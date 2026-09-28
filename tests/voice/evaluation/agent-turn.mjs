import {dockingReady} from './desktop-state.mjs';
import {companionWindows} from '../../../runtime/window-companion.mjs';
import {approvalDecision} from '../../../runtime/approval-voice.mjs';
// Real Pi agent and real tools, with a disposable memory/cwd. No speech input.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {localAgentConfig} from '../../../runtime/local-agent.mjs';
import {runDesktopCommand} from '../../../runtime/desktop.mjs';
const job=JSON.parse(readFileSync(process.argv[2],'utf8'));
const agentUrl=job.agentModule?pathToFileURL(job.agentModule):new URL('../../../runtime/pi.mjs',import.meta.url);
const {PiAgent}=await import(agentUrl);
// Baseline memory behavior belongs to the selected implementation as well.
const {Memory}=await import(new URL('./memory.mjs',agentUrl));
const out=patch=>process.stdout.write(JSON.stringify(patch)+'\n');
const ipc=(...args)=>runDesktopCommand('omarchy-shell',['io.github.komagata.oma',...args]);
const config=localAgentConfig(job.home);
const settings=JSON.parse(readFileSync(join(config,'settings.json')));settings.defaultModel=job.model;settings.defaultThinkingLevel=job.thinking||'off';
if(job.sampling)settings.omaLocalSampling=job.sampling;
const models=JSON.parse(readFileSync(join(config,'models.json')));const provider=models.providers['oma-local'];
provider.baseUrl='http://127.0.0.1:11435/v1';provider.models[0].id=job.model;provider.models[0].name=job.model;
writeFileSync(join(config,'settings.json'),JSON.stringify(settings));writeFileSync(join(config,'models.json'),JSON.stringify(models));
const memory=new Memory(join(job.home,'memory.sqlite'));
if(job.seedMemory)memory.remember('evaluation_favorite_color',job.locale==='ja'?'紫':'purple');
let updates=Promise.resolve();let protocolFailure;
const agent=new PiAgent({home:join(job.home,'pi'),cwd:job.home,memory,locale:job.locale,env:{...process.env,PI_CODING_AGENT_DIR:config},
 emit:patch=>{
  out({event:'state',...patch});if(patch.viewMode)updates=updates.then(()=>ipc('viewMode',patch.viewMode));
  if(typeof patch.computerUsing==='boolean')updates=updates.then(()=>ipc('computerUse',String(patch.computerUsing)));
  if(patch.approval&&job.instructions.length>1&&approvalDecision(job.instructions[1])===null){
   protocolFailure='The follow-up requires a save/discard/cancel choice, but the assistant entered binary approval mode';
   out({event:'followup_rejected',text:job.instructions[1],route:'binary-approval'});
   queueMicrotask(()=>{agent.approve(patch.approval.id,false);agent.cancel().catch(()=>{});});
  }
 }});
const guarded=async(command,args,options)=>{
 await updates;
 const ws=JSON.parse(await runDesktopCommand('hyprctl',['-j','activeworkspace']));
 if(ws.id!==job.workspace)throw Error('Workspace changed; refusing desktop input');
 return runDesktopCommand(command,args,options);
};
agent.desktop.run=guarded;
// Optional diagnostic observation only: archive the exact frame sent to the model.
// This never supplies an expected result or changes a desktop input.
if(job.captureScreenshots){
 const directory=join(job.home,'screenshots');mkdirSync(directory,{recursive:true});
 const screenshot=agent.desktop.screenshot.bind(agent.desktop);let count=0;
 agent.desktop.screenshot=async(...args)=>{
  const result=await screenshot(...args),frame=agent.desktop.frame;
  const name=String(++count).padStart(3,'0');
  writeFileSync(join(directory,name+'.png'),Buffer.from(frame.image.data,'base64'));
  writeFileSync(join(directory,name+'.json'),JSON.stringify({...frame,image:undefined}));
  return result;
 };
}
agent.companion.run=guarded;
// The installed UI owns its geometry state; use its actual companion for docking.
agent.companion.accompany=async address=>{
 const clients=JSON.parse(await guarded('hyprctl',['-j','clients']));
 // Match the production tool's validation before the UI IPC boundary. A bad
 // model target must be a tool error, not a fatal error in the host UI worker.
 const {target}=companionWindows(clients,address);
 if(!target||target.workspace.id!==job.workspace)throw Error('Target is outside the isolated evaluation workspace');
 await ipc('accompany',address);let previous;
 for(let i=0;i<60;i++){
  const state=JSON.parse(await ipc('status'));
  const clients=JSON.parse(await guarded('hyprctl',['-j','clients']));
  const active=JSON.parse(await guarded('hyprctl',['-j','activewindow']));
  const geometry=JSON.stringify(clients.filter(w=>w.address===address||/^O\.M\.A\.( Mini)?$/.test(w.title)).map(w=>[w.address,w.at,w.size]));
  if(dockingReady(state,clients,active.address,address)&&geometry===previous)return {alongside:true,target:address};
  previous=geometry;await new Promise(r=>setTimeout(r,100));
 }
 throw Error('UI did not finish docking and focusing the application');
};
const closeTarget=agent.companion.closeTarget.bind(agent.companion);
agent.companion.closeTarget=async address=>{
 const clients=JSON.parse(await guarded('hyprctl',['-j','clients']));
 const target=clients.find(w=>w.address===address);
 if(target&&target.workspace.id!==job.workspace){
  const error=Error('Refusing to close a window outside the isolated evaluation workspace');
  out({event:'error',error:error.message,critical:true,kind:'blocked_outside_workspace_target'});throw error;
 }
 return closeTarget(address);
};
// The real pipeline defers dismissal until the reply has finished. This
// component test has no playback, so its corresponding boundary is run().
let pendingDismiss=false;
agent.onDismiss=()=>{pendingDismiss=true;};
const startAgent=agent.start.bind(agent);const observed=new WeakSet();
agent.start=async()=>{await startAgent();if(!observed.has(agent.session)){
 observed.add(agent.session);agent.session.subscribe(event=>{
  if(event.type==='tool_execution_start')out({event:'tool_start',name:event.toolName,args:event.args});
  if(event.type==='tool_execution_end')out({event:'tool_end',name:event.toolName,error:event.isError===true,result:event.isError?event.result:undefined,details:event.result?.details});
 });
}};
let timedOut=false;
const timeout=setTimeout(()=>{timedOut=true;agent.cancel();},150000);
try{
 for(const [index,instruction] of job.instructions.entries()){
  if(index>0){
   const state=JSON.parse(await runDesktopCommand('omarchy-shell',['shell','call','io.github.komagata.omatext','inspectState','']));
   if(!state.opened||!state.modified||(job.retainedLength!==null&&state.length!==job.retainedLength)){const error=Error('Unsaved content must remain intact before the follow-up');error.critical=true;error.kind='unsaved_fixture_loss';throw error;}
   out({event:'unsaved_choice',retained:true,nativeDialog:state.editor?.modalOpen===true});
  }
  const start=performance.now();const text=await agent.run(instruction);await updates;
  if(pendingDismiss){pendingDismiss=false;await ipc('stop');if(!job.allowDismiss){const error=Error('O.M.A. ended the conversation instead of completing the requested operation');error.critical=true;error.kind='wrong_assistant_dismissal';throw error;}}
  if(protocolFailure)throw Error(protocolFailure);
  if(timedOut)throw Error('Agent operation timed out');
  const last=[...(agent.session?.messages||[])].reverse().find(m=>m.role==='assistant');
  out({event:'answer',text,seconds:(performance.now()-start)/1000,model:agent.modelId,provider:agent.provider,thinkingLevel:agent.session?.thinkingLevel,usage:last?.usage,stopReason:last?.stopReason});
 }
 out({event:'result',facts:memory.facts()});
}catch(error){out({event:'error',error:protocolFailure||error.message,critical:error.critical===true,kind:error.kind});process.exitCode=1;}
finally{clearTimeout(timeout);await agent.close();await updates;memory.close();}
