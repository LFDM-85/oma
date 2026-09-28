// Opt-in: real model and speech APIs, fictional data in a disposable workspace.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadApiKey} from '../runtime/credentials.mjs';import {Memory} from '../runtime/memory.mjs';import {PiAgent} from '../runtime/pi.mjs';import {Speech} from '../runtime/speech.mjs';import {Oma} from '../runtime/oma.mjs';
const key=await loadApiKey();if(!key)throw Error('No configured speech API key.');
const dir=mkdtempSync(join(tmpdir(),'oma-pi-live-'));const memory=new Memory(join(dir,'memory.sqlite'));
const options={home:join(dir,'pi'),cwd:dir,memory,locale:'ja-JP',emit(p){if(p.error)throw Error(p.error)}};
let agent=new PiAgent(options);const speech=new Speech({key,locale:'ja-JP',env:{}});let firstAudio;const pcm=[],events=[];
const audio={played:0,pumping:false,stop(){},async stopRecording(){},async close(){},record(fn){this.input=fn},enqueue(b){firstAudio??=performance.now();pcm.push(b)},finish(){}};
let oma=new Oma({agent,speech,memory,audio,emit:p=>events.push(p),locale:'ja-JP'});
try{
 const started=performance.now();await oma.text('日本語で「準備できました」とだけ答えてください。');
 assert.ok(pcm.length);assert.ok(!events.some(e=>e.error),JSON.stringify(events.filter(e=>e.error)));
 console.log('Pi -> speech first audio ms:',Math.round(firstAudio-started));
 const recognized=await speech.transcribe(Buffer.concat(pcm));assert.match(recognized,/準備/);console.log('Japanese speech round trip: PASS');
 await agent.run('このテスト専用の好みをrememberで保存してください。keyはtest-color、valueはfictional emerald greenです。');assert.ok(memory.facts().some(f=>f.value.includes('emerald')));
 await agent.run('現在の作業ディレクトリにoma-test.txtを作成して、内容をOMA_PI_OKだけにしてください。作成したファイルを読み返して確認してください。');assert.equal(readFileSync(join(dir,'oma-test.txt'),'utf8').trim(),'OMA_PI_OK');console.log('Pi real file action: PASS');
 await agent.close();agent=new PiAgent(options);const recall=await agent.run('保存したテスト専用の好きな色を英語で答えてください。');assert.match(recall,/emerald/i);console.log('Pi restart + durable recall: PASS');
 await agent.run('forgetツールを使ってemeraldを含むテストの記憶を忘れてください。');assert.equal(memory.search('emerald').length,0);console.log('Pi forget + session reset: PASS');
 console.log('LIVE PASS');
}finally{await agent.close();await oma.close();memory.close();rmSync(dir,{recursive:true,force:true});}
