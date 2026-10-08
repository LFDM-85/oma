import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readTasks, record, SystemWatch, taskLabel, systemProcesses} from '../runtime/tasks.mjs';

test('hook records fold into a history with status, newest first', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'oma-tasks-')), 'tasks.jsonl');
  record({t: 'start', id: 'c1:2', conv: 'c1', label: 'pacman -Syu', source: 'oma'}, file);
  record({t: 'start', id: 'c1:4', conv: 'c1', label: 'rm -rf ~', source: 'oma', status: 'blocked'}, file);
  assert.equal(readTasks({file})[1].status, 'running');
  record({t: 'end', conv: 'c1', status: 'failed', error: 'exit status 1'}, file);
  const [blocked, update] = readTasks({file});
  assert.deepEqual([blocked.status, update.status, update.error], ['blocked', 'failed', 'exit status 1']);
  assert.equal(taskLabel('sudo -n pacman -S --noconfirm htop'), 'pacman -S --noconfirm htop');
});

test('system processes start after two polls and end when gone', () => {
  const events = [];
  let live = [{id: 'sys-1-9', label: 'yay -Syu', command: 'yay -Syu'}];
  const watch = new SystemWatch({scan: () => live, write: e => events.push(e)});
  watch.poll();
  assert.equal(events.length, 0);
  watch.poll();
  live = [];
  watch.poll();
  assert.deepEqual(events.map(e => [e.t, e.id]), [['start', 'sys-1-9'], ['end', 'sys-1-9']]);
  assert.ok(Array.isArray(systemProcesses()));
});
