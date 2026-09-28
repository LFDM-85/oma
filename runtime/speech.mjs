import {spawn} from 'node:child_process';
import {transcriptionLanguage} from './locale.mjs';
export function wav(pcm){
 const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(36+pcm.length,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);return Buffer.concat([b,pcm]);
}
function command(value){if(!value)return null;const args=JSON.parse(value);if(!Array.isArray(args)||!args.length||args.some(x=>typeof x!=='string'||x.includes('\0')))throw Error('Speech command must be a JSON argv array');return args;}
function deadline(signal){return AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(60000)]);}
async function collect(stream,limit,consume,signal){
 let size=0;for await(const data of stream){signal?.throwIfAborted();size+=data.length;if(size>limit)throw Error('Speech response exceeded size limit');consume(Buffer.from(data));}
}
export class Speech {
 constructor({key='',locale,env=process.env,fetch:request=globalThis.fetch}={}){
  Object.assign(this,{key,locale,request});this.stt=command(env.OMA_STT_COMMAND);this.tts=command(env.OMA_TTS_COMMAND);
  this.sttModel=env.OMA_STT_MODEL||'gpt-4o-transcribe';this.ttsModel=env.OMA_TTS_MODEL||'gpt-4o-mini-tts';this.voice=env.OMA_TTS_VOICE||'cedar';
 }
 get ready(){return !!((this.stt||this.key)&&(this.tts||this.key));}
 async run(args,input,consume,limit,signal){
  signal.throwIfAborted();const child=spawn(args[0],args.slice(1),{stdio:['pipe','pipe','pipe'],signal,killSignal:'SIGKILL',env:{...process.env,OMA_LANGUAGE:transcriptionLanguage(this.locale)||''}});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Speech command failed (exit '+code+')')));});
  done.catch(()=>{});child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(input);
  try{await collect(child.stdout,limit,consume,signal);await done;}finally{if(child.exitCode===null)child.kill('SIGKILL');}
 }
 async transcribe(pcm,signal){
  signal=deadline(signal);signal.throwIfAborted();const chunks=[];
  if(this.stt){await this.run(this.stt,wav(pcm),b=>chunks.push(b),32000,signal);return Buffer.concat(chunks).toString('utf8').trim();}
  if(!this.key)throw Error('Configure speech credentials or OMA_STT_COMMAND.');
  const body=new FormData();body.append('file',new Blob([wav(pcm)],{type:'audio/wav'}),'speech.wav');body.append('model',this.sttModel);
  const language=transcriptionLanguage(this.locale);if(language)body.append('language',language);
  const r=await this.request('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+this.key},body,signal,redirect:'error'});
  if(!r.ok){await r.body?.cancel();throw Error('Speech recognition failed (HTTP '+r.status+').');}
  await collect(r.body,64000,b=>chunks.push(b),signal);return String(JSON.parse(Buffer.concat(chunks).toString()).text||'').trim();
 }
 async speak(text,onChunk,signal){
  text=text.replace(/O\.M\.A\./g,transcriptionLanguage(this.locale)==='ja'?'オーマ':'OH-mah');
  if(!text.trim())return;signal=deadline(signal);signal.throwIfAborted();let carry=Buffer.alloc(0);
  const consume=b=>{const packet=Buffer.concat([carry,b]);const length=packet.length-packet.length%2;carry=packet.subarray(length);if(length)onChunk(packet.subarray(0,length));};
  if(this.tts)await this.run(this.tts,text,consume,24*1024*1024,signal);
  else{
   if(!this.key)throw Error('Configure speech credentials or OMA_TTS_COMMAND.');
   const r=await this.request('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+this.key,'Content-Type':'application/json'},body:JSON.stringify({model:this.ttsModel,voice:this.voice,input:text,response_format:'pcm',instructions:'Calm, clear, concise computer-like delivery. No laughter or filler.'}),signal,redirect:'error'});
   if(!r.ok){await r.body?.cancel();throw Error('Speech synthesis failed (HTTP '+r.status+').');}
   await collect(r.body,24*1024*1024,consume,signal);
  }
  if(carry.length)throw Error('Speech provider returned incomplete PCM samples.');
 }
}
