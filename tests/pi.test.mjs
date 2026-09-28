import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Memory} from '../runtime/memory.mjs';
const pi=await import('../runtime/pi.mjs').catch(()=>({}));
function fixture(t){const home=mkdtempSync(join(tmpdir(),'oma-pi-'));const memory=new Memory(join(home,'memory.sqlite'));t.after(()=>{memory.close();rmSync(home,{recursive:true,force:true});});return {home,memory};}
test('local Pi uses native structured edits and preserves unrelated bytes',async t=>{
 const {home,memory}=fixture(t),agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 agent.provider='oma-local';agent.modelId='qwen3.5:4b';
 assert.equal(typeof agent.sessionTools,'function');
 const tools=agent.sessionTools(),edit=tools.find(tool=>tool.name==='edit');
 assert.ok(edit.parameters.properties.edits,'The native edit array already protects literal text');
 assert.equal(edit.parameters.properties.input,undefined);
 const path=join(home,'note.txt');writeFileSync(path,'Morning plan.\r\nKeep trailing spaces.  ');
 await edit.execute('replace',{path,edits:[{oldText:'Morning',newText:'Evening'}]},new AbortController().signal);
 assert.equal(readFileSync(path,'utf8'),'Evening plan.\r\nKeep trailing spaces.  ');
 assert.ok(tools.find(tool=>tool.name==='write').parameters.properties.input,'Flat text writing still needs literal JSON protection');
});
test('Pi resources include bundled skills and the installed Omarchy skill, but no ambient extensions',async t=>{
 assert.equal(typeof pi.createResources,'function','Pi resource loader missing');
 const {home,memory}=fixture(t),skill=join(home,'omarchy','SKILL.md');mkdirSync(join(home,'omarchy'));writeFileSync(skill,'---\nname: omarchy\ndescription: Desktop settings\n---\nUse the supported Omarchy CLI.');
 const loader=await pi.createResources({home,cwd:home,memory,locale:'ja-JP',omarchySkill:skill});
 assert.deepEqual(loader.getSkills().skills.map(s=>s.name).sort(),['oma','oma-camera','omarchy']);
 assert.match(loader.getSystemPrompt(),/Japanese/);assert.match(loader.getSystemPrompt(),/Use the supported Omarchy CLI/);
 assert.equal(loader.getExtensions().extensions.length,0);
});
test('memory tools persist facts and exact URLs while confirmation denial never grants permission',async t=>{
 assert.equal(typeof pi.PiAgent,'function','Pi agent missing');const {home,memory}=fixture(t),patches=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p)});
 const tools=agent.tools();const call=(name,args)=>tools.find(t=>t.name===name).execute(name,args,new AbortController().signal);
 await call('remember',{key:'favorite',value:'fictional amber'});
 assert.match(JSON.stringify(await call('search_memory',{query:'amber'})),/fictional amber/);
 const denied=call('confirm_action',{description:'Publish the draft'});
 const approval=patches.find(p=>p.approval).approval;agent.approve(approval.id,false);
 assert.equal(JSON.parse((await denied).content[0].text).approved,false);
});
test('a verified pending document choice cannot become a binary approval',async t=>{
 const {home,memory}=fixture(t),patches=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p)});
 agent.pendingApplicationCloses.add('0xabc');
 agent.desktop.json=async()=>[{address:'0xabc',mapped:true,hidden:false,title:'Untitled — OmaText'}];
 agent.desktop.command=async()=>Buffer.from(JSON.stringify({opened:true,modified:true,busy:false,editor:{modalOpen:true,settingsOpen:false}}));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),100);t.after(()=>clearTimeout(timer));
 await assert.rejects(()=>agent.confirm('Discard the selected draft',controller.signal),/save, discard or cancel/);
 assert.equal(agent.approvals.size,0);
 assert.equal(patches.some(p=>p.approval),false);
});
test('stale or resolved close requests do not block unrelated approval',async t=>{
 const {home,memory}=fixture(t);
 for(const kind of ['gone','resolved','other-application']){
  const patches=[],agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p)});
  agent.pendingApplicationCloses.add('0xabc');
  agent.desktop.json=async()=>kind==='gone'?[]:[{address:'0xabc',mapped:true,hidden:false,title:kind==='other-application'?'Browser':'Untitled — OmaText'}];
  agent.desktop.command=async()=>{assert.equal(kind,'resolved');return Buffer.from(JSON.stringify({opened:true,modified:true,editor:{modalOpen:false}}));};
  const decision=agent.confirm('Publish the requested draft',new AbortController().signal);
  await new Promise(resolve=>setImmediate(resolve));
  const approval=patches.find(p=>p.approval)?.approval;assert.ok(approval,kind);
  agent.approve(approval.id,false);assert.deepEqual(await decision,{approved:false});
  if(kind==='gone')assert.equal(agent.pendingApplicationCloses.size,0);
 }
});
test('forget purges O.M.A. Pi sessions and facts without deleting unrelated Pi data',async t=>{
 assert.equal(typeof pi.PiAgent,'function','Pi agent missing');const {home,memory}=fixture(t);
 const own=join(home,'pi');mkdirSync(join(own,'sessions'),{recursive:true});writeFileSync(join(own,'sessions','old.jsonl'),'private orange');
 writeFileSync(join(home,'unrelated.jsonl'),'keep');memory.remember('favorite','private orange');
 const agent=new pi.PiAgent({home:own,cwd:home,memory,emit(){}});
 await agent.tools().find(t=>t.name==='forget').execute('forget',{query:'orange'},new AbortController().signal);
 await agent.resetForgottenSession();
 assert.equal(memory.search('orange').length,0);assert.equal(readFileSync(join(home,'unrelated.jsonl'),'utf8'),'keep');
 assert.equal((await import('node:fs')).existsSync(join(own,'sessions','old.jsonl')),false);
});
test('Pi settings alone select the model; old O.M.A. overrides and speech key are ignored',async t=>{
 const {home,memory}=fixture(t);const config=join(home,'config');mkdirSync(config);
 writeFileSync(join(config,'settings.json'),JSON.stringify({defaultProvider:'fixture',defaultModel:'chosen'}));
 memory.set('piProvider','old');memory.set('piModel','old');let injected=false;
 const model={provider:'fixture',id:'chosen'};
 const modelRuntime={getAvailable:async()=>[model],getModel:(p,m)=>p===model.provider&&m===model.id?model:undefined,setRuntimeApiKey:async()=>{injected=true;}};
 const agent=new pi.PiAgent({home,cwd:home,memory,key:'speech-only',emit(){},modelRuntime,env:{PI_CODING_AGENT_DIR:config,OMA_PI_PROVIDER:'old',OMA_PI_MODEL:'old'}});
 assert.equal(await agent.status(),true);assert.equal(agent.provider,'fixture');assert.equal(agent.modelId,'chosen');assert.equal(injected,false);
});
test('missing Pi defaults require setup without choosing an arbitrary available model',async t=>{
 const {home,memory}=fixture(t);const patches=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p),env:{PI_CODING_AGENT_DIR:home},modelRuntime:{getAvailable:async()=>[{provider:'openai',id:'gpt-4.1'}],getModel:()=>undefined}});
 assert.equal(await agent.status(),false);assert.equal(patches.at(-1).modelProvider,'');assert.equal(patches.at(-1).modelName,'');
 await assert.rejects(()=>agent.start(),/Pi.*default model/);
});
test('Pi exposes the same mini and normal presentation tool',async t=>{
 const {home,memory}=fixture(t),patches=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p)});
 const tool=agent.tools().find(t=>t.name==='set_view_mode');assert.ok(tool);
 for(const mode of ['mini','normal'])await tool.execute('mode',{mode},new AbortController().signal);
 assert.deepEqual(patches,[{viewMode:'mini'},{viewMode:'normal'}]);
 await assert.rejects(()=>tool.execute('mode',{mode:'other'},new AbortController().signal),/Invalid/);
});

test('a length-limited model reply does not mark the operation completed',async t=>{
 const {home,memory}=fixture(t);
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 agent.session={subscribe:()=>()=>{},prompt:async()=>{},messages:[{role:'assistant',content:[],stopReason:'length'}]};
 await assert.rejects(()=>agent.run('Open the editor'),/limit|truncated/i);
 assert.notEqual(JSON.parse(memory.get('taskCheckpoint')).status,'completed');
});

test('Pi executes the same literal command arguments as the shared OMA skill',async t=>{
 const {home,memory}=fixture(t);
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 const tool=agent.tools().find(t=>t.name==='run_command');assert.ok(tool);
 const literal='spaces; $(not-a-command)';
 const result=await tool.execute('command',{command:process.execPath,args:['-e','process.stdout.write(process.argv[1])',literal]},new AbortController().signal);
 assert.equal(JSON.parse(result.content[0].text).stdout,literal);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>tool.execute('command',{command:process.execPath,args:['-e','throw Error()']},controller.signal),/abort/i);
});

test('Pi respects the configured reasoning level for model comparisons',async t=>{
 const {home,memory}=fixture(t);
 writeFileSync(join(home,'settings.json'),JSON.stringify({defaultProvider:'oma-local',defaultModel:'qwen3.5:9b',defaultThinkingLevel:'low'}));
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){},env:{PI_CODING_AGENT_DIR:home},modelRuntime:{}});
 await agent.configure();assert.equal(agent.thinkingLevel,'low');
});

test('ending a conversation permits a final reply but no further tool actions',async t=>{
 const {home,memory}=fixture(t);let dismissed=0;const updates=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 agent.onDismiss=()=>dismissed++;
 const active=['read','end_conversation'];
 agent.session={getActiveToolNames:()=>active,setActiveToolsByName:names=>updates.push(names),subscribe:()=>()=>{},messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{
  const end=agent.tools().find(tool=>tool.name==='end_conversation');
  await end.execute('end',{},new AbortController().signal);
  await end.execute('duplicate-end',{},new AbortController().signal);
  assert.deepEqual(updates,[[]]);
 }};
 await agent.run('Please end this conversation.');
 assert.equal(dismissed,1);
 assert.deepEqual(updates,[[],active],'An interrupted closure must not disable later conversation tools');
});

test('explicit farewell uses the same conservative lifecycle route for text and voice',async t=>{
 for(const instruction of ['バイバイ','Thanks. Bye.']){
  const {home,memory}=fixture(t);let dismissed=0,prompts=0;const deltas=[],active=['read','end_conversation'],updates=[];
  const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});agent.onDismiss=()=>dismissed++;
  agent.notice=async()=> 'A localized farewell.';
  agent.session={getActiveToolNames:()=>active,setActiveToolsByName:names=>updates.push(names),subscribe:()=>()=>{},messages:[],prompt:async()=>{prompts++}};
  assert.equal(await agent.run(instruction,text=>deltas.push(text)),'A localized farewell.');
  assert.equal(dismissed,1);assert.equal(prompts,0);assert.deepEqual(deltas,['A localized farewell.']);
  assert.deepEqual(updates,[[],active]);
 }
});

test('quoted or extended farewell requests still go through the agent without closing',async t=>{
 for(const instruction of ['Translate goodbye into Japanese. Keep this conversation open.','バイバイという言葉の意味を教えて','Goodbye, but first save this document.']){
  const {home,memory}=fixture(t);let dismissed=0,prompts=0;
  const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});agent.onDismiss=()=>dismissed++;
  agent.session={subscribe:()=>()=>{},messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{prompts++}};
  await agent.run(instruction);assert.equal(dismissed,0);assert.equal(prompts,1);
 }
});

test('three identical failed tool actions stop with an error rather than reporting completion',async t=>{
 const {home,memory}=fixture(t);let listener,aborts=0;
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});agent.provider='oma-local';
 agent.session={subscribe:fn=>{listener=fn;return()=>{};},abort:async()=>{aborts++;},messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{
  for(let n=0;n<3;n++){
   listener({type:'tool_execution_start',toolCallId:String(n),toolName:'desktop_type',args:{frameId:'stale',text:'Note'}});
   listener({type:'tool_execution_end',toolCallId:String(n),toolName:'desktop_type',isError:true,result:{}});
  }
  await Promise.resolve();
 }};
 await assert.rejects(()=>agent.run('Type a note'),/same tool action failed three times/i);
 assert.equal(aborts,1);
 assert.notEqual(JSON.parse(memory.get('taskCheckpoint')).status,'completed');
});

test('successful or corrected tool actions reset the repeated-error guard',async t=>{
 const {home,memory}=fixture(t);let listener;
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});agent.provider='oma-local';
 agent.session={subscribe:fn=>{listener=fn;return()=>{};},abort:async()=>assert.fail('Recovery must remain possible'),messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{
  for(const [n,[frameId,isError]] of [['old',true],['old',true],['new',true],['new',true],['new',false],['new',true],['new',true]].entries()){
   listener({type:'tool_execution_start',toolCallId:String(n),toolName:'desktop_type',args:{frameId,text:'Note'}});
   listener({type:'tool_execution_end',toolCallId:String(n),toolName:'desktop_type',isError,result:{}});
  }
  await Promise.resolve();
 }};
 await agent.run('Type a note');
 assert.equal(JSON.parse(memory.get('taskCheckpoint')).status,'completed');
});

test('Pi exposes literal append without rebuilding existing file contents',async t=>{
 const {home,memory}=fixture(t);writeFileSync(join(home,'note.txt'),'Keep. ');
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 const tool=agent.tools().find(tool=>tool.name==='append_text_file');assert.ok(tool);
 const result=await tool.execute('append',{path:'note.txt',text:'追記'},new AbortController().signal);
 assert.equal(readFileSync(join(home,'note.txt'),'utf8'),'Keep. 追記');
 assert.equal(JSON.parse(result.content[0].text).bytesAppended,6);
});

test('cancel uses a recorded pending target and refuses ambiguity',async t=>{
 const {home,memory}=fixture(t);const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 const tools=agent.tools(),close=tools.find(x=>x.name==='close_application_window'),cancel=tools.find(x=>x.name==='cancel_application_close');assert.ok(cancel);
 const signal=new AbortController().signal;
 await assert.rejects(()=>cancel.execute('none',{},signal),/single|pending/i);
 let bClosed=false;
 agent.companion.closeTarget=async address=>({closed:address==='0xb'&&bClosed,requiresAttention:!(address==='0xb'&&bClosed)});
 await close.execute('a',{address:'0xa'},signal);await close.execute('b',{address:'0xb'},signal);
 await assert.rejects(()=>cancel.execute('ambiguous',{},signal),/single|ambiguous/i);
 bClosed=true;await close.execute('b-done',{address:'0xb'},signal);
 agent.desktop={check(){},async json(){return [{address:'0xa',title:'Untitled — OmaText',mapped:true,pid:7,workspace:{id:98}}]},async command(){return Buffer.from(JSON.stringify({opened:true,busy:false,editor:{modalOpen:false}}))}};
 const result=JSON.parse((await cancel.execute('cancel-a',{},signal)).content[0].text);
 assert.equal(result.address,'0xa');assert.equal(result.cancelled,true);
 await assert.rejects(()=>cancel.execute('duplicate',{},signal),/single|pending/i);
});

test('a local stream failure before output or actions gets one schema repair attempt',async t=>{
 const {home,memory}=fixture(t);const patches=[];
 const agent=new pi.PiAgent({home,cwd:home,memory,emit:p=>patches.push(p)});agent.provider='oma-local';
 let requests=0;
 agent.session={subscribe:()=>()=>{},messages:[],prompt:async()=>{
  requests++;agent.session.messages.push({role:'assistant',stopReason:requests===1?'error':'stop',errorMessage:'Stream ended without finish_reason'});
 }};
 await agent.run('Create my requested document');assert.equal(requests,2);
 assert.equal(patches.filter(p=>p.modelRetry).length,1);
 assert.equal(JSON.parse(memory.get('taskCheckpoint')).status,'completed');
});
test('stream recovery never replays an executed action or spoken output and is bounded',async t=>{
 for(const mode of ['action','speech','repeat','remote']){
  const {home,memory}=fixture(t);let listener,requests=0;
  const agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});agent.provider=mode==='remote'?'other':'oma-local';
  agent.session={subscribe:fn=>{listener=fn;return()=>{}},messages:[],prompt:async()=>{
   requests++;
   if(mode==='action')listener({type:'tool_execution_start',toolCallId:'1',toolName:'append_text_file',args:{path:'note.txt',text:'Extra'}});
   if(mode==='speech')listener({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'I have started.'}});
   agent.session.messages.push({role:'assistant',stopReason:'error',errorMessage:'Stream ended without finish_reason'});
  }};
  await assert.rejects(()=>agent.run('Continue my work'),/finish_reason/);
  assert.equal(requests,mode==='repeat'?2:1,mode);
  assert.notEqual(JSON.parse(memory.get('taskCheckpoint')).status,'completed');
 }
});

test('local window tools use short references but execute against verified native addresses',async t=>{
 const {home,memory}=fixture(t),agent=new pi.PiAgent({home,cwd:home,memory,emit(){}});
 agent.provider='oma-local';agent.modelId='qwen3.5:4b';
 const clients=[{address:'0xabc123',pid:1,title:'Draft — OmaText',class:'editor',workspace:{id:98},mapped:true},{address:'0xdef456',pid:2,title:'Other',class:'browser',workspace:{id:98},mapped:true}];
 agent.desktop.json=async args=>args[0]==='monitors'?[{id:0,activeWorkspace:{id:98}}]:clients;
 const closed=[];agent.companion.closeTarget=async address=>{closed.push(address);return {closed:true}};
 const tools=agent.tools(),signal=new AbortController().signal;
 const list=tools.find(x=>x.name==='list_windows'),close=tools.find(x=>x.name==='close_application_window');
 const observed=JSON.parse((await list.execute('list',{},signal)).content[0].text).windows;
 assert.deepEqual(close.parameters.required,['windowId']);assert.equal(observed[1].windowId,'w2');
 await close.execute('close',{windowId:'w2'},signal);assert.deepEqual(closed,['0xdef456']);
 await assert.rejects(()=>close.execute('bad',{windowId:'0xabc123'},signal),/reference|list_windows/);
 assert.deepEqual(closed,['0xdef456']);
});
test('Pi injects one current context at each request and tool continuation without persisting inventory',async t=>{
 const {home,memory}=fixture(t);let current={status:'current',windows:[{title:'first'}]},refreshes=0,stops=0;
 const context={start:async()=>{},refresh:async()=>{refreshes++},snapshot:()=>current,stop:()=>stops++};
 const agent=new pi.PiAgent({home,cwd:home,memory,emit(){},desktopContext:context});
 const session={agent:{transformContext:async messages=>messages},abort:async()=>{},dispose(){}};
 assert.equal(typeof agent.installDesktopContext,'function');agent.installDesktopContext(session);agent.session=session;
 const messages=[{role:'system',content:'original tools',toolsAdded:[{name:'example'}]},{role:'user',content:'What is next to you?'}],original=JSON.stringify(messages);
 const first=await session.agent.transformContext(messages);assert.match(first[0].content,/first/);assert.match(first[0].content,/untrusted/i);assert.deepEqual(first[0].toolsAdded,[{name:'example'}]);
 current={status:'current',windows:[{title:'second'}]};const second=await session.agent.transformContext(messages);assert.match(second[0].content,/second/);assert.doesNotMatch(second[0].content,/first/);assert.equal(JSON.stringify(messages),original);assert.equal(refreshes,2);
 current={status:'unavailable',windows:null};assert.match((await session.agent.transformContext(messages))[0].content,/unavailable/);assert.equal(memory.search('second').length,0);await agent.close();assert.equal(stops,1);
});
test('real Pi request projection refreshes after tools without persisting desktop metadata',async t=>{
 const {ModelRuntime}=await import('@earendil-works/pi-coding-agent');
 const {home,memory}=fixture(t),skill=join(home,'SKILL.md');writeFileSync(skill,'---\nname: omarchy\ndescription: Fixture\n---\nUse supported commands.');
 writeFileSync(join(home,'settings.json'),JSON.stringify({defaultProvider:'oma-local',defaultModel:'fixture'}));
 const runtime=await ModelRuntime.create({authPath:join(home,'auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('oma-local',{baseUrl:'http://127.0.0.1:1/v1',api:'openai-completions',apiKey:'fixture',models:[{id:'fixture',name:'Fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:2048}]});
 let title='fictional-desktop-before',starts=0,stops=0,refreshes=0;const requests=[];
 const context={start:async()=>{starts++},stop:()=>stops++,refresh:async()=>refreshes++,snapshot:()=>({status:'current',windows:[{title}]})};
 const agent=new pi.PiAgent({home:join(home,'pi'),cwd:home,memory,emit:p=>{if(p.viewMode)title='fictional-desktop-after'},modelRuntime:runtime,env:{PI_CODING_AGENT_DIR:home},omarchySkill:skill,desktopContext:context});
 t.after(()=>agent.close());await agent.start();
 agent.session.agent.streamFunction=(model,context)=>{
  requests.push(JSON.stringify(context));const tool=requests.length===1;
  const message={role:'assistant',content:tool?[{type:'toolCall',id:'view',name:'set_view_mode',arguments:{mode:'mini'}}]:[{type:'text',text:'Done.'}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:tool?'toolUse':'stop',timestamp:Date.now()};
  return {async *[Symbol.asyncIterator](){yield {type:'done',reason:message.stopReason,message}},result:async()=>message};
 };
 await agent.run('Switch to mini mode.');assert.equal(requests.length,2);assert.match(requests[0],/fictional-desktop-before/);assert.match(requests[1],/fictional-desktop-after/);assert.doesNotMatch(requests[1],/fictional-desktop-before/);
 assert.doesNotMatch(JSON.stringify(agent.session.messages),/fictional-desktop-/);assert.equal(refreshes,2);assert.ok(starts>=1);
 const {readdirSync}=await import('node:fs');for(const file of readdirSync(join(home,'pi','sessions'),{recursive:true}))if(file.endsWith('.jsonl'))assert.doesNotMatch(readFileSync(join(home,'pi','sessions',file),'utf8'),/fictional-desktop-/);
 await agent.close();assert.equal(stops,1);
});
