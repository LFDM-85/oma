// Background work O.M.A. shows behind the face: commands its model runs
// (recorded by the agy hooks in agy-guard.mjs) and package/update processes
// running anywhere on the machine. The history is an append-only JSONL log.
import {appendFileSync, readFileSync, mkdirSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, dirname, basename} from 'node:path';

export const tasksFile = join(homedir(), '.local/state/oma/tasks.jsonl');

export function record(event, file = tasksFile) {
  mkdirSync(dirname(file), {recursive: true});
  appendFileSync(file, JSON.stringify({at: new Date().toISOString(), ...event}) + '\n');
}

export const taskLabel = command => String(command).replace(/^sudo\s+(-\S+\s+)*/, '').replace(/\s+/g, ' ').trim().slice(0, 60);

// Folds the log into tasks, newest first. An "end" without an id closes the
// oldest running task of its agy conversation (tools run one at a time).
export function readTasks({file = tasksFile, limit = 40} = {}) {
  let lines = [];
  try { lines = readFileSync(file, 'utf8').trim().split('\n').slice(-2000); } catch {}
  const tasks = new Map();
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.t === 'start') {
      const closed = e.status && e.status !== 'running';
      tasks.set(e.id, {id: e.id, conv: e.conv || '', label: e.label, command: e.command, source: e.source,
        status: e.status || 'running', startedAt: e.at, endedAt: closed ? e.at : '', error: e.error || ''});
    } else if (e.t === 'end') {
      const task = e.id ? tasks.get(e.id) : [...tasks.values()].find(t => t.conv === e.conv && t.status === 'running');
      if (task && task.status === 'running') Object.assign(task, {status: e.status, endedAt: e.at, error: e.error || ''});
    }
  }
  return [...tasks.values()].reverse().slice(0, limit);
}

const SYSTEM = /^(pacman|yay|paru|makepkg|flatpak|fwupdmgr|mkinitcpio|omarchy-update|omarchy-pkg-[\w-]+|omarchy-update-[\w-]+)$/;
const SHELLS = new Set(['bash', 'sh', 'zsh', 'sudo', 'env']);

function proc(pid) {
  try {
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return {pid, argv, ppid: fields[1], started: fields[19]};
  } catch {
    return null;
  }
}

// Package and update processes, top-most only (yay → sudo → pacman shows yay),
// leaving out those O.M.A.'s own agy runs, which the hooks already record.
export function systemProcesses() {
  const matched = new Map();
  const all = new Map();
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const p = proc(pid);
    if (!p || !p.argv.length) continue;
    all.set(pid, p);
    const words = p.argv.filter(a => !a.startsWith('-'));
    const name = words.map(a => basename(a)).find(a => !SHELLS.has(a)) || '';
    // Periodic checks (omarchy-update-available…) are not work worth showing.
    if (SYSTEM.test(name) && !/-(available|check|status|present|missing|accessible|time|lock)$/.test(name)) matched.set(pid, {...p, name});
  }
  const out = [];
  for (const p of matched.values()) {
    let parent = p.ppid, nested = false;
    for (let i = 0; i < 10 && parent && parent !== '0'; i++) {
      const up = all.get(parent);
      if (!up) break;
      if (matched.has(parent) || up.argv.some(a => /(^|\/)agy$|antigravity/.test(a))) { nested = true; break; }
      parent = up.ppid;
    }
    if (!nested) out.push({id: `sys-${p.pid}-${p.started}`, label: taskLabel(p.argv.join(' ').replace(/^(\S*\/)?(bash|sh) /, '').replace(/\S*\/(?=omarchy-)/, '')), command: p.argv.join(' ')});
  }
  return out;
}

// Turns snapshots of systemProcesses() into start/end records; a process must
// live through two polls so quick queries (pacman -Q) never show up.
export class SystemWatch {
  constructor({scan = systemProcesses, write = record} = {}) {
    Object.assign(this, {scan, write, seen: new Map(), live: new Set()});
  }
  poll() {
    const now = new Map(this.scan().map(p => [p.id, p]));
    let changed = false;
    for (const [id, p] of now) {
      if (!this.live.has(id) && this.seen.has(id)) {
        this.write({t: 'start', id, label: p.label, command: p.command, source: 'system'});
        this.live.add(id);
        changed = true;
      }
    }
    for (const id of this.live) {
      if (!now.has(id)) {
        this.write({t: 'end', id, status: 'ended'});
        this.live.delete(id);
        changed = true;
      }
    }
    this.seen = now;
    return changed;
  }
}
