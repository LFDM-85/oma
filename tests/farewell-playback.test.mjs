import test from 'node:test';import assert from 'node:assert/strict';
const {FarewellPlayback}=await import('../runtime/farewell-playback.mjs').catch(()=>({}));
test('farewell dismisses immediately on actual player drain without waiting for network close',()=>{
 assert.equal(typeof FarewellPlayback,'function');const events=[];const audio={stop(){events.push('stop audio')},enqueue(){events.push('speech')},finish(){events.push('finish')}};
 const f=new FarewellPlayback({audio,disconnect:()=>{events.push('disconnect');return new Promise(()=>{})},caption:()=>events.push('caption'),dismiss:()=>events.push('dismiss')});f.start({pcm:Buffer.alloc(4800),text:'Bye.'});assert.ok(!events.includes('dismiss'));f.drained();assert.equal(events.at(-1),'dismiss');f.drained();assert.equal(events.filter(x=>x==='dismiss').length,1);
});
test('manual stop cancels pending automatic dismissal and repeated end tools do not repeat speech',()=>{
 assert.equal(typeof FarewellPlayback,'function');let played=0,closed=0;const f=new FarewellPlayback({audio:{stop(){},enqueue(){played++},finish(){}},disconnect(){},caption(){},dismiss(){closed++}});const entry={pcm:Buffer.alloc(4800),text:'Bye.'};f.start(entry);f.start(entry);assert.equal(played,1);f.cancel();f.drained();assert.equal(closed,0);
});
