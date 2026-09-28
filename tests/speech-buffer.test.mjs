import test from 'node:test';import assert from 'node:assert/strict';
import {SpeechBuffer} from '../runtime/speech-buffer.mjs';
const frame=value=>{const b=Buffer.alloc(960);for(let i=0;i<960;i+=2)b.writeInt16LE(value,i);return b};
test('buffers a complete phrase through short pauses and flushes at silence',()=>{
 const out=[];const buffer=new SpeechBuffer(b=>out.push(b));
 buffer.append(Buffer.concat([frame(0),frame(1000),frame(0),frame(1000)]));assert.equal(out.length,0);
 buffer.append(Buffer.alloc(960*15));assert.equal(out.length,1);assert.ok(out[0].includes(frame(1000)));assert.equal(buffer.frames.length,0);
 buffer.append(Buffer.alloc(960*20));assert.equal(out.length,1);
});
test('reset discards pending speech and handles split PCM packets',()=>{
 const out=[];const buffer=new SpeechBuffer(b=>out.push(b));const speech=frame(1000);buffer.append(speech.subarray(0,11));buffer.append(speech.subarray(11));buffer.reset();buffer.append(Buffer.alloc(960*20));assert.equal(out.length,0);
});
