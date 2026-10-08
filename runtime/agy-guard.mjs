#!/usr/bin/env node
// PreToolUse hook for the headless Antigravity (Gemini) model behind O.M.A.
// The model may use the skills to read and inspect; anything that changes the
// machine or the homelab is denied here and must come back as a "RUN:" line,
// which O.M.A. puts behind its approval dialog.
import {realpathSync} from 'node:fs';
import {basename} from 'node:path';

const READ_TOOLS = new Set(['view_file', 'list_dir', 'grep_search', 'find_by_name', 'search_web']);
// Secrets never go into the model's context (it runs on Google's servers).
const SECRET = /\.ssh|\.gnupg|oauth|credential|api[_-]?key|secret|token|password|passwd|shadow|\.env\b|keyring|vaultwarden|\.netrc|cookies/i;
const SKILL_SCRIPTS = new Set([
  '/home/luismelo/Projects/proxmox-skill/scripts/proxmox_vm.py',
  '/home/luismelo/Projects/opnsense-skill/skills/opnsense/scripts/opnsense.py'
]);
const PLAIN = new Set(['cat', 'head', 'tail', 'ls', 'grep', 'rg', 'wc', 'sort', 'cut', 'tr', 'jq', 'column',
  'free', 'df', 'du', 'uptime', 'uname', 'date', 'whoami', 'hostname', 'id', 'lsblk', 'findmnt', 'ps', 'pgrep',
  'ss', 'getent', 'dig', 'host', 'sensors', 'lscpu', 'lsusb', 'lspci', 'which', 'file', 'stat', 'upower', 'echo']);
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

const deny = reason => ({decision: 'deny', reason: reason + ' If the user wants this done, do not retry: explain it and end your answer with one line "RUN: <command>" so O.M.A. asks the user for approval.'});

function segmentOk(seg) {
  const words = seg.trim().split(/\s+/);
  const cmd = basename(words[0] || '');
  const args = words.slice(1);
  // sort -o, rg --pre and git --output write files or run programs.
  if (args.some(a => /^(-o|--output|--pre)/.test(a))) return false;
  if (PLAIN.has(cmd)) return true;
  if (cmd === 'ping') return args.includes('-c');
  if (cmd === 'nmcli') return args.every(a => /^(-[a-z]|-t|-f|--terse|--fields|[A-Z,-]+|device|dev|d|connection|con|c|general|g|show|status|wifi|list|--rescan|no)$/.test(a));
  if (cmd === 'omarchy') return /^(theme current|version|commands)\b/.test(args.join(' ')) || args.includes('--help');
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

export function decide(call) {
  const name = call?.toolCall?.name || '';
  const args = call?.toolCall?.args || {};
  if (SECRET.test(JSON.stringify(args))) return deny('Secrets and credentials are off limits.');
  if (READ_TOOLS.has(name)) return {decision: 'allow'};
  if (name !== 'run_command') return deny(`The ${name} tool is not available to O.M.A.`);
  const line = String(args.CommandLine || '');
  if (/[;&<>`\n]|\$\(|\|\|/.test(line)) return deny('Only single read-only commands (optionally piped) are allowed.');
  if (!line.split('|').every(segmentOk)) return deny('That command is not on the read-only list.');
  return {decision: 'allow'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  process.stdin.on('data', c => input += c);
  process.stdin.on('end', () => {
    let out;
    try { out = decide(JSON.parse(input)); } catch { out = deny('Guard could not read the tool call.'); }
    process.stdout.write(JSON.stringify(out));
  });
}
