import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../skills/oma/scripts/cancel-document-close.mjs').catch(()=>({}));
function fixture({extra=false,modifiedAfter=true}={}){
 let modal=true;const actions=[];
 const window={address:'0x1',title:'Untitled — OmaText',mapped:true,hidden:false,pid:7,workspace:{id:98}};
 const desktop={check(){},frame:{id:'fresh',active:'0x1'},async json(){return [window,...(extra?[{...window,address:'0x2',title:'Save As'}]:[])]},async command(){return Buffer.from(JSON.stringify({opened:true,length:12,url:'',modified:modal?true:modifiedAfter,active:true,busy:false,editor:{modalOpen:modal}}))},async dispatch(value){actions.push(value)},async screenshot(){},async call(name,args){actions.push([name,args]);if(name==='desktop_key')modal=false;}};
 return {desktop,actions,address:'0x1'};
}
test('cancelling dismisses the actual pending dialog and retains the document',async()=>{
 const f=fixture();assert.equal(typeof module.cancelOmaTextClose,'function');
 const result=await module.cancelOmaTextClose(f);
 assert.equal(result.cancelled,true);assert.equal(result.documentOpen,true);
 assert.deepEqual(f.actions.filter(Array.isArray),[['desktop_key',{frameId:'fresh',key:'Escape'}]]);
});
test('cancellation refuses ambiguous sibling windows and unknown targets',async()=>{
 assert.equal(typeof module.cancelOmaTextClose,'function');
 const f=fixture({extra:true});await assert.rejects(()=>module.cancelOmaTextClose(f),/separate|ambiguous/i);
 assert.equal(f.actions.length,0);
 await assert.rejects(()=>module.cancelOmaTextClose({...fixture(),address:'0xwrong'}),/identify|target/i);
});
test('cancellation cannot claim preserved work if document state changed',async()=>{
 assert.equal(typeof module.cancelOmaTextClose,'function');
 await assert.rejects(()=>module.cancelOmaTextClose(fixture({modifiedAfter:false})),/changed|preserv/i);
});
