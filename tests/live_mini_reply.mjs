// Opt-in billed integration: synthetic microphone, real Live API and PipeWire drain.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';import {join} from 'node:path';
import {createInterface} from 'node:readline';import assert from 'node:assert/strict';
import {Memory} from '../runtime/memory.mjs';import {Speech} from '../runtime/speech.mjs';import {loadApiKey} from '../runtime/credentials.mjs';
const dir=mkdtempSync(join(tmpdir(),'oma-spoken-bye-'));let child,module;
try{
 const key=await loadApiKey();const phrases=await Promise.all(['ミニモードにして。','猫についてどう思いますか。'].map(async text=>{const chunks=[];await new Speech({key,locale:'ja-JP'}).speak(text,p=>chunks.push(p));return Buffer.concat(chunks)}));
 writeFileSync(join(dir,'input.pcm'),Buffer.concat([Buffer.alloc(48000*5),phrases[0],Buffer.alloc(48000*14),phrases[1],Buffer.alloc(48000*20)]));
 const m=new Memory(join(dir,'memory.sqlite'));m.set('wakeEnabled','false');m.close();
 for(const name of ['greetings','farewells'])cpSync(join(homedir(),'.local/share/oma',name),join(dir,name),{recursive:true});
 const sink='oma_bye_test_'+process.pid;
 module=execFileSync('pactl',['load-module','module-null-sink','sink_name='+sink]).toString().trim();
 writeFileSync(join(dir,'pw-play'),'#!/bin/sh\nexec /usr/bin/pw-play --target '+sink+' "$@"\n',{mode:0o700});
 writeFileSync(join(dir,'pw-record'),`#!/usr/bin/python3
import time,sys
with open(${JSON.stringify(join(dir,'input.pcm'))},'rb') as f:
 while True:
  b=f.read(960)
  if not b: break
  sys.stdout.buffer.write(b);sys.stdout.buffer.flush();time.sleep(.02)
`,{mode:0o700});
 child=spawn(process.execPath,['runtime/main-live.mjs'],{env:{...process.env,PATH:dir+':'+process.env.PATH,OMA_DATA_DIR:dir,LANG:'ja_JP.UTF-8',LC_ALL:'ja_JP.UTF-8'},stdio:['pipe','pipe','pipe']});
 let started=false,user='',dismissed=false,error='';const modes=[];child.stderr.resume();
 const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No answer after mini mode and idle prompt: '+user)),45000);createInterface({input:child.stdout}).on('line',line=>{const p=JSON.parse(line);if(p.error)error=p.error;if(p.userText)user=p.userText;if(p.keyConfigured&&!started){started=true;for(const action of [{action:'presentation',active:true},{action:'opening'},{action:'greet'}])child.stdin.write(JSON.stringify(action)+'\n');}if(p.viewMode)modes.push(p.viewMode);if(p.assistantText&&/猫|ネコ/.test(p.assistantText)){dismissed=true;clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);if(!dismissed)reject(Error('Worker exited: '+error));});});
 await result;assert.ok(modes.includes('mini')); assert.equal(error,'');console.log(JSON.stringify({spokenTranscript:user,modes,error}));
}finally{child?.kill();if(module)execFileSync('pactl',['unload-module',module]);rmSync(dir,{recursive:true,force:true});}
