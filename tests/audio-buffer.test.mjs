import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {Audio} from '../runtime/audio.mjs';

function fixture(t){
 t.mock.timers.enable({apis:['setTimeout','Date']});
 t.mock.method(performance,'now',()=>Date.now());
 const chunks=[];let spawned=0;
 const child=new EventEmitter();child.stdin=new PassThrough();child.stderr=new PassThrough();
 child.stdin.on('data',b=>chunks.push(Buffer.from(b)));
 child.stdin.on('finish',()=>child.emit('close',0));child.kill=()=>child.emit('close',null);
 const audio=new Audio(()=>{},()=>{},{startupBufferMs:250,spawnProcess:()=>{spawned++;return child}});
 t.after(()=>audio.stop());
 return {audio,chunks,get spawned(){return spawned}};
}
async function advance(t,ms){for(let at=0;at<ms;at+=10){t.mock.timers.tick(Math.min(10,ms-at));await Promise.resolve();}}

test('streaming playback buffers arrival jitter without changing or dropping PCM',async t=>{
 const f=fixture(t),packets=[Buffer.alloc(4800,1),Buffer.alloc(4800,2),Buffer.alloc(4800,3)];
 f.audio.enqueue(packets[0]);await advance(t,130);f.audio.enqueue(packets[1]);
 await advance(t,110);f.audio.enqueue(packets[2]);
 assert.equal(f.spawned,0,'Do not start the output clock before the jitter reserve is ready');
 await advance(t,10);assert.equal(f.spawned,1);
 assert.ok(Buffer.concat(f.chunks).length<Buffer.concat(packets).length,"Playback levels must not race through the whole reserve");
 await advance(t,220);
 assert.deepEqual(Buffer.concat(f.chunks),Buffer.concat(packets));
 f.audio.finish();await advance(t,20);
});
test('a finished short clip drains without waiting for the entire startup buffer',async t=>{
 const f=fixture(t),packet=Buffer.alloc(960,7);f.audio.enqueue(packet);f.audio.finish();
 await advance(t,10);assert.equal(f.spawned,1);assert.deepEqual(Buffer.concat(f.chunks),packet);
});
test('stopping during startup cancels the old buffer and a new stream starts cleanly',async t=>{
 const f=fixture(t);f.audio.enqueue(Buffer.alloc(4800,1));await advance(t,100);f.audio.stop();
 const packet=Buffer.alloc(4800,2);f.audio.enqueue(packet);await advance(t,150);
 assert.equal(f.spawned,0);await advance(t,100);assert.equal(f.spawned,1);
 assert.deepEqual(Buffer.concat(f.chunks),packet);f.audio.finish();await advance(t,20);
});
test('after a long delivery gap playback rebuilds its jitter reserve',async t=>{
 const f=fixture(t),first=Buffer.alloc(4800,1),second=Buffer.alloc(4800,2);
 f.audio.enqueue(first);await advance(t,600);
 assert.deepEqual(Buffer.concat(f.chunks),first);
 f.audio.enqueue(second);await advance(t,240);
 assert.deepEqual(Buffer.concat(f.chunks),first,'Do not resume with an empty jitter reserve');
 await advance(t,20);assert.deepEqual(Buffer.concat(f.chunks),Buffer.concat([first,second]));
 f.audio.finish();await advance(t,20);
});
test('stop during rebuffering does not leak old speech into a new session',async t=>{
 const f=fixture(t);f.audio.enqueue(Buffer.alloc(4800,1));await advance(t,600);
 f.audio.enqueue(Buffer.alloc(4800,2));await advance(t,100);f.audio.stop();
 const before=Buffer.concat(f.chunks).length;
 f.audio.enqueue(Buffer.alloc(4800,3));await advance(t,260);
 const resumed=Buffer.concat(f.chunks).subarray(before);
 assert.ok(resumed.equals(Buffer.alloc(4800,3)));f.audio.finish();await advance(t,20);
});
test('waveform updates follow playback time instead of consuming a whole utterance immediately',async t=>{
 const f=fixture(t),times=[];f.audio.onLevel=level=>{if(level>0)times.push(Date.now());};
 const pcm=Buffer.alloc(48000);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(2000,i);
 f.audio.enqueue(pcm);f.audio.finish();await advance(t,100);
 assert.ok(times.length<20);await advance(t,1000);
 assert.equal(times.length,50);assert.ok(times.at(-1)-times[0]>=800);
});
test('speaker warmup sends only silence before preserving the complete first word',async t=>{
 const f=fixture(t);f.audio.startupBufferMs=0;f.audio.leadingSilenceMs=350;
 const word=Buffer.alloc(4800,19);f.audio.enqueue(word);f.audio.finish();await advance(t,10);
 const silence=Buffer.alloc(16800);assert.deepEqual(Buffer.concat(f.chunks),silence);
 await advance(t,250);assert.deepEqual(Buffer.concat(f.chunks),silence);
 await advance(t,250);assert.deepEqual(Buffer.concat(f.chunks),Buffer.concat([silence,word]));
});
test('interrupting output warmup prevents the cancelled first word from being played',async t=>{
 const f=fixture(t);f.audio.startupBufferMs=0;f.audio.leadingSilenceMs=350;
 f.audio.enqueue(Buffer.alloc(4800,19));await advance(t,100);f.audio.stop();await advance(t,400);
 assert.deepEqual(Buffer.concat(f.chunks),Buffer.alloc(16800));
});
