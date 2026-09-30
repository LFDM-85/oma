import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VoiceEffects} from './voice-effects.mjs';
export class StreamingVoiceEffects {
 constructor({deliver,onError,spawnProcess=spawn,enabled=true}){Object.assign(this,{deliver,onError,spawnProcess,enabled});this.serial=0;this.pending=Buffer.alloc(0);this.radio=new VoiceEffects({radio:true});}
 get busy(){return false;}
 start(){if(this.child)return;const serial=this.serial;this.child=this.spawnProcess('python3',['-u',fileURLToPath(new URL('./streaming-vocoder.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});const child=this.child;let error='';child.stderr.on('data',b=>error=(error+b).slice(-1000));child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>{if(serial!==this.serial)return;const data=Buffer.concat([this.pending,chunk]),length=data.length-data.length%2;this.pending=Buffer.from(data.subarray(length));if(length)this.deliver(this.radio.process(data.subarray(0,length)));});child.on('error',e=>{if(serial===this.serial)this.onError(e)});child.on('exit',code=>{if(serial===this.serial){this.child=null;if(code)this.onError(Error(error||'Voice processing stopped'));}});}
 setEnabled(enabled){if(this.enabled===enabled)return;this.reset();this.enabled=enabled;}
 append(pcm){if(!this.enabled){this.deliver(pcm);return;}this.start();if(this.child.stdin.writable)this.child.stdin.write(pcm);}
 reset(){this.serial++;this.child?.kill();this.child=null;this.pending=Buffer.alloc(0);this.radio.reset();}
}
