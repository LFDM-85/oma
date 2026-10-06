import test from 'node:test';import assert from 'node:assert/strict';
import {LocalTools} from '../runtime/local-tools.mjs';
import {Vault,vaultInstructions,preferencesNote} from '../runtime/vault.mjs';
import {liveConfig} from '../runtime/live-config.mjs';
const recorder=(output='ok')=>{const calls=[];return {calls,run:async(command,args)=>{calls.push([command,...args]);return Buffer.from(output)}};};
test('vault calls are signed as O.M.A. and keep names that look like options as values',async()=>{
 const r=recorder();const vault=new Vault({run:r.run});
 await vault.search('-rf homelab');await vault.read('Homelab/Homelab - Where we left off');await vault.note('Inbox/x','--overwrite');
 assert.deepEqual(r.calls,[
  ['agentmem','--agent','oma','vault','search','--limit','5','--','-rf homelab'],
  ['agentmem','--agent','oma','vault','read','--limit','20000','--','Homelab/Homelab - Where we left off'],
  ['agentmem','--agent','oma','vault','note','--text=--overwrite','--','Inbox/x']]);
 await assert.rejects(()=>vault.search('  '),/required/);await assert.rejects(()=>vault.read('x'.repeat(201)),/too long/);
});
test('writing to the vault waits for approval and writes nothing when declined',async()=>{
 const r=recorder();let approval;
 const t=new LocalTools({memory:{},vault:new Vault({run:r.run}),emit:p=>{if(p.approval)approval=p.approval}});t.begin();
 let result=t.call('vault_note',{note:'Inbox/O.M.A.',text:'Luís prefers Chromium'});await new Promise(setImmediate);
 assert.match(approval.description,/Inbox\/O\.M\.A\..*Chromium/);t.approve(approval.id,false);
 assert.deepEqual(await result,{written:false});assert.equal(r.calls.length,0);
 result=t.call('vault_note',{note:'Inbox/O.M.A.',text:'Luís prefers Chromium'});await new Promise(setImmediate);t.approve(approval.id,true);
 assert.equal((await result).written,true);assert.equal(r.calls.length,1);
});
test('search and read return the vault text',async()=>{
 const t=new LocalTools({memory:{},vault:new Vault({run:recorder('# Note').run}),emit(){}});t.begin();
 assert.deepEqual(await t.call('vault_search',{query:'nvme'}),{text:'# Note'});
 assert.deepEqual(await t.call('vault_read',{note:'Home'}),{text:'# Note'});
});
test('remembered facts are mirrored to the vault, and a vault failure does not lose them',async()=>{
 for(const fails of [false,true]){
  const calls=[];const vault={note:async(...a)=>{calls.push(a.slice(0,2));if(fails)throw Error('no agentmem')}};
  const t=new LocalTools({memory:{remember:(key,value)=>({key,value})},vault,emit(){}});t.begin();
  const result=await t.call('remember',{key:'browser',value:'Chromium'});
  assert.equal(result.saved,true);assert.equal(result.vault,fails?undefined:preferencesNote);
  assert.deepEqual(calls,[[preferencesNote,'browser: Chromium']]);
 }
});
test('the vault map reaches the delegated instructions only when there is one',()=>{
 assert.equal(vaultInstructions(''),'');
 const memory={facts:()=>[],get:()=>null};
 const config=liveConfig(memory,{...process.env,OMA_OMARCHY_SKILL:new URL('../package.json',import.meta.url).pathname},{vault:()=>'- Home — Entry point'});
 assert.match(config.delegation.responses.instructions,/Obsidian vault[^]*- Home — Entry point/);
 assert.ok(config.delegation.responses.tools.some(t=>t.name==='vault_search'));
});
