import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {omaProfile,profileSkills} from '../runtime/profile.mjs';
test('O.M.A. skills describe GPT-Live and local tools',()=>{
 assert.deepEqual(profileSkills,['oma','oma-camera']);
 assert.match(omaProfile,/Responses backend/);assert.match(omaProfile,/camera_snapshot/);
 assert.match(omaProfile,/Omarchy skill/);assert.doesNotMatch(omaProfile,/Codex|delegate.*run_task/);
});

test('the loaded OMA skill identifies spoken and written aliases as the assistant itself',()=>{
 assert.match(omaProfile,/Your own name is/);for(const alias of ['O.M.A.','OMA','OH-mah','オーマ'])assert.ok(omaProfile.includes(alias));assert.match(omaProfile,/not your personal name/);
});
test('loaded OMA skill routes transcript opening to the portable CLI',()=>{
 assert.match(omaProfile,/oma transcript --today/);assert.match(omaProfile,/oma transcript --follow/);assert.match(omaProfile,/ログを見せて/);assert.match(omaProfile,/xdg-open/);
});

test('Live receives the skill delegation policy for follow-up document actions',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:()=>null});
 for(const phrase of ['Backend tools:', 'Delegate to the backend when:', 'Do not delegate to the backend when:', 'close a window', 'new blank document', 'Each follow-up'])assert.ok(config.instructions.includes(phrase),phrase);
 assert.ok(config.delegation.responses.instructions.includes('new_text_document'));
});

test('desktop procedures belong to the backend rather than the voice routing prompt',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:()=>null});
 assert.doesNotMatch(config.instructions,/new_text_document|oma transcript --today/);
 assert.match(config.delegation.responses.instructions,/new_text_document/);
 assert.match(config.delegation.responses.instructions,/oma transcript --today/);
});

test('execution backends do not receive the speech frontend delegation policy',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:()=>null});
 for(const instructions of [omaProfile,config.delegation.responses.instructions]){
  assert.doesNotMatch(instructions,/Delegate to the backend when:|Do not delegate to the backend when:/);
  assert.match(instructions,/execute.*tools directly/i);
 }
 assert.match(config.instructions,/Delegate to the backend when:/);
});

test('Live defaults to Luna low while retaining the voice model',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:()=>null},{OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname});
 assert.equal(config.delegation.responses.model,'gpt-6-luna');
 assert.equal(config.delegation.responses.reasoning.effort,'low');
 assert.equal(config.model,'gpt-live-1');
});

test('Live preserves an explicit backend model override',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:()=>null},{OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname,OMA_BACKEND_MODEL:'gpt-5.6-luna'});
 assert.equal(config.delegation.responses.model,'gpt-5.6-luna');
 assert.equal(config.delegation.responses.reasoning.effort,'low');
 assert.equal(config.model,'gpt-live-1');
});

test('Live status reports the configured backend model for defaults and overrides',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const status=source.slice(source.indexOf('function status()'),source.indexOf('\nconst tools='));
 const memory={facts:()=>[],get:()=>null};
 for(const override of [undefined,'gpt-5.6-luna']){
  const env={OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname,...(override?{OMA_BACKEND_MODEL:override}:{})};
  let emitted;
  runInNewContext(status+';status();',{process:{env},key:null,findOmarchySkill:()=>env.OMA_OMARCHY_SKILL,languageOptions:()=>[],memory,emit:value=>{emitted=value}});
  assert.equal(emitted.modelName,liveConfig(memory,env).delegation.responses.model);
 }
});
