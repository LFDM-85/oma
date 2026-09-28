import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const module=await import('../skills/oma/scripts/append-text.mjs').catch(()=>({}));
test('append preserves original bytes, line endings and all requested whitespace',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'oma-append-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const path=join(cwd,'note.txt'),original=Buffer.from('\ufeffOne.\r\nTwo!  ','utf8');writeFileSync(path,original);
 assert.equal(typeof module.appendTextFile,'function');
 const result=module.appendTextFile({cwd,path:'note.txt',text:' 次の文\n'});
 assert.deepEqual(readFileSync(path),Buffer.concat([original,Buffer.from(' 次の文\n')]));
 assert.equal(result.bytesAppended,Buffer.byteLength(' 次の文\n'));
 assert.equal(result.previousBytes,original.length);
 assert.equal(result.appended,true);
});
test('append does not silently create a missing file or accept a directory',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'oma-append-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 assert.equal(typeof module.appendTextFile,'function');
 assert.throws(()=>module.appendTextFile({cwd,path:'missing.txt',text:'Text'}));
 assert.equal(existsSync(join(cwd,'missing.txt')),false);
 assert.throws(()=>module.appendTextFile({cwd,path:cwd,text:'Text'}));
 assert.throws(()=>module.appendTextFile({cwd,path:'missing.txt',text:undefined}));
});
