#!/usr/bin/env node
// PreToolUse hook for the headless Antigravity (Gemini) model behind O.M.A.
// The user chose auto-approval: the model runs and edits what it is asked, as
// the user, without a confirmation. This hook is the only gate. It blocks what
// must never follow from a misheard or injected request (wiping disks or the
// home folder, touching sudo or accounts, piping downloads into a shell,
// reading secrets) and limits sudo to what /etc/sudoers.d/oma allows without
// a password. It stops accidents; it is not a sandbox against an attacker who
// controls the model's input.
import {basename} from 'node:path';
import {record, taskLabel} from './tasks.mjs';

const HOME = '/home/luismelo';
const READ_TOOLS = new Set(['view_file', 'list_dir', 'grep_search', 'find_by_name', 'search_web', 'command_status', 'read_terminal']);
const EDIT_TOOLS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);
// Secrets never go into the model's context (it runs on Google's servers).
const SECRET = /\.ssh\/|\.gnupg|oauth|credential|api[_-]?key|secret|token|password|passwd|shadow|\.env\b|keyring|vaultwarden|\.netrc|cookies/i;
const NEVER = [
  [/\b(mkfs(\.\w+)?|wipefs|fdisk|sfdisk|sgdisk|gdisk|parted|cryptsetup|shred|blkdiscard)\b/, 'Disk and partition tools'],
  [/\bdd\b[^|;&]*\bof=\/dev\//, 'Writing to a raw device'],
  [/>\s*\/dev\/(sd|nvme|vd|mmcblk)/, 'Writing to a raw device'],
  [/sudoers|\bvisudo\b|\b(passwd|chpasswd|usermod|userdel|useradd|groupmod)\b/, 'Changing accounts or sudo configuration'],
  [/:\(\)\s*\{/, 'A fork bomb'],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, 'Piping a download into a shell'],
  [/\b(chmod|chown)\s+(-\S*R|--recursive)\S*\s+(\S+\s+)?(\/|~|\$HOME|\/home)\/?(\s|$)/, 'A recursive permission change on / or home']
];
// A recursive delete of one of these paths is refused; anything inside is fine.
const PRECIOUS = new Set(['/', '/*', '~', '~/*', '$HOME', '$HOME/*', '/home', HOME, HOME + '/*',
  '/etc', '/usr', '/boot', '/var', '/bin', '/lib', '/lib64', '/opt', '/srv', '/root', '.', '..', '*',
  '~/Documents', '~/Documents/Obsidian Vault', '~/Projects', '~/.config', HOME + '/Documents', HOME + '/Projects', HOME + '/.config']);
// Mirrors /etc/sudoers.d/oma: sudo runs only these, non-interactively.
const SUDO_OK = [
  /^pacman -(S|Sy|Syu|Su)( |$)/,
  /^systemctl (restart|start|stop|enable|disable|reload) \S/,
  /^systemctl daemon-reload$/
];

const deny = reason => ({decision: 'deny', reason: reason + ' is blocked for O.M.A. Do not retry. If the user really wants it, end your answer with one line "RUN: <command>"; O.M.A. will ask the user and run it in a terminal.'});
const forbid = reason => ({decision: 'deny', reason: reason + ' is forbidden for O.M.A. Do not retry and do not offer a RUN line; tell the user to do it by hand.'});

// Destructive commands O.M.A. never runs and never offers for approval.
export function forbidden(line) {
  const hit = NEVER.find(([re]) => re.test(line));
  if (hit) return hit[1];
  return line.split(/\|\||&&|[;|&\n]/).some(rmDanger) ? 'A recursive delete of a system or home folder' : '';
}

function rmDanger(seg) {
  const words = seg.trim().split(/\s+/);
  if (basename(words[0] === 'sudo' ? words[1] || '' : words[0] || '') !== 'rm') return false;
  const recursive = words.some(w => /^-[a-zA-Z]*[rR]/.test(w) || w === '--recursive');
  return recursive && words.slice(1).filter(w => !w.startsWith('-')).some(w => PRECIOUS.has(w.replace(/["']/g, '').replace(/(.)\/+$/, '$1')));
}

function sudoOk(seg) {
  const words = seg.trim().split(/\s+/);
  if (words[0] !== 'sudo') return !words.includes('sudo');
  let i = 1;
  while (words[i]?.startsWith('-')) i++;
  const rest = words.slice(i).join(' ').replace(/^\/usr\/bin\//, '');
  return SUDO_OK.some(r => r.test(rest));
}

export function decide(call) {
  const name = call?.toolCall?.name || '';
  const args = call?.toolCall?.args || {};
  if (SECRET.test(JSON.stringify(args))) return deny('Reading or writing secrets and credentials');
  if (READ_TOOLS.has(name)) return {decision: 'allow'};
  if (EDIT_TOOLS.has(name)) {
    const file = String(args.TargetFile || args.AbsolutePath || args.FilePath || '');
    return file.startsWith(HOME + '/') ? {decision: 'allow'} : deny('Editing files outside the home folder');
  }
  if (name !== 'run_command') return deny(`The ${name} tool`);
  const line = String(args.CommandLine || '');
  const never = forbidden(line);
  if (never) return forbid(never);
  const segments = line.split(/\|\||&&|[;|&\n]/);
  if (/\bsudo\b/.test(line)) {
    if (/`|\$\(|\b(sh|bash|zsh|eval|env|tee)\b/.test(line)) return deny('sudo with a nested shell or redirection');
    if (!segments.every(sudoOk)) return deny('sudo outside pacman -S/-Syu and systemctl start/stop/restart/enable/disable');
  }
  return {decision: 'allow'};
}

// As a hook: "pre" (PreToolUse) decides and logs the command as a task,
// "post" (PostToolUse) closes it, so O.M.A. can show it behind the face.
if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  process.stdin.on('data', c => input += c);
  process.stdin.on('end', () => {
    let call = {}, out;
    try { call = JSON.parse(input); } catch {}
    if (process.argv[2] === 'post') {
      out = {};
      try { record({t: 'end', conv: call.conversationId || '', status: call.error ? 'failed' : 'done', error: call.error ? String(call.error).slice(0, 200) : ''}); } catch {}
    } else {
      try { out = decide(call); } catch { out = deny('A tool call the guard could not read'); }
      const command = call?.toolCall?.name === 'run_command' ? String(call.toolCall.args?.CommandLine || '') : '';
      if (command) {
        try {
          record({t: 'start', id: `${call.conversationId || 'agy'}:${call.stepIdx ?? Date.now()}`, conv: call.conversationId || '', label: taskLabel(command), command, source: 'oma',
            status: out.decision === 'allow' ? 'running' : 'blocked', error: out.decision === 'allow' ? '' : String(out.reason).split(' is ')[0]});
        } catch {}
      }
    }
    process.stdout.write(JSON.stringify(out));
  });
}
