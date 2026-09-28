import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const module=await import('../runtime/local-speech.mjs').catch(()=>({}));
function fixture(){
 const children=[];
 const spawnProcess=()=>{const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;child.emit('exit',null)};children.push(child);return child;};
 return {children,spawnProcess};
}
test('recognition preparation is shared, language-aware and renewed after worker shutdown',async()=>{
 const f=fixture(),speech=new module.LocalSpeech({data:'/tmp/fixture',locale:'ja',spawnProcess:f.spawnProcess});
 const first=speech.prepareRecognition(),second=speech.prepareRecognition();assert.equal(first,second);
 let child=f.children[0],request=JSON.parse(child.stdin.read().toString());
 assert.equal(request.action,'prepare_recognition');assert.equal(request.language,'ja');assert.equal(request.pcm,undefined);
 child.stdout.write(JSON.stringify({id:request.id,done:true})+'\n');await first;
 await speech.prepareRecognition();assert.equal(child.stdin.read(),null);
 speech.locale='en';const english=speech.prepareRecognition();request=JSON.parse(child.stdin.read().toString());
 assert.equal(request.language,'en');child.stdout.write(JSON.stringify({id:request.id,done:true})+'\n');await english;
 speech.close();const renewed=speech.prepareRecognition();child=f.children[1];request=JSON.parse(child.stdin.read().toString());
 child.stdout.write(JSON.stringify({id:request.id,done:true})+'\n');await renewed;speech.close();
});
test('local speech reuses its worker and routes transcription and streamed PCM by request',async()=>{
 assert.equal(typeof module.LocalSpeech,'function');
 const {children,spawnProcess}=fixture();const speech=new module.LocalSpeech({data:'/tmp/fixture',locale:'ja-JP',spawnProcess});
 const transcription=speech.transcribe(Buffer.from([0,0]));const child=children[0];
 const request=JSON.parse(child.stdin.read().toString());assert.equal(request.action,'transcribe');assert.equal(request.language,'ja');
 child.stdout.write(JSON.stringify({id:request.id,text:'[lip smack]こんにちは[tongue click]',done:true})+'\n');
 assert.equal(await transcription,'こんにちは');
 const chunks=[];const speaking=speech.speak('応答します',b=>chunks.push(b));
 const next=JSON.parse(child.stdin.read().toString());assert.equal(next.action,'speak');assert.equal(next.text,'応答します');
 child.stdout.write(JSON.stringify({id:next.id,pcm:Buffer.from([1,0,2,0]).toString('base64')})+'\n');
 child.stdout.write(JSON.stringify({id:next.id,done:true})+'\n');await speaking;
 assert.deepEqual(Buffer.concat(chunks),Buffer.from([1,0,2,0]));assert.equal(children.length,1);speech.close();
});
test('cancelling local synthesis stops the worker and ignores late audio',async()=>{
 assert.equal(typeof module.LocalSpeech,'function');
 const {children,spawnProcess}=fixture();const speech=new module.LocalSpeech({data:'/tmp/fixture',spawnProcess});
 const controller=new AbortController(),chunks=[];
 const result=speech.speak('test',b=>chunks.push(b),controller.signal);const rejected=assert.rejects(result,/abort/i);
 const child=children[0],request=JSON.parse(child.stdin.read().toString());controller.abort();await rejected;
 child.stdout.write(JSON.stringify({id:request.id,pcm:'AAA='})+'\n');assert.equal(chunks.length,0);assert.equal(child.killed,true);
 speech.close();
});
test('cancelled speculative recognition keeps loaded models and ignores its late transcript',async()=>{
 const {children,spawnProcess}=fixture();const speech=new module.LocalSpeech({data:'/tmp/fixture',locale:'en',spawnProcess});
 const controller=new AbortController();
 const early=speech.transcribe(Buffer.from([1,0]),controller.signal);const rejected=assert.rejects(early,/abort/i);
 const child=children[0],first=JSON.parse(child.stdin.read().toString());controller.abort();await rejected;
 assert.notEqual(child.killed,true,'An ordinary pause/resume must not unload the recognition and synthesis models');
 assert.deepEqual(JSON.parse(child.stdin.read().toString()),{action:'cancel',id:first.id});
 const final=speech.transcribe(Buffer.from([2,0]));const next=JSON.parse(child.stdin.read().toString());
 assert.equal(children.length,1);
 child.stdout.write(JSON.stringify({id:first.id,text:'stale partial',done:true})+'\n');
 child.stdout.write(JSON.stringify({id:next.id,text:'complete utterance',done:true})+'\n');
 assert.equal(await final,'complete utterance');speech.close();assert.equal(child.killed,true);
});
