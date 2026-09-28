// Opt-in: one billed GPT-Live greeting, then the cached clip through real PipeWire.
import {Audio} from '../runtime/audio.mjs';
import {GreetingCache} from '../runtime/startup-greeting.mjs';
import {StreamingVoiceEffects} from '../runtime/streaming-voice-effects.mjs';
import {LiveSession} from '../runtime/live-session.mjs';
import {liveConfig} from '../runtime/live-config.mjs';
import {greetingInstruction} from '../runtime/locale.mjs';
import {loadApiKey} from '../runtime/credentials.mjs';
import {Memory} from '../runtime/memory.mjs';
import OpenAI from 'openai';import {LiveWS} from 'openai/resources/live/ws';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir,homedir} from 'node:os';
const directory=mkdtempSync(join(tmpdir(),'oma-greeting-bench-')),memory=new Memory(join(directory,'memory.sqlite'));memory.set('responseLanguage','ja');
let first,clock;const audio=new Audio(level=>{if(level>.04&&!first)first=performance.now()-clock},e=>{throw Error(e)},{volume:3,startupBufferMs:250});
const cache=new GreetingCache(join(homedir(),'.local/share/oma')),entry=cache.load('ja-JP','cedar');if(!entry)throw Error('Prepare Japanese Cedar greeting first');
const key=await loadApiKey();let session,interval;
try{
 clock=performance.now();audio.outputBuffer=new StreamingVoiceEffects({deliver:pcm=>audio.enqueue(pcm),onError:e=>{throw e}});
 session=new LiveSession({config:liveConfig(memory),connect:()=>new LiveWS(new OpenAI({apiKey:key}),{reconnect:false}),audio,memory,emit:p=>{if(p.error)console.error(p.error)},execute:async()=>({}),cancelTools(){}});
 await session.start();interval=setInterval(()=>session.appendAudio(Buffer.alloc(960)),20);session.instruct(greetingInstruction('ja-JP'));
 const deadline=Date.now()+15000;while(!first&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));if(!first)throw Error('No live speech');const liveMs=Math.round(first);
 await new Promise(r=>setTimeout(r,3500));clearInterval(interval);await session.close();audio.stop();
 first=0;clock=performance.now();audio.enqueue(entry.pcm);audio.finish();
 await new Promise((resolve,reject)=>{audio.onDrained=resolve;setTimeout(()=>reject(Error('Playback timeout')),5000).unref()});
 console.log(JSON.stringify({liveFirstPlaybackLevelMs:liveMs,cachedFirstPlaybackLevelMs:Math.round(first),cachedSpeechSeconds:entry.pcm.length/48000,note:'Single trial; callback timing, not acoustic loopback'}));
}finally{clearInterval(interval);await session?.close();await audio.close();memory.close();rmSync(directory,{recursive:true,force:true});}
