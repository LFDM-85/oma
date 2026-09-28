import {Audio} from './audio.mjs';
import {Oma} from './oma.mjs';
import {HandsFreeTurn} from './wake.mjs';
export function approvalDecision(text){
 const answer=String(text).normalize('NFKC').toLowerCase().replace(/[\s。、,.!！?？]/g,'');
 if(['はい','お願いします','はいお願いします','いいですよ','許可します','許可して','実行して','yes','yesplease','allow','allowonce','goahead','okay','ok','sure','proceed'].includes(answer))return true;
 if(['いいえ','いいえやめてください','いいえ結構です','やめて','やめてください','キャンセル','許可しない','実行しないで','no','nothanks','deny','cancel','stop'].includes(answer))return false;
 return null;
}
export class ApprovalVoice {
 constructor({speech,locale,emit,onDecision,audio,guide,transcribe}){
  Object.assign(this,{speech,locale,emit,onDecision});this.serial=0;this.pending=null;this.phase='idle';
  this.audio=audio||new Audio((level,shapes)=>this.emit({level,...shapes}),error=>{this.phase='waiting';this.emit({error,approvalListening:false})});
  this.guide=guide||new Oma({locale,audio:this.audio,speech,agent:{notice:async text=>text,cancel:async()=>{},close:async()=>{}},memory:{context(){return ''},add(){},needsCompaction(){return false}},emit:p=>{
   if(p.assistantText!==undefined)this.emit({assistantText:p.assistantText});
   if(p.error)this.emit({error:p.error});
  }});
  this.transcribe=transcribe||((pcm,signal)=>this.transcription(pcm,signal));
  this.handsFree=new HandsFreeTurn({release:()=>this.release(),cancel:()=>this.waitForRetry()});
  this.audio.onInputLevel=level=>this.handsFree.level(level);
 }
 async transcription(pcm,signal){return this.speech.transcribe(pcm,signal);}
 show(request){this.clear();this.pending=request;this.ask().catch(e=>this.failed(e));}
 async ask(){
  if(!this.pending)return;
  const serial=this.serial;this.phase='speaking';this.emit({approvalListening:false,userText:''});
  const instruction=this.locale?.startsWith('ja')?'次の操作を許可しますか。'+this.pending.description+'。はい、または、いいえで答えてください。':'Allow this operation? '+this.pending.description+'. Please answer yes or no.';
  await this.guide.greet(false,instruction);
  while(serial===this.serial&&(this.guide.active||this.guide.responseRequested||this.audio.pumping))await new Promise(r=>setTimeout(r,50));
  if(serial!==this.serial)return;
  if(this.guide.state==='error'||this.guide.state==='offline'){this.phase='waiting';return;}
  await this.press();
 }
 async press(initialAudio){
  if(!this.pending||this.phase==='listening')return;
  this.serial++;this.controller?.abort();this.guide.turn.stop();this.guide.interrupt();
  await this.audio.stopRecording();if(!this.pending)return;
  const serial=this.serial;this.chunks=[];this.bytes=0;this.phase='listening';
  this.emit({state:'approval',approvalListening:true,userText:'',error:''});this.handsFree.start();
  if(initialAudio?.length){this.chunks.push(initialAudio);this.bytes=initialAudio.length;this.handsFree.level(1000);}
  this.audio.record(b=>{if(serial!==this.serial||this.phase!=='listening')return;if(this.bytes+b.length>24000*2*20)return;this.chunks.push(b);this.bytes+=b.length;});
 }
 async release(){
  if(!this.pending||this.phase!=='listening')return;
  const serial=this.serial;this.phase='transcribing';this.handsFree.stop();this.emit({approvalListening:false});
  await this.audio.stopRecording();if(serial!==this.serial)return;
  if(this.bytes<4800){this.phase='waiting';return;}
  this.controller=new AbortController();const controller=this.controller;
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{const text=await this.transcribe(Buffer.concat(this.chunks),controller.signal);this.resolve(text,serial);}
  catch(e){if(serial===this.serial)this.failed(e);}finally{clearTimeout(timeout);}
 }
 resolve(text,serial){
  if(serial!==this.serial||!this.pending)return;
  this.emit({userText:text});const answer=approvalDecision(text);
  if(answer===null){this.phase='waiting';this.emit({state:'approval',approvalListening:false,assistantText:'Please say yes or no, or use the approval buttons.'});return;}
  const id=this.pending.id;this.clear();this.onDecision(id,answer);
 }
 waitForRetry(){this.handsFree.stop();this.audio.stopRecording();this.phase='waiting';this.emit({approvalListening:false});}
 failed(error){this.handsFree.stop();this.phase='waiting';this.emit({approvalListening:false,error:error.message});}
 clear(){this.serial++;this.pending=null;this.phase='idle';this.controller?.abort();this.handsFree?.stop();this.guide.turn.stop();this.guide.interrupt();this.audio.stopRecording();this.emit({approvalListening:false});}
 async close(){this.clear();await this.guide.close();}
}
