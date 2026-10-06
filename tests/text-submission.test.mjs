import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
const body=name=>qml.match(new RegExp('^    function '+name+'\\([^\\n]+\\) \\{([\\s\\S]*?)^    \\}','m'))[1];
function fixture(){
 const calls=[],root={textReady:true,textSending:false,textSerial:0,pendingTextId:'',submittedDraft:'',textDraft:'First request',command:m=>calls.push(m)};
 const send=value=>vm.runInNewContext('(function(){'+body('sendText')+'})()',{root,value});
 const finish=result=>vm.runInNewContext('(function(){'+body('finishTextSubmission')+'})()',{root,result});
 return {root,calls,send,finish};
}
test('sending text retains the draft until the backend accepts this submission',()=>{
 const f=fixture();assert.equal(f.send(f.root.textDraft),true);assert.equal(f.root.textDraft,'First request');
 assert.equal(f.calls[0].action,'text');assert.equal(f.calls[0].text,'First request');assert.equal(f.root.textSending,true);
 f.finish({id:f.calls[0].submissionId,accepted:true});assert.equal(f.root.textDraft,'');assert.equal(f.root.textSending,false);
});
test('rejected submissions and stale acknowledgements do not erase user text',()=>{
 const f=fixture();f.send(f.root.textDraft);f.finish({id:'stale',accepted:true});assert.equal(f.root.textSending,true);
 f.finish({id:f.calls[0].submissionId,accepted:false});assert.equal(f.root.textDraft,'First request');assert.equal(f.root.textSending,false);
});
test('an acceptance cannot clear a newer draft started while the request was being submitted',()=>{
 const f=fixture();f.send(f.root.textDraft);f.root.textDraft='New correction';f.finish({id:f.calls[0].submissionId,accepted:true});
 assert.equal(f.root.textDraft,'New correction');assert.equal(f.root.textSending,false);
});
test('whitespace, disconnected state and repeated Enter cannot dispatch another request',()=>{
 const f=fixture();assert.equal(f.send('  '),false);f.root.textReady=false;assert.equal(f.send('hello'),false);
 f.root.textReady=true;f.send('hello');assert.equal(f.send('hello'),false);assert.equal(f.calls.length,1);
});

function liveSubmission(text) {
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const branch=source.slice(source.indexOf(" if(c.action==='text'){"),source.indexOf(" if(c.action==='approve')"));
 const patches=[],context={c:{action:'text',text:'A written request',submissionId:'typed-1'},lastUserRequest:0,lastActivity:0,idle:{activity(){}},start:async()=>{},session:{text},emit:patch=>patches.push(patch)};
 return {patches,completion:vm.runInNewContext('(async function(){'+branch+'})()',context)};
}
test('the live backend acknowledges only after asynchronous text preparation succeeds',async()=>{
 let release;const ready=new Promise(resolve=>release=resolve),f=liveSubmission(()=>ready);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.patches,[]);
 release();await f.completion;assert.equal(f.patches[0].textSubmission.accepted,true);
});
test('failed live text preparation rejects the submission so the UI can retain its draft',async()=>{
 const f=liveSubmission(async()=>{throw Error('Context unavailable')});
 await assert.rejects(f.completion,/Context unavailable/);
 assert.equal(f.patches[0].textSubmission.id,'typed-1');assert.equal(f.patches[0].textSubmission.accepted,false);
});
