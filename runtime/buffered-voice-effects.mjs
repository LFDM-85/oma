import {SpeechBuffer} from './speech-buffer.mjs';
import {renderPcm} from './offline-voice-effects.mjs';
export class BufferedVoiceEffects {
 constructor({deliver,onError,render=renderPcm}){Object.assign(this,{deliver,onError,render});this.generation=0;this.pending=0;this.chain=Promise.resolve();this.controller=new AbortController();this.buffer=new SpeechBuffer(pcm=>this.queue(pcm),{quietFrames:30});}
 get busy(){return this.pending>0||this.buffer.frames.length>0;}
 append(pcm){this.buffer.append(pcm);}
 queue(pcm){const generation=this.generation,signal=this.controller.signal;this.pending++;
  this.chain=this.chain.then(async()=>{if(signal.aborted)return;const out=await this.render(pcm,{vocoder:.5,radio:true,reverb:false},signal);if(generation===this.generation)this.deliver(out);}).catch(error=>{if(!signal.aborted)this.onError(error);}).finally(()=>{if(generation===this.generation)this.pending--;});
 }
 reset(){this.generation++;this.controller.abort();this.controller=new AbortController();this.pending=0;this.chain=Promise.resolve();this.buffer.reset();}
}
