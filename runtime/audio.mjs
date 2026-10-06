import {spawn} from 'node:child_process';
import {stopChild} from './stop-child.mjs';
// Keep a retro tremolo without reversing the waveform on every carrier cycle.
// The dry voice stays dominant so consonants do not turn into a harsh buzz.
const voiceEffectAmount=0;
const voiceSample=(v,index,amount)=>v*(1-amount+amount*Math.sin(2*Math.PI*110*index/24000))/Math.hypot(1-amount,amount/Math.SQRT2);
export function shapeAudio(input,offset=0,amount=voiceEffectAmount,volume=2){
 const pcm=Buffer.alloc(input.length-input.length%2);let sum=0,crossings=0,previous=0,peak=0;
 for(let i=0;i<pcm.length/2;i++)peak=Math.max(peak,Math.abs(voiceSample(input.readInt16LE(i*2),offset+i,amount)));
 const safeVolume=Math.min(volume,24576/Math.max(1,peak));
 for(let i=0;i<pcm.length/2;i++){
  const v=input.readInt16LE(i*2);sum+=v*v;if(i>0&&(v>=0)!==(previous>=0))crossings++;previous=v;
  pcm.writeInt16LE(Math.round(voiceSample(v,offset+i,amount)*safeVolume),i*2);
 }
 const level=Math.min(1,Math.sqrt(sum/Math.max(1,pcm.length/2))/7000);
 // A lightweight spectral cue, not phoneme recognition: rounded low-frequency
 // vowels vs wider high-frequency speech. Silence always returns to neutral.
 const brightness=Math.min(1,crossings/Math.max(1,pcm.length/2)*8);
 const gate=level<.035?0:Math.min(1,level*1.4);
 return {pcm,level,lipRound:gate*(1-brightness)*.8,lipWide:gate*brightness*.55};
}
// Five milliseconds of lookahead protect peaks without clipping the waveform.
// State survives network packets. Release is slow enough to avoid buzzing.
export class VoiceProcessor {
 constructor(){this.delay=new Float64Array(120);this.index=0;this.offset=0;this.gain=2;this.hold=0;}
 process(input){
  const pcm=Buffer.alloc(input.length-input.length%2);
  for(let i=0;i<pcm.length/2;i++){
   const delayed=this.delay[this.index];
   this.delay[this.index]=voiceSample(input.readInt16LE(i*2),this.offset++,voiceEffectAmount);
   this.index=(this.index+1)%this.delay.length;
   let peak=Math.abs(delayed);
   for(const sample of this.delay)peak=Math.max(peak,Math.abs(sample));
   const target=Math.min(2,24576/Math.max(1,peak));
   if(target<this.gain){this.gain=target;this.hold=120;}
   else if(this.hold>0)this.hold--;
   else this.gain+=(target-this.gain)*(1-Math.exp(-1/(24000*.1)));
   pcm.writeInt16LE(Math.round(delayed*this.gain),i*2);
  }
  return pcm;
 }
}
export class Audio {
 constructor(onLevel,onError,{spawnProcess=spawn,inputTarget=null,outputTarget=null,processor=null,volume=1,playbackRate=1,startupBufferMs=0,leadingSilenceMs=0}={}){Object.assign(this,{spawnProcess,inputTarget,outputTarget,processor,volume,playbackRate,startupBufferMs,leadingSilenceMs});this.onLevel=onLevel;this.onError=onError;this.serial=0;this.queue=[];this.played=0;this.offset=0;this.finished=true;}
 takeRecording(source){
  const child=source.recorder;if(!child)return;
  source.recorder=null;this.recorder=child;child.omaOwner=this;
 }
 record(onData){
  this.recordHandler=onData;
  if(this.recorder)return;
  const child=this.spawnProcess('pw-record',[...(this.inputTarget?['--target',this.inputTarget]:[]),'--raw','--rate','24000','--channels','1','--format','s16','--latency','40ms','-P','{"node.name":"oma-input","application.name":"O.M.A. Conversation"}','-'],{stdio:['ignore','pipe','pipe']});this.recorder=child;child.omaOwner=this;
  child.stdout.on('data',data=>{let sum=0;for(let i=0;i+1<data.length;i+=2)sum+=data.readInt16LE(i)**2;child.omaOwner.onInputLevel?.(Math.sqrt(sum/Math.max(1,data.length/2)));child.omaOwner.recordHandler?.(data)});child.stderr.resume();child.on('error',()=>this.onError('Microphone could not start.'));
  child.on('exit',code=>{const owner=child.omaOwner;if(owner.recorder===child){owner.recorder=null;if(code)owner.onError('Microphone unavailable. Check PipeWire input.');}});
 }
 stopRecording(){const c=this.recorder;this.recorder=null;if(c){this.recordingStopped=Promise.all([this.recordingStopped,stopChild(c)]).then(()=>{});this.recordingStopped.catch(()=>{});}return this.recordingStopped||Promise.resolve();}
 enqueue(pcm){this.queue.push(pcm);this.finished=false;if(!this.pumping)this.pump();}
 async pump(){
  this.pumping=true;const serial=this.serial;
  // The live source arrives in realtime packets, not ahead of playback. Reserve
  // a little audio before starting PipeWire's clock to absorb network jitter.
  // Keep the original rate; an optional processor changes timbre only.
  const readyAt=performance.now()+this.startupBufferMs;
  while(serial===this.serial&&!this.finished&&performance.now()<readyAt)
   await new Promise(resolve=>setTimeout(resolve,Math.min(10,readyAt-performance.now())));
  try{await this.stopped;}catch(e){if(serial===this.serial){this.pumping=false;this.onError(e.message);}return;}
  if(serial!==this.serial)return;
  if(!this.player){this.player=this.spawnProcess('pw-play',[...(this.outputTarget?['--target',this.outputTarget]:[]),'--volume',String(this.volume),'--raw','--rate',String(Math.round(24000*this.playbackRate)),'--channels','1','--format','s16','--latency','120ms','-'],{stdio:['pipe','ignore','pipe']});
   this.playerDone=new Promise(resolve=>{this.player.once('close',code=>resolve(code===0));this.player.once('error',()=>resolve(false));});
   this.player.stderr.resume();this.player.stdin.on('error',()=>{});
   // Wake the output device with silence; preserve every sample of the first word.
   if(this.leadingSilenceMs>0){
    this.player.stdin.write(Buffer.alloc(Math.round(24000*this.playbackRate*this.leadingSilenceMs/1000)*2));
    const until=performance.now()+this.leadingSilenceMs;
    while(serial===this.serial&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,Math.min(10,until-performance.now())));
    if(serial!==this.serial)return;
   }
  }
  let bufferedUntil=performance.now(),rebuffer=false;
  while(serial===this.serial&&(this.queue.length||!this.finished)){
   if(!this.queue.length){
    if(this.startupBufferMs>0&&performance.now()>=bufferedUntil)rebuffer=true;
    await new Promise(r=>setTimeout(r,10));continue;
   }
   // Once a long gap drains the reserve, rebuild it from the next arrival.
   // Waiting only at session start leaves later speech vulnerable to jitter.
   if(rebuffer){
    const resumeAt=performance.now()+this.startupBufferMs;
    while(serial===this.serial&&!this.finished&&performance.now()<resumeAt)
     await new Promise(resolve=>setTimeout(resolve,Math.min(10,resumeAt-performance.now())));
    if(serial!==this.serial)return;
    rebuffer=false;
   }
   const packet=this.queue.shift();
   for(let at=0;at<packet.length&&serial===this.serial;at+=960){
    const block=packet.subarray(at,at+960);
    const {level,lipRound,lipWide}=shapeAudio(block,this.offset,0,1);
    const pcm=this.processor?this.processor.process(block):block;this.offset+=pcm.length/2;
    bufferedUntil=Math.max(bufferedUntil,performance.now())+pcm.length/(48*this.playbackRate);
    if(this.player?.stdin.writable&&!this.player.stdin.write(pcm)){
     await new Promise(resolve=>{const stream=this.player.stdin;const done=()=>{stream.off('drain',done);stream.off('close',done);stream.off('error',done);resolve()};stream.once('drain',done);stream.once('close',done);stream.once('error',done)});
    }
    if(serial!==this.serial)return;
    this.onLevel(Math.min(1,level*this.volume),{lipRound:Math.min(1,lipRound*this.volume),lipWide:Math.min(1,lipWide*this.volume)});this.played+=pcm.length/(48*this.playbackRate);
    {
     const ahead=bufferedUntil-performance.now()-120;
     if(ahead>0)await new Promise(resolve=>setTimeout(resolve,ahead));
    }
   }
  }
  if(serial===this.serial){
   // EOF tells pw-play to drain PipeWire's queued samples before exiting.
   // Sending the last block is not the same as the speaker finishing it.
   if(this.player?.stdin.writable)this.player.stdin.end();
   const played=await this.playerDone;
   if(serial!==this.serial)return;
   this.player=null;this.playerDone=null;this.pumping=false;
   if(!played){this.queue=[];this.finished=true;this.onLevel(0,{lipRound:0,lipWide:0});this.onError('Audio output stopped before playback completed.');return;}
   if(this.queue.length){this.pump();return;}
   this.onLevel(0,{lipRound:0,lipWide:0});this.onDrained?.();}
 }
 finish(){this.finished=true;}
 stop(){this.outputBuffer?.reset();this.processor?.reset();this.serial++;this.queue=[];this.finished=true;this.pumping=false;const player=this.player;this.player=null;if(player){this.stopped=Promise.all([this.stopped,stopChild(player)]).then(()=>{});this.stopped.catch(()=>{});}this.played=0;this.offset=0;this.onLevel(0,{lipRound:0,lipWide:0});return this.stopped||Promise.resolve();}
 async close(){await this.stopRecording();await this.stop();}
}
