import {execFile,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VoiceEffects} from './voice-effects.mjs';
const script=fileURLToPath(new URL('./offline-vocoder.py',import.meta.url));
export function pcmWav(pcm){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
function postprocess(pcm,options){const input=Buffer.concat([pcm,Buffer.alloc(options.reverb?48000:0)]),processor=new VoiceEffects({...options,vocoder:0}),chunks=[];for(let i=0;i<input.length;i+=960)chunks.push(processor.process(input.subarray(i,i+960)));return Buffer.concat(chunks);}
function argumentsFor(options){if(![0,.35,.5,1].includes(options.vocoder))throw Error('Invalid vocoder mix');return [script,'--input','-','--mix',String(options.vocoder)];}
export function renderPcmSync(pcm,options){const processed=options.vocoder?execFileSync('python3',argumentsFor(options),{input:pcmWav(pcm),maxBuffer:10000000,timeout:15000}).subarray(44):pcm;return postprocess(processed,options);}
export async function renderPcm(pcm,options,signal){
 let processed=pcm;
 if(options.vocoder)processed=(await new Promise((resolve,reject)=>{
  const child=execFile('python3',argumentsFor(options),{encoding:'buffer',maxBuffer:10000000,timeout:15000,signal},(error,stdout)=>error?reject(error):resolve(stdout));
  child.stdin.on('error',()=>{});child.stdin.end(pcmWav(pcm));
 })).subarray(44);
 return postprocess(processed,options);
}
