import test from 'node:test';import assert from 'node:assert/strict';
const {LiveIdle}=await import('../runtime/live-idle.mjs').catch(()=>({}));
function fixture(){assert.equal(typeof LiveIdle,'function');let time=0,ready=true,closed=0;const speech=[];const idle=new LiveIdle({now:()=>time,ready:()=>ready,speak:bye=>speech.push(bye),dismiss:()=>closed++});idle.show(true);return {idle,speech,advance:n=>time+=n,ready:v=>ready=v,get closed(){return closed}};}
test('10 seconds prompts, next 10 seconds says farewell, closes only after audible farewell',()=>{
 const f=fixture();f.advance(9999);f.idle.tick();assert.deepEqual(f.speech,[]);f.advance(1);f.idle.tick();assert.deepEqual(f.speech,[false]);f.advance(3000);f.idle.tick();assert.equal(f.closed,0);f.idle.output();f.advance(2000);f.idle.output();f.advance(9999);f.idle.tick();assert.equal(f.speech.length,1);f.advance(1);f.idle.tick();assert.deepEqual(f.speech,[false,true]);f.advance(3000);f.idle.tick();assert.equal(f.closed,0);f.idle.output();f.advance(1499);f.idle.tick();assert.equal(f.closed,0);f.advance(1);f.idle.tick();assert.equal(f.closed,1);
});
test('user activity cancels farewell, work pauses countdown, hidden panels never prompt',()=>{
 const f=fixture();f.advance(10000);f.idle.tick();f.idle.output();f.advance(10000);f.idle.tick();f.idle.activity();f.idle.output();f.advance(1500);f.idle.tick();assert.equal(f.closed,0);f.ready(false);f.advance(20000);f.idle.tick();f.ready(true);f.idle.tick();assert.equal(f.speech.length,2);f.idle.show(false);f.advance(50000);f.idle.tick();assert.equal(f.speech.length,2);
});
test('missing farewell audio never silently dismisses the panel',()=>{
 const f=fixture();f.advance(10000);f.idle.tick();f.idle.output();f.advance(10000);f.idle.tick();f.advance(16000);f.idle.tick();assert.equal(f.closed,0);assert.equal(f.idle.stage,'waiting');
});
test('only new transcribed words reset inactivity; noise tags and repeated captions do not',()=>{
 const f=fixture();f.advance(9000);f.idle.input('[lip smack] [tongue click]');f.advance(1000);f.idle.tick();assert.deepEqual(f.speech,[false]);f.idle.input('こんにちは');f.advance(9000);f.idle.input('こんにちは');f.advance(1000);f.idle.tick();assert.deepEqual(f.speech,[false,false]);
});
