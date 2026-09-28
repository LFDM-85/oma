import test from 'node:test';import assert from 'node:assert/strict';
import {LocalTools} from '../runtime/local-tools.mjs';
test('memory and PC tool layer is independent of Pi and rejects unknown tools',async()=>{
 const saved=[];const t=new LocalTools({memory:{remember:(...a)=>saved.push(a)},emit(){}});t.begin();
 assert.deepEqual(await t.call('remember',{key:'language',value:'Japanese'}),{saved:true});assert.deepEqual(saved,[['language','Japanese']]);
 await assert.rejects(()=>t.call('unknown',{}),/Unknown/);t.cancel();await assert.rejects(()=>t.call('remember',{key:'x',value:'y'}),/abort/i);
});
test('closing cancels an outstanding approval',async()=>{
 let approval;const t=new LocalTools({memory:{},emit:p=>{if(p.approval)approval=p.approval}});t.begin();const result=t.call('confirm_action',{description:'Publish this document'});assert.ok(approval.id);t.cancel();assert.deepEqual(await result,{approved:false});
});
test('ending a conversation schedules closure after the farewell',async()=>{
 let endings=0;
 const t=new LocalTools({memory:{},emit(){},onEnd:()=>endings++});t.begin();
 assert.deepEqual(await t.call('end_conversation',{}),{closingAfterReply:true});
 assert.equal(endings,1);t.cancel();
});
test('view modes change presentation without ending the conversation',async()=>{
 const patches=[];const t=new LocalTools({memory:{},emit:p=>patches.push(p)});t.begin();
 for(const mode of ['mini','normal'])assert.deepEqual(await t.call('set_view_mode',{mode}),{viewMode:mode});
 assert.deepEqual(patches,[{viewMode:'mini'},{viewMode:'normal'}]);
 await assert.rejects(()=>t.call('set_view_mode',{mode:'other'}),/Invalid/);
});

test('both backends expose the same skill-owned new-document operation',async()=>{
 const {localToolDefinitions}=await import('../runtime/local-tools.mjs');
 const {PiAgent}=await import('../runtime/pi.mjs');
 const live=localToolDefinitions.find(t=>t.name==='new_text_document');
 const pi=new PiAgent({home:'/tmp',cwd:'/tmp',memory:{},emit(){}}).tools().find(t=>t.name==='new_text_document');
 assert.ok(live);assert.ok(pi);assert.deepEqual(live.parameters,pi.parameters);
});
