import {idleInstruction} from './idle.mjs';
import OpenAI from 'openai';
import {LiveWS} from 'openai/resources/live/ws';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {greetingInstruction} from './locale.mjs';
import {VoiceEffects} from './voice-effects.mjs';
// Generate only the public greeting: no microphone, history, or desktop tools.
export async function prepareGreeting({key,locale,voice,cache,signal,effectsEnabled=true,connect=()=>new LiveWS(new OpenAI({apiKey:key}),{reconnect:false}),spawnProcess=spawn}){
 if(signal?.aborted||!key||!locale||cache.load(locale,voice,effectsEnabled))return;
 const instructions=cache.farewell?idleInstruction(locale,true):greetingInstruction(locale);
 const wire=connect();let interval,deadline,abort;const chunks=[];let text='';
 try{
 await new Promise((resolve,reject)=>{
  abort=()=>reject(Error('Greeting preparation cancelled'));
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  deadline=setTimeout(()=>reject(Error('Greeting preparation timed out')),25000);
  wire.socket.on('open',()=>wire.send({type:'session.start',session:{model:'gpt-live-1',store:false,instructions:instructions+' Speak only once, then remain silent. Do not delegate.',audio:{format:{type:'audio/pcm',rate:24000},output:{voice}}}}));
  wire.on('error',reject);wire.on('event',e=>{
   if(e.type==='error')reject(Error(e.error?.message||'Greeting generation failed'));
   if(e.type==='session.started'){
    clearTimeout(deadline);deadline=setTimeout(resolve,12000);
    interval=setInterval(()=>wire.send({type:'session.input_audio.append',audio:Buffer.alloc(960).toString('base64')}),20);
    wire.send({type:'session.instructions.append',delegation_id:null,content:instructions+' Speak now, once.'});
   }
   if(e.type==='session.output_audio.delta')chunks.push(Buffer.from(e.delta,'base64'));
   if(e.type==='session.output_transcript.delta')text+=e.delta;
  });
 });
 }finally{clearInterval(interval);clearTimeout(deadline);wire.close();signal?.removeEventListener('abort',abort);}
 if(signal?.aborted)return;
 const raw=Buffer.concat(chunks);let first=-1,last=-1;
 for(let i=0;i+1<raw.length;i+=2)if(Math.abs(raw.readInt16LE(i))>100){if(first<0)first=i;last=i;}
 if(first<0||!text.trim()||last>=raw.length-9600)throw Error('Incomplete greeting audio');
 const trimmed=raw.subarray(Math.max(0,first-1440),Math.min(raw.length,last+(cache.farewell?2400:4800)));
 if(!effectsEnabled){if(!signal?.aborted)cache.save(locale,voice,{text:text.trim(),pcm:trimmed},false);return;}
 const processed=await new Promise((resolve,reject)=>{
  const child=spawnProcess('python3',['-u',fileURLToPath(new URL('./streaming-vocoder.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],signal});const out=[];
  child.stdout.on('data',x=>out.push(x));child.stderr.resume();child.on('error',reject);child.stdin.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(out)):reject(Error('Greeting effect failed')));
  child.stdin.end(Buffer.concat([trimmed,Buffer.alloc(24000)]));
 });
 if(signal?.aborted)return;
 const pcm=new VoiceEffects({radio:true}).process(processed.subarray(0,trimmed.length));
 cache.save(locale,voice,{text:text.trim(),pcm},effectsEnabled);
}
