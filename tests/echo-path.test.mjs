import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {Audio} from '../runtime/audio.mjs';
test('stopping playback exposes completion only after its owned process closes',async()=>{
 const audio=new Audio(()=>{},()=>{});let signal,finished=false;
 const child=Object.assign(new EventEmitter(),{pid:123,exitCode:null,kill(value){signal=value;return true;}});
 audio.player=child;
 const stopped=audio.stop();assert.equal(typeof stopped?.then,'function');
 stopped.then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);
 assert.equal(signal,'SIGTERM');child.exitCode=0;child.emit('close',0);await stopped;
 assert.equal(finished,true);
});

test('conversation microphone targets cleaned source for shared recording',()=>{
 let args;const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()});
 const audio=new Audio(()=>{},()=>{},{inputTarget:'clean-mic',spawnProcess:(...a)=>{args=a;return child}});
 audio.record(()=>{});assert.deepEqual(args[1].slice(0,2),['--target','clean-mic']);
});
