// Opt-in PipeWire integration check. Uses a temporary null sink; no speaker or microphone.
// Compare: node tests/bench-audio-playback.mjs 0 and ... 250
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Audio} from '../runtime/audio.mjs';
const bufferMs=Number(process.argv[2]??250);
const stallMs=Number(process.argv[3]??70);
const sink='oma_test_'+process.pid;
const module=execFileSync('pactl',['load-module','module-null-sink',`sink_name=${sink}`,'rate=24000','channels=1']).toString().trim();
let record;const captured=[];
try{
 record=spawn('parec',['--device',sink+'.monitor','--raw','--format=s16le','--rate=24000','--channels=1','--latency-msec=10']);record.stdout.on('data',b=>captured.push(b));record.stderr.resume();await delay(300);
 let drained;const done=new Promise(r=>drained=r);const errors=[];
 const audio=new Audio(()=>{},e=>errors.push(e),{outputTarget:sink,startupBufferMs:bufferMs});audio.onDrained=drained;
 const pcm=Buffer.alloc(4800);for(let i=0;i<2400;i++)pcm.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*440*i/24000)),i*2);
 const start=performance.now();
 for(let i=0;i<40;i++){const due=i*100+(i>=5?70:0)+(i>=18?stallMs:0);await delay(Math.max(0,due-(performance.now()-start)));audio.enqueue(pcm);}
 audio.finish();let timeout;try{await Promise.race([done,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('drain timeout')),6000)})]);}finally{clearTimeout(timeout);}await delay(250);audio.stop();record.kill();await delay(50);
 const data=Buffer.concat(captured);let first=-1,last=-1;
 for(let i=0;i+1<data.length;i+=2)if(Math.abs(data.readInt16LE(i))>100){if(first<0)first=i;last=i;}
 let run=0;const gaps=[];for(let i=first;i<=last;i+=2){if(Math.abs(data.readInt16LE(i))<50)run++;else{if(run>=48)gaps.push(run/24);run=0;}}
 console.log(JSON.stringify({bufferMs,stallMs,capturedMs:data.length/48,signalMs:(last-first)/48,gapsMs:gaps,errors}));
 assert.deepEqual(errors,[]);assert.ok(first>=0,'Tone reached the monitor');
 if(bufferMs>=250&&stallMs<=70){assert.deepEqual(gaps,[],'No inserted silence during continuous tone');assert.ok(Math.abs((last-first)/48-4000)<2,'Playback remains at the original rate');}
 if(bufferMs>=250&&stallMs===500){assert.equal(gaps.length,1,'Only the long stall, no repeated gaps after resuming');}
}finally{record?.kill();execFileSync('pactl',['unload-module',module]);}
