import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Memory} from '../runtime/memory.mjs';
const mod=await import('../runtime/transcript.mjs').catch(()=>({}));
test('session captions include partial speech, corrections and cached greeting without duplicate prefixes',()=>{
 assert.equal(typeof mod.TranscriptLog,'function');const m=new Memory(join(mkdtempSync(join(tmpdir(),'oma-transcript-')),'memory.sqlite'));const log=new mod.TranscriptLog(m.db);log.begin();log.update({assistantText:'Ready.'});log.update({userText:'Hello'});log.update({userText:'Hello there'});log.update({assistantText:'Ready.\nHello!'});const text=mod.renderTranscript(log.read());assert.equal((text.match(/Ready\./g)||[]).length,1);assert.match(text,/Hello there/);assert.match(text,/Hello!/);log.end();log.begin();log.update({userText:'Next session'});assert.equal(log.read().length,1);assert.equal(log.read(true).length,4);m.close();
});
test('annotations are not exported and forgetting removes matching transcript records',()=>{
 assert.equal(typeof mod.TranscriptLog,'function');const m=new Memory(join(mkdtempSync(join(tmpdir(),'oma-transcript-')),'memory.sqlite'));const log=new mod.TranscriptLog(m.db);log.begin();log.update({userText:'[lip smack] private word'});assert.doesNotMatch(mod.renderTranscript(log.read()),/lip smack/);m.forget('private word');assert.equal(log.read().length,0);m.close();
});
test('reopening excludes old local captions while retaining the new utterance',()=>{
 const m=new Memory(join(mkdtempSync(join(tmpdir(),'oma-transcript-')),'memory.sqlite'));const log=new mod.TranscriptLog(m.db);log.begin({userText:'Previous question'});log.update({userText:'Previous question'});assert.equal(log.read().length,0);log.update({userText:'Previous question\nNew question'});assert.equal(log.read()[0].body,'New question');m.close();
});
