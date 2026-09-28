import test from 'node:test';
import assert from 'node:assert/strict';
import {localSamplingOptions} from '../runtime/local-sampling.mjs';
test('explicit local sampling preserves zero penalties and rejects unrelated request overrides',()=>{
 assert.deepEqual(localSamplingOptions(),{temperature:.2});
 assert.deepEqual(localSamplingOptions({temperature:.6,top_p:.95,presence_penalty:0}),{temperature:.6,samplingParams:{top_p:.95,presence_penalty:0}});
 for(const value of [{temperature:-1},{top_p:2},{presence_penalty:3},{model:'different'},null,[],{temperature:'0.6'}])assert.throws(()=>localSamplingOptions(value));
});
