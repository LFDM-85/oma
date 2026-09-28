import test from 'node:test';import assert from 'node:assert/strict';import {CaptionText,captionText} from '../runtime/caption-text.mjs';
test('complete and incomplete annotations disappear without removing speech',()=>{assert.equal(captionText('[breas]こんにちは［breath］。[tongue click'),'こんにちは。');assert.equal(captionText('hello [outer [inner] tag]world'),'hello world');});
test('split annotation stays hidden until its close, normal words survive',()=>{const c=new CaptionText();assert.equal(c.append('Hello[bre'),'Hello');assert.equal(c.append('as] world'),' world');});
