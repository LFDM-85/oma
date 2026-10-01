import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const layouts=[
  ['source','qml/Service.qml',''],
  ['packaged','builds/hash/qml/Service.qml','builds/hash'],
  ['legacy source','Service.qml',''],
  ['legacy package','builds/hash/Service.qml','builds/hash'],
];

for(const [name,service,payload] of layouts)test(`CLI resolves runtime in ${name} layout`,t=>{
  const dir=mkdtempSync(join(tmpdir(),'oma cli layout '));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const servicePath=join(dir,service),payloadRoot=join(dir,payload);
  mkdirSync(join(payloadRoot,'runtime'),{recursive:true});
  mkdirSync(join(servicePath,'..'),{recursive:true});
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({entryPoints:{service}}));
  writeFileSync(join(payloadRoot,'runtime/transcript-cli.mjs'),"export async function main(){console.log('usage: oma transcript');}\n");
  const result=spawnSync(process.execPath,['scripts/oma','--help'],{cwd:process.cwd(),env:{...process.env,OMA_PLUGIN_DIR:dir},encoding:'utf8'});
  assert.equal(result.status,0,`${result.stderr} stdout=${result.stdout}`);
  assert.match(result.stdout,/usage: oma transcript/);
});
