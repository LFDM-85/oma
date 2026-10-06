import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stopChild} from '../runtime/stop-child.mjs';

test('continuous capture emits a new onset while recognition is running and preserves both utterances',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-listen-')),module=join(dir,'src/omarchy_voice');mkdirSync(module,{recursive:true});
 writeFileSync(join(module,'__init__.py'),'');
 writeFileSync(join(module,'dobby.py'),`def settings(): return {'whisper_model':'fixture','language':'auto'}
class Dobby: pass
def transcript_from_output(text): return text.strip()
class Segmenter:
 def __init__(self,cfg): self.frames=[];self.voiced=0;self.quiet=0
 def feed(self,frame):
  speech=any(frame);self.voiced+=int(speech)
  if speech or self.frames: self.frames.append(frame)
  self.quiet=0 if speech else self.quiet+1
  if self.frames and self.quiet>=2:
   pcm=b''.join(self.frames);self.frames=[];self.voiced=0;self.quiet=0;return pcm,0
  return None,.1 if speech else 0
`);
 writeFileSync(join(dir,'pw-record'),`#!/usr/bin/python3
import sys,time,struct
for value in [1000]*3+[0]*2+[2000]*3+[0]*2:
 sys.stdout.buffer.write(struct.pack('<h',value)*1600);sys.stdout.buffer.flush();time.sleep(.02)
time.sleep(10)
`,{mode:0o755});
 writeFileSync(join(dir,'voxtype'),`#!/usr/bin/python3
import sys,time,wave,struct,json
open(__file__+'.args','w').write(json.dumps(sys.argv))
with wave.open(sys.argv[-1],'rb') as wav: sample=struct.unpack('<h',wav.readframes(1))[0]
time.sleep(.35)
print('First phrase' if sample==1000 else 'Second phrase')
`,{mode:0o755});
 const child=spawn('python3',[new URL('../runtime/dobby-voice.py',import.meta.url).pathname,'listen','fixture-mic','','continuous'],{env:{...process.env,OMA_DOBBY_ROOT:dir,PATH:dir+':'+process.env.PATH},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{await stopChild(child);rmSync(dir,{recursive:true,force:true})});
 const events=[];let errors='';child.stderr.on('data',b=>errors+=b);
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Recognition timed out: '+errors)),5000);
  createInterface({input:child.stdout}).on('line',line=>{
   const event=JSON.parse(line);events.push(event);
   if(event.error||event.transcriptionError){clearTimeout(timeout);reject(Error(JSON.stringify(event)))}
   if(events.filter(e=>e.transcript).length===2){clearTimeout(timeout);resolve()}
  });child.on('error',reject);
 });
 const starts=events.filter(e=>e.speechStarted),transcripts=events.filter(e=>e.transcript);
 assert.deepEqual(starts.map(e=>e.utteranceId),[1,2]);assert.deepEqual(transcripts.map(e=>[e.utteranceId,e.transcript]),[[1,'First phrase'],[2,'Second phrase']]);
 assert.ok(events.indexOf(starts[1])<events.indexOf(transcripts[0]),'Capture must continue while the first utterance is being recognized');
 assert.equal(events.filter(e=>e.listeningReady===false).length,0);
 assert.equal(JSON.parse(readFileSync(join(dir,'voxtype.args'),'utf8')).includes('--language'),false);
});
