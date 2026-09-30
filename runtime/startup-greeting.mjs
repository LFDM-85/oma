import {idleInstruction} from './idle.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {greetingInstruction} from './locale.mjs';
const revision=createHash('sha256').update(readFileSync(new URL('./streaming-vocoder.py',import.meta.url))).update(readFileSync(new URL('./voice-effects.mjs',import.meta.url))).digest('hex');
export class GreetingCache {
 constructor(directory,{farewell=false}={}){this.farewell=farewell;this.directory=join(directory,farewell?'farewells':'greetings');}
 path(locale,voice,effectsEnabled=true){return join(this.directory,createHash('sha256').update(JSON.stringify([locale,voice,(this.farewell?idleInstruction(locale,true):greetingInstruction(locale)),effectsEnabled?revision:'raw-v1'])).digest('hex')+'.json');}
 load(locale,voice,effectsEnabled=true){try{const entry=JSON.parse(readFileSync(this.path(locale,voice,effectsEnabled),'utf8'));const pcm=Buffer.from(entry.audio,'base64');this.validate(entry.text,pcm);return {text:entry.text,pcm};}catch{return null;}}
 validate(text,pcm){if(typeof text!=='string'||!text.trim()||text.length>500||!Buffer.isBuffer(pcm)||pcm.length<4800||pcm.length>48000*12||pcm.length%2)throw Error('Invalid greeting');}
 save(locale,voice,{text,pcm},effectsEnabled=true){this.validate(text,pcm);mkdirSync(this.directory,{recursive:true,mode:0o700});const path=this.path(locale,voice,effectsEnabled),temp=path+'.tmp';writeFileSync(temp,JSON.stringify({text,audio:pcm.toString('base64')}),{mode:0o600});renameSync(temp,path);}
}
// Gate only the startup clip. Retain at most 15 seconds while connecting.
export class StartupGreeting {
 constructor({play}){this.play=play;this.stop();}
 begin(entry){this.stop();this.active=true;this.playing=true;this.play(entry.pcm,entry.text);}
 input(pcm){if(!this.active)return;if(this.send&&!this.playing){this.send(pcm);return;}this.queue.push(Buffer.from(pcm));this.bytes+=pcm.length;while(this.bytes>720000)this.bytes-=this.queue.shift().length;}
 connect(send){if(!this.active)return;this.send=send;this.flush();}
 drained(){if(!this.active)return;this.playing=false;this.flush();}
 flush(){if(!this.send||this.playing)return;for(const pcm of this.queue)this.send(pcm);this.queue=[];this.bytes=0;}
 stop(){this.active=false;this.playing=false;this.send=null;this.queue=[];this.bytes=0;}
}
