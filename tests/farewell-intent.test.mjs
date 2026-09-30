import test from 'node:test';import assert from 'node:assert/strict';
import {FarewellIntent,directFarewell} from '../runtime/farewell-intent.mjs';
test('only whole direct farewells match',()=>{
 for(const text of ['じゃいいや、バイバイ','バイバイ','ありがとうございました、バイバイ','ありがとうばいばーい','Bye!'])assert.ok(directFarewell(text),text);
 for(const text of ['バイバイって英語で何？','「バイバイ」','終了しないで','ブラウザを終了して'])assert.equal(directFarewell(text),false,text);
});
test('recognizer punctuation between thanks and goodbye preserves whole-utterance intent',()=>{
 for(const text of ['Thanks. Bye.','Thanks! Goodbye.','Thanks, bye.','Thanks.\nBye!'])assert.ok(directFarewell(text),text);
 for(const text of ['Thanks. Bye is a word.','Say "Thanks. Bye."','Thanks. Bye. Keep this open.','Thanks. Do not close OMA.'])assert.equal(directFarewell(text),false,text);
});
test('waits for transcript stability, cancels extended phrases and closes once',()=>{
 let calls=0;const f=new FarewellIntent(()=>calls++);
 f.input('こんにちは\nバイバイ',0);f.tick(799);assert.equal(calls,0);
 f.input('こんにちは\nバイバイってどういう意味',800);f.tick(1800);assert.equal(calls,0);
 f.input('こんにちは\nバイバイ',2000);f.tick(2800);f.tick(4000);assert.equal(calls,1);
 f.reset();f.input('バイバイ',5000);f.reset();f.tick(6000);assert.equal(calls,1);
});
test('Japanese thanks with an exclamation still counts as a direct goodbye',()=>{
 for(const text of ['ありがとう! バイバイ','ありがとう！バイバイ','ありがとう!バイバイ。'])assert.ok(directFarewell(text),text);
 assert.equal(directFarewell('ありがとう! バイバイって何？'),false);
});
test('pending holds only while a detected goodbye awaits confirmation',()=>{
 let calls=0;const f=new FarewellIntent(()=>calls++);
 assert.equal(f.pending,false);
 f.input('バイバイ',0);assert.equal(f.pending,true);
 f.input('バイバイってどういう意味',300);assert.equal(f.pending,false);
 f.input('バイバイ',400);f.tick(1200);assert.equal(calls,1);assert.equal(f.pending,false);
});
