import test from 'node:test';import assert from 'node:assert/strict';
import {BufferedVoiceEffects} from '../runtime/buffered-voice-effects.mjs';
const frame=()=>{const b=Buffer.alloc(960);for(let i=0;i<960;i+=2)b.writeInt16LE(2000,i);return b};
test('buffers speech, waits for a pause, renders selected effects then delivers in order',async()=>{
 const outputs=[],options=[];const buffer=new BufferedVoiceEffects({deliver:b=>outputs.push(b),onError:e=>{throw e},render:async(pcm,o)=>{options.push(o);return pcm;}});
 buffer.append(frame());buffer.append(Buffer.alloc(960*29));assert.equal(outputs.length,0);assert.equal(buffer.busy,true);
 buffer.append(Buffer.alloc(960));await buffer.chain;assert.equal(outputs.length,1);assert.deepEqual(options[0],{vocoder:.5,radio:true,reverb:false});assert.equal(buffer.busy,false);
});
test('reset prevents pending effects from playing after the conversation closes',async()=>{
 let complete;const output=[];const buffer=new BufferedVoiceEffects({deliver:b=>output.push(b),onError:e=>{throw e},render:()=>new Promise(r=>complete=r)});
 buffer.append(Buffer.concat([frame(),Buffer.alloc(960*30)]));await Promise.resolve();const pending=buffer.chain;buffer.reset();complete(frame());await pending;assert.equal(output.length,0);assert.equal(buffer.busy,false);
});
