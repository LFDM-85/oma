import test from 'node:test';
import assert from 'node:assert/strict';
import {locateTextLabel} from './voice/evaluation/ocr-labels.mjs';
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const word=(block,index,x,text,confidence=95)=>`5\t1\t${block}\t1\t1\t${index}\t${x}\t100\t${text.length*8}\t16\t${confidence}\t${text}`;
test('locates the whole label and does not confuse Save with Don’t Save',()=>{
 const tsv=[header,word(1,1,100,'Cancel'),word(2,1,220,'Don’t'),word(2,2,264,'Save'),word(3,1,380,'Save')].join('\n');
 assert.deepEqual(locateTextLabel(tsv,"Don't Save",500,250),{x:516,y:432});
 assert.deepEqual(locateTextLabel(tsv,'Save',500,250),{x:792,y:432});
 assert.equal(locateTextLabel(tsv,'Save everything',500,250),null);
});
test('refuses duplicate, low-confidence, out-of-frame and partial text matches',()=>{
 assert.equal(locateTextLabel([header,word(1,1,50,'Cancel'),word(2,1,200,'Cancel')].join('\n'),'Cancel',500,250),null);
 assert.equal(locateTextLabel([header,word(1,1,50,'Cancel',40)].join('\n'),'Cancel',500,250),null);
 assert.equal(locateTextLabel([header,word(1,1,490,'Cancel')].join('\n'),'Cancel',500,250),null);
 assert.equal(locateTextLabel([header,word(1,1,50,'Save'),word(1,2,87,'changes')].join('\n'),'Save',500,250),null);
 assert.equal(locateTextLabel('not TSV','Save',500,250),null);
});
