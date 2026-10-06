import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const execute=promisify(execFile);
const run=async(command,args)=>(await execute(command,args,{timeout:10000})).stdout;
export class EchoCancel {
 constructor({execute=run,suffix=process.pid+'_'+randomUUID().replaceAll('-','')}={}){
  this.execute=execute;this.source='oma_mic_'+suffix;this.sink='oma_speaker_'+suffix;this.module=null;
 }
 async open(target=''){
  if(this.module!==null)return;
  const sink=(await this.execute('pactl',['get-default-sink'])).trim();
  const source=target||(await this.execute('pactl',['get-default-source'])).trim();
  if(!source||!sink||source.startsWith('oma_mic_')||sink.startsWith('oma_speaker_'))throw Error('Choose a physical microphone and speaker in system sound settings.');
  const value=(await this.execute('pactl',['load-module','module-echo-cancel','aec_method=webrtc','source_name='+this.source,'sink_name='+this.sink,'source_master='+source,'sink_master='+sink,'source_properties=priority.session=0','sink_properties=priority.session=0'])).trim();
  if(!/^\d+$/.test(value))throw Error('O.M.A. could not create its echo cancellation path.');
  this.module=Number(value);
 }
 async close(){const id=this.module;this.module=null;if(id!==null)await this.execute('pactl',['unload-module',String(id)]);}
}
