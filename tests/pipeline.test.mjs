import test from 'node:test';import assert from 'node:assert/strict';
import {Oma} from '../runtime/oma.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('greeting audio is ready before nonblocking recognition preparation starts',async()=>{
 const f=fixture({locale:'en'});let finish,started=false;
 f.speech.prepareRecognition=()=>{assert.equal(f.played.length>0,true);started=true;return new Promise(r=>finish=r)};
 assert.equal(await f.oma.greet(),true);await tick();assert.equal(started,true);
 assert.deepEqual(f.spoken,['Awaiting your command.']);assert.deepEqual(f.saved,[]);
 finish();await f.oma.close();
});
function fixture(overrides={}){
 const patches=[],saved=[],spoken=[],played=[];
 const audio={pumping:false,played:0,record(fn){this.input=fn},async stopRecording(){},stop(){this.pumping=false},enqueue(b){played.push(b);this.pumping=true},finish(){},async close(){}};
 const agent={busy:false,async start(){},async cancel(){},async close(){},async notice(){return 'Ready.'},async run(text,delta){delta('First. ');delta('Second.');return 'First. Second.'}};
 const speech={async transcribe(){return 'hello'},async speak(text,chunk){spoken.push(text);chunk(Buffer.alloc(4800))}};
 const oma=new Oma({agent,speech,audio,memory:{revision:0,add:(...a)=>saved.push(a),context(){return ''}},emit:p=>patches.push(p),...overrides});
 return {oma,audio,agent,speech,patches,saved,spoken,played};
}
test('speech state follows audible playback, including standalone voice tests',async()=>{
 const f=fixture();assert.equal(typeof f.oma.playbackLevel,'function');
 f.oma.setState('thinking');f.oma.playbackLevel(0,{});assert.equal(f.oma.state,'thinking');
 f.oma.playbackLevel(.3,{lipRound:.2});assert.equal(f.oma.state,'speaking');assert.equal(f.patches.at(-1).level,.3);
 f.audio.pumping=false;f.audio.onDrained();assert.equal(f.oma.state,'idle');
 f.oma.setState('approval');f.oma.playbackLevel(.3,{});assert.equal(f.oma.state,'approval');
 await f.oma.close();
});
test('each new utterance preserves previous captions on separate lines',async()=>{
 const f=fixture();await f.oma.text('first request');f.audio.pumping=false;f.audio.onDrained();
 await f.oma.text('second request');
 assert.equal(f.patches.filter(p=>p.userText!==undefined).at(-1).userText,'first request\nsecond request');
 assert.equal(f.patches.filter(p=>p.assistantText!==undefined).at(-1).assistantText,'First. Second.\nFirst. Second.');
 await f.oma.close();
});
test('one Pi conversation streams ordered sentences to independent speech and stores one answer',async()=>{
 const f=fixture();await f.oma.text('hello');assert.deepEqual(f.spoken,['First.','Second.']);assert.deepEqual(f.saved,[['user','hello']]);
 f.audio.pumping=false;f.audio.onDrained();assert.deepEqual(f.saved.at(-1),['assistant','First. Second.']);assert.equal(f.oma.state,'idle');
});
test('interruption rejects late text/audio and retains microphone pre-roll',async()=>{
 const f=fixture();let heard;f.agent.notePlayback=value=>heard=value;let delta,finish;f.agent.run=async(text,fn)=>{delta=fn;await new Promise(r=>finish=r);};
 const old=f.oma.text('old');await tick();delta('Old reply.');await tick();
 const first=Buffer.alloc(4800,1);await f.oma.press(first);delta('Stale.');finish();await old;
 assert.equal(f.oma.turn.recording,true);assert.equal(f.oma.sentBytes,first.length);assert.equal(f.spoken.includes('Stale.'),false);
 assert.equal(f.oma.state,'listening');assert.equal(heard,'');await f.oma.close();
});
test('late STT response after closing never starts a Pi turn',async()=>{
 const f=fixture();let finish,calls=0;f.speech.transcribe=()=>new Promise(r=>finish=r);f.agent.run=async()=>calls++;
 await f.oma.press(Buffer.alloc(4800));const release=f.oma.release();await tick();f.oma.turn.stop();f.oma.interrupt();finish('stale');await release;assert.equal(calls,0);await f.oma.close();
});
test('farewell waits for audio drain and is canceled by new user input',async()=>{
 const f=fixture();f.agent.run=async(text,delta)=>{f.agent.onDismiss();delta('Bye.');};await f.oma.text('bye');
 assert.equal(f.patches.some(p=>p.dismiss),false);f.audio.pumping=false;f.audio.onDrained();assert.equal(f.patches.filter(p=>p.dismiss).length,1);
 const g=fixture();g.agent.run=async(text,delta)=>{g.agent.onDismiss();delta('Bye.');};await g.oma.text('bye');await g.oma.press();g.audio.onDrained();assert.equal(g.patches.some(p=>p.dismiss),false);await g.oma.close();
});
test('an explicit farewell closes after playback even if the local model omits the tool',async()=>{
 for(const text of ['バイバイ。会話を終了してください。','またね','Goodbye.','Close O.M.A.']){
  const f=fixture();await f.oma.text(text);assert.equal(f.patches.some(p=>p.dismiss),false);
  f.audio.pumping=false;f.audio.onDrained();assert.equal(f.patches.some(p=>p.dismiss),true,text);await f.oma.close();
 }
 for(const text of ['バイバイを英語に訳して','「またね」と言って','会話を終了しないで','Do not close O.M.A.','Close the browser.']){
  const f=fixture();await f.oma.text(text);f.audio.pumping=false;f.audio.onDrained();assert.equal(f.patches.some(p=>p.dismiss),false,text);await f.oma.close();
 }
});
test('a standalone farewell uses a short tool-free notice instead of another full agent turn',async()=>{
 const f=fixture();let notices=0,runs=0;
 f.agent.notice=async instruction=>{notices++;assert.match(instruction,/translated|response language/);return 'Goodbye.';};
 f.agent.run=async()=>{runs++;throw Error('No desktop agent needed for a standalone farewell');};
 await f.oma.text('Thanks, goodbye.');
 assert.equal(notices,1);assert.equal(runs,0);assert.deepEqual(f.spoken,['Goodbye.']);
 assert.equal(f.patches.some(p=>p.dismiss),false);
 f.audio.pumping=false;f.audio.onDrained();assert.equal(f.patches.some(p=>p.dismiss),true);
 assert.deepEqual(f.saved,[['user','Thanks, goodbye.'],['assistant','Goodbye.']]);
 await f.oma.close();
});
test('notices use a tool-free request, never add a user memory, and a pending notice cannot reopen recording',async()=>{
 const f=fixture({locale:'ja'});let noticeFinish;f.agent.notice=()=>new Promise(r=>noticeFinish=r);const greeting=f.oma.greet(true);await tick();f.oma.turn.stop();f.oma.interrupt();noticeFinish('Ready.');await greeting;assert.deepEqual(f.spoken,[]);assert.deepEqual(f.saved,[]);await f.oma.close();
});
test('the fixed English opening goes directly to speech while custom notices still use the model',async()=>{
 for(const locale of ['en','en-US']){
  const f=fixture({locale});let requests=0;f.agent.notice=async()=>{requests++;return 'Custom notice.';};
  await f.oma.greet();assert.deepEqual(f.spoken,['Awaiting your command.']);assert.equal(requests,0);assert.deepEqual(f.saved,[]);
  f.audio.pumping=false;f.audio.onDrained();await f.oma.greet(false,'A custom notice instruction');
  assert.equal(requests,1);assert.equal(f.spoken.at(-1),'Custom notice.');await f.oma.close();
 }
 const f=fixture({locale:'ja'});f.agent.notice=async instruction=>{assert.match(instruction,/Translate/);return 'ご命令をお待ちしています。';};
 await f.oma.greet();assert.deepEqual(f.spoken,['ご命令をお待ちしています。']);await f.oma.close();
});
test('text queued during recorder shutdown cannot replace a newer utterance',async()=>{
 const f=fixture();let finish;let stopped=0;const calls=[];
 f.audio.stopRecording=()=>++stopped===1?new Promise(r=>finish=r):Promise.resolve();
 f.agent.run=async text=>calls.push(text);
 const old=f.oma.text('old');await tick();await f.oma.text('new');finish();await old;
 assert.deepEqual(calls,['new']);await f.oma.close();
});

test('Japanese sentence playback starts before the rest of a streamed reply finishes',async()=>{
 const f=fixture();let finish;
 f.agent.run=async(text,delta)=>{delta('こんにちは。次の文は');await new Promise(r=>finish=r);delta('続きです。');};
 const running=f.oma.text('hello');await tick();assert.deepEqual(f.spoken,['こんにちは。']);finish();await running;await f.oma.close();
});
test('early transcription overlaps silence but never runs the agent before release',async()=>{
 const f=fixture();let calls=0,executed=0;f.speech.transcribe=async()=>{calls++;return 'prepared'};f.agent.run=async()=>{executed++};
 await f.oma.press(Buffer.alloc(4800));f.oma.prepareTranscription();await tick();assert.equal(executed,0);
 await f.oma.release();assert.equal(calls,1);assert.equal(executed,1);await f.oma.close();
});
test('resumed speech discards a stale transcript even when the provider ignores cancellation',async()=>{
 const f=fixture();let finish,calls=0;const executed=[];
 f.speech.transcribe=async()=>++calls===1?new Promise(r=>finish=r):'complete instruction';f.agent.run=async text=>executed.push(text);
 await f.oma.press(Buffer.alloc(4800));f.oma.prepareTranscription();f.oma.cancelTranscription();finish('delete');await tick();
 await f.oma.release();assert.deepEqual(executed,['complete instruction']);await f.oma.close();
});
test('failed speculative transcription falls back once at confirmed end',async()=>{
 const f=fixture();let calls=0;f.speech.transcribe=async()=>{if(++calls===1)throw Error('temporary');return 'retry'};
 await f.oma.press(Buffer.alloc(4800));f.oma.prepareTranscription();await tick();await f.oma.release();assert.equal(calls,2);await f.oma.close();
});

test('empty preview retries the complete recording and previews are bounded',async()=>{
 const f=fixture();let calls=0;f.speech.transcribe=async()=>++calls<=2?'':'complete';
 await f.oma.press(Buffer.alloc(4800));f.oma.prepareTranscription();await tick();f.oma.cancelTranscription();
 f.oma.prepareTranscription();await tick();f.oma.cancelTranscription();f.oma.prepareTranscription();assert.equal(calls,2);
 await f.oma.release();assert.equal(calls,3);await f.oma.close();
 const g=fixture();let attempts=0;g.speech.transcribe=async()=>++attempts===1?'':'complete';
 await g.oma.press(Buffer.alloc(4800));g.oma.prepareTranscription();await tick();await g.oma.release();assert.equal(attempts,2);await g.oma.close();
});
test('a long opening clause can speak before the sentence is complete',async()=>{
 const f=fixture();let finish;const clause='設定画面から音声の接続状態を確認できますが、';
 f.agent.run=async(text,delta)=>{delta(clause+'そのあと');await new Promise(r=>finish=r);delta('続けます。');};
 const running=f.oma.text('hello');await tick();assert.deepEqual(f.spoken,[clause]);finish();await running;await f.oma.close();
});
