import test from 'node:test';import assert from 'node:assert/strict';
import {connectModel} from '../runtime/connect-model.mjs';
test('existing default is reused without asking for authentication or changing settings',async()=>{
 const model={provider:'fixture',id:'saved',name:'Saved'};let writes=0;
 const result=await connectModel({runtime:{getAvailable:async()=>[model]},settings:{getDefaultProvider:()=>model.provider,getDefaultModel:()=>model.id,setDefaultModelAndProvider(){writes++}},choose(){throw Error('unexpected choice')},interaction:{}});
 assert.equal(result,model);assert.equal(writes,0);
});
test('guided authentication uses Pi login and saves only to Pi settings',async()=>{
 let logged=false,saved,flushed=false;const model={provider:'fixture',id:'model',name:'Model'};const interaction={};
 const runtime={getAvailable:async()=>logged?[model]:[],getProviders:()=>[{id:'fixture',name:'Fixture',auth:{oauth:{name:'Account'}}}],login:async(p,m,i)=>{assert.equal(p,'fixture');assert.equal(m,'oauth');assert.equal(i,interaction);logged=true;}};
 const settings={getDefaultProvider(){},getDefaultModel(){},setDefaultModelAndProvider:(...a)=>saved=a,flush:async()=>{flushed=true}};
 const result=await connectModel({runtime,settings,choose:async(label,options)=>options[0].value,interaction});
 assert.equal(result,model);assert.deepEqual(saved,['fixture','model']);assert.equal(flushed,true);
});
test('cancelled authentication never replaces the Pi default',async()=>{
 let wrote=false;await assert.rejects(()=>connectModel({runtime:{getAvailable:async()=>[],getProviders:()=>[{id:'fixture',name:'Fixture',auth:{apiKey:{login(){}}}}],login:async()=>{throw Error('cancelled')}},settings:{getDefaultProvider(){},getDefaultModel(){},setDefaultModelAndProvider(){wrote=true}},choose:async(l,o)=>o[0].value,interaction:{}}),/cancelled/);assert.equal(wrote,false);
});
import {checkConnection} from '../runtime/connection-check.mjs';
test('connection check verifies AI, synthesis and transcription before returning playback',async()=>{
 const signal=new AbortController().signal;let transcribed=false;
 const pcm=await checkConnection({agent:{notice:async()=> 'hello'},speech:{speak:async(t,fn)=>fn(Buffer.alloc(4800)),transcribe:async b=>{transcribed=true;assert.equal(b.length,4800);return 'hello'}},signal});assert.equal(pcm.length,4800);assert.equal(transcribed,true);
});
test('failed speech recognition cannot mark onboarding ready',async()=>{
 await assert.rejects(()=>checkConnection({agent:{notice:async()=> 'hello'},speech:{speak:async(t,fn)=>fn(Buffer.alloc(4800)),transcribe:async()=>''},signal:new AbortController().signal}),/Speech recognition/);
});
import {ModelRuntime,SettingsManager} from '@earendil-works/pi-coding-agent';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('real Pi auth and settings APIs store guided setup in isolated shared configuration',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-connect-pi-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'settings.json'),JSON.stringify({theme:'preserved'}));
 const runtime=await ModelRuntime.create({authPath:join(dir,'auth.json'),modelsPath:null,modelsStorePath:join(dir,'models.json'),refreshOnCreate:false});
 const settings=SettingsManager.create(dir,dir);let prompted=false;
 const model=await connectModel({runtime,settings,choose:async(label,choices)=>choices.find(c=>c.value?.id==='openai')?.value||choices.find(c=>c.value==='api_key')?.value||choices[0].value,interaction:{prompt:async p=>{assert.equal(p.type,'secret');prompted=true;return 'fictional-test-key-never-sent'},notify(){}}});
 assert.equal(prompted,true);assert.equal(model.provider,'openai');
 const saved=JSON.parse(readFileSync(join(dir,'settings.json'),'utf8'));assert.equal(saved.defaultProvider,'openai');assert.equal(saved.defaultModel,model.id);assert.equal(saved.theme,'preserved');
 assert.ok(JSON.parse(readFileSync(join(dir,'auth.json'),'utf8')).openai);
});
