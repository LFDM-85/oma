import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=`import sys,json
sys.path.insert(0,'runtime')
from wake_match import is_wake
print(json.dumps([is_wake(r) for r in json.load(sys.stdin)]))`;
const result=(text,words)=>({text,result:words.map(([word,conf])=>({word,conf}))});
test('recognizes the observed Japanese call without accepting weak prefixes or unrelated speech',()=>{
 const samples=[
  result('ヘイ 大間',[['ヘイ',1],['大間',.672]]),
  result('ヘイ オー マ',[['ヘイ',.99],['オー',.75],['マ',.76]]),
  result('ヘイ オマ',[['ヘイ',.95],['オマ',.95]]),
  result('ヘイ 大間',[['ヘイ',.60],['大間',1]]),
  result('ヘイ 大間',[['ヘイ',1],['大間',.4]]),
  result('ヘイ 大間',[['ヘイ',.85],['大間',.56]]),
  result('大間',[['大間',1]]),
  result('ヘイ [unk] 大間',[['ヘイ',1],['[unk]',1],['大間',1]]),
  {text:'ヘイ 大間',result:[]},
 ];
 const p=spawnSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.deepEqual(JSON.parse(p.stdout),[true,true,true,false,false,false,false,false,false]);
});
const english=`import sys,json
sys.path.insert(0,'runtime')
from wake_match import EnglishWake
out=[]
for results in json.load(sys.stdin):
    wake=EnglishWake();out.append(any([wake.accept(r) for r in results]))
print(json.dumps(out))`;
const timed=(text,words)=>({text,result:words.map(([word,conf,start,end])=>({word,conf,start,end}))});
test('recognizes the English call, including a pause after the greeting, but not similar names',()=>{
 const samples=[
  [result('hey oma',[['hey',1],['oma',.81]])],
  [result('hey oh mah',[['hey',1],['oh',.89],['mah',.45]])],
  [timed('hey',[['hey',1,.5,.8]]),timed('oma',[['oma',1,1.2,1.6]])],
  [result('hey oma',[['hey',.6],['oma',1]])],
  [result('hey oh ma',[['hey',1],['oh',.5],['ma',.5]])],
  [result('hey emma',[['hey',1],['emma',1]])],
  [result('hey oh ma [unk]',[['hey',1],['oh',.6],['ma',.6],['[unk]',1]])],
  [result('oma',[['oma',1]])],
  [timed('hey',[['hey',1,.5,.8]]),timed('oma',[['oma',1,3,3.4]])],
 ];
 const p=spawnSync('python3',['-c',english],{cwd:new URL('..',import.meta.url),input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.deepEqual(JSON.parse(p.stdout),[true,true,true,false,false,false,false,false,false]);
});
