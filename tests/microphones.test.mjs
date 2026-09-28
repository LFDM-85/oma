import test from 'node:test';import assert from 'node:assert/strict';
import {listMicrophones,microphoneNode} from '../runtime/microphones.mjs';
const node=(id,name,description,media='Audio/Source')=>({id,type:'PipeWire:Interface:Node',info:{props:{'node.name':name,'node.description':description,'media.class':media}}});
const run=async(command,args)=>{assert.equal(command,'pw-dump');assert.deepEqual(args,[]);return JSON.stringify([node(12,'camera','Web camera'),node(21,'yamaha','Yamaha AG03MK2'),node(30,'speakers','Speakers','Audio/Sink'),node(41,'capture','Recorder','Stream/Input/Audio')])};
test('microphone list contains stable source names, not output or recording streams',async()=>{
 assert.deepEqual(await listMicrophones(run),[{value:'camera',label:'Web camera',id:'12'},{value:'yamaha',label:'Yamaha AG03MK2',id:'21'}]);
});
test('selected microphone uses its current node id for mute checks and never falls back silently',async()=>{
 assert.equal(await microphoneNode('yamaha',run),'21');
 assert.equal(await microphoneNode('',()=>{throw Error('No lookup needed')}),'@DEFAULT_AUDIO_SOURCE@');
 await assert.rejects(microphoneNode('disconnected',run),/microphone/);
});
