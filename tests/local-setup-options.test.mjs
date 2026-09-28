import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('local setup validates model options before installing anything',t=>{
 const home=mkdtempSync(join(tmpdir(),'oma-setup-options-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const bin=join(home,'bin');mkdirSync(bin);
 writeFileSync(join(bin,'mise'),'#!/bin/sh\nexit 93\n',{mode:0o755});
 const data=join(home,'data');
 const run=args=>spawnSync('bash',['scripts/setup-local',...args],{encoding:'utf8',env:{...process.env,PATH:bin+':/usr/bin',OMA_DATA_DIR:data}});
 const help=run(['--help']);assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/--stt/);assert.equal(existsSync(data),false);
 for(const args of [['--stt','unknown'],['--stt'],['--unknown']]){
  const result=run(args);assert.equal(result.status,2);assert.equal(existsSync(data),false);
 }
});
