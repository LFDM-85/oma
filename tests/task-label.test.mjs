import test from 'node:test';import assert from 'node:assert/strict';import {taskLabel} from '../runtime/task-label.mjs';
test('known commands explain their actual purpose',()=>{assert.equal(taskLabel('run_command',{command:'/home/user/.local/bin/oma',args:['transcript','--today']}),'/home/user/.local/bin/oma transcript --today');assert.equal(taskLabel('run_command',{command:'hyprctl',args:['-j','clients']}),'hyprctl -j clients');});
test('shows executable and arguments, quoting spaces and masking credentials',()=>{
 assert.equal(taskLabel('run_command',{command:'oma',args:['transcript','--today'],description:'Opening history'}),'oma transcript --today');
 const value=taskLabel('run_command',{command:'curl',args:['--token','secret-value','-H','Authorization: Bearer abcdefghi','https://example.com']});
 assert.ok(value.includes('curl --token'));assert.ok(value.includes('[redacted]'));assert.ok(!value.includes('secret-value'));assert.ok(!value.includes('abcdefghi'));
 assert.equal(taskLabel('run_command',{command:'cat',args:['/tmp/a b.txt']}),"cat '/tmp/a b.txt'");
});
