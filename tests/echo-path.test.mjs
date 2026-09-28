import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {EchoPath} from '../runtime/echo-path.mjs';
import {Audio} from '../runtime/audio.mjs';

test('restarting echo cancellation waits for the previous module owner to exit',async()=>{
 const children=[];
 const path=new EchoPath({spawnProcess:()=>{
  if(children.length)assert.equal(children.at(-1).exitCode,0,'Previous module owner is still alive');
  const child=Object.assign(new EventEmitter(),{pid:123,stdin:new PassThrough(),stderr:new PassThrough(),exitCode:null,kill(){setTimeout(()=>{child.exitCode=0;child.emit('close',0);},20);return true;}});
  children.push(child);return child;
 },run:async()=>JSON.stringify([path.source,path.sink].map(name=>({type:'PipeWire:Interface:Node',info:{props:{'node.name':name}}})))});
 await path.start();path.close();await path.start();await path.close();
 assert.equal(children.length,2);
});
test('stopping playback exposes completion only after its owned process closes',async()=>{
 const audio=new Audio(()=>{},()=>{});let signal,finished=false;
 const child=Object.assign(new EventEmitter(),{pid:123,exitCode:null,kill(value){signal=value;return true;}});
 audio.player=child;
 const stopped=audio.stop();assert.equal(typeof stopped?.then,'function');
 stopped.then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);
 assert.equal(signal,'SIGTERM');child.exitCode=0;child.emit('close',0);await stopped;
 assert.equal(finished,true);
});

test('echo module belongs to a child, keeps system default priorities, and is removed on close',async()=>{
 let launch,killed=false;
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stderr:new PassThrough(),exitCode:null,kill(){killed=true}});
 const path=new EchoPath({inputTarget:'selected-microphone',spawnProcess:(...args)=>{launch=args;return child},run:async()=>JSON.stringify([path.source,path.sink].map(name=>({type:'PipeWire:Interface:Node',info:{props:{'node.name':name}}})))});
 await path.start();assert.equal(launch[0],'setpriv');assert.deepEqual(launch[1].slice(0,4),['--pdeathsig','TERM','--','pw-cli']);assert.match(launch[1].at(-1),/aec\/libspa-aec-webrtc/);assert.match(launch[1].at(-1),/priority.session = 0/);
 assert.ok(launch[1].at(-1).includes('target.object = "selected-microphone"'));
 path.close();assert.equal(killed,true);
});
test('conversation microphone targets cleaned source for shared recording',()=>{
 let args;const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()});
 const audio=new Audio(()=>{},()=>{},{inputTarget:'clean-mic',spawnProcess:(...a)=>{args=a;return child}});
 audio.record(()=>{});assert.deepEqual(args[1].slice(0,2),['--target','clean-mic']);
});
