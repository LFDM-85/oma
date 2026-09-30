import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {registerHooks} from 'node:module';
// Fail closed even before dependency injection exists: never contact the API.
const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='openai'||specifier==='openai/resources/live/ws')return {url:'oma-preparation-test:'+specifier,shortCircuit:true};return next(specifier,context)},load(url,context,next){if(url==='oma-preparation-test:openai')return {format:'module',source:'export default class OpenAI {}',shortCircuit:true};if(url==='oma-preparation-test:openai/resources/live/ws')return {format:'module',source: "export class LiveWS {constructor(){throw Error('Network forbidden: connect injection missing')}}",shortCircuit:true};return next(url,context)}});
const {prepareGreeting}=await import('../runtime/prepare-greeting.mjs');hooks.deregister();
function fixture(){
 const raw=Buffer.alloc(24000);for(let i=2000;i<10000;i+=2)raw.writeInt16LE(1234,i);
 const wire=new EventEmitter();wire.socket=new EventEmitter();wire.close=()=>{};
 wire.send=e=>{if(e.type==='session.start')wire.emit('event',{type:'session.started'});if(e.type==='session.instructions.append'){wire.emit('event',{type:'session.output_audio.delta',delta:raw.toString('base64')});wire.emit('event',{type:'session.output_transcript.delta',delta:'Ready.'});}};
 let connections=0;const connect=()=>{connections++;queueMicrotask(()=>wire.socket.emit('open'));return wire;};
 const saved=[],loads=[];const cache={load(...args){loads.push(args);return null},save(...args){saved.push(args)}};
 return {raw,connect,cache,saved,loads,get connections(){return connections}};
}
test('OFF prepares raw opening and farewell clips under the OFF variant without Python',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 for(const farewell of [false,true]){
  const f=fixture();f.cache.farewell=farewell;
  const promise=prepareGreeting({key:'fictional',locale:'en-US',voice:'cedar',cache:f.cache,effectsEnabled:false,connect:f.connect,spawnProcess(){throw Error('Python forbidden')}});
  await Promise.resolve();t.mock.timers.tick(12000);await promise;
  assert.equal(f.connections,1);assert.equal(f.loads[0][2],false);assert.equal(f.saved[0][3],false);
  const end=9998+(farewell?2400:4800);assert.deepEqual(f.saved[0][2].pcm,f.raw.subarray(560,end));
 }
});
test('aborted preparation cannot save after the processing child closes',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const f=fixture(),controller=new AbortController();
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let spawned=0;
 const promise=prepareGreeting({key:'fictional',locale:'en-US',voice:'cedar',cache:f.cache,effectsEnabled:true,signal:controller.signal,connect:f.connect,spawnProcess(){spawned++;return child}});
 await Promise.resolve();t.mock.timers.tick(12000);await Promise.resolve();await Promise.resolve();assert.equal(spawned,1);
 controller.abort();child.stdout.write(Buffer.alloc(24000));child.emit('close',0);await promise;assert.equal(f.saved.length,0);
});
test('an already aborted preparation does not create a connection',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await prepareGreeting({key:'fictional',locale:'en-US',voice:'cedar',cache:f.cache,signal:controller.signal,connect:f.connect});assert.equal(f.connections,0);assert.equal(f.saved.length,0);
});
