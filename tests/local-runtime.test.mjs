import test from 'node:test';
import assert from 'node:assert/strict';
const local=await import('../runtime/local-runtime.mjs').catch(()=>({}));
test('local model readiness requires the installed model, not merely an HTTP listener',async()=>{
 assert.equal(typeof local.localModelReady,'function');
 const absent=await local.localModelReady(async()=>({ok:true,json:async()=>({models:[]})}));assert.equal(absent,false);
 const ready=await local.localModelReady(async url=>{assert.equal(url,'http://127.0.0.1:11435/api/tags');return {ok:true,json:async()=>({models:[{name:'qwen3.5:4b'}]})}});assert.equal(ready,true);
 assert.equal(await local.localModelReady(async()=>{throw Error('offline')}),false);
});
