import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Dobby speech uses the original FFT vocoder, keeps the complete utterance, and supports raw playback',t=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-dobby-voice-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const module=join(dir,'src/omarchy_voice');mkdirSync(module,{recursive:true});writeFileSync(join(module,'__init__.py'),'');
 const piper=join(dir,'piper'),model=join(dir,'fixture.onnx');writeFileSync(model,'fixture, never loaded');
 writeFileSync(piper,`#!/usr/bin/python3
import math,struct,sys,wave
path=sys.argv[sys.argv.index('--output-file')+1]
sys.stdin.read()
with wave.open(path,'wb') as output:
 output.setnchannels(1);output.setsampwidth(2);output.setframerate(24000)
 output.writeframes(b''.join(struct.pack('<h',int(6000*math.sin(2*math.pi*330*i/24000)+1800*math.sin(2*math.pi*1100*i/24000))) for i in range(26400)))
`,{mode:0o755});
 writeFileSync(join(module,'dobby.py'),`def settings():
 return {'tts_binary':${JSON.stringify(piper)},'tts_model':${JSON.stringify(model)},'tts_length_scale':1.0,'tts_sentence_silence':0.0}
class Dobby:
 @staticmethod
 def _speakable(text): return text
class Segmenter: pass
def transcript_from_output(text): return text
`);
 const helper=new URL('../runtime/dobby-voice.py',import.meta.url).pathname;
 const env={...process.env,OMA_DOBBY_ROOT:dir};
 const runWithInput=(args,input,options={})=>{
  const path=join(dir,'input');writeFileSync(path,input);const fd=openSync(path,'r');
  try{return execFileSync('python3',args,{...options,stdio:[fd,'pipe','pipe'],maxBuffer:1024*1024,timeout:20000})}finally{closeSync(fd)}
 };
 const render=mode=>runWithInput([helper,'synthesize',mode],'Fictional speech fixture.',{env});
 const raw=render('raw'),effects=render('effects');
 const original=runWithInput(['-u',new URL('../runtime/streaming-vocoder.py',import.meta.url).pathname],Buffer.concat([raw,Buffer.alloc(24000)])).subarray(0,raw.length);
 assert.equal(raw.length,26400*2);assert.equal(effects.length,raw.length);
 assert.notDeepEqual(effects,raw);assert.deepEqual(effects,original);
});
