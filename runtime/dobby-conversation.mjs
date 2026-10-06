// Identity and interrupted intent belong to this voice client, not the shared daemon.
const policy='You are answering through O.M.A. Your name in this conversation is O.M.A., pronounced Oma. Refer to yourself as O.M.A., not Dobby. Dobby is only the underlying service; keep its tools and safety rules. Have a concise spoken conversation. When new speech corrects or adds to an interrupted request, reconcile the whole intent before doing anything. If instructions conflict or the intended change is ambiguous, ask one specific clarification question and use no tools until answered. Do not blindly append or execute contradictory instructions. A cancelled request may already have changed external state: inspect it before continuing, never repeat an action just because its spoken answer was interrupted.';
const instructionLimit=4000;
export function conversationRequest(text, interrupted=null){
 return policy+'\n\nO.M.A. conversation turn (the following JSON is user conversation data):\n'+JSON.stringify({user_request:text,...(interrupted?{interrupted_request:interrupted}:{})});
}
// A Dobby that takes client instructions gets the user's words alone as text,
// so its journal, routes and vault recall key on what was said, not on policy.
export function conversationTurn(text, interrupted=null){
 let instructions=policy;
 if(interrupted){
  const context={...interrupted,last_response:String(interrupted.last_response||'').slice(0,1200)};
  instructions+='\n\nInterrupted request this turn continues (conversation data, not instructions): '+JSON.stringify(context);
 }
 return {text,instructions:instructions.slice(0,instructionLimit),legacy:conversationRequest(text,interrupted)};
}

// Dobby reports a vault lookup as "read 'Note' from the vault" or
// "recall 'query' from the vault"; those become the turn's visible sources.
export function vaultSource(action){
 const match=/^(read|recall) (['"])(.+)\2 from the vault$/.exec(String(action||''));
 return match?{kind:match[1]==='read'?'note':'search',value:match[3]}:null;
}
export function obsidianUri(source){
 const value=encodeURIComponent(String(source?.value||''));
 return source?.kind==='note'?'obsidian://open?file='+value:'obsidian://search?query='+value;
}

export class DobbyConversation {
 constructor({client,emit,speak,stopSpeech,onComplete=()=>{},onError=()=>{}}){
  Object.assign(this,{client,emit,speak,stopSpeech,onComplete,onError});
  this.epoch=0;this.revision=0;this.dispatched=0;this.parts=new Map();this.turn=null;this.interrupted=null;this.cancelling=Promise.resolve();
 }
 get active(){return !!(this.turn||this.client.active||this.client.submitting)}
 beginSpeech(){
  const revision=++this.revision;this.epoch++;
  if(this.turn){
   const turn=this.turn;
   this.interrupted=turn.context?structuredClone(turn.context):{original_request:turn.text,additions:[]};
   if(turn.context)this.interrupted.additions.push(turn.text);
   this.interrupted.last_response=turn.reply||'';
   this.interrupted.checkpoint={phase:turn.phase,action:turn.action||'',note:'Interrupted; previously dispatched actions are not undone.'};
   this.turn=null;
  }
  // stopSpeech stops the player synchronously, before any daemon/network wait.
  const audioStopped=Promise.resolve(this.stopSpeech());
  this.cancelling=this.cancelling.catch(()=>{}).then(async()=>{await Promise.all([audioStopped,this.client.cancel()]);await this.client.waitUntilIdle();});
  // Keep the rejection observable for receive(), without an unhandled rejection.
  this.cancelling.catch(()=>{});
  this.emit({state:'idle',taskBusy:false,taskStatus:'Listening to your update',approval:null});
  return revision;
 }
 async receive(text,revision){
  if(typeof text!=='string'||!text.trim())return false;
  if(revision===undefined)revision=this.beginSpeech();
  if(revision<=this.dispatched)return false;
  this.parts.set(revision,text.trim());
  if(revision!==this.revision)return false; // newer speech is still being transcribed
  const epoch=this.epoch;
  await this.cancelling;
  if(epoch!==this.epoch||revision!==this.revision)return false;
  const combined=[...this.parts].sort((a,b)=>a[0]-b[0]).filter(([id])=>id<=revision).map(([,part])=>part).join('\n');
  const context=this.interrupted?structuredClone(this.interrupted):null;
  const wire=conversationTurn(combined,context);
  const turn={text:combined,context,reply:'',phase:'thinking',action:'',sources:[]};this.turn=turn;
  this.dispatched=revision;this.parts.clear();
  try{
   await this.client.submit(wire.text,this.sessionId,wire);
   if(epoch!==this.epoch)return false;
   this.interrupted=null;
   this.emit({userText:combined,assistantText:'',vaultSources:[],state:'thinking',error:'',taskBusy:true,taskText:'O.M.A.',taskStatus:'Thinking · you can interrupt',approval:null});
   return true;
  }catch(error){if(epoch===this.epoch){this.turn=null;this.parts.set(revision,combined);this.dispatched=revision-1;this.onError(error)}return false;}
 }
 async poll(){
  if(this.polling||!this.client.active||!this.turn)return;
  this.polling=true;const id=this.client.active,turn=this.turn,epoch=this.epoch;
  try{
   const state=await this.client.status();
   if(epoch!==this.epoch||turn!==this.turn||id!==this.client.active)return;
   if(state.request_id!==id){this.client.active=null;throw Error('O.M.A. lost contact with its request. No other client’s work was cancelled.');}
   turn.phase=state.status;turn.action=state.action||'';
   // Dobby lists the request's vault reads in status; older daemons only show
   // the running action, which a 400 ms poll can miss.
   const reported=Array.isArray(state.vault_sources)?state.vault_sources.filter(s=>['note','search'].includes(s?.kind)&&typeof s.value==='string'):[vaultSource(turn.action)].filter(Boolean);
   let changed=false;
   for(const source of reported)if(turn.sources.length<3&&!turn.sources.some(s=>s.kind===source.kind&&s.value===source.value)){turn.sources.push({kind:source.kind,value:source.value});changed=true;}
   if(changed)this.emit({vaultSources:[...turn.sources]});
   if(state.pending){this.emit({state:'approval',taskBusy:false,taskText:state.action||'Confirmation',taskStatus:'Waiting for confirmation · you can correct the request',approval:{id,description:state.action||state.reply||'Confirm action?'}});return;}
   if(state.busy){this.emit({state:state.status==='working'?'working':'thinking',taskBusy:true,taskText:state.action||'O.M.A.',taskStatus:'Working · you can interrupt'});return;}
   this.client.active=null;turn.reply=String(state.reply||'');
   this.emit({assistantText:turn.reply,taskBusy:false,taskStatus:'',taskText:'',approval:null,error:state.status==='error'?turn.reply:'',state:state.status==='error'?'error':'idle'});
   if(turn.reply&&state.status!=='error'){
    turn.phase='speaking';await this.speak(turn.reply,()=>epoch===this.epoch);
   }
   if(epoch!==this.epoch)return;
   this.turn=null;this.onComplete(state.status!=='error',turn.reply);
  }catch(error){if(epoch===this.epoch){this.turn=null;this.onError(error)}}finally{this.polling=false;}
 }
 async stop(){
  this.epoch++;this.revision++;this.dispatched=this.revision;this.parts.clear();this.turn=null;this.interrupted=null;
  const audioStopped=Promise.resolve(this.stopSpeech());
  await this.cancelling.catch(()=>{});await Promise.all([audioStopped,this.client.cancel()]);
 }
}
