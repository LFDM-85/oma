import test from 'node:test';
import assert from 'node:assert/strict';
import {EchoCancel} from '../runtime/echo-cancel.mjs';
test('echo path pairs the chosen microphone with the physical system speaker, without changing defaults',async()=>{
 const calls=[];const echo=new EchoCancel({suffix:'fixture',execute:async(c,a)=>{calls.push([c,a]);return a[0]==='get-default-sink'?'physical-speaker\n':'42\n'}});
 await echo.open('chosen-mic');await echo.open('chosen-mic');
 const args=calls[1][1];assert.ok(args.includes('source_master=chosen-mic'));assert.ok(args.includes('sink_master=physical-speaker'));assert.ok(args.includes('aec_method=webrtc'));assert.ok(args.includes('source_name=oma_mic_fixture'));
 await echo.close();await echo.close();assert.deepEqual(calls.at(-1),['pactl',['unload-module','42']]);assert.equal(calls.length,3);
});
test('echo path refuses a virtual default that could feed audio back into itself',async()=>{
 const echo=new EchoCancel({execute:async()=> 'oma_speaker_stale'});
 await assert.rejects(echo.open(),/physical/);assert.equal(echo.module,null);
});
test('failed module creation is reported instead of enabling unprotected speaker interruption',async()=>{
 const echo=new EchoCancel({execute:async(c,a)=>a[0]==='load-module'?'invalid':'physical'});
 await assert.rejects(echo.open(),/echo cancellation/);assert.equal(echo.module,null);
});
