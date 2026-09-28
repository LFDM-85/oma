#!/usr/bin/env node
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Memory} from './memory.mjs';
import {voiceProvider} from './voice-provider.mjs';
const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma');
const memory=new Memory(join(data,'memory.sqlite'));
// Quickshell may disappear without closing inherited pipes. Do not leave an
// orphan microphone/API session alive after its owning process exits.
const owner=process.ppid;
const ownerWatch=setInterval(()=>{if(process.ppid!==owner){clearInterval(ownerWatch);setTimeout(()=>process.exit(0),5000).unref();process.kill(process.pid,'SIGTERM');}},1000);
ownerWatch.unref();
const selected=process.env.OMA_VOICE_PROVIDER||voiceProvider(memory);memory.close();
process.stdout.write(JSON.stringify({voiceProvider:selected,providerChanging:false})+'\n');
if(selected==='local'||selected==='pipeline'){
 process.env.OMA_LOCAL_MODE=selected==='local'?'1':'0';
 await import('./main-pipeline.mjs');
}else await import('./main-live.mjs');
