#!/usr/bin/env node
import {captionText} from './caption-text.mjs';
import {TranscriptLog} from './transcript.mjs';
import {ApprovalVoice} from './approval-voice.mjs';
import {switchVoiceProvider} from './voice-provider.mjs';
import {localAgentConfig} from './local-agent.mjs';
import {LocalSpeech} from './local-speech.mjs';
import {listMicrophones,microphoneNode} from './microphones.mjs';
import {startLocalModel,localModelReady,installLocalModels} from './local-runtime.mjs';
import {IdleConversation,idleInstruction} from './idle.mjs';
import {EchoPath} from './echo-path.mjs';
import {OpenMic,canListen} from './open-mic.mjs';
import {WakeListener,HandsFreeTurn,microphoneAvailable} from './wake.mjs';
import {loadApiKey,saveApiKey} from './credentials.mjs';
import {StartupCue} from './startup.mjs';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {Memory} from './memory.mjs';
import {Audio} from './audio.mjs';
import {PiAgent} from './pi.mjs';
import {Speech} from './speech.mjs';
import {checkConnection} from './connection-check.mjs';
import {statSync} from 'node:fs';
import {Oma} from './oma.mjs';
import {resolveLocale,reconnectInstruction,responseLocale,languageOptions,validateResponseLanguage} from './locale.mjs';
process.umask(0o077);
const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma');
const restartContextPath=join(data,'restart-context.json');
async function saveRestartContext(context){
 await mkdir(data,{recursive:true});
 await writeFile(restartContextPath,JSON.stringify(context),'utf8');
}
async function loadRestartContext(){
 try{return JSON.parse(await readFile(restartContextPath,'utf8'));}
 catch{return null;}
}
async function clearRestartContext(){
 try{await unlink(restartContextPath);}catch{}
}
let approvalVoice;
let docked=false;
let transcriptLog=null;
const emit=patch=>{if(patch.docked!==undefined)docked=patch.docked;for(const k of ['userText','assistantText'])if(patch[k]!==undefined)patch[k]=captionText(patch[k]);
 transcriptLog?.update(patch);
 process.stdout.write(JSON.stringify(patch)+'\n');
 if(patch.approval!==undefined)queueMicrotask(()=>{
  if(!approvalVoice)return;
  if(patch.approval===null){approvalVoice.clear();return;}
  if(!agent.approvals.has(patch.approval.id))return;
  oma.silence();oma.setState('approval');
  approvalVoice.show(patch.approval);
 });
};
const memory=new Memory(join(data,'memory.sqlite'));
transcriptLog=new TranscriptLog(memory.db);
const localMode=process.env.OMA_LOCAL_MODE==='1';
let localModelProcess=null,localSetupBusy=false;
if(localMode){try{localModelProcess=await startLocalModel(data)}catch(e){emit({localSetupMessage:e.message})}}
let key=localMode?'':await loadApiKey();
const locale=responseLocale(memory.get('responseLanguage'));
let ready=false;
const echoPath=new EchoPath({inputTarget:memory.get('microphoneTarget')||null});
try{await echoPath.start();}catch(e){emit({state:'error',error:e.message});process.exit(1);}
const audioOptions={inputTarget:echoPath.source,outputTarget:echoPath.sink,volume:3};
const audio=new Audio((level,shapes)=>oma.playbackLevel(level,shapes),error=>emit({state:'error',error}),audioOptions);
const agentEnv=localMode?{...process.env,PI_CODING_AGENT_DIR:localAgentConfig(data)}:process.env;
const agent=new PiAgent({home:join(data,localMode?'local/pi':'pi'),cwd:process.env.OMA_WORKSPACE||join(homedir(),'Projects'),memory,emit,locale,env:agentEnv});
const speech=localMode?new LocalSpeech({data,locale}):new Speech({key,locale});
const oma=new Oma({memory,audio,agent,speech,emit,locale});
emit({responseLanguages:languageOptions(),responseLanguage:memory.get('responseLanguage')||''});
oma.onPrepareRestartContext=ctx=>command({action:'prepareRestartContext',...ctx});
let restartContext=await loadRestartContext();
if(restartContext){
 // One-shot restore context: consume at startup so it is not repeated forever.
 await clearRestartContext();
}
approvalVoice=new ApprovalVoice({speech,locale:oma.locale,emit,audio:new Audio((level,shapes)=>emit({level,...shapes}),error=>emit({error}),audioOptions),onDecision:(id,allow)=>agent.approve(id,allow)});
let presented=false;let savingKey=false;let demoTimer=null;const startupCue=new StartupCue(echoPath.sink);
const handsFree=new HandsFreeTurn({release:()=>oma.release().catch(e=>oma.error(e)),cancel:()=>command({action:'stop'}),onPause:()=>{if(process.env.OMA_EARLY_TRANSCRIPTION!=='0')oma.prepareTranscription()},onResume:()=>oma.cancelTranscription()});
audio.onInputLevel=rawLevel=>{
 // Input meter uses RMS-derived mic level from existing recorder path.
 const normalized=Math.min(1,Math.sqrt(Math.max(0,rawLevel))/130);
 emit({inputLevel:normalized});
 handsFree.level(rawLevel);
 if(rawLevel>650)idle.activity();
};
oma.onWakeReady=()=>handsFree.start();
const wake=new WakeListener({data,inputTarget:memory.get('microphoneTarget')||null,enabled:memory.get('wakeEnabled')!=='false',ready:()=>({key:ready,idle:!presented&&!savingKey&&(approvalVoice.pending?approvalVoice.phase==='waiting':oma.state==='idle'&&!agent.busy)}),emit,onWake:async()=>{
 idle.activity();emit({wakeDetected:true});
 if(approvalVoice.pending){approvalVoice.ask().catch(e=>approvalVoice.failed(e));return;}
 try{await oma.greet(false);}catch(e){oma.error(e);}
}});
wake.start();
const idle=new IdleConversation({ready:()=>!docked&&ready&&oma.state==='idle'&&!oma.turn.recording&&!oma.active&&!oma.responseRequested&&!audio.pumping&&!oma.toolsRunning&&!agent.busy&&!savingKey,
 speak:farewell=>oma.greet(false,idleInstruction(oma.locale,farewell)),dismiss:()=>emit({dismiss:true})});
const standbyAudio=new Audio(()=>{},error=>{openMic.pause();emit({error});},audioOptions);
let microphoneChecked=0,microphoneFree=false;
const openMic=new OpenMic({audio:standbyAudio,handoff:true,
 ready:()=>canListen({presented,key:ready,savingKey,demo:!!demoTimer,state:oma.state,recording:oma.turn.recording,approvalPhase:approvalVoice.pending?approvalVoice.phase:null}),
 available:async()=>{if(Date.now()-microphoneChecked>1000){microphoneFree=await microphoneAvailable(memory.get('microphoneTarget')||null);microphoneChecked=Date.now();}return microphoneFree;},
 onListening:listeningReady=>emit({listeningReady}),onError:e=>oma.error(e),
 onSpeech:async pcm=>{
  idle.activity();wake.pause();startupCue.stop();
  if(approvalVoice.pending){await standbyAudio.stopRecording();await approvalVoice.press(pcm);return;}
  audio.takeRecording(standbyAudio);
  handsFree.speechRms=openMic.speechRms;
  if(agent.busy)agent.cancel().catch(e=>oma.error(e));
  handsFree.start();handsFree.level(1000);await oma.press(pcm);
 }
});
const microphoneTimer=setInterval(()=>openMic.tick(),250);
const idleTimer=setInterval(()=>idle.tick().catch(e=>{idle.show(false);oma.error(e);}),250);
let connectionCheckController, refreshing=false;
const piConfig=agentEnv.PI_CODING_AGENT_DIR||join(homedir(),'.pi/agent');
function configSignature(){return ['settings.json','auth.json','models.json'].map(name=>{try{const st=statSync(join(piConfig,name));return st.mtimeMs+':'+st.size}catch{return '-'}}).join('|')}
let seenConfig=configSignature();
async function refreshConnections(){
 if(refreshing||agent.busy||oma.active||audio.pumping||oma.turn.recording||connectionCheckController)return;
 refreshing=true;
 try{await agent.close();agent.modelRuntime=null;agent.configured=false;await agent.configure();const configured=await agent.status();const modelReady=configured&&(!localMode||await localModelReady());ready=modelReady&&speech.ready;seenConfig=configSignature();emit({modelReady,keyConfigured:ready,speechReady:speech.ready,connectionTestPassed:false,state:ready?'idle':'unauthenticated',error:''});}
 catch(e){emit({connectionTestError:'Could not verify the connection. Reconnect from Settings.'});}
 finally{refreshing=false;}
}
const configTimer=setInterval(()=>{if(configSignature()!==seenConfig)refreshConnections()},2000);
async function refreshMicrophones(){
 const choices=(await listMicrophones()).filter(m=>!m.value.startsWith('oma-aec-')).map(({value,label})=>({value,label}));
 const target=memory.get('microphoneTarget')||'';
 if(target&&!choices.some(m=>m.value===target))choices.push({value:target,label:'Disconnected: '+target});
 emit({microphones:[{value:'',label:'System default'},...choices],microphoneTarget:target});
}
let microphoneBusy=false;
async function command(c){
 if(c.action==='accompanyWindow'){await agent.companion.accompany(c.address);return;}
 if(c.action==='restoreFloating'){await agent.companion.restore();return;}
 if(c.action==='refreshMicrophones'){try{await refreshMicrophones();emit({microphoneError:''})}catch(e){emit({microphoneError:e.message})}return;}
 if(c.action==='setMicrophone'){
  if(microphoneBusy)return;microphoneBusy=true;emit({microphoneBusy:true,microphoneError:''});
  const previous=echoPath.inputTarget;
  try{
   if(typeof c.target!=='string')throw Error('Choose a microphone.');
   await microphoneNode(c.target);await command({action:'stop'});
   await Promise.all([audio.stop(),approvalVoice.audio.close(),startupCue.stop()]);
   await echoPath.close();echoPath.inputTarget=c.target||null;
   await echoPath.start();wake.inputTarget=c.target||null;memory.set('microphoneTarget',c.target);microphoneChecked=0;await refreshMicrophones();
  }catch(e){echoPath.inputTarget=previous;try{await echoPath.close();await echoPath.start()}catch{}emit({microphoneError:e.message});}
  finally{microphoneBusy=false;emit({microphoneBusy:false})}return;
 }

 if(c.action==='localSetup'&&localMode){
  if(localSetupBusy)return;localSetupBusy=true;
  try{await command({action:'stop'});await installLocalModels(data,emit);localModelProcess??=await startLocalModel(data);await refreshConnections();emit({localSetupMessage:'Local models are ready.'});}
  catch(e){emit({localSetupMessage:e.message})}finally{localSetupBusy=false}return;
 }
 if(c.action==='setVoiceProvider'){await switchVoiceProvider({memory,value:c.value,stop:()=>command({action:'stop'}),emit});return;}
 if(c.action==='setResponseLanguage'){
  try{const value=validateResponseLanguage(c.value);await command({action:'stop'});await agent.close();memory.set('responseLanguage',value);oma.locale=agent.locale=speech.locale=responseLocale(value);approvalVoice.locale=oma.locale;emit({responseLanguage:value,languageError:''});}
  catch(e){emit({languageError:e.message})}return;
 }
 if(c.action==='refreshConnections'){await refreshConnections();return;}
 if(c.action==='testConnection'){
  if(connectionCheckController||!ready)return;
  await command({action:'stop'});connectionCheckController=new AbortController();emit({connectionTesting:true,connectionTestPassed:false,connectionTestError:''});
  try{const pcm=await checkConnection({agent,speech,signal:connectionCheckController.signal});audio.enqueue(pcm);audio.finish();seenConfig=configSignature();emit({connectionTestPassed:true});}
  catch(e){emit({connectionTestError:localMode?'Local voice test failed. '+e.message:'Connection test failed. Check your credentials, API balance, and network.'});}
  finally{connectionCheckController=null;emit({connectionTesting:false});}return;
 }
 if(c.action==='presentation'){presented=c.active===true;if(!presented){agent.desktopContext.stop();await agent.companion.restore();if(localMode)await agent.close();}if(presented)transcriptLog.begin(Object.fromEntries(['user','assistant'].map(role=>[role==='user'?'userText':'assistantText',[oma.captionHistory[role],oma.captionCurrent[role]].filter(Boolean).join('\n')])));else transcriptLog.end();idle.show(presented);const paused=openMic.pause();openMic.after=Date.now()+600;if(presented)wake.pause();else if(oma.noticeResponse||oma.turn.recording)await command({action:'stop'});await paused;return;}
 if(['press','text','approve','answer'].includes(c.action))idle.activity();
 if(c.action==='setWake'){memory.set('wakeEnabled',c.enabled===true?'true':'false');wake.setEnabled(c.enabled===true);return;}
 if(c.action==='saveApiKey'){
  if(savingKey)return;savingKey=true;emit({keySaving:true,keyError:'',keySaved:false});
  try{await saveApiKey(c.key);emit({keySaved:true,keyError:'',connectionTestPassed:false});}
  catch(e){emit({keyError:e.message});}
  finally{c.key='';savingKey=false;emit({keySaving:false});}return;
 }
 if(c.action==='prepareRestartContext'){
  // Persist minimal text-only context to continue naturally after restart.
  const locale=resolveLocale()||oma.locale||'en-US';
  const summary=String(c.summary||'').slice(0,400);
  const lastUserUtterance=String(c.lastUserUtterance||'').slice(0,300);
  const progress=String(c.progress||'').slice(0,200);
  await saveRestartContext({requestedAt:Date.now(),summary,lastUserUtterance,progress,locale});
  return;
 }
 if(c.action==='opening'||c.action==='closing'){startupCue.play();return;}
 if(c.action==='demo'){
  await openMic.pause();
  emit({state:'speaking',userText:'What can you help me with?',assistantText:'I can answer questions, find information, and help you with your work.',error:''});let tick=0;
  clearInterval(demoTimer);demoTimer=setInterval(()=>{emit({level:Math.max(0,Math.sin(tick++*.34)*.45+.20),inputLevel:0,lipRound:Math.max(0,Math.sin(tick*.13))*.6,lipWide:Math.max(0,Math.sin(tick*.19))*.3});if(tick>180){clearInterval(demoTimer);demoTimer=null;emit({state:'idle',level:0,inputLevel:0,lipRound:0,lipWide:0});}},40);return;
 }
 if(c.action==='stop'){connectionCheckController?.abort();const paused=openMic.pause();approvalVoice.clear();idle.activity();handsFree.stop();wake.pause();wake.cooldown=Date.now()+3000;startupCue.stop();if(agent.busy)agent.cancel().catch(e=>oma.error(e));clearInterval(demoTimer);demoTimer=null;oma.turn.stop();const generation=oma.turn.generation;oma.interrupt();await Promise.all([paused,audio.stopRecording(),oma.cancellation]);await oma.runningAgent?.catch(()=>{});if(generation!==oma.turn.generation)return;oma.setState('idle',{level:0,inputLevel:0,lipRound:0,lipWide:0});return;}
 if(c.action==='approve'){approvalVoice.clear();agent.approve(String(c.id),c.allow===true);return;}

 if(c.action==='cancelTask'){await command({action:'stop'});return;}
 if(c.action==='connect'){await command({action:'stop'});await agent.close();agent.modelRuntime=null;agent.configured=false;await agent.configure();ready=(await agent.status())&&speech.ready;emit({keyConfigured:ready,speechReady:speech.ready,state:ready?'idle':'unauthenticated'});if(ready)await oma.connect();return;}
 if(!ready)throw Error(localMode?'Open Settings and set up local models.':'Open Settings to configure the Pi model and speech connection.');
 if(c.action==='press'&&approvalVoice.pending){await approvalVoice.press();return;}
 if(c.action==='release'&&approvalVoice.pending){await approvalVoice.release();return;}
 if(c.action==='press'){await openMic.pause();handsFree.start();wake.pause();startupCue.stop();if(agent.busy)agent.cancel().catch(e=>oma.error(e));await oma.press();}
 else if(c.action==='release')await oma.release();
 else if(c.action==='text'){await openMic.pause();await oma.text(String(c.text||'').slice(0,10000));}

 else if(c.action==='greet')await oma.greet();
 else if(c.action==='restoreGreet'){
  if(restartContext){
   const locale=restartContext.locale||resolveLocale()||oma.locale;
   // Prefer a short connective line; keep summary stored for optional/manual use.
   await oma.greet(false,reconnectInstruction(locale));
   restartContext=null;
   await clearRestartContext();
  }else await oma.greet();
 }
}
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line.length>20000)return;try{command(JSON.parse(line)).catch(e=>oma.error(e));}catch{emit({error:'Invalid command'});}});
let closing=false;
async function close(){if(closing)return;closing=true;clearInterval(configTimer);connectionCheckController?.abort();presented=false;clearInterval(microphoneTimer);await openMic.pause();clearInterval(idleTimer);idle.show(false);wake.close();handsFree.stop();await startupCue.stop();clearInterval(demoTimer);await approvalVoice.close();await oma.close();speech.close?.();localModelProcess?.kill();await echoPath.close();memory.close();process.exit(0);}
input.on('close',close);process.on('SIGTERM',close);process.on('SIGINT',close);
process.on('uncaughtException',e=>{emit({state:'error',error:'O.M.A. runtime error: '+e.message.slice(0,200)});close();});
try{const configured=await agent.status();const modelReady=configured&&(!localMode||await localModelReady());ready=modelReady&&speech.ready;emit({modelReady,keyConfigured:ready,speechReady:speech.ready,state:ready?'idle':'unauthenticated',level:0,inputLevel:0,lipRound:0,lipWide:0,error:ready?'':localMode?'Set up local models in Settings.':'Configure a Pi model and speech connection in Settings.'});}catch(e){oma.error(e);}

refreshMicrophones().catch(e=>emit({microphoneError:e.message}));
