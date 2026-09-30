import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';import {StreamingVoiceEffects} from '../runtime/streaming-voice-effects.mjs';
function child(){const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>c.emit('exit',null);return c;}
test('one worker stays alive across packets and stop discards late worker output',()=>{
 const children=[],output=[];const effect=new StreamingVoiceEffects({deliver:b=>output.push(b),onError:e=>{throw e},spawnProcess:()=>{const c=child();children.push(c);return c;}});
 effect.append(Buffer.alloc(960));effect.append(Buffer.alloc(960));assert.equal(children.length,1);
 children[0].stdout.write(Buffer.from([1]));assert.equal(output.length,0);children[0].stdout.write(Buffer.from([0]));assert.equal(output[0].length,2);
 effect.reset();children[0].stdout.write(Buffer.alloc(960));assert.equal(output.length,1);
 effect.append(Buffer.alloc(960));assert.equal(children.length,2);effect.reset();
});

test('disabled effects deliver exact PCM without spawning processing',()=>{
 const output=[];const effect=new StreamingVoiceEffects({enabled:false,deliver:b=>output.push(b),onError:e=>{throw e},spawnProcess:()=>{throw Error('must not spawn')}});
 const pcm=Buffer.from([1,0,255,127,0,128,123,4]);effect.append(pcm);assert.deepEqual(output,[pcm]);
});
test('switching modes invalidates old output and starts fresh processing when re-enabled',()=>{
 const children=[],output=[],errors=[];const effect=new StreamingVoiceEffects({deliver:b=>output.push(b),onError:e=>errors.push(e),spawnProcess:()=>{const c=child();children.push(c);return c;}});
 effect.append(Buffer.alloc(960));effect.setEnabled(false);children[0].stdout.write(Buffer.from([4,0]));children[0].emit('error',Error('late'));assert.equal(output.length,0);assert.equal(errors.length,0);
 const raw=Buffer.from([9,0]);effect.append(raw);assert.deepEqual(output,[raw]);effect.reset();effect.append(raw);assert.deepEqual(output,[raw,raw]);
 effect.setEnabled(true);effect.append(raw);assert.equal(children.length,2);children[0].stdout.write(raw);assert.equal(output.length,2);children[1].stdout.write(raw);assert.equal(output.length,3);effect.reset();
});
