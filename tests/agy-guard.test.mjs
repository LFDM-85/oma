import test from 'node:test';
import assert from 'node:assert/strict';
import {decide} from '../runtime/agy-guard.mjs';

const run = CommandLine => decide({toolCall: {name: 'run_command', args: {CommandLine}}}).decision;
const PVE = 'python3 /home/luismelo/Projects/proxmox-skill/scripts/proxmox_vm.py';

test('read-only skill and system commands are allowed', () => {
  for (const c of [`${PVE} inventory`, `${PVE} start --node pve01 --vmid 100`, 'hyprctl -j clients', 'df -h | head -5',
    'agentmem --agent oma vault search -- nvme', 'systemctl --user status oma', 'nmcli -t -f IN-USE,SSID device wifi list', 'omarchy theme current'])
    assert.equal(run(c), 'allow', c);
});

test('writes, chaining and secrets are denied', () => {
  for (const c of [`${PVE} start --node pve01 --vmid 100 --apply`, `${PVE} start --ap`, 'hyprctl dispatch exit', 'rm -rf ~',
    'df; reboot', 'cat $(echo x)', 'ls > /tmp/x', 'sort -o x y', 'systemctl restart sshd', 'agentmem vault note x --text y',
    'cat ~/.gemini/oauth_creds.json', 'nmcli con down x', 'ip link set wlan0 down', 'sudo ls'])
    assert.equal(run(c), 'deny', c);
  assert.equal(decide({toolCall: {name: 'write_to_file', args: {}}}).decision, 'deny');
  assert.equal(decide({toolCall: {name: 'view_file', args: {AbsolutePath: '/home/luismelo/.ssh/id_ed25519'}}}).decision, 'deny');
  assert.equal(decide({toolCall: {name: 'view_file', args: {AbsolutePath: '/home/luismelo/.gemini/config/skills/jev/SKILL.md'}}}).decision, 'allow');
});
