import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWriteTool} from '@earendil-works/pi-coding-agent';
const load=()=>import('../runtime/literal-tool.mjs');
test('structured tool arguments preserve whitespace through a real file write',async t=>{
 const {literalTool}=await load();const home=mkdtempSync(join(tmpdir(),'oma-literal-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const tool=literalTool(createWriteTool(home));const content='\n  雨です。\nKeep trailing spaces.  \n';
 await tool.execute('literal',{input:{path:'note.txt',content}},new AbortController().signal);
 assert.equal(readFileSync(join(home,'note.txt'),'utf8'),content);
 assert.equal(tool.parameters.properties.input.properties.content.type,'string');
 assert.deepEqual(tool.parameters.required,['input']);
});
test('missing structured input is rejected before any operation',async()=>{
 const {literalTool}=await load();let calls=0;const tool=literalTool({name:'fixture',parameters:{type:'object'},execute:()=>calls++});
 await assert.rejects(()=>tool.execute('bad',{text:'guess'},new AbortController().signal),/input/i);
 assert.equal(calls,0);
});
