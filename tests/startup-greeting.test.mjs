import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const mod=await import('../runtime/startup-greeting.mjs').catch(()=>({}));
test('cached greeting plays before connection and input waits for playback and connection',()=>{
 assert.equal(typeof mod.StartupGreeting,'function');
 const sent=[],played=[];const g=new mod.StartupGreeting({play:pcm=>played.push(pcm)});
 g.begin({pcm:Buffer.alloc(4800),text:'Ready.'});g.input(Buffer.from([1,0]));
 assert.equal(played.length,1);g.connect(p=>sent.push(p));assert.equal(sent.length,0);
 g.drained();assert.deepEqual(sent,[Buffer.from([1,0])]);g.input(Buffer.from([2,0]));assert.equal(sent.length,2);
});
test('stop discards buffered input and prevents late connection delivery',()=>{
 assert.equal(typeof mod.StartupGreeting,'function');const sent=[];const g=new mod.StartupGreeting({play(){}});
 g.begin({pcm:Buffer.alloc(4800),text:'Ready.'});g.input(Buffer.alloc(960));g.stop();g.connect(p=>sent.push(p));g.drained();assert.equal(sent.length,0);
});
test('cache is keyed by language and voice, rejects invalid audio',()=>{
 assert.equal(typeof mod.GreetingCache,'function');const dir=mkdtempSync(join(tmpdir(),'oma-greeting-'));
 try{const c=new mod.GreetingCache(dir);c.save('ja-JP','cedar',{text:'お待ちしています。',pcm:Buffer.alloc(48000)});assert.equal(c.load('ja-JP','cedar').pcm.length,48000);assert.equal(c.load('en-US','cedar'),null);assert.equal(c.load('ja-JP','marin'),null);assert.throws(()=>c.save('ja-JP','cedar',{text:'x',pcm:Buffer.alloc(1)}));}finally{rmSync(dir,{recursive:true,force:true})}
});
test('playback finishing before connection retains ordered speech until connected',()=>{
 const sent=[];const g=new mod.StartupGreeting({play(){}});g.begin({pcm:Buffer.alloc(4800),text:'Ready.'});g.input(Buffer.from([1,0]));g.drained();g.input(Buffer.from([2,0]));g.connect(p=>sent.push(p));assert.deepEqual(sent,[Buffer.from([1,0]),Buffer.from([2,0])]);
});
test('waiting input is bounded and a new opening does not replay old speech',()=>{
 const sent=[];const g=new mod.StartupGreeting({play(){}});g.begin({pcm:Buffer.alloc(4800),text:'Ready.'});for(let i=0;i<20;i++)g.input(Buffer.alloc(48000));assert.ok(g.bytes<=720000);g.stop();g.begin({pcm:Buffer.alloc(4800),text:'Ready.'});g.connect(p=>sent.push(p));g.drained();assert.equal(sent.length,0);
});
test('farewell clips are language-specific and cannot replace opening greetings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-farewell-cache-'));try{const opening=new mod.GreetingCache(dir),farewell=new mod.GreetingCache(dir,{farewell:true});opening.save('ja-JP','cedar',{text:'Ready.',pcm:Buffer.alloc(48000)});assert.equal(farewell.load('ja-JP','cedar'),null);farewell.save('ja-JP','cedar',{text:'Bye.',pcm:Buffer.alloc(48000)});assert.equal(opening.load('ja-JP','cedar').text,'Ready.');assert.equal(farewell.load('ja-JP','cedar').text,'Bye.');assert.equal(farewell.load('en-US','cedar'),null);}finally{rmSync(dir,{recursive:true,force:true})}
});

test('raw and processed opening and farewell caches cannot overwrite each other',()=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-cache-modes-'));
 try{for(const farewell of [false,true]){
  const c=new mod.GreetingCache(dir,{farewell});const processed={text:'Processed.',pcm:Buffer.alloc(4800,1)},raw={text:'Raw.',pcm:Buffer.alloc(4800,2)};
  c.save('en-US','cedar',processed);assert.equal(c.path('en-US','cedar'),c.path('en-US','cedar',true));assert.equal(c.load('en-US','cedar',false),null);
  c.save('en-US','cedar',raw,false);assert.deepEqual(c.load('en-US','cedar',false),raw);assert.deepEqual(c.load('en-US','cedar',true),processed);
 }}finally{rmSync(dir,{recursive:true,force:true})}
});
