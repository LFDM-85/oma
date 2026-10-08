import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';

const execute = promisify(execFile);
const run = async (command, args) => (await execute(command, args, {timeout: 10000})).stdout;

export class EchoCancel {
  constructor({execute = run, suffix = process.pid + '_' + randomUUID().replaceAll('-', '')} = {}) {
    this.execute = execute;
    this.source = 'oma_mic_' + suffix;
    this.sink = 'oma_speaker_' + suffix;
    this.module = null;
  }

  async findPhysicalSource() {
    try {
      const out = await this.execute('pactl', ['list', 'sources', 'short']);
      const lines = out.trim().split('\n');
      for (const line of lines) {
        const parts = line.split('\t');
        const name = parts[1] || parts[0];
        if (name && !name.startsWith('oma_mic_') && !name.endsWith('.monitor')) {
          return name.trim();
        }
      }
    } catch {}
    return '';
  }

  async findPhysicalSink() {
    try {
      const out = await this.execute('pactl', ['list', 'sinks', 'short']);
      const lines = out.trim().split('\n');
      for (const line of lines) {
        const parts = line.split('\t');
        const name = parts[1] || parts[0];
        if (name && !name.startsWith('oma_speaker_') && !name.endsWith('.monitor')) {
          return name.trim();
        }
      }
    } catch {}
    return '';
  }

  async cleanupStaleModules() {
    try {
      const out = await this.execute('pactl', ['list', 'modules', 'short']);
      const lines = out.trim().split('\n');
      for (const line of lines) {
        if (line.includes('module-echo-cancel') && (line.includes('oma_mic_') || line.includes('oma_speaker_'))) {
          const modId = line.split('\t')[0];
          if (modId && /^\d+$/.test(modId)) {
            await this.execute('pactl', ['unload-module', modId]).catch(() => {});
          }
        }
      }
    } catch {}
  }

  async open(target = '') {
    if (this.module !== null) return;
    
    // Auto-clean stale modules from crashed sessions first
    await this.cleanupStaleModules();

    let sink = '';
    try {
      sink = (await this.execute('pactl', ['get-default-sink'])).trim();
    } catch {}
    if (!sink || sink.startsWith('oma_speaker_')) {
      sink = await this.findPhysicalSink();
    }

    let source = target || '';
    if (!source) {
      try {
        source = (await this.execute('pactl', ['get-default-source'])).trim();
      } catch {}
    }
    if (!source || source.startsWith('oma_mic_')) {
      source = await this.findPhysicalSource();
      if (source) {
        // Reset system default source to this real hardware source
        await this.execute('pactl', ['set-default-source', source]).catch(() => {});
      }
    }

    if (!source || !sink) {
      throw Error('Choose a physical microphone and speaker in system sound settings.');
    }

    try {
      const value = (await this.execute('pactl', [
        'load-module',
        'module-echo-cancel',
        'aec_method=webrtc',
        'source_name=' + this.source,
        'sink_name=' + this.sink,
        'source_master=' + source,
        'sink_master=' + sink,
        'source_properties=priority.session=0',
        'sink_properties=priority.session=0'
      ])).trim();

      if (/^\d+$/.test(value)) {
        this.module = Number(value);
      }
    } catch (e) {
      // If echo cancel module fails to load, don't crash the entire app
      console.warn('Could not load module-echo-cancel:', e.message);
      this.source = source;
      this.sink = sink;
    }
  }

  async close() {
    const id = this.module;
    this.module = null;
    if (id !== null) {
      await this.execute('pactl', ['unload-module', String(id)]).catch(() => {});
    }
  }
}
