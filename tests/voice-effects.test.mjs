import test from 'node:test';import assert from 'node:assert/strict';import {VoiceEffects} from '../runtime/voice-effects.mjs';import {Vocoder} from '../runtime/vocoder.mjs';
test('all eight combinations are packet independent and resettable',()=>{
 const input=Buffer.alloc(24000);for(let i=0;i<6000;i++)input.writeInt16LE(Math.round(5000*Math.sin(i*.19)),i*2);
 for(let mask=0;mask<8;mask++){
  const options={vocoder:mask&1?.5:0,radio:!!(mask&2),reverb:!!(mask&4)},processor=new VoiceEffects(options),expected=processor.process(input);processor.reset();
  const chunks=[];for(let i=0;i<input.length;i+=960)chunks.push(processor.process(input.subarray(i,i+960)));
  assert.deepEqual(Buffer.concat(chunks),expected);assert.equal(expected.length,input.length);
 }
 assert.deepEqual(new VoiceEffects().process(input),input);
 assert.deepEqual(new VoiceEffects({vocoder:.5}).process(input),new Vocoder({mix:.5}).process(input));
});
test('radio reduces low/high frequencies and reverb leaves a decaying tail',()=>{
 const energy=hz=>{const pcm=Buffer.alloc(48000);for(let i=0;i<24000;i++)pcm.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*hz/24000)),i*2);const out=new VoiceEffects({radio:true}).process(pcm);let e=0;for(let i=12000;i<out.length;i+=2)e+=out.readInt16LE(i)**2;return e;};
 assert.ok(energy(60)<energy(1000)*.01);assert.ok(energy(9000)<energy(1000)*.01);
 const impulse=Buffer.alloc(48000);impulse.writeInt16LE(10000,0);const out=new VoiceEffects({reverb:true}).process(impulse);assert.ok(out.subarray(1000,12000).some(x=>x));
});
