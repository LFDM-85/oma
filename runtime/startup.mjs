import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {stopChild} from './stop-child.mjs';
// 24 kHz mono signed 16-bit PCM; see assets/NOTICE.md for source and license.
const startupPcm=readFileSync(new URL('../assets/startup.pcm',import.meta.url));
export function startupSound(){return startupPcm;}
export class StartupCue {
 constructor(outputTarget=null,spawnProcess=spawn){this.outputTarget=outputTarget;this.spawnProcess=spawnProcess;this.finished=Promise.resolve(true);}
 play(){
  this.stop();
  this.finished=new Promise(resolve=>{this.resolveFinished=resolve;});
  const child=this.spawnProcess('pw-play',[...(this.outputTarget?['--target',this.outputTarget]:[]),'--raw','--rate','24000','--channels','1','--format','s16','-'],{stdio:['pipe','ignore','ignore']});
  this.child=child;const resolve=this.resolveFinished;
  child.on('error',()=>resolve(false));child.stdin.on('error',()=>{});
  // pw-play closes after draining the device, not just writing the last byte.
  child.on('close',code=>{if(this.child===child){this.child=null;this.resolveFinished=null;}resolve(code===0);});
  child.stdin.end(startupSound());return this.finished;
 }
 stop(){this.resolveFinished?.(false);this.resolveFinished=null;const child=this.child;this.child=null;if(child){this.stopped=Promise.all([this.stopped,stopChild(child)]).then(()=>{});this.stopped.catch(()=>{});}return this.stopped||Promise.resolve();}
}
