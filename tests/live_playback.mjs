// Opt-in billed GPT-Live -> real PipeWire speaker check. No microphone, tools or personal memory.
import OpenAI from 'openai';
import {LiveWS} from 'openai/resources/live/ws';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {loadApiKey} from '../runtime/credentials.mjs';
import {Audio} from '../runtime/audio.mjs';
const errors=[],incoming=createHash('sha256'),outgoing=createHash('sha256');
let bytes=0,voiced=0,firstAt,lastAt,maxGap=0,timer,drain,accepting=true;
const drained=new Promise(resolve=>drain=resolve);
const audio=new Audio(level=>{if(level>.04)voiced++},e=>errors.push(e),{
 startupBufferMs:250,playbackRate:1,outputTarget:process.env.OMA_TEST_OUTPUT_TARGET||null,
 spawnProcess(command,args,options){
  const child=spawn(command,args,options),write=child.stdin.write.bind(child.stdin);
  child.stdin.write=(pcm,...rest)=>{outgoing.update(pcm);return write(pcm,...rest)};
  return child;
 }
});audio.onDrained=drain;
const wire=new LiveWS(new OpenAI({apiKey:await loadApiKey()}),{reconnect:false});
wire.socket.on('open',()=>wire.send({type:'session.start',session:{model:'gpt-live-1',store:false,
 instructions:'Speak Japanese.',audio:{format:{type:'audio/pcm',rate:24000},output:{voice:'vesper'}}}}));
wire.on('error',e=>errors.push(e.message));
wire.on('event',e=>{
 if(e.type==='error')errors.push(e.error?.message||'Live error');
 if(e.type==='session.started'){
  timer=setInterval(()=>wire.send({type:'session.input_audio.append',audio:Buffer.alloc(960).toString('base64')}),20);
  wire.send({type:'session.instructions.append',delegation_id:null,content:'今すぐ「オーマです。音声の再生テストをしています。声を加工せず、そのままの速さで話しています。」と一度だけ話してください。'});
 }
 if(e.type==='session.output_audio.delta'&&accepting){
  const pcm=Buffer.from(e.delta,'base64'),now=performance.now();
  firstAt??=now;if(lastAt)maxGap=Math.max(maxGap,now-lastAt);lastAt=now;
  incoming.update(pcm);bytes+=pcm.length;audio.enqueue(pcm);
 }
});
try{
 await delay(14000);accepting=false;clearInterval(timer);wire.close();
 assert.ok(bytes>0,'Received live audio');audio.finish();
 let timeout;try{await Promise.race([drained,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Playback did not drain')),5000)})]);}finally{clearTimeout(timeout);}
 assert.deepEqual(errors,[]);assert.ok(voiced>0,'Speech reached playback');
 assert.equal(outgoing.digest('hex'),incoming.digest('hex'),'Every PCM byte reaches the player unchanged');
 console.log(JSON.stringify({pass:true,audioMs:bytes/48,maxPacketGapMs:Math.round(maxGap),startupBufferMs:250,pcmUnchanged:true,playbackDrained:true}));
}finally{clearInterval(timer);wire.close();audio.stop();}
