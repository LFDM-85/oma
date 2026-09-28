// Development-only cancellation/cold-reload probe. No desktop actions or audio
// playback. Compare the same synthetic recording through two source snapshots.
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const {values:a}=parseArgs({options:{module:{type:'string'},fixtures:{type:'string'},output:{type:'string'}}});
if(!a.module||!a.fixtures||!a.output)throw Error('--module, --fixtures and --output are required');
mkdirSync(a.output,{recursive:false});
const source=resolve(a.module),{LocalSpeech}=await import(pathToFileURL(source));
const hash=b=>createHash('sha256').update(b).digest('hex');
const local=join(homedir(),'.local/share/oma/local'),data=mkdtempSync(join(tmpdir(),'oma-resume-'));
mkdirSync(join(data,'local'));
for(const name of ['venv','whisper','huggingface'])symlinkSync(join(local,name),join(data,'local',name));
writeFileSync(join(data,'local/speech.json'),JSON.stringify({stt:'qwen3-asr-1.7b'}));
const pcm=path=>{
 const wav=readFileSync(path);if(wav.toString('ascii',0,4)!=='RIFF')throw Error('Expected WAV');
 let valid=false;
 for(let at=12;at+8<=wav.length;){const size=wav.readUInt32LE(at+4),name=wav.toString('ascii',at,at+4);
  if(name==='fmt ')valid=wav.readUInt16LE(at+8)===1&&wav.readUInt16LE(at+10)===1&&wav.readUInt32LE(at+12)===24000&&wav.readUInt16LE(at+22)===16;
  if(name==='data'){if(!valid)throw Error('Expected 24 kHz mono PCM16');return wav.subarray(at+8,at+8+size);}at+=8+size+(size%2);}
 throw Error('Missing WAV data');
};
const config={split:'dev',source:'synthetic',module:source,module_sha256:hash(readFileSync(source)),worker_sha256:hash(readFileSync(join(dirname(source),'local-speech.py'))),cancel_after_ms:500,resume_after_ms:500,partial_seconds:2,fixtures:{}};
const results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(const language of ['ja','en']){
  const manifest=JSON.parse(readFileSync(join(a.fixtures,language,'manifest.json')));if(manifest.split!=='dev')throw Error('Development fixtures required');
  const clip=join(a.fixtures,language,manifest.phrases.write.file),warm=join(a.fixtures,language,manifest.phrases.bye.file);
  for(const name of ['write','bye'])if(hash(readFileSync(join(a.fixtures,language,manifest.phrases[name].file)))!==manifest.phrases[name].sha256)throw Error('Fixture changed');
  config.fixtures[language]={sha256:hash(readFileSync(clip)),expected:manifest.phrases.write.text};
  for(let repeat=0;repeat<2;repeat++){
   const row={language,repeat,worker_starts:0},speech=new LocalSpeech({data,locale:language,spawnProcess:(...args)=>{row.worker_starts++;return spawn(...args);}});
   try{
    let start=performance.now();await speech.transcribe(pcm(warm));row.warmup_seconds=(performance.now()-start)/1000;
    const controller=new AbortController();const partial=speech.transcribe(pcm(clip).subarray(0,24000*2*2),controller.signal).then(text=>({text}),e=>({error:e.name}));
    await delay(500);controller.abort();row.partial=await partial;await delay(500);
    start=performance.now();row.actual=await speech.transcribe(pcm(clip));row.final_seconds=(performance.now()-start)/1000;
    if(speech.child){const status=readFileSync('/proc/'+speech.child.pid+'/status','utf8');row.worker_peak_rss_kib=Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]);}
   }catch(e){row.error=e.message;}finally{speech.close();}
   results.push(row);writeFileSync(join(a.output,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(row));
  }
 }
}finally{writeFileSync(join(a.output,'configuration.json'),JSON.stringify(config,null,2)+'\n');rmSync(data,{recursive:true,force:true});}
