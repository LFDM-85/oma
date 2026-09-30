import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync,openSync,closeSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Memory} from '../runtime/memory.mjs';import {GreetingCache} from '../runtime/startup-greeting.mjs';
function worker(t,data){
 const commands=join(data,'commands');writeFileSync(commands,'');
 const out=join(data,'stdout'),err=join(data,'stderr'),fds=[openSync(out,'w'),openSync(err,'w')];
 const child=spawn(process.execPath,[new URL('fixtures/voice-effects-worker.mjs',import.meta.url).pathname],{env:{...process.env,OMA_DATA_DIR:data,OMA_TEST_COMMANDS:commands,OMA_LIVE_VOICE:'cedar',OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname},stdio:['ignore',...fds]});
 t.after(()=>child.kill());fds.forEach(closeSync);const events=[];let read=0;function refresh(){const lines=readFileSync(out,'utf8').split('\n').slice(0,-1).filter(Boolean);while(read<lines.length)events.push(JSON.parse(lines[read++]));}
 return {events,send:c=>appendFileSync(commands,JSON.stringify(c)+'\n'),async wait(predicate){const end=Date.now()+2000;while(Date.now()<end){refresh();const found=events.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,10))}throw Error('No expected worker event: '+readFileSync(err,'utf8')+' '+JSON.stringify(events))},async close(){const end=new Promise(r=>child.once('close',r));appendFileSync(commands,JSON.stringify({action:'fixtureClose'})+'\n');assert.equal(await end,0,readFileSync(err,'utf8'))}};
}
function directory(t){const data=mkdtempSync(join(tmpdir(),'oma-effects-setting-'));t.after(()=>rmSync(data,{recursive:true,force:true}));return data;}
test('default ON and OFF/ON persistence are authoritative on backend restart',async t=>{
 const data=directory(t);let w=worker(t,data);await w.wait(e=>e.voiceEffectsEnabled===true);
 w.send({action:'setVoiceEffects',enabled:false});await w.wait(e=>e.voiceEffectsEnabled===false);await w.close();
 const m=new Memory(join(data,'memory.sqlite'));assert.equal(m.get('voiceEffectsEnabled'),'false');m.close();
 w=worker(t,data);await w.wait(e=>e.voiceEffectsEnabled===false);w.send({action:'setVoiceEffects',enabled:true});await w.wait(e=>e.voiceEffectsEnabled===true);await w.close();
 w=worker(t,data);await w.wait(e=>e.voiceEffectsEnabled===true);await w.close();
});
test('OFF cache miss uses raw live greeting and does not use processed farewell',async t=>{
 const data=directory(t),m=new Memory(join(data,'memory.sqlite'));m.set('voiceEffectsEnabled','false');m.set('responseLanguage','en');m.close();
 for(const farewell of [false,true])new GreetingCache(data,{farewell}).save('en','cedar',{text:'Processed.',pcm:Buffer.alloc(4800,1)});
 const w=worker(t,data);await w.wait(e=>e.voiceEffectsEnabled===false);w.send({action:'greet'});await w.wait(e=>e.played);
 assert.equal(w.events.find(e=>e.sessionEffects!==undefined).hasFarewell,false);assert.equal(w.events.find(e=>e.sessionEffects!==undefined).voice,'cedar');assert.equal(w.events.find(e=>e.audioOptions).audioOptions.volume,3);assert.deepEqual(Buffer.from(w.events.find(e=>e.played).played,'base64'),Buffer.from([1,0,255,127,0,128]));
 assert.ok(w.events.filter(e=>e.preparing!==undefined).every(e=>e.preparing===false));assert.equal(w.events.filter(e=>e.preparing!==undefined).length,2);await w.close();
});
test('OFF opening and farewell playback select raw cache; toggle aborts both preparation jobs',async t=>{
 const data=directory(t),m=new Memory(join(data,'memory.sqlite'));m.set('voiceEffectsEnabled','false');m.set('responseLanguage','en');m.close();
 for(const farewell of [false,true]){const c=new GreetingCache(data,{farewell});c.save('en','cedar',{text:'Processed.',pcm:Buffer.alloc(4800,1)});c.save('en','cedar',{text:farewell?'Bye.':'Ready.',pcm:Buffer.alloc(4800,farewell?3:2)},false)}
 const w=worker(t,data);await w.wait(e=>e.voiceEffectsEnabled===false);w.send({action:'greet'});await w.wait(e=>e.played);
 assert.deepEqual(Buffer.from(w.events.find(e=>e.played).played,'base64'),Buffer.alloc(4800,2));
 w.send({action:'text',text:'bye'});await w.wait(e=>e.assistantText?.includes('Bye.'));assert.ok(w.events.some(e=>e.played===Buffer.alloc(4800,3).toString('base64')));
 w.send({action:'setVoiceEffects',enabled:true});await w.wait(e=>e.voiceEffectsEnabled===true);assert.equal(w.events.filter(e=>e.aborted===false).length,2);await w.close();
});
