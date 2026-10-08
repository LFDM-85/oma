#!/usr/bin/env node
// PreToolUse hook for the headless Antigravity (Gemini) model behind O.M.A.
// The user chose auto-approval: the model runs and edits what it is asked, as
// the user, without a confirmation. This hook is the only gate. It blocks what
// must never follow from a misheard or injected request (wiping disks or the
// home folder, touching sudo or accounts, piping downloads into a shell,
// reading secrets) and limits sudo to what /etc/sudoers.d/oma allows without
// a password. It stops accidents; it is not a sandbox against an attacker who
// controls the model's input.
//
// Spoken requests are different: the microphone also hears videos and other
// people, so a spoken turn may only read and inspect. Any change it asks for
// comes back as a RUN: line, which O.M.A. confirms with the user first.
import {realpathSync} from 'node:fs';
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

// Read-only commands a spoken request may run.
const SKILL_SCRIPTS = new Set([
  '/home/luismelo/Projects/proxmox-skill/scripts/proxmox_vm.py',
  '/home/luismelo/Projects/opnsense-skill/skills/opnsense/scripts/opnsense.py'
]);
const PLAIN = new Set(['cat', 'head', 'tail', 'ls', 'grep', 'rg', 'wc', 'sort', 'cut', 'tr', 'jq', 'column',
  'free', 'df', 'du', 'uptime', 'uname', 'date', 'whoami', 'hostname', 'id', 'lsblk', 'findmnt', 'ps', 'pgrep',
  'ss', 'getent', 'dig', 'host', 'sensors', 'lscpu', 'lsusb', 'lspci', 'which', 'file', 'stat', 'upower', 'echo']);
// Omarchy routes that only print; everything else (theme set, toggle, restart,
// bar, install…) goes through RUN: and the user's approval.
const OMARCHY_READ = /^(.* )?--help$|^(commands|commands --json|commands --all|version|channel current|battery status|drive info( \S+)?|reminder show|dev status|debug --no-sudo --print|menu keybindings --print)$|^(theme|font) (current|list|extras)$|^theme bg current$|^hw (display|touchpad|touchscreen)$|^hyprland monitor (focused|laptop)$|^hyprland toggle (enabled|disabled) [\w.-]+$|^audio (output sink|sink availability)$/;

// Commands with a read-only subcommand in the given argument position.
const SUB = {
  hyprctl: /^(clients|activewindow|activeworkspace|workspaces|monitors|devices|binds|layers|version|getoption|configerrors|-j)$/,
  systemctl: /^(status|is-active|is-enabled|is-failed|list-units|list-timers|show|--user)$/,
  coredumpctl: /^(list|info)$/,
  wpctl: /^(status|inspect|get-volume)$/,
  pactl: /^(list|info|get-default-sink|get-default-source)$/,
  resolvectl: /^(status|query)$/,
  ip: /^(-[a-z0-9]+|addr|address|a|link|l|route|r|neigh|n)$/,
  git: /^(-C|status|log|diff|show)$/,
  journalctl: /^-/,
  agentmem: /^(--agent|vault|search|read|map|list)$/,
  jev: /^(risk|choice|score|noul|claim)$/
};

const deny = reason => ({decision: 'deny', reason: reason + ' is blocked for O.M.A. Do not retry. If the user really wants it, end your answer with one line "RUN: <command>"; O.M.A. will ask the user and run it in a terminal.'});
const forbid = reason => ({decision: 'deny', reason: reason + ' is forbidden for O.M.A. Do not retry and do not offer a RUN line; tell the user to do it by hand.'});

// Destructive commands O.M.A. never runs and never offers for approval.
export function forbidden(line) {
  const hit = NEVER.find(([re]) => re.test(line));
  if (hit) return hit[1];
  return line.split(/\|\||&&|[;|&\n]/).some(rmDanger) ? 'A recursive delete of a system or home folder' : '';
}

function readOnlySegment(seg) {
  const words = seg.trim().split(/\s+/);
  const cmd = basename(words[0] || '');
  const args = words.slice(1);
  // sort -o, rg --pre and git --output write files or run programs.
  if (args.some(a => /^(-o|--output|--pre)/.test(a))) return false;
  if (PLAIN.has(cmd)) return true;
  if (cmd === 'ping') return args.includes('-c');
  if (cmd === 'nmcli') return args.every(a => /^(-[a-z]|-t|-f|--terse|--fields|[A-Z,-]+|device|dev|d|connection|con|c|general|g|show|status|wifi|list|--rescan|no)$/.test(a));
  if (cmd === 'omarchy' || cmd.startsWith('omarchy-')) {
    const route = (cmd === 'omarchy' ? args : [...cmd.slice(8).split('-'), ...args]).join(' ');
    return OMARCHY_READ.test(route);
  }
  if (cmd === 'python3' || cmd === 'python') {
    let script;
    try { script = realpathSync(args[0] || ''); } catch { return false; }
    // argparse accepts abbreviations, so "--ap" would mean "--apply".
    return SKILL_SCRIPTS.has(script) && !args.some(a => /^--a/.test(a));
  }
  const rule = SUB[cmd];
  if (!rule) return false;
  // The first positional word decides.
  const first = args.find(a => !a.startsWith('-')) ?? args[0] ?? '';
  if (cmd === 'journalctl') return !args.some(a => /^--(vacuum|rotate|flush|sync|relinquish|setup-keys)/.test(a));
  if (cmd === 'agentmem') return args[0] === '--agent' ? args[2] === 'vault' && rule.test(args[3] || '') : args[0] === 'vault' && rule.test(args[1] || '');
  if (cmd === 'ip') return rule.test(first) && !args.some(a => /^(add|del|delete|change|replace|set|flush)$/.test(a));
  return rule.test(first);
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

export function decide(call, {voice = false} = {}) {
  const name = call?.toolCall?.name || '';
  const args = call?.toolCall?.args || {};
  if (SECRET.test(JSON.stringify(args))) return deny('Reading or writing secrets and credentials');
  if (READ_TOOLS.has(name)) return {decision: 'allow'};
  if (voice && EDIT_TOOLS.has(name)) return deny('Editing files from a spoken request');
  if (EDIT_TOOLS.has(name)) {
    const file = String(args.TargetFile || args.AbsolutePath || args.FilePath || '');
    return file.startsWith(HOME + '/') ? {decision: 'allow'} : deny('Editing files outside the home folder');
  }
  if (name !== 'run_command') return deny(`The ${name} tool`);
  const line = String(args.CommandLine || '');
  const never = forbidden(line);
  if (never) return forbid(never);
  const segments = line.split(/\|\||&&|[;|&\n]/);
  if (voice && (/[;&<>`\n]|\$\(|\|\|/.test(line) || !line.split('|').every(readOnlySegment))) return deny('A change from a spoken request');
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
      try { out = decide(call, {voice: process.argv[3] === 'voice'}); } catch { out = deny('A tool call the guard could not read'); }
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
