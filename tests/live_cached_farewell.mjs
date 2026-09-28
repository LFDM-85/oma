// Opt-in billed integration: synthetic microphone, real Live API and PipeWire drain.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';import {join} from 'node:path';
import {createInterface} from 'node:readline';import assert from 'node:assert/strict';
import {Memory} from '../runtime/memory.mjs';import {Speech} from '../runtime/speech.mjs';import {loadApiKey} from '../runtime/credentials.mjs';
const dir=mkdtempSync(join(tmpdir(),'oma-spoken-bye-'));let child,module;
try{
 const chunks=[];await new Speech({key:await loadApiKey(),locale:'ja-JP'}).speak('ありがとう、バイバイ。',p=>chunks.push(p));
 writeFileSync(join(dir,'input.pcm'),Buffer.concat([Buffer.alloc(48000*5),...chunks,Buffer.alloc(48000*25)]));
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
 let started=false,user='',dismissed=false,error='';child.stderr.resume();
 const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No spoken farewell dismissal: '+user)),35000);createInterface({input:child.stdout}).on('line',line=>{const p=JSON.parse(line);if(p.error)error=p.error;if(p.userText)user=p.userText;if(p.keyConfigured&&!started){started=true;for(const action of [{action:'presentation',active:true},{action:'opening'},{action:'greet'}])child.stdin.write(JSON.stringify(action)+'\n');}if(p.dismiss){dismissed=true;clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);if(!dismissed)reject(Error('Worker exited: '+error));});});
 await result;assert.match(user,/バイバイ|ばいばい|ばいばーい/);assert.equal(error,'');console.log(JSON.stringify({spokenTranscript:user,dismissed,error}));
}finally{child?.kill();if(module)execFileSync('pactl',['unload-module',module]);rmSync(dir,{recursive:true,force:true});}
