import test from 'node:test';import assert from 'node:assert/strict';
import {Vocoder} from '../runtime/vocoder.mjs';
test('vocoder is packet independent and preserves sample count',()=>{
 const input=Buffer.alloc(48000);for(let i=0;i<input.length/2;i++)input.writeInt16LE(Math.round(6000*Math.sin(i*2*Math.PI*180/24000)),i*2);
 const full=new Vocoder().process(input),stream=new Vocoder();
 const chunks=[];for(let i=0;i<input.length;i+=960)chunks.push(stream.process(input.subarray(i,i+960)));
 assert.deepEqual(Buffer.concat(chunks),full);assert.equal(full.length,input.length);assert.notDeepEqual(full,input);
 stream.reset();assert.deepEqual(stream.process(input),full);
});
test('vocoder emits silence for silence',()=>{assert.deepEqual(new Vocoder().process(Buffer.alloc(4800)),Buffer.alloc(4800));});
test('50 percent is the arithmetic midpoint of dry and wet, with no mix-dependent gain',()=>{
 const input=Buffer.alloc(48000);for(let i=0;i<input.length/2;i++)input.writeInt16LE(Math.round(2000*Math.sin(i*2*Math.PI*180/24000)),i*2);
 const dry=new Vocoder({mix:0}).process(input),wet=new Vocoder({mix:1}).process(input),half=new Vocoder({mix:.5}).process(input);
 assert.deepEqual(dry,input);
 for(let i=0;i<input.length;i+=2)assert.ok(Math.abs(half.readInt16LE(i)-(dry.readInt16LE(i)+wet.readInt16LE(i))/2)<=1);
});
