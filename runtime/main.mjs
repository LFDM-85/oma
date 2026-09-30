#!/usr/bin/env node
// Quickshell may disappear without closing inherited pipes. Do not leave an
// orphan microphone/API session alive after its owning process exits.
const owner=process.ppid;
const ownerWatch=setInterval(()=>{if(process.ppid!==owner){clearInterval(ownerWatch);setTimeout(()=>process.exit(0),5000).unref();process.kill(process.pid,'SIGTERM');}},1000);
ownerWatch.unref();
// Legacy provider preferences and environment variables are intentionally ignored.
await import('./main-live.mjs');
