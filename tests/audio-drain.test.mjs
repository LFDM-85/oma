import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {Audio} from '../runtime/audio.mjs';
function fixture(){
 const child=new EventEmitter();child.stdin=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('close',null,'SIGTERM');
 const audio=new Audio(()=>{},()=>{},{spawnProcess:()=>child});let drained=0;audio.onDrained=()=>drained++;
 return {audio,child,get drained(){return drained}};
}
test('audio remains busy until the player finishes playing its buffered tail',async()=>{
 const f=fixture();f.audio.enqueue(Buffer.alloc(960));f.audio.finish();await delay(60);
 assert.equal(f.audio.pumping,true);assert.equal(f.drained,0);
 assert.equal(f.child.stdin.writableEnded,true);
 f.child.emit('close',0);await delay(0);
 assert.equal(f.audio.pumping,false);assert.equal(f.drained,1);
});
test('interruption during output drain never triggers a delayed farewell close',async()=>{
 const f=fixture();f.audio.enqueue(Buffer.alloc(960));f.audio.finish();await delay(60);
 f.audio.stop();await delay(0);assert.equal(f.drained,0);assert.equal(f.audio.pumping,false);
});
test('playback sends received PCM unchanged, without gain, limiter or tail samples',async()=>{
 const f=fixture(), chunks=[];f.child.stdin.on('data',b=>chunks.push(Buffer.from(b)));
 const pcm=Buffer.alloc(4800);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(i%4?32767:-32768,i);
 f.audio.enqueue(pcm);f.audio.finish();await delay(130);
 assert.deepEqual(Buffer.concat(chunks),pcm);
 f.child.emit('close',0);await delay(0);
});
test('faster playback changes only the output sample clock',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('close',0);
 let args;const chunks=[];child.stdin.on('data',b=>chunks.push(Buffer.from(b)));
 const audio=new Audio(()=>{},()=>{},{playbackRate:1.25,spawnProcess:(command,a)=>{args=a;return child}});
 const input=Buffer.alloc(960,17);audio.enqueue(input);audio.finish();await delay(30);
 assert.equal(args[args.indexOf('--rate')+1],'30000');assert.deepEqual(Buffer.concat(chunks),input);
 child.emit('close',0);
});
