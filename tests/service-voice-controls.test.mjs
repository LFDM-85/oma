import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('an external agent can synchronize the same computer-use visibility state',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const body=qml.match(/function computerUse\(active: bool\): void \{([^}]+)\}/)?.[1];
 assert.ok(body,'Missing computer-use visibility bridge');
 const root={computerUsing:false};
 vm.runInNewContext(body,{root,active:true});assert.equal(root.computerUsing,true);
 vm.runInNewContext(body,{root,active:false});assert.equal(root.computerUsing,false);
});
test('sending to an open assistant does not re-summon it and steal editor focus',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const body=qml.match(/function send\(text: string\): void \{ (.*) \}/)[1];
 for(const panelOpened of [true,false]){
  const calls=[];const root={panelOpened,show(){calls.push('show')},command(value){calls.push(value.text)}};
  vm.runInNewContext(body,{root,text:'hello'});
  assert.deepEqual(calls,panelOpened?['hello']:['show','hello']);
 }
});
test('voice test controls use the same setters as Settings',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 for(const [method,setter,value] of [['responseLanguage','setResponseLanguage','en'],['microphone','setMicrophone','test-source']]){
  const body=qml.match(new RegExp('function '+method+'\\(value: string\\): void \\{([^}]+)\\}'))?.[1];
  assert.ok(body,'Missing '+method);let received;
  vm.runInNewContext(body,{value,root:{[setter](v){received=v}}});assert.equal(received,value);
 }
});

test('voice effects setter and IPC use backend authority rather than local toggle state',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const setter=qml.match(/function setVoiceEffects\(enabled\) \{ ([^\n]+) \}/)?.[1];assert.ok(setter);const sent=[];vm.runInNewContext(setter,{enabled:false,command:c=>sent.push(JSON.stringify(c))});assert.equal(sent[0],JSON.stringify({action:'setVoiceEffects',enabled:false}));
 const ipc=qml.match(/function voiceEffects\(enabled: bool\): void \{([^}]+)\}/)?.[1];assert.ok(ipc);let value;vm.runInNewContext(ipc,{enabled:true,root:{setVoiceEffects(v){value=v}}});assert.equal(value,true);
 assert.match(qml,/property bool voiceEffectsEnabled: true/);assert.match(qml,/"wakeEnabled", "voiceEffectsEnabled", "wakeStatus"/);assert.match(qml,/voiceEffectsEnabled: root.voiceEffectsEnabled/);
});
