import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';import {StreamingVoiceEffects} from '../runtime/streaming-voice-effects.mjs';
function child(){const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>c.emit('exit',null);return c;}
test('one worker stays alive across packets and stop discards late worker output',()=>{
 const children=[],output=[];const effect=new StreamingVoiceEffects({deliver:b=>output.push(b),onError:e=>{throw e},spawnProcess:()=>{const c=child();children.push(c);return c;}});
 effect.append(Buffer.alloc(960));effect.append(Buffer.alloc(960));assert.equal(children.length,1);
 children[0].stdout.write(Buffer.from([1]));assert.equal(output.length,0);children[0].stdout.write(Buffer.from([0]));assert.equal(output[0].length,2);
 effect.reset();children[0].stdout.write(Buffer.alloc(960));assert.equal(output.length,1);
 effect.append(Buffer.alloc(960));assert.equal(children.length,2);effect.reset();
});
