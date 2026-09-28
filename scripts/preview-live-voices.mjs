// Explicitly run to generate billed GPT-Live auditions; no microphone or personal context.
import OpenAI from 'openai';
import {LiveWS} from 'openai/resources/live/ws';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {loadApiKey} from '../runtime/credentials.mjs';
const directory=join(homedir(),'.local/share/oma/voice-preview');
await mkdir(directory,{recursive:true});
const client=new OpenAI({apiKey:await loadApiKey()});
const voices='vesper marin alloy ash ballad beacon bossa cedar cinder coral delta echo gleam meridian quartz ripple sage shimmer stone tempo verse willow'.split(' ');
const styles=[['slow','Slow','Speak at a slow, unhurried pace with clear articulation.'],['brisk','Brisk','Speak briskly and clearly, with short pauses.'],['retro','Retro computer','Speak like a composed onboard computer in a 1970s or 1980s science-fiction film. Use a restrained, even, low-register delivery with little pitch variation, precise diction and a measured pace. Do not add sound effects.']];
let jobs=[...voices.map(voice=>({id:voice,voice,label:voice,style:'Speak clearly in a natural conversational tone.'})),...styles.map(([id,label,style])=>({id:'vesper-'+id,voice:'vesper',label:'Vesper · '+label,style}))];
if(process.argv.includes('--retry-failed'))jobs=JSON.parse(await readFile(join(directory,'samples.json'),'utf8')).samples;
const customIndex=process.argv.indexOf('--style');
if(customIndex>=0){const voice=process.argv[process.argv.indexOf('--voice')+1]||'vesper';if(!voices.includes(voice))throw Error('Invalid voice');jobs=[{id:'custom-'+Date.now(),voice,label:'Custom preview',style:process.argv[customIndex+1].slice(0,4000)}];}
const sentence='指示をお待ちしています。システムは正常です。次の操作を指定してください。';
function wav(pcm){
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
async function generate(job){
 const chunks=[];let transcript='',interval,deadline,retryGreeting;
 const wire=new LiveWS(client,{reconnect:false});
 try{
 await new Promise((resolve,reject)=>{
  deadline=setTimeout(()=>reject(Error('Session timed out')),25000);
  wire.socket.on('open',()=>wire.send({type:'session.start',session:{model:'gpt-live-1',store:false,instructions:'Speak Japanese. '+job.style+' Do not delegate. Speak the requested sentence once, then remain silent.',audio:{format:{type:'audio/pcm',rate:24000},output:{voice:job.voice}}}}));
  wire.on('error',reject);
  wire.on('event',e=>{
   if(e.type==='error')reject(Error(e.error?.message||'API error'));
   if(e.type==='session.started'){
    clearTimeout(deadline);deadline=setTimeout(resolve,18000);
    interval=setInterval(()=>wire.send({type:'session.input_audio.append',audio:Buffer.alloc(960).toString('base64')}),20);
    wire.send({type:'session.instructions.append',delegation_id:null,content:'今すぐ次の文だけを一度話し、その後は黙って待ってください。「'+sentence+'」'});
    retryGreeting=setTimeout(()=>{if(!transcript.trim())wire.send({type:'session.instructions.append',delegation_id:null,content:'Speak now, once, in Japanese: '+sentence});},6000);
   }
   if(e.type==='session.output_audio.delta')chunks.push(Buffer.from(e.delta,'base64'));
   if(e.type==='session.output_transcript.delta')transcript+=e.delta;
  });
 });
 const raw=Buffer.concat(chunks);let first=-1,last=-1;
 for(let i=0;i+1<raw.length;i+=2)if(Math.abs(raw.readInt16LE(i))>100){if(first<0)first=i;last=i;}
 if(first<0||!transcript.trim())throw Error('No speech received');
 // Trim only leading/trailing silence. Samples, pitch and playback rate stay unchanged.
 const pcm=raw.subarray(Math.max(0,first-9600),Math.min(raw.length,last+19200));
 await writeFile(join(directory,job.id+'.wav'),wav(pcm));
 delete job.error;Object.assign(job,{file:job.id+'.wav',transcript,seconds:pcm.length/48000});
 console.log(JSON.stringify({voice:job.id,seconds:job.seconds,transcript}));
 }catch(e){job.error=String(e.message);console.log(JSON.stringify({voice:job.id,error:job.error}));}
 finally{clearInterval(interval);clearTimeout(deadline);clearTimeout(retryGreeting);wire.close();}
}
const pending=process.argv.includes('--retry-failed')?jobs.filter(job=>job.error):jobs;
let next=0;
await Promise.all(Array.from({length:3},async()=>{while(next<pending.length)await generate(pending[next++]);}));
await writeFile(join(directory,customIndex>=0?jobs[0].id+'.json':'samples.json'),JSON.stringify({model:'gpt-live-1',sentence,created:new Date().toISOString(),samples:jobs},null,2));
console.log('Saved '+directory);
