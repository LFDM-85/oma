import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,statSync,mkdirSync,symlinkSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const module=await import('../skills/oma/scripts/rename-file.mjs').catch(()=>({}));
function fixture(t){const cwd=mkdtempSync(join(tmpdir(),'oma-rename-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));return cwd;}
test('rename preserves bytes and inode and removes the old name, including Unicode and shell metacharacters',async t=>{
 const cwd=fixture(t),from='元の 文書.txt',to='new $(touch injected).txt';
 const bytes=Buffer.from('\ufeffOriginal!\r\nNext line  ');writeFileSync(join(cwd,from),bytes);const before=statSync(join(cwd,from));
 assert.equal(typeof module.renameFile,'function');
 const result=await module.renameFile({cwd,from,to});
 assert.equal(result.renamed,true);assert.equal(existsSync(join(cwd,from)),false);
 assert.deepEqual(readFileSync(join(cwd,to)),bytes);assert.equal(statSync(join(cwd,to)).ino,before.ino);
 assert.equal(existsSync(join(cwd,'injected')),false);
});
test('rename refuses existing files, directories and dangling links without losing the source',async t=>{
 const cwd=fixture(t);writeFileSync(join(cwd,'source'),'original');writeFileSync(join(cwd,'existing'),'keep');
 mkdirSync(join(cwd,'directory'));symlinkSync('missing',join(cwd,'link'));
 assert.equal(typeof module.renameFile,'function');
 for(const to of ['existing','directory','link']){
  await assert.rejects(()=>module.renameFile({cwd,from:'source',to}));
  assert.equal(readFileSync(join(cwd,'source'),'utf8'),'original');
 }
 assert.equal(readFileSync(join(cwd,'existing'),'utf8'),'keep');assert.equal(lstatSync(join(cwd,'link')).isSymbolicLink(),true);
});
test('missing sources, directory sources and cancelled requests do not create a destination',async t=>{
 const cwd=fixture(t);mkdirSync(join(cwd,'directory'));writeFileSync(join(cwd,'source'),'original');
 assert.equal(typeof module.renameFile,'function');
 for(const from of ['missing','directory'])await assert.rejects(()=>module.renameFile({cwd,from,to:'target'}));
 await assert.rejects(()=>module.renameFile({cwd,from:'source',to:'target',signal:AbortSignal.abort()}));
 assert.equal(existsSync(join(cwd,'target')),false);assert.equal(readFileSync(join(cwd,'source'),'utf8'),'original');
});
