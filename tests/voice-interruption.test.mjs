import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenMic,canListen} from '../runtime/open-mic.mjs';

test('visible conversation listens during replies, thinking and tasks, but not hidden/settings or an existing recording',()=>{
 const s={presented:true,key:true,state:'speaking',recording:false};
 for(const state of ['idle','speaking','thinking','working','connecting'])assert.equal(canListen({...s,state}),true,state);
 assert.equal(canListen({...s,presented:false}),false);
 assert.equal(canListen({...s,recording:true}),false);
 assert.equal(canListen({...s,key:false}),false);
 assert.equal(canListen({...s,savingKey:true}),false);
 assert.equal(canListen({...s,demo:true}),false);
 assert.equal(canListen({...s,approvalPhase:'speaking'}),true);
 assert.equal(canListen({...s,approvalPhase:'listening'}),false);
});
