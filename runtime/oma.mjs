import {resolveLocale,greetingInstruction,greetingSource} from './locale.mjs';
import {Turn} from './turn.mjs';
import {bounded} from './memory.mjs';
import {restartAssistant} from './restart.mjs';
import {runDesktopCommand} from './desktop.mjs';
import {directFarewell} from './farewell-intent.mjs';
import {idleInstruction} from './idle.mjs';
export class Oma {
 constructor({memory,emit,audio,agent,speech,locale=resolveLocale()}){
  Object.assign(this,{memory,emit,audio,agent,speech,locale});this.turn=new Turn();this.state='idle';this.active=false;this.connected=false;this.toolsRunning=0;this.sentBytes=0;this.voiceEpoch=0;this.captionHistory={user:'',assistant:''};this.captionCurrent={user:'',assistant:''};
  if(agent){agent.onDismiss=()=>{this.pendingDismiss=this.turn.generation};agent.onRestart=()=>{this.pendingRestart=this.turn.generation};}
  if(audio)audio.onDrained=()=>this.drained();
 }
 showCaption(role,text){this.captionCurrent[role]=text;this.emit({[role==='user'?'userText':'assistantText']:bounded([this.captionHistory[role],text].filter(Boolean).join('\n'),24000)});}
 setState(state,extra={}){this.state=state;this.emit({state,...extra});}
 playbackLevel(level,shapes){
  if(level>.04&&!this.closing&&!['approval','error'].includes(this.state))this.setState('speaking',{level,...shapes});
  else this.emit({level,...shapes});
 }
 async connect(){await this.agent.start();this.connected=true;}
 valid(gen){return !this.closing&&gen===this.turn.generation&&!this.controller?.signal.aborted;}
 silence(){this.voiceEpoch++;this.speechController?.abort();this.audio.stop();}
 interrupt(){
  clearTimeout(this.recordTimeout);clearTimeout(this.wakeTimer);this.pendingDismiss=undefined;this.pendingRestart=undefined;this.wakeGeneration=null;
  this.cancelTranscription();this.saveSpoken(true);this.controller?.abort();this.silence();this.active=false;this.responseRequested=false;
  this.cancellation=Promise.resolve(this.agent?.cancel()).catch(e=>{if(!this.closing)this.error(e)});
 }
 begin(){for(const role of ['user','assistant']){this.captionHistory[role]=bounded([this.captionHistory[role],this.captionCurrent[role]].filter(Boolean).join('\n'),24000);this.captionCurrent[role]='';}this.timings={};this.previewCount=0;this.releasedAt=null;this.controller=new AbortController();this.audio.played=0;this.transcript='';this.segments=[];this.audioBytes=0;this.pendingSentence='';this.speechChain=Promise.resolve();this.noticeResponse=false;this.emit({userText:this.captionHistory.user,assistantText:this.captionHistory.assistant,error:''});}
 async press(initialAudio){
  if(!this.turn.press())return;this.interrupt();this.begin();this.sentBytes=0;this.inputChunks=[];this.setState('listening');
  const gen=this.turn.generation;const append=b=>{if(!this.valid(gen)||!this.turn.recording)return;if(this.sentBytes+b.length>24000*2*90)return;this.sentBytes+=b.length;this.inputChunks.push(b);};
  if(initialAudio?.length)append(initialAudio);this.audio.record(append);
  // Construct the Pi session while the user speaks; no inference or tools run here.
  Promise.resolve(this.cancellation).then(()=>{if(this.valid(gen))return this.agent.start()}).catch(()=>{});
  this.recordTimeout=setTimeout(()=>this.release().catch(e=>this.error(e)),90000);
 }
 prepareTranscription(){
  if(!this.turn.recording||this.preview||this.previewCount>=2||this.sentBytes<4800)return;
  this.previewCount++;const gen=this.turn.generation;const controller=new AbortController();
  const preview={controller,started:performance.now()};this.preview=preview;
  preview.result=this.speech.transcribe(Buffer.concat(this.inputChunks),AbortSignal.any([this.controller.signal,controller.signal])).then(text=>{
   if(this.preview===preview&&this.valid(gen)&&this.turn.recording)this.showCaption('user',text);
   return {text};
  },()=>({failed:true}));
 }
 cancelTranscription(){this.preview?.controller.abort();this.preview=null;if(this.turn.recording)this.showCaption('user','');}
 async finalTranscript(pcm,signal){
  const preview=this.preview;
  if(preview){const result=await preview.result;signal.throwIfAborted();if(this.preview===preview&&!result.failed&&result.text?.trim()){this.timings.transcriptionOverlapMs=Math.round(this.releasedAt-preview.started);this.preview=null;return result.text;}}
  return this.speech.transcribe(pcm,signal);
 }
 async release(){
  if(!this.turn.release())return;const gen=this.turn.generation;const signal=this.controller.signal;clearTimeout(this.recordTimeout);
  this.releasedAt=performance.now();const pcm=Buffer.concat(this.inputChunks);this.inputChunks=[];await this.audio.stopRecording();if(!this.valid(gen))return;
  if(pcm.length<4800){this.setState('idle');return;}this.setState('thinking');this.active=true;
  try{const text=await this.finalTranscript(pcm,signal);if(!this.valid(gen))return;this.timings.recognitionMs=Math.round(performance.now()-this.releasedAt);this.emit({latency:{...this.timings}});if(!text){this.active=false;this.setState('idle');return;}await this.respond(text,gen);}
  catch(e){if(this.valid(gen))this.error(e);}
 }
 async text(text){
  if(!text?.trim())return;this.turn.stop();const gen=this.turn.generation;this.interrupt();await this.audio.stopRecording?.();if(gen!==this.turn.generation||this.closing)return;this.begin();return this.respond(bounded(text,10000),gen);
 }
 async respond(text,gen){
  this.active=true;this.setState('thinking');
  const farewell=directFarewell(text);
  if(farewell)this.pendingDismiss=gen;
  try{
   await this.cancellation;if(!this.valid(gen))return;
   await this.runningAgent?.catch(()=>{});if(!this.valid(gen))return;
   this.memory.add('user',text);this.showCaption('user',text);
   this.modelStartedAt=performance.now();
   const receive=delta=>{if(this.valid(gen)){if(this.timings.modelFirstTextMs===undefined){this.timings.modelFirstTextMs=Math.round(performance.now()-this.modelStartedAt);this.emit({latency:{...this.timings}});}this.transcript=bounded(this.transcript+delta,24000);this.showCaption('assistant',this.transcript);this.pendingSentence=bounded(this.pendingSentence+delta,24000);this.flushSentences(gen);}};
   // The existing conservative whole-utterance matcher has already established
   // an explicit end request. A tool-enabled conversation turn adds unnecessary
   // reasoning and another round trip after end_conversation. Keep this reply
   // localized and cancellable, with dismissal still gated on actual playback.
   this.runningAgent=farewell?this.agent.notice(idleInstruction(this.locale,true)).then(receive):this.agent.run(text,receive);
   await this.runningAgent;if(!this.valid(gen))return;
   if(this.agent.forgotten){this.memoryWasForgotten=true;this.agent.forgotten=false;}
   this.flushSentences(gen,true);await this.speechChain;if(!this.valid(gen))return;
   this.active=false;this.audio.finish();if(!this.audio.pumping)this.drained();
  }catch(e){if(this.valid(gen))this.error(e);}
 }
 flushSentences(gen,final=false){
  while(this.pendingSentence){const match=/^([\s\S]*?[。！？]|[\s\S]*?[.!?](?:\s|$)|[\s\S]*?\n)/.exec(this.pendingSentence);
   const clause=!this.audioBytes&&this.pendingSentence.length>=24?/^(.{18,}?[、，,])/.exec(this.pendingSentence):null;
   const length=match?match[0].length:clause?clause[0].length:this.pendingSentence.length>400?400:final?this.pendingSentence.length:0;if(!length)break;
   const text=this.pendingSentence.slice(0,length).trim();this.pendingSentence=this.pendingSentence.slice(length);if(text)this.queueSpeech(text,gen);
  }
 }
 queueSpeech(text,gen){
  const epoch=this.voiceEpoch,signal=this.controller.signal;
  this.speechChain=this.speechChain.then(async()=>{
   if(!this.valid(gen)||epoch!==this.voiceEpoch)return;
   const start=this.audioBytes;const speechStartedAt=performance.now();this.speechController=new AbortController();const segmentSignal=AbortSignal.any([signal,this.speechController.signal]);
   try{await this.speech.speak(text,b=>{if(!this.valid(gen)||epoch!==this.voiceEpoch)return;if(this.timings.speechFirstAudioMs===undefined){this.timings.speechFirstAudioMs=Math.round(performance.now()-speechStartedAt);if(this.releasedAt)this.timings.releaseToAudioMs=Math.round(performance.now()-this.releasedAt);this.emit({latency:{...this.timings}});}this.audioBytes+=b.length;this.audio.enqueue(b);},segmentSignal);}
   catch(e){if(this.valid(gen)&&epoch===this.voiceEpoch)throw e;return;}
   if(this.valid(gen)&&epoch===this.voiceEpoch)this.segments.push({text,start,end:this.audioBytes});
  });
  // Keep rejections observed while the model is still streaming.
  this.speechChain.catch(()=>{});
 }
 saveSpoken(interrupted=false){
  if(!this.transcript||this.noticeResponse)return;
  if(!this.memoryWasForgotten){
   const heard=(this.segments||[]).filter(s=>s.end<=this.audio.played*48).map(s=>s.text).join(' ');
   if(interrupted)this.agent?.notePlayback?.(heard);
   this.memory.add('assistant',interrupted?'[Interrupted; only complete played segments are confirmed heard] '+heard:this.transcript);
  }
  this.transcript='';this.memoryWasForgotten=false;
 }
 drained(){
  if(this.active||this.turn.recording||this.audio.pumping)return;this.saveSpoken();this.setState('idle');
  if(this.pendingRestart===this.turn.generation){this.pendingRestart=undefined;Promise.resolve(this.onPrepareRestartContext?.({locale:this.locale})).then(()=>restartAssistant(runDesktopCommand)).catch(e=>this.error(e));return;}
  if(this.pendingDismiss===this.turn.generation){this.pendingDismiss=undefined;this.emit({dismiss:true});return;}
  if(this.wakeGeneration===this.turn.generation&&!this.wakeTimer){const gen=this.turn.generation;this.wakeTimer=setTimeout(()=>{this.wakeTimer=null;if(gen!==this.turn.generation)return;this.wakeGeneration=null;this.onWakeReady?.();this.press().catch(e=>this.error(e));},120);}
 }
 async greet(listenAfter=false,instructions){
  if(this.turn.recording||this.active||this.audio.pumping||this.agent?.busy)return;
  this.turn.stop();this.begin();const gen=this.turn.generation;this.noticeResponse=true;this.active=true;this.responseRequested=true;this.wakeGeneration=listenAfter?gen:null;this.setState('thinking');
  try{const text=instructions===undefined&&this.locale?.split('-')[0]==='en'?greetingSource:await this.agent.notice(instructions??greetingInstruction(this.locale));if(!this.valid(gen))return false;this.transcript=text;this.showCaption('assistant',text);this.queueSpeech(text,gen);await this.speechChain;if(!this.valid(gen))return false;this.active=false;this.responseRequested=false;this.audio.finish();if(!this.audio.pumping)this.drained();
   // The greeting PCM is already queued. Prepare local recognition while it
   // plays and the user starts speaking, without delaying the opening sound.
   // A later real transcription still reports any model-loading failure.
   Promise.resolve().then(()=>{if(this.valid(gen))return this.speech.prepareRecognition?.()}).catch(()=>{});
   return true;}
  catch(e){if(this.valid(gen))this.error(e);return false;}
 }
 error(e){this.cancelTranscription();this.controller?.abort();this.silence();this.agent?.cancel().catch(()=>{});this.active=false;this.responseRequested=false;clearTimeout(this.recordTimeout);clearTimeout(this.wakeTimer);this.wakeGeneration=null;this.turn.stop();this.audio.stopRecording?.();this.setState('error',{error:bounded(e.message,800),level:0});}
 async close(){this.closing=true;this.turn.stop();this.interrupt();await this.agent?.close();await this.audio.close();}
}
