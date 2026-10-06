import test from 'node:test';
import assert from 'node:assert/strict';
import {DobbyClient,requestId} from '../runtime/dobby-client.mjs';

test('refuses a new request while Dobby has a pending action',async()=>{
 const client=new DobbyClient();const calls=[];
 client.command=async m=>{calls.push(m);return {pending:true,busy:false}};
 await assert.rejects(client.submit('hello',requestId()),/ocupado/);
 assert.deepEqual(calls,[{action:'status'}]);assert.equal(client.active,null);
});
test('Stop cannot cancel another client’s active request',async()=>{
 const client=new DobbyClient();client.active=requestId();const calls=[];
 client.command=async m=>{calls.push(m);return {request_id:requestId(),busy:true,pending:true}};
 await client.cancel();assert.deepEqual(calls,[{action:'status'}]);assert.equal(client.active,null);
});
test('confirmation is scoped to the active request and its pending state',async()=>{
 const client=new DobbyClient();const id=requestId();client.active=id;let confirmed=false;
 client.command=async m=>{if(m.action==='confirm')confirmed=true;return {request_id:requestId(),pending:true}};
 await assert.rejects(client.confirm(id,true),/já não/);assert.equal(confirmed,false);
 await assert.rejects(client.confirm(requestId(),true),/outro/);assert.equal(confirmed,false);
});
test('cancelling during acceptance waits for the request ID and cancels only that request',async()=>{
 const client=new DobbyClient();let accepted,allowAcceptance;const gate=new Promise(resolve=>allowAcceptance=resolve);const calls=[];
 client.command=async m=>{
  calls.push(m);
  if(m.action==='say'){accepted=m;await gate;return {request_id:m.request_id,status:'accepted'}}
  if(m.action==='status')return {request_id:accepted?.request_id,busy:!!accepted,pending:false};
  return 'Cancelled.';
 };
 const submit=client.submit('hello',requestId());
 await new Promise(resolve=>setImmediate(resolve));
 const cancel=client.cancel();allowAcceptance();await Promise.all([submit,cancel]);
 const cancelled=calls.find(c=>c.action==='cancel');assert.equal(cancelled.request_id,accepted.request_id);assert.equal(accepted.silent,true);assert.equal(accepted.version,2);assert.equal(client.active,null);
});
test('rejects an unaccepted request and preserves the daemon refusal',async()=>{
 const client=new DobbyClient();client.command=async m=>m.action==='status'?{busy:false,pending:false}:{error:'busy now',code:'busy'};
 await assert.rejects(client.submit('hello',requestId()),/busy now/);assert.equal(client.active,null);
});
test('bounds the ASCII JSON wire before opening a socket',async()=>{
 const client=new DobbyClient({socketPath:'/path/never-opened'});
 await assert.rejects(client.command({action:'say',text:'漢'.repeat(6000)}),/demasiado longo/);
});
test('an interrupted request must finish stopping before its replacement can run',async()=>{
 const client=new DobbyClient();let count=0;
 client.status=async()=>({busy:++count<3,pending:false});
 await client.waitUntilIdle({pollMs:1});assert.equal(count,3);
});
test('cancel preserves its request ownership when the daemon cannot be reached',async()=>{
 const client=new DobbyClient();client.active=requestId();const owned=client.active;
 client.status=async()=>{throw Error('unreachable')};
 await assert.rejects(client.cancel(),/unreachable/);assert.equal(client.active,owned);
});
