import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('owned child termination waits for exit and escalates an ignored TERM',async t=>{
 const module=await import('../runtime/stop-child.mjs').catch(()=>({}));
 assert.equal(typeof module.stopChild,'function');
 const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready');"],{stdio:['ignore','pipe','ignore']});
 t.after(()=>child.kill('SIGKILL'));await once(child.stdout,'data');
 await module.stopChild(child,{graceMs:20,killMs:1000});
 assert.equal(child.signalCode,'SIGKILL');
 await module.stopChild(child);
});
