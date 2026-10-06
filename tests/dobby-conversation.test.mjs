import test from 'node:test';
import assert from 'node:assert/strict';
import {DobbyConversation,conversationRequest} from '../runtime/dobby-conversation.mjs';
import {DobbyClient,requestId} from '../runtime/dobby-client.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const requests=[],patches=[],spoken=[],errors=[],calls=[];
 const client={active:null,submitting:null,state:{busy:false,pending:false},async status(){return this.state},async submit(text,session){const id=String(requests.length+1);requests.push({text,session,id});this.active=id;this.state={busy:true,request_id:id};return id},async cancel(){if(this.active)calls.push('cancel:'+this.active);this.active=null;this.state={busy:false,pending:false}},async waitUntilIdle(){calls.push('idle')}};
 const conversation=new DobbyConversation({client,emit:p=>patches.push(p),speak:async text=>spoken.push(text),stopSpeech:()=>{calls.push('stop-audio')},onError:e=>errors.push(e)});conversation.sessionId='oma-session';
 return {client,conversation,requests,patches,spoken,errors,calls};
}
const packet=request=>JSON.parse(request.text.split('conversation data):\n')[1]);
test('an empty typed update cannot interrupt the current request',async()=>{
 const f=fixture();await f.conversation.receive('Keep working');const count=f.calls.length;
 assert.equal(await f.conversation.receive('   '),false);assert.equal(f.calls.length,count);assert.equal(f.conversation.active,true);
});
test('all turns identify O.M.A. without changing the shared daemon identity',async()=>{
 const f=fixture();await f.conversation.receive('What is your name?');
 assert.match(f.requests[0].text,/Your name.*O\.M\.A\./);assert.equal(packet(f.requests[0]).user_request,'What is your name?');assert.equal(f.requests[0].session,'oma-session');
 f.client.state={request_id:f.client.active,busy:false,reply:'I am O.M.A.',status:'done'};
 await f.conversation.poll();assert.deepEqual(f.spoken,['I am O.M.A.']);assert.equal(f.conversation.active,false);
});
test('speech onset stops playback immediately while cancellation acknowledgement is delayed',async()=>{
 const f=fixture();await f.conversation.receive('Tell me a story');
 let release;f.client.cancel=()=>new Promise(resolve=>{release=()=>{f.client.active=null;resolve()}});
 const revision=f.conversation.beginSpeech();assert.equal(f.calls.at(-1),'stop-audio');await tick();
 let dispatched=false;const update=f.conversation.receive('Make it short',revision).then(()=>dispatched=true);
 await tick();assert.equal(dispatched,false);assert.equal(f.requests.length,1);
 release();await update;assert.equal(f.requests.length,2);
 const p=packet(f.requests[1]);assert.equal(p.interrupted_request.original_request,'Tell me a story');assert.equal(p.user_request,'Make it short');
});
test('contradictory corrections carry the original intent and require clarification before tools',async()=>{
 const f=fixture();await f.conversation.receive('Use red for the background');
 const revision=f.conversation.beginSpeech();await f.conversation.receive('Use blue, and keep it red',revision);
 const request=f.requests[1];assert.match(request.text,/conflict.*clarification question and use no tools/);
 assert.equal(packet(request).interrupted_request.original_request,'Use red for the background');
 assert.equal(packet(request).user_request,'Use blue, and keep it red');
});
test('earlier recognition results wait for the newest utterance and preserve every addition',async()=>{
 const f=fixture();await f.conversation.receive('Plan a weekend in Lisbon');
 const first=f.conversation.beginSpeech(),second=f.conversation.beginSpeech();
 assert.equal(await f.conversation.receive('with children',first),false);assert.equal(f.requests.length,1);
 await f.conversation.receive('and a small budget',second);
 assert.equal(packet(f.requests[1]).user_request,'with children\nand a small budget');
 assert.equal(packet(f.requests[1]).interrupted_request.original_request,'Plan a weekend in Lisbon');
});
test('a second interruption retains earlier corrections and a dispatched action checkpoint',async()=>{
 const f=fixture();await f.conversation.receive('Open one terminal');
 await f.conversation.receive('on workspace two',f.conversation.beginSpeech());
 f.client.state={request_id:f.client.active,busy:true,status:'acting',action:'Terminal launched'};await f.conversation.poll();
 await f.conversation.receive('Actually workspace three',f.conversation.beginSpeech());
 const context=packet(f.requests[2]).interrupted_request;
 assert.equal(context.original_request,'Open one terminal');assert.deepEqual(context.additions,['on workspace two']);assert.equal(context.checkpoint.action,'Terminal launched');
 assert.match(f.requests[2].text,/inspect it before continuing, never repeat/);
});
test('interrupting during speech invalidates a late completion without losing the update',async()=>{
 const f=fixture();let release;let completed=0;
 f.conversation.speak=()=>new Promise(resolve=>release=resolve);f.conversation.onComplete=()=>completed++;
 await f.conversation.receive('Explain the solar system');
 f.client.state={request_id:f.client.active,busy:false,reply:'A long answer.',status:'done'};
 const poll=f.conversation.poll();await tick();
 const revision=f.conversation.beginSpeech();release();await poll;
 assert.equal(completed,0);await f.conversation.receive('Only talk about Mars',revision);
 assert.equal(packet(f.requests[1]).interrupted_request.last_response,'A long answer.');
 assert.equal(f.errors.length,0);
});
test('Stop invalidates transcripts waiting for a cancelled request to settle',async()=>{
 const f=fixture();await f.conversation.receive('One request');let release;
 f.client.waitUntilIdle=()=>new Promise(resolve=>release=resolve);
 const revision=f.conversation.beginSpeech();await tick();
 const update=f.conversation.receive('Late correction',revision);const stopped=f.conversation.stop();release();await Promise.all([update,stopped]);
 assert.equal(f.requests.length,1);assert.equal(f.conversation.active,false);
});
test('wire limits still apply to the conversation envelope before opening a socket',async()=>{
 const client=new DobbyClient({socketPath:'/never-opened'});client.status=async()=>({busy:false,pending:false});
 await assert.rejects(client.submit(conversationRequest('漢'.repeat(6000)),requestId()),/demasiado longo/);
 assert.equal(client.active,null);
});
