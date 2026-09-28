import test from 'node:test';
import assert from 'node:assert/strict';
import {HandsFreeTurn} from '../runtime/wake.mjs';

test('hands-free dictation waits through short pauses and restarts the silence window after speech',t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1000});
 let submitted=0,cancelled=0;
 const turn=new HandsFreeTurn({release(){submitted++},cancel(){cancelled++}});
 turn.start();turn.level(1000);
 t.mock.timers.tick(500);
 assert.equal(submitted,0,'a thinking pause must not submit the command');
 turn.level(1000);
 t.mock.timers.tick(900);
 assert.equal(submitted,0,'new speech must restart the full silence window');
 t.mock.timers.tick(200);
 assert.equal(submitted,1);
 assert.equal(cancelled,0);
 t.mock.timers.tick(4000);
 assert.equal(submitted,1);
});
test('a caller can retain a longer pause window for dictation',t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1000});
 let submitted=0;const turn=new HandsFreeTurn({release(){submitted++},cancel(){},silenceMs:5000});
 turn.start();turn.level(1000);
 for(let i=0;i<8;i++){t.mock.timers.tick(1000);turn.level(400);}
 assert.equal(submitted,0);
 t.mock.timers.tick(4000);assert.equal(submitted,0);
 turn.level(400);t.mock.timers.tick(5100);assert.equal(submitted,1);
});
test('early pause notification does not submit and resumed speech invalidates it',t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1000});let pauses=0,resumes=0,releases=0;
 const turn=new HandsFreeTurn({release(){releases++},cancel(){},onPause(){pauses++},onResume(){resumes++}});
 turn.start();turn.level(300);t.mock.timers.tick(400);assert.equal(pauses,1);assert.equal(releases,0);
 turn.level(300);assert.equal(resumes,1);t.mock.timers.tick(400);assert.equal(pauses,2);assert.equal(releases,0);
 t.mock.timers.tick(700);assert.equal(releases,1);
});
