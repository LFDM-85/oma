#!/usr/bin/env node
// Quickshell may disappear without closing inherited pipes. Do not leave an
// orphan microphone/API session alive after its owning process exits.
const owner=process.ppid;
const ownerWatch=setInterval(()=>{if(process.ppid!==owner){clearInterval(ownerWatch);setTimeout(()=>process.exit(0),5000).unref();process.kill(process.pid,'SIGTERM');}},1000);
ownerWatch.unref();
// User-selected local bridge keeps the upstream GPT-Live worker intact.
const {readFileSync}=await import('node:fs');
const {homedir}=await import('node:os');
const {join}=await import('node:path');
let backend=process.env.OMA_BACKEND||'';
if(!backend){try{backend=JSON.parse(readFileSync(join(homedir(),'.config/oma/backend.json'),'utf8')).backend}catch{}}
await import(backend==='dobby'?'./main-dobby.mjs':'./main-live.mjs');
