import test from 'node:test';
import assert from 'node:assert/strict';
import {speechChunks,splitTextIntoChunks} from '../runtime/google-voice.mjs';

test('the first sentence is its own chunk so speech starts sooner',()=>{
 const text='O disco tem 40 GB livres. A partição de arranque está a 60 por cento.';
 assert.deepEqual(speechChunks(text),['O disco tem 40 GB livres.','A partição de arranque está a 60 por cento.']);
 assert.equal(speechChunks(text).join(' '),splitTextIntoChunks(text).join(' '),'No words are dropped');
});
test('a short opener stays with the next sentence',()=>{
 assert.deepEqual(speechChunks('Sim. O serviço está ativo.'),['Sim. O serviço está ativo.']);
});
test('long text keeps every word across chunks',()=>{
 const text=Array.from({length:12},(_,i)=>`Frase número ${i} com algum conteúdo.`).join(' ');
 const chunks=speechChunks(text);
 assert.ok(chunks.every(c=>c.length<=180));
 assert.equal(chunks.join(' '),text);
});
