import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../runtime/dobby-client.mjs';
const {DobbyClient,requestId}=client;

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
test('instructions go in their own field when Dobby advertises them, folded into text otherwise',async()=>{
 for(const capabilities of [['instructions'],undefined]){
  const client=new DobbyClient();const sent=[];
  client.command=async m=>{sent.push(m);return m.action==='say'?{request_id:m.request_id,status:'accepted'}:{busy:false,pending:false,capabilities}};
  await client.submit('hello',requestId(),{instructions:'Be O.M.A.',legacy:'Be O.M.A. {"user_request":"hello"}'});
  const say=sent.find(m=>m.action==='say');
  if(capabilities)assert.deepEqual([say.text,say.instructions,say.client],['hello','Be O.M.A.','oma']);
  else{assert.equal(say.text,'Be O.M.A. {"user_request":"hello"}');assert.equal(say.instructions,undefined);}
 }
});
test('the sentinel state is bounded and fresh only for ten minutes',()=>{
 const {autonomyPatch}=client;
 assert.deepEqual(autonomyPatch({}),{events:[],proposals:[],fresh:false,lastChecked:0});
 assert.deepEqual(autonomyPatch({autonomy:[1]}),{events:[],proposals:[],fresh:false,lastChecked:0});
 const state={autonomy:{events:[{ts:1000,title:'x'},null],proposals:Array.from({length:9},(_,i)=>({id:String(i)}))}};
 const patch=autonomyPatch(state,1000*1000+60000);
 assert.equal(patch.events.length,1);assert.equal(patch.proposals.length,5);assert.equal(patch.fresh,true);
 assert.equal(autonomyPatch(state,1000*1000+601000).fresh,false);
});
test('daily advisor state and probe timestamp survive the client adapter',()=>{
 const advisor={enabled:false,status:'done',report:'/local/draft.md'};
 const patch=client.autonomyPatch({autonomy:{advisor,last_checked:123}});
 assert.deepEqual(patch.advisor,advisor);assert.equal(patch.lastChecked,123);
 assert.equal(client.autonomyPatch({autonomy:{advisor:[]}}).advisor,undefined);
});
