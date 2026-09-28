import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('a clean checkout preflight explains the missing GPT-Live dependency without starting the worker',t=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),checkout=mkdtempSync(join(tmpdir(),'oma-plugin-checkout-'));t.after(()=>rmSync(checkout,{recursive:true,force:true}));
 for(const dir of ['scripts','runtime','skills'])cpSync(join(root,dir),join(checkout,dir),{recursive:true,filter:p=>!p.endsWith('/oma-pointer')});
 cpSync(join(root,'package.json'),join(checkout,'package.json'));
 const result=JSON.parse(execFileSync('python3',[join(checkout,'scripts/check-setup.py')],{encoding:'utf8'}));
 assert.equal(result.setupRequired,true);assert.match(result.setupMessage,/GPT-Live SDK/);assert.doesNotMatch(result.setupMessage,/Codex/);
});

test('local build includes the executable resources imported from bundled skills',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const selection=readFileSync(join(root,'scripts/install-local'),'utf8').split('\n').find(line=>line.startsWith('files=sorted('));
 const files=JSON.parse(execFileSync('python3',['-c',`import pathlib,json,sys
src=pathlib.Path(sys.argv[1])
${selection}
print(json.dumps([str(p.relative_to(src)) for p in files]))`,root],{encoding:'utf8'}));
 assert.ok(files.includes('skills/oma/scripts/new-document.mjs'));
});
