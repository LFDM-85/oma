import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';import {Memory} from '../runtime/memory.mjs';import {PiAgent} from '../runtime/pi.mjs';
test('real Pi cancellation settles after an end tool while the final stream is pending',async t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-pi-cancel-')),memory=new Memory(join(home,'memory.sqlite'));
 let requests=0,secondStarted;const second=new Promise(r=>secondStarted=r);
 const server=createServer(async(req,res)=>{
  for await(const ignored of req){}res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(++requests===1){
   res.write('data: '+JSON.stringify({choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'finish',type:'function',function:{name:'end_conversation',arguments:'{}'}}]},finish_reason:null}]})+'\n\n');
   res.end('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n');
  }else{res.write('data: '+JSON.stringify({choices:[{index:0,delta:{role:'assistant'},finish_reason:null}]})+'\n\n');secondStarted();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const runtime=await ModelRuntime.create({authPath:join(home,'auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('oma-local',{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:'openai-completions',apiKey:'fixture',models:[{id:'fixture',name:'Fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:2048}]});
 const skill=join(home,'SKILL.md');writeFileSync(skill,'---\nname: omarchy\ndescription: Fixture\n---\nUse supported commands.');
 writeFileSync(join(home,'settings.json'),JSON.stringify({defaultProvider:'oma-local',defaultModel:'fixture'}));
 const agent=new PiAgent({home:join(home,'pi'),cwd:home,memory,emit(){},modelRuntime:runtime,env:{PI_CODING_AGENT_DIR:home},omarchySkill:skill});
 let task;const bounded=promise=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve('timeout'),1000))]);
 t.after(async()=>{server.closeAllConnections();server.close();await bounded(agent.close());await bounded(task);memory.close();rmSync(home,{recursive:true,force:true});});
 task=agent.run('Finish the conversation').catch(error=>({error:error.message}));
 assert.notEqual(await bounded(second),'timeout','The final stream should start');
 assert.notEqual(await bounded(Promise.all([agent.cancel(),agent.cancel()])),'timeout','Concurrent cancellation must settle');
 assert.notEqual(await bounded(task),'timeout','The turn must return after cancellation');
 assert.equal(agent.busy,false);
});
for(const provider of ['fixture','oma-local'])test('real Pi SDK '+provider+' preserves memory and applies its conversation lifecycle',async t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-pi-integration-'));const memory=new Memory(join(home,'memory.sqlite'));const requests=[];let mode='remember';let calls=0;
 const server=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);requests.push(body);res.writeHead(200,{'Content-Type':'text/event-stream'});
 const tool=mode==='remember'?'remember':mode==='write'?'bash':mode==='forget'?'forget':null;
 const args=mode==='remember'?{key:'color',value:'fictional cyan'}:mode==='write'?{command:'printf OMA_PI_OK > pi-result.txt'}:{query:'cyan'};
 const isTool=tool&&calls++===0;
 const delta=isTool?{role:'assistant',tool_calls:[{index:0,id:'call_'+mode,type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:mode==='recall'?'fictional cyan':'Done.'};
 for(const data of [{id:'test',object:'chat.completion.chunk',created:0,model:'fixture',choices:[{index:0,delta,finish_reason:null}]},{id:'test',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:isTool?'tool_calls':'stop'}]}])res.write('data: '+JSON.stringify(data)+'\n\n');res.end('data: [DONE]\n\n');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const runtime=await ModelRuntime.create({authPath:join(home,'auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider(provider,{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:'openai-completions',apiKey:'fixture-key',models:[{id:'fixture',name:'Fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:4096}]});
 const skill=join(home,'omarchy','SKILL.md');mkdirSync(join(home,'omarchy'));writeFileSync(skill,'---\nname: omarchy\ndescription: Desktop commands\n---\nUse supported commands.');
 writeFileSync(join(home,'settings.json'),JSON.stringify({defaultProvider:provider,defaultModel:'fixture'}));
 const opts={home:join(home,'pi'),cwd:home,memory,emit(){},modelRuntime:runtime,env:{PI_CODING_AGENT_DIR:home},omarchySkill:skill};let agent=new PiAgent(opts);
 t.after(async()=>{await agent.close();memory.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(home,{recursive:true,force:true});});
 let reply='';await agent.run('Remember fictional cyan.',d=>reply+=d);assert.equal(reply,'Done.');assert.match(JSON.stringify(memory.facts()),/fictional cyan/);
 assert.ok(requests[0].messages[0].content.includes('Use supported commands.'));
 assert.equal(requests[0].temperature,provider==='oma-local'?0.2:undefined);
 assert.ok(requests[0].tools.some(t=>t.function.name==='remember'));
 agent.notePlayback('Done.');mode='write';calls=0;await agent.run('Write the test file.');assert.equal(readFileSync(join(home,'pi-result.txt'),'utf8'),'OMA_PI_OK');
 assert.ok(JSON.stringify(requests.at(-1).messages).includes('previous spoken reply was interrupted'));
 await agent.close();agent=new PiAgent(opts);mode='recall';calls=0;await agent.run('Recall the color.');assert.equal(requests.at(-1).messages.some(m=>JSON.stringify(m).includes('Remember fictional cyan.')),provider!=='oma-local');
 assert.match(JSON.stringify(memory.facts()),/fictional cyan/);
 mode='forget';calls=0;await agent.run('Forget cyan.');assert.equal(memory.search('cyan').length,0);
 mode='fresh';calls=0;await agent.run('Start fresh.');assert.ok(!JSON.stringify(requests.at(-1).messages).includes('cyan'));
});
