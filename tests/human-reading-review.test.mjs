import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh, reference, rate, summary, restore} from './voice/evaluation/human-review-state.mjs';
const d={id:'fixture',cases:[{id:'a',readings:['よみ']}],samples:[{id:'s',case_id:'a',voice:'Voice A',speed:'1.2'}]};
test('pending references and uncertain ratings do not become passes; reference changes stale ratings',()=>{
 const s=fresh(d); rate(s,'s','correct','',d); assert.equal(summary(s,d).eligible,0);
 reference(s,'a','confirmed',['よみ'],d); rate(s,'s','correct','',d); assert.equal(summary(s,d).correct,1);
 reference(s,'a','corrected',['べつ'],d); assert.equal(summary(s,d).stale,1); assert.equal(summary(s,d).correct,0);
 rate(s,'s','unclear','',d); assert.equal(summary(s,d).correct,0); assert.equal(summary(s,d).unclear,1);
});
test('export roundtrip and malformed/wrong dataset rejection',()=>{
 const s=fresh(d); reference(s,'a','corrected',['よみかた'],d); rate(s,'s','misread','heard something else',d);
 assert.deepEqual(restore(JSON.stringify(s),d),s);
 for(const bad of ['{',JSON.stringify({...s,dataset:'other'}),JSON.stringify({...s,ratings:{unknown:{value:'correct'}}}),JSON.stringify({...s,refs:{a:{status:'confirmed',readings:[],revision:0}}})]) assert.throws(()=>restore(bad,d));
});
