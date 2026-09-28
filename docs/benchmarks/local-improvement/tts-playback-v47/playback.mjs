// Opt-in: actual worker -> Audio -> PipeWire null sink -> monitor capture.
// No physical microphone or speaker. First audible time uses monitor arrival.
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
const [baseline,candidate,output,baselineAudio,candidateAudio]=process.argv.slice(2);
const defaultAudio=new URL('../../../runtime/audio.mjs',import.meta.url);
const audioModules={baseline:baselineAudio?pathToFileURL(resolve(baselineAudio)):defaultAudio,candidate:candidateAudio?pathToFileURL(resolve(candidateAudio)):defaultAudio};
if(!output)throw Error('Pass baseline worker, candidate worker, new output directory');
mkdirSync(output);
const local=join(homedir(),'.local/share/oma/local');
const corpus=readFileSync(new URL('./utterances.tsv',import.meta.url),'utf8').trim().split('\n').slice(1).map(line=>line.split('\t')).filter(x=>x[0].trim()==='final').slice(0,20);
const sink='oma_tts_measure_'+process.pid;
const mod=execFileSync('pactl',['load-module','module-null-sink','sink_name='+sink,'rate=24000','channels=1']).toString().trim();
const recorder=spawn('parec',['--device',sink+'.monitor','--raw','--format=s16le','--rate=24000','--channels=1','--latency-msec=10'],{stdio:['ignore','pipe','pipe']});
recorder.stderr.resume();let current;let carry=Buffer.alloc(0);
recorder.stdout.on('data',data=>{
 const b=Buffer.concat([carry,data]);carry=b.subarray(b.length-b.length%2);
 if(!current)return;
 current.capture.push(Buffer.from(b.subarray(0,b.length-b.length%2)));
 if(current.firstSound===null)for(let i=0;i+1<b.length;i+=2)if(Math.abs(b.readInt16LE(i))>100){current.firstSound=performance.now()-current.started;break;}
});
let child;let audio;let id=0;const pending=new Map();
const request=(text,language,consume)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{consume,resolve,reject});child.stdin.write(JSON.stringify({id:key,action:'speak',text,language})+'\n');});
try{
 await pause(250);
 // Alternating order in a second invocation can detect run-order drift.
 for(const [label,worker] of [['baseline',baseline],['candidate',candidate]]){
  const {Audio}=await import(audioModules[label]);
  child=spawn(join(local,'venv/bin/python'),['-u',resolve(worker),local],{stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HOME:join(local,'huggingface'),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
  child.stderr.on('data',b=>appendFileSync(join(output,label+'-worker.log'),b));
  createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(!p)return;if(r.error){pending.delete(r.id);p.reject(Error(r.error));}else{if(r.pcm)p.consume(Buffer.from(r.pcm,'base64'));if(r.done){pending.delete(r.id);p.resolve();}}});
  child.on('exit',()=>{for(const p of pending.values())p.reject(Error('Speech worker exited'));pending.clear();});
  for(const [language,column,warmup] of [['ja',1,'準備中です。'],['en',2,'Getting ready.']]){
   await request(warmup,language,()=>{});
   for(const [index,row] of corpus.entries()){
    const errors=[];let drained;const done=new Promise(r=>drained=r);
    audio=new Audio(()=>{},e=>{errors.push(e);drained();},{outputTarget:sink,volume:1});audio.onDrained=drained;
    current={started:performance.now(),firstSound:null,capture:[]};const pcm=[];let firstPCM,generationMs;
    let timer;try{
     await Promise.race([(async()=>{await request(row[column],language,b=>{firstPCM??=performance.now()-current.started;pcm.push(b);audio.enqueue(b);});generationMs=performance.now()-current.started;audio.finish();await done;await pause(150);})(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Playback timeout')),30000))]);
     const result={configuration:label,language,id:`${language}-final-${String(index+1).padStart(2,'0')}`,text:row[column],first_pcm_ms:firstPCM,generation_ms:generationMs,generation_rtf:generationMs/(Buffer.concat(pcm).length/48),monitor_first_sound_ms:current.firstSound,source_frames:Buffer.concat(pcm).length/2,errors};
     if(current.firstSound===null)result.errors.push('No sound reached the monitor');
     writeFileSync(join(output,label+'-'+result.id+'.s16le'),Buffer.concat(current.capture));
     writeFileSync(join(output,label+'-'+result.id+'-source.s16le'),Buffer.concat(pcm));
     appendFileSync(join(output,'results.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify(result));
    }finally{clearTimeout(timer);current=null;await audio.close();}
   }
  }
  const status=readFileSync('/proc/'+child.pid+'/status','utf8');
  appendFileSync(join(output,'provenance.jsonl'),JSON.stringify({configuration:label,audio_module:String(audioModules[label]),audio_sha256:createHash('sha256').update(readFileSync(audioModules[label])).digest('hex'),worker_sha256:createHash('sha256').update(readFileSync(worker)).digest('hex'),peak_worker_rss_kib:Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]),sample_rate:24000,volume:1,physical_speaker:false})+'\n');
  const exited=new Promise(r=>child.once('exit',r));child.stdin.end();await exited;child=null;
 }
}finally{child?.kill('SIGKILL');await audio?.close();recorder.kill();execFileSync('pactl',['unload-module',mod]);}
