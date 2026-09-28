// Opt-in local playback measurement. Temporary PipeWire sink; no API or mic.
import {execFileSync,spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';import {setTimeout as delay} from 'node:timers/promises';
import {GreetingCache} from '../runtime/startup-greeting.mjs';import {Audio} from '../runtime/audio.mjs';import {StartupCue,startupSound} from '../runtime/startup.mjs';import {FarewellPlayback} from '../runtime/farewell-playback.mjs';
const entry=new GreetingCache(join(homedir(),'.local/share/oma'),{farewell:true}).load('ja-JP','cedar');if(!entry)throw Error('Prepare Japanese farewell first');
const sink='oma_farewell_'+process.pid,module=execFileSync('pactl',['load-module','module-null-sink',`sink_name=${sink}`,'rate=24000','channels=1']).toString().trim();let record;const buffers=[];const errors=[];const audio=new Audio(()=>{},e=>errors.push(e),{outputTarget:sink,volume:3,startupBufferMs:250});const cue=new StartupCue(sink);
try{
 record=spawn('parec',['--device',sink+'.monitor','--raw','--format=s16le','--rate=24000','--channels=1','--latency-msec=10']);record.stdout.on('data',b=>buffers.push(b));record.stderr.resume();await delay(300);
 let done;const ended=new Promise(r=>done=r);const f=new FarewellPlayback({audio,disconnect(){},caption(){},dismiss(){cue.play().then(done)}});audio.onDrained=()=>f.drained();f.start(entry);await ended;await delay(300);record.kill();await delay(100);
 writeFileSync('/tmp/oma-farewell-captured.pcm',Buffer.concat(buffers));writeFileSync('/tmp/oma-farewell-reference.pcm',entry.pcm);writeFileSync('/tmp/oma-farewell-cue.pcm',startupSound());if(errors.length)throw Error(errors.join('; '));
 const result=execFileSync('python3',['-c',`import numpy as np,json
read=lambda p:np.fromfile('/tmp/oma-farewell-'+p+'.pcm',dtype='<i2').astype(float)
y=read('captured');v=read('reference');c=read('cue')
def locate(t):
 n=1<<(len(y)+len(t)-1).bit_length()
 corr=np.fft.irfft(np.fft.rfft(y,n)*np.fft.rfft(t[::-1],n),n)
 return int(np.argmax(corr)-len(t)+1)
a=locate(v);b=locate(c);last=int(np.flatnonzero(np.abs(v)>100)[-1]);first=int(np.flatnonzero(np.abs(c)>100)[0]);gap=(b+first-a-last)/24
print(json.dumps({'farewell_to_cue_ms':round(gap,1),'voice_start_ms':round(a/24,1),'cue_start_ms':round(b/24,1)}))
assert 0<=gap<450, 'Unexpected gap or overlap'`],{encoding:'utf8'});console.log(result.trim());
}finally{record?.kill();audio.stop();cue.stop();execFileSync('pactl',['unload-module',module]);}
