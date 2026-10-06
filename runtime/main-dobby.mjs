import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DobbyClient,requestId} from './dobby-client.mjs';
import {Memory} from './memory.mjs';
import {Audio} from './audio.mjs';
import {VoiceEffects} from './voice-effects.mjs';
import {TranscriptLog} from './transcript.mjs';
import {captionText} from './caption-text.mjs';
import {listMicrophones,microphoneNode} from './microphones.mjs';
import {languageOptions} from './locale.mjs';
import {WakeListener,microphoneAvailable} from './wake.mjs';
import {WindowCompanion} from './window-companion.mjs';
import {StartupCue} from './startup.mjs';
import {stopChild} from './stop-child.mjs';

process.umask(0o077);
const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma');
const memory=new Memory(join(data,'memory.sqlite')),log=new TranscriptLog(memory.db);
const localPython=join(homedir(),'.local/share/omarchy-dobby/runtime/bin/python');
const python=process.env.OMA_DOBBY_PYTHON||(existsSync(localPython)?localPython:'python3');
const helper=fileURLToPath(new URL('./dobby-voice.py',import.meta.url));
const client=new DobbyClient();
const sessionId=memory.get('dobbySessionId')||requestId();memory.set('dobbySessionId',sessionId);
let presented=false,closed=false,testing=false,ready=false,faulted=false,recording=null,synth=null,meta={},generation=0,requestGeneration=0,polling=false,speaking=false,micCheck=false,drainResolve=null;
let target=memory.get('microphoneTarget')||'',approval=null,lastActivity=Date.now();
const emit=patch=>{for(const key of ['userText','assistantText'])if(patch[key]!==undefined)patch[key]=captionText(patch[key]);if(patch.approval!==undefined)approval=patch.approval;log.update(patch);process.stdout.write(JSON.stringify(patch)+'\n');};
const effectsEnabled=()=>memory.get('dobbyVoiceEffects')!=='false';
const audio=new Audio((level,shapes)=>emit({level,...shapes}),message=>fail(Error(message)),{volume:1.3,processor:effectsEnabled()?new VoiceEffects({radio:true}):null});
const cue=new StartupCue();
const companion=new WindowCompanion({emit});
const wake=new WakeListener({data,enabled:memory.get('wakeEnabled')!=='false',inputTarget:target,emit,onWake:()=>emit({wakeDetected:true}),ready:()=>({key:ready,idle:!presented&&!testing&&!client.active})});
function fail(error){faulted=true;testing=false;emit({state:'error',error:error.message||String(error),listeningReady:false,taskBusy:false,connectionTesting:false});void stopRecording();if(synth)void stopChild(synth);void audio.stop();drainResolve?.();drainResolve=null;}
async function helperResult(mode,...args){
 return new Promise((resolve,reject)=>{
  const child=spawn(python,[helper,mode,...args],{stdio:['ignore','pipe','ignore']});let text='';
  child.stdout.on('data',b=>text+=b);child.on('error',reject);child.on('close',code=>{try{const result=JSON.parse(text.trim());if(code||result.error)throw Error(result.error||'Falha no áudio local.');resolve(result)}catch(e){reject(e)}});
 });
}
async function refreshMicrophones(){emit({microphoneBusy:true});try{const options=await listMicrophones();emit({microphones:[{value:'',label:'System default'},...options],microphoneTarget:target,microphoneError:''})}catch(e){emit({microphoneError:e.message})}finally{emit({microphoneBusy:false})}}
async function connect(){
 const [config,state]=await Promise.all([helperResult('config'),client.status()]);meta=config;ready=true;faulted=false;
 emit({modelProvider:'Dobby · '+config.planner,modelName:config.model,voiceProvider:'dobby',modelReady:true,speechReady:config.speechReady,keyConfigured:true,omarchySkillLoaded:true,responseLanguages:languageOptions(),responseLanguage:config.responseLanguage,microphoneTarget:target,voiceEffectsEnabled:effectsEnabled(),state:'idle',error:'',backendStatus:{provider:config.planner,recognition:'Voxtype · '+config.whisperModel,voice:'Piper',available:true,busy:!!state.busy}});
 if(!config.speechReady)throw Error('Voz Piper do Dobby não está disponível.');
 await refreshMicrophones();
}
async function stopRecording(){const child=recording;recording=null;if(child)await stopChild(child);emit({inputLevel:0,listeningReady:false})}
async function listen(){
 if(!presented||!ready||closed||faulted||testing||speaking||client.active||client.submitting||recording||micCheck)return;
 const current=generation;micCheck=true;
 try{
  const state=await client.status();
  if(state.listening){emit({state:'idle',listeningReady:false,error:'O microfone do Dobby já está ativo. Desliga-o antes de usar o O.M.A.'});return;}
  if(state.busy||state.pending){emit({state:'idle',listeningReady:false,taskStatus:'Dobby ocupado com outro pedido'});return;}
  if(!await microphoneAvailable(target)){emit({state:'idle',listeningReady:false,error:'Microfone silenciado, desligado ou sessão bloqueada.'});return;}
  if(current!==generation||!presented||recording||client.active||client.submitting||speaking||testing)return;
  emit({error:'',taskStatus:'',taskBusy:false});
  const child=spawn(python,[helper,'listen',target,meta.responseLanguage||''],{stdio:['ignore','pipe','ignore']});recording=child;
  let transcript='',failed=false;
  createInterface({input:child.stdout}).on('line',line=>{if(recording!==child||current!==generation)return;try{const patch=JSON.parse(line);if(patch.transcript!==undefined)transcript=patch.transcript;else if(patch.error){failed=true;fail(Error(patch.error))}else emit(patch)}catch{failed=true;fail(Error('Resposta inválida do reconhecimento local.'))}});
  child.on('error',e=>{if(recording===child){recording=null;failed=true;fail(e)}});
  child.on('close',code=>{if(recording!==child)return;recording=null;if(current!==generation)return;if(code&&!failed){fail(Error('Reconhecimento local terminou inesperadamente.'));return;}if(transcript.trim())void send(transcript).catch(fail);else if(!failed)setTimeout(()=>void listen().catch(fail),400)});
 }finally{micCheck=false;}
}
async function speak(text,current){
 if(current!==generation||closed)return;
 speaking=true;await stopRecording();emit({state:'speaking',listeningReady:false});
 try{
  const child=spawn(python,[helper,'synthesize',effectsEnabled()?'effects':'raw'],{stdio:['pipe','pipe','pipe']});synth=child;let error='',pending=Buffer.alloc(0),bytes=0;
  child.stderr.on('data',b=>error=(error+b).slice(-1000));child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{if(current!==generation)return;const pcm=Buffer.concat([pending,chunk]);const n=pcm.length-pcm.length%2;pending=Buffer.from(pcm.subarray(n));if(n){bytes+=n;audio.enqueue(pcm.subarray(0,n))}});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code&&current===generation?reject(Error(error||'Falha na voz local.')):resolve())});
  child.stdin.end(text);await done;if(synth===child)synth=null;if(current!==generation)return;
  if(!bytes)throw Error('A voz local não produziu áudio.');
  const drained=new Promise(resolve=>{drainResolve=resolve;audio.onDrained=()=>{drainResolve=null;resolve()}});audio.finish();await drained;
 }finally{speaking=false;if(current===generation)emit({state:approval?'approval':'idle',level:0,lipRound:0,lipWide:0})}
}
async function send(text){
 if(speaking||client.active||client.submitting)throw Error('Espera pelo fim da resposta ou usa Stop.');
 const current=++generation;faulted=false;await stopRecording();
 const id=await client.submit(text,sessionId);if(current!==generation){await client.cancel();return;}
 requestGeneration=current;lastActivity=Date.now();log.end();log.begin();memory.add('user',text);
 emit({userText:text,assistantText:'',state:'thinking',error:'',taskBusy:true,taskText:'Dobby',taskStatus:'A aguardar resposta',approval:null});
 void poll();
}
async function poll(){
 if(polling||!client.active||closed)return;polling=true;
 try{
  const id=client.active,current=requestGeneration,state=await client.status();
  if(id!==client.active||current!==generation)return;
  if(state.request_id!==id){client.active=null;throw Error('O pedido do O.M.A. perdeu contacto com o Dobby. Não foi cancelado outro pedido.');}
  if(state.pending){emit({state:'approval',taskBusy:false,taskText:state.action||'Confirmação do Dobby',taskStatus:'Aguarda confirmação',approval:{id,description:state.action||state.reply||'Confirmar ação?'}});return;}
  if(state.busy){emit({state:state.status==='working'?'working':'thinking',taskBusy:true,taskText:state.action||'Dobby',taskStatus:state.status});return;}
  client.active=null;
  const reply=String(state.reply||'');memory.add('assistant',reply);emit({assistantText:reply,taskBusy:false,taskStatus:'',taskText:'',approval:null,error:state.status==='error'?reply:'',state:state.status==='error'?'error':'idle'});
  if(reply&&(presented||testing)&&state.status!=='error')await speak(reply,current);
  if(testing){testing=false;emit({connectionTesting:false,connectionTestPassed:state.status!=='error',connectionTestError:state.status==='error'?reply:''})}
  if(current===generation)void listen().catch(fail);
 }catch(e){if(testing){testing=false;emit({connectionTesting:false,connectionTestPassed:false,connectionTestError:e.message})}fail(e)}finally{polling=false;}
}
async function stop(){
 generation++;testing=false;faulted=false;await stopRecording();const child=synth;synth=null;if(child)await stopChild(child);await audio.stop();drainResolve?.();drainResolve=null;await client.cancel();cue.stop();log.end();
 emit({state:'idle',error:'',approval:null,taskBusy:false,taskText:'',taskStatus:'',connectionTesting:false,level:0,lipRound:0,lipWide:0});
}
async function command(c){
 if(c.action==='presentation'){presented=c.active===true;if(presented){faulted=false;log.begin();lastActivity=Date.now();void listen().catch(fail)}else await stop();return;}
 if(c.action==='connect'||c.action==='refreshConnections'){await connect();void listen().catch(fail);return;}
 if(c.action==='stop'){presented=false;await stop();return;}
 if(c.action==='text'){await send(c.text);return;}
 if(c.action==='testConnection'){
  if(testing||client.active||speaking)throw Error('Termina o pedido atual antes do teste.');
  emit({connectionTestPassed:false,connectionTestError:''});await connect();testing=true;emit({connectionTesting:true});await send('Hello. Reply with one short sentence confirming that you received this greeting. Do not use tools.');return;
 }
 if(c.action==='approve'){const id=c.id;await client.confirm(id,c.allow===true);emit({approval:null,state:c.allow?'thinking':'idle'});void poll();return;}
 if(c.action==='press'){presented=true;void listen().catch(fail);return;}
 if(c.action==='release')return;
 if(c.action==='opening'){cue.play();return;}
 if(c.action==='closing'){cue.play();return;}
 if(['greet','restoreGreet'].includes(c.action)){emit({assistantText:'O.M.A. ligado ao Dobby. Podes falar.'});return;}
 if(c.action==='refreshMicrophones'){await refreshMicrophones();return;}
 if(c.action==='setMicrophone'){
  const next=String(c.target||'');await microphoneNode(next);await stopRecording();target=next;memory.set('microphoneTarget',next);wake.pause();wake.inputTarget=next;emit({microphoneTarget:next,microphoneError:''});void listen().catch(fail);return;
 }
 if(c.action==='setWake'){memory.set('wakeEnabled',c.enabled===true);wake.setEnabled(c.enabled===true);return;}
 if(c.action==='setVoiceEffects'){memory.set('dobbyVoiceEffects',c.enabled===true);audio.processor=c.enabled?new VoiceEffects({radio:true}):null;emit({voiceEffectsEnabled:c.enabled===true});return;}
 if(c.action==='setResponseLanguage'){emit({responseLanguage:meta.responseLanguage,languageError:'O idioma e a voz seguem a configuração do Dobby.'});return;}
 if(c.action==='saveApiKey'){c.key='';emit({keyError:'Este modo usa as ligações existentes do Dobby; não precisa de uma chave OpenAI.'});return;}
 if(c.action==='companionPanel'){await companion.setPanelState(c.active,c.closing);return;}
 if(c.action==='companionVisibility'){companion.setAutoVisible(c.active);return;}
 if(c.action==='autoAccompanyWindow'){await companion.autoOpen(c.address);return;}
 if(c.action==='companionWindowClosed'){companion.autoClose(c.address);return;}
 if(c.action==='accompanyWindow'){await companion.accompany(c.address);return;}
 if(c.action==='restoreFloating'){await companion.restore();return;}
}
const input=createInterface({input:process.stdin});let commands=Promise.resolve();
input.on('line',line=>{if(line.length>32768)return;commands=commands.then(()=>command(JSON.parse(line))).catch(fail)});
const timer=setInterval(()=>{void poll();if(presented&&!client.active&&!speaking&&!testing){if(Date.now()-lastActivity>180000){presented=false;void stop().then(()=>emit({dismiss:true})).catch(fail)}else void listen().catch(fail)}},400);
async function close(){if(closed)return;closed=true;presented=false;clearInterval(timer);wake.close();try{await stop();await companion.setPanelState(false,false)}finally{memory.close();process.exit(0)}}
input.on('close',()=>void close());process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
await connect().catch(fail);wake.start();
