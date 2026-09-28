import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Memory} from '../runtime/memory.mjs';
import {PiAgent} from '../runtime/pi.mjs';
const local=await import('../runtime/local-agent.mjs').catch(()=>({}));
test('isolated local Pi config selects only the loopback model with image and tool support',async t=>{
 assert.equal(typeof local.localAgentConfig,'function');
 const home=mkdtempSync(join(tmpdir(),'oma-local-agent-')),memory=new Memory(join(home,'memory.sqlite'));
 t.after(()=>{memory.close();rmSync(home,{recursive:true,force:true})});
 const config=local.localAgentConfig(home);
 const agent=new PiAgent({home:join(home,'sessions'),cwd:home,memory,emit(){},env:{PI_CODING_AGENT_DIR:config}});
 t.after(()=>agent.close());await agent.configure();
 assert.equal(agent.provider,'oma-local');assert.equal(agent.modelId,'qwen3.5:4b');
 const model=agent.modelRuntime.getModel(agent.provider,agent.modelId);
 assert.equal(model.baseUrl,'http://127.0.0.1:11435/v1');assert.ok(model.input.includes('image'));
 assert.equal(model.thinkingLevelMap.off,'none');
 const stored=JSON.parse(readFileSync(join(config,'models.json'),'utf8'));
 assert.deepEqual(Object.keys(stored.providers),['oma-local']);
});

test('local requests retain answer room with a resumed desktop conversation',async t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-local-budget-')),memory=new Memory(join(home,'memory.sqlite'));
 t.after(()=>{memory.close();rmSync(home,{recursive:true,force:true})});
 const agent=new PiAgent({home,cwd:home,memory,emit(){},env:{PI_CODING_AGENT_DIR:local.localAgentConfig(home)}});
 t.after(()=>agent.close());await agent.configure();
 const model=agent.modelRuntime.getModel(agent.provider,agent.modelId);let payload;
 // A resumed session includes skill instructions, tool schemas and desktop observations.
 await agent.modelRuntime.completeSimple(model,{systemPrompt:'Desktop instructions. '.repeat(3300),messages:[{role:'user',content:'What is one plus one?',timestamp:Date.now()}]},
  {onPayload(p){payload=p;throw Error('Captured before network');}});
 assert.ok(payload.max_tokens>=2048,'Resumed context reduced output to '+payload.max_tokens+' tokens');
});

test('local model comparison settings persist without changing the loopback provider',t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-local-choice-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 local.localAgentConfig(home);
 writeFileSync(join(home,'local','agent.json'),JSON.stringify({model:'qwen3.5:4b-q8_0',thinkingLevel:'off'}));
 const config=local.localAgentConfig(home);
 const settings=JSON.parse(readFileSync(join(config,'settings.json')));
 const provider=JSON.parse(readFileSync(join(config,'models.json'))).providers['oma-local'];
 assert.equal(settings.defaultModel,'qwen3.5:4b-q8_0');assert.equal(settings.defaultThinkingLevel,'off');
 assert.equal(provider.models[0].id,settings.defaultModel);assert.equal(provider.baseUrl,'http://127.0.0.1:11435/v1');
 writeFileSync(join(home,'local','agent.json'),JSON.stringify({model:'qwen3.5:4b',thinkingLevel:'surprise'}));
 assert.throws(()=>local.localAgentConfig(home),/thinking/i);
});
test('the multilingual 3.6 candidate can be selected without changing the default',t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-local-qwen36-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 let config=local.localAgentConfig(home);assert.equal(JSON.parse(readFileSync(join(config,'settings.json'))).defaultModel,'qwen3.5:4b');
 writeFileSync(join(home,'local','agent.json'),JSON.stringify({model:'qwen3.6:35b',thinkingLevel:'low'}));
 config=local.localAgentConfig(home);assert.equal(JSON.parse(readFileSync(join(config,'settings.json'))).defaultModel,'qwen3.6:35b');
});

test('zero repetition penalties reach the real local API payload',async t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-local-sampling-')),memory=new Memory(join(home,'memory.sqlite'));
 t.after(()=>{memory.close();rmSync(home,{recursive:true,force:true})});
 local.localAgentConfig(home);
 writeFileSync(join(home,'local','agent.json'),JSON.stringify({sampling:{temperature:.6,top_p:.95,presence_penalty:0}}));
 const agent=new PiAgent({home,cwd:home,memory,emit(){},env:{PI_CODING_AGENT_DIR:local.localAgentConfig(home)}});
 t.after(()=>agent.close());await agent.configure();let payload;
 const model=agent.modelRuntime.getModel(agent.provider,agent.modelId);
 await agent.modelRuntime.completeSimple(model,{messages:[{role:'user',content:'A development probe.',timestamp:Date.now()}]},
  {...agent.localSampling,onPayload(value){payload=value;throw Error('Captured before network')}});
 assert.equal(payload.temperature,.6);assert.equal(payload.top_p,.95);assert.equal(payload.presence_penalty,0);
});
