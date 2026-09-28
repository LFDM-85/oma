import test from 'node:test';import assert from 'node:assert/strict';
const mod=await import('../runtime/conversation-end.mjs').catch(()=>({}));
test('farewell waits for audible output and 700 ms quiet; resumed voice postpones closing',()=>{
 assert.equal(typeof mod.canFinishConversation,'function');const ending={at:1000};assert.equal(mod.canFinishConversation(ending,0,1700),false);assert.equal(mod.canFinishConversation(ending,2000,2699),false);assert.equal(mod.canFinishConversation(ending,2000,2700),true);assert.equal(mod.canFinishConversation(ending,2650,2700),false);assert.equal(mod.canFinishConversation(null,0,9000),false);
});
test('UI dismissal does not wait for remote session-close acknowledgement',async()=>{
 assert.equal(typeof mod.finishConversation,'function');const events=[];let done;const pending=mod.finishConversation(()=>{events.push('stop');return new Promise(r=>done=r)},()=>events.push('dismiss'));assert.deepEqual(events,['stop','dismiss']);done();await pending;
});
test('farewell already spoken after user goodbye does not wait for a second farewell',()=>{
 assert.equal(mod.canFinishConversation({at:3000,speechAfter:1000},2200,3000),true);
 assert.equal(mod.canFinishConversation({at:3000,speechAfter:2500},2200,3000),false);
});
