#!/usr/bin/env python3
"""Opt-in real desktop/Live API tests. Never part of the offline test suite."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import subprocess
import time
import unicodedata

def data_directory():
    return Path(os.environ.get('OMA_DATA_DIR',str(Path.home()/'.local/share/oma')))

PLUGIN = 'io.github.komagata.oma'
EDITOR = 'io.github.komagata.omatext'
EXPECTED = {'ja':'こんにちは　今日の天気は雨です。', 'en':'Hello. It is raining today.'}
SCENARIOS = ('document', 'empty', 'modes', 'logs', 'quoted-goodbye', 'interruption', 'idle', 'farewell', 'retained-document', 'empty-with-neighbor')

def expected_document(manifest,language):
    text=manifest.get('expectedDocument',EXPECTED[language])
    if not isinstance(text,str) or not text:raise ValueError('Invalid expected document in fixture manifest')
    return text

def numeric_reply(text,expected):
    # Read complete numeric tokens; "12" or "twenty two" is not the answer 2.
    words='zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million'
    pattern=rf'[+-]?\d+(?:\.\d+)?|[〇零一二三四五六七八九十百千万億兆]+|(?<![\w-])(?:{words})(?:[ -]+(?:{words}))*(?![\w-])'
    tokens=re.findall(pattern,unicodedata.normalize('NFKC',text).lower())
    return bool(tokens) and tokens[-1] in {2:('2','二','two'),4:('4','四','four')}[expected]


class UnsafeOperation(RuntimeError):
    pass

def unsaved_choice_ready(document, length, *, replied, busy):
    if not document.get('opened') or not document.get('modified') or document.get('length') != length:
        raise UnsafeOperation('Unsaved document changed or closed before the user chose what to do')
    return bool(document.get('editor',{}).get('modalOpen') or (replied and not busy))


def matrix_results(providers, languages, cases, repeats):
    if repeats < 1:
        raise ValueError('Repeat count must be positive')
    return [{'provider':provider,'language':language,'case':name,'repeat':repeat,'passed':None,'status':'not_run'}
            for provider in providers for language in languages for repeat in range(repeats) for name in cases]


def run(*args):
    return subprocess.check_output(args, timeout=20).decode()


def json_run(*args):
    return json.loads(run(*args))


def ipc(*args):
    return run('omarchy-shell', PLUGIN, *args)


def clients():
    return json_run('hyprctl', '-j', 'clients')


def own(window):
    return window['title'] in ('O.M.A.', 'O.M.A. Mini')


def assert_side_by_side(app, oma, monitor):
    width, height = monitor['width'], monitor['height']
    if monitor.get('transform', 0) % 2:
        width, height = height, width
    right = monitor['x'] + round(width / monitor['scale'])
    bottom = monitor['y'] + round(height / monitor['scale'])
    assert app['workspace']['id'] == oma['workspace']['id'], 'Windows on different workspaces'
    assert not oma['floating'] and not app['floating'], 'Unexpected floating window'
    assert app['at'][0] + app['size'][0] <= oma['at'][0], 'Overlapping windows'
    assert oma['at'][0] >= monitor['x'] and oma['at'][0] + oma['size'][0] <= right, 'Off-screen horizontally'
    assert oma['at'][1] >= monitor['y'] and oma['at'][1] + oma['size'][1] <= bottom, 'Off-screen vertically'


class VoiceDesktop:
    def __init__(self, fixtures, artifacts, workspace, provider, language):
        self.fixtures, self.artifacts, self.workspace = fixtures, artifacts, workspace
        self.provider, self.language = provider, language
        self.manifest = json.loads((fixtures / 'manifest.json').read_text())
        self.module = None
        self.source_module = None
        self.neighbor = None
        self.fixture_url=None
        self.steps = []
        self.utterances=[]
        self.events = []
        self.started = time.monotonic()
        self.started_wall=time.time()
        self.db = sqlite3.connect(f'file:{data_directory()}/memory.sqlite?mode=ro', uri=True)
        self.session = None

    def state(self):
        return json.loads(ipc('status'))

    def busy(self):
        s=self.state()
        return s['taskBusy'] or s['state'] in ('working','thinking','transcribing')

    def document(self):
        value = run('omarchy-shell', 'shell', 'call', EDITOR, 'inspectState', '').strip()
        return json.loads(value) if value.startswith('{') else {}

    def transcript(self, role):
        if self.session is None:
            return ''
        rows = self.db.execute('SELECT body FROM transcript_entries WHERE session=? AND role=? ORDER BY id', (self.session, role))
        return '\n'.join(row[0] for row in rows)

    def guard(self):
        active = json_run('hyprctl', '-j', 'activeworkspace')['id']
        if active != self.workspace:
            raise RuntimeError('Workspace focus changed; stopping desktop input to protect your work')
        if not getattr(self,'before',set()) <= {w['address'] for w in clients()}:
            raise UnsafeOperation('An unrelated window disappeared; stopping the evaluation')
        state=self.state()
        self.observe_state(state)
        assert not state['error'], state['error']

    def observe_state(self, state):
        event = {'taskBusy':state['taskBusy'],'backendStatus':state['backendStatus'],
                 'taskStatus':state.get('taskStatus',''),'pipelineState':state.get('state'),
                 'audioLevel':round(state.get('level',0),2),'inputLevel':round(state.get('inputLevel',0),2),
                 'listeningReady':state.get('listeningReady'),'microphoneBusy':state.get('microphoneBusy')}
        if not self.events or self.events[-1]['state'] != event:
            self.events.append({'seconds': round(time.monotonic()-self.started, 2), 'state': event})

    def wait(self, label, predicate, timeout=60, allow_closed=False):
        start = time.monotonic()
        while time.monotonic() - start < timeout:
            self.guard()
            state = self.state()
            self.observe_state(state)
            if predicate():
                elapsed = round(time.monotonic()-start, 2)
                self.steps.append({'check': label, 'seconds': elapsed})
                print(f'PASS {label} ({elapsed}s)', flush=True)
                return
            if not allow_closed and not state['panelOpened']:
                if self.session is not None:raise UnsafeOperation('Conversation ended without an end request before: '+label)
                raise AssertionError('Conversation ended before: '+label)
            time.sleep(.25)
        raise AssertionError('Timed out: ' + label)

    def start(self):
        assert not self.state()['panelOpened'], 'Close O.M.A. before running voice tests'
        rows = clients()
        assert not any(w['workspace']['id'] == self.workspace for w in rows), 'Test workspace must be empty'
        assert not any('OmaText' in w['title'] for w in rows), 'Close OmaText before running voice tests'
        assert not self.document().get('modified'), 'Save or discard existing OmaText work before testing'
        self.original = json_run('hyprctl', '-j', 'activeworkspace')['id']
        self.microphone = self.state()['microphoneTarget']
        self.original_mode=self.state()['viewMode']
        ipc('viewMode','normal')
        wait_setting('viewMode','normal')
        self.before = {w['address'] for w in rows}
        if self.case in ('empty','document','retained-document','logs','empty-with-neighbor'):
            run('omarchy','plugin','disable',EDITOR)
            run('omarchy-shell','shell','rescanPlugins')
            time.sleep(1)
            run('omarchy','plugin','enable',EDITOR)
        assert self.state()['voiceProvider']==self.provider and self.state()['responseLanguage']==self.language
        if self.provider=='local':
            assert self.state()['modelProvider']=='oma-local', 'Local test must not use a cloud agent'
            if os.environ.get('OMA_EVALUATION_MODEL'):
                assert self.state()['modelName']==os.environ['OMA_EVALUATION_MODEL'],'The app did not select the requested local model'
        self.sink = 'oma_voice_test_' + str(os.getpid())
        self.module = run('pactl', 'load-module', 'module-null-sink', 'sink_name='+self.sink).strip()
        self.source = self.sink+'_source'
        self.source_module = run('pactl','load-module','module-remap-source','master='+self.sink+'.monitor','source_name='+self.source,'source_properties=priority.session=0').strip()
        ipc('microphone', self.source)
        wait_setting('microphoneTarget', self.source)
        run('hyprctl', 'dispatch', f'hl.dsp.focus({{workspace="{self.workspace}"}})')
        self.monitor = next(m for m in json_run('hyprctl', '-j', 'monitors') if m['focused'])
        if self.case=='empty-with-neighbor':
            self.neighbor = subprocess.Popen(['foot','--app-id=oma-evaluation-neighbor','--title=OMA evaluation neighbor','sleep','3600'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.wait('neighbor fixture visible', lambda: any(w['pid']==self.neighbor.pid for w in clients()), 10, allow_closed=True)
        if self.case=='retained-document':
            fixture=self.artifacts.resolve()/'previous.txt'
            fixture.write_text('Previous test document.\n')
            self.fixture_url=fixture.as_uri()
            run('omatext',str(fixture))
            for _ in range(30):
                if self.document().get('url')==self.fixture_url:
                    break
                time.sleep(.2)
            assert self.document().get('url')==self.fixture_url
            app=self.editor_window()
            run('hyprctl','dispatch',f'hl.dsp.window.close({{window="address:{app["address"]}"}})')
            time.sleep(.5)
            assert not self.document()['opened']
        ipc('open')
        self.wait('microphone ready', lambda: self.state()['listeningReady'], 45)
        self.session = self.db.execute('SELECT max(id) FROM transcript_sessions').fetchone()[0]
        # The selected source persists across local VAD recorder restarts.
        assert self.state()['microphoneTarget']==self.source
        quiet_since=None
        def opening_finished():
            nonlocal quiet_since
            state=self.state()
            quiet=bool(self.transcript('assistant')) and state['state']=='idle' and state['level']<=.04 and state['listeningReady']
            if not quiet:
                quiet_since=None
                return False
            quiet_since=quiet_since or time.monotonic()
            return time.monotonic()-quiet_since>=.75
        self.wait('opening finished',opening_finished,45)

    def say(self, phrase):
        self.guard()
        before = self.transcript('user')
        assistant = self.transcript('assistant')
        audio = self.fixtures / self.manifest['phrases'][phrase]['file']
        self.utterances.append({'id':phrase, **self.manifest['phrases'][phrase]})
        print('VOICE ' + phrase, flush=True)
        # Re-check focus during playback too; stop speech promptly on external focus changes.
        process = subprocess.Popen(['paplay', '--device='+self.sink, str(audio)])
        try:
            deadline = time.monotonic()+40
            while process.poll() is None:
                self.guard()
                if time.monotonic() > deadline:
                    raise TimeoutError('Speech playback timed out')
                time.sleep(.25)
            assert process.returncode == 0, 'Speech playback failed'
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
        self.wait('recognized '+phrase, lambda: self.transcript('user') != before, 10)
        return assistant

    def editor_window(self):
        return next(w for w in clients() if 'OmaText' in w['title'] and w['address'] not in self.before)

    def layout(self):
        app = self.editor_window()
        self.editor_used=True
        oma = next(w for w in clients() if own(w))
        assert app['workspace']['id'] == self.workspace, 'Editor opened outside test workspace'
        assert_side_by_side(app, oma, self.monitor)

    def cancel_editor_dialogs(self):
        # Cleanup only: Cancel never authorizes saving or discarding. Native
        # Save As is a separate modal window, so Escape on its parent is ignored.
        app=self.editor_window()
        for attempt in range(4):
            self.guard()
            if not self.document().get('editor',{}).get('modalOpen'):return
            if attempt==3:raise RuntimeError('Editor dialog did not cancel; preserving the document')
            dialogs=[w for w in clients() if w['workspace']['id']==self.workspace and w['address'] not in self.before and w['address']!=app['address'] and w.get('pid')==app.get('pid') and not own(w)]
            if len(dialogs)>1:raise RuntimeError('Ambiguous editor dialogs; preserving the document')
            target=dialogs[0] if dialogs else app
            run('hyprctl','dispatch',f'hl.dsp.focus({{window="address:{target["address"]}"}})')
            time.sleep(.2)
            run('wtype','-k','Escape');time.sleep(.3)

    def content(self):
        self.guard()
        app = self.editor_window()
        if os.environ.get('OMA_EVALUATION_EDITOR_INSPECTION')=='1':
            snapshot=json.loads(run('omarchy-shell','shell','call',EDITOR,'inspectEvaluationDocument',''))
            if not snapshot.get('opened') or snapshot.get('busy') or not isinstance(snapshot.get('text'),str):
                raise RuntimeError('Document is not available for read-only inspection')
            return snapshot['text']
        types = subprocess.run(['wl-paste','--list-types'],capture_output=True,timeout=10)
        mime = types.stdout.decode().splitlines()[0] if types.returncode==0 and types.stdout.strip() else None
        previous = subprocess.check_output(['wl-paste', '--no-newline', '--type', mime], timeout=10) if mime else None
        try:
            run('hyprctl', 'dispatch', f'hl.dsp.focus({{window="address:{app["address"]}"}})')
            deadline=time.monotonic()+3
            while not self.document().get('active'):
                self.guard()
                if time.monotonic()>deadline:raise TimeoutError('Editor did not activate for content verification')
                time.sleep(.1)
            if self.document().get('editor',{}).get('modalOpen'):
                raise RuntimeError('Cannot read document through an open modal dialog')
            # An unsuccessful copy must not accidentally verify the previous
            # clipboard. Qt needs time to process modifier transitions too.
            run('wl-copy','--clear')
            run('wtype', '-M', 'ctrl', '-s', '100', '-k', 'a', '-s', '100', '-k', 'c', '-s', '100', '-m', 'ctrl')
            time.sleep(.2)
            return run('wl-paste', '--no-newline')
        finally:
            if json_run('hyprctl', '-j', 'activeworkspace')['id'] == self.workspace:
                run('wtype', '-k', 'Right')
            if mime:
                subprocess.run(['wl-copy', '--type', mime], input=previous, check=True, timeout=10)
            else:
                run('wl-copy','--clear')

    def goodbye(self):
        self.say('bye')
        self.wait('farewell dismisses O.M.A.', lambda: not self.state()['panelOpened'] and not any(own(w) for w in clients()), 25, allow_closed=True)

    def close_editor(self, phrase='close', modified=False):
        length=self.document().get('length')
        before=self.say(phrase)
        if modified:
            self.wait('unsaved content retained for a choice', lambda: unsaved_choice_ready(
                self.document(),length,replied=bool(self.transcript('assistant')[len(before):].strip()),busy=self.busy()),35)
            self.say('discard')
        self.wait('editor closed', lambda: not self.document().get('opened') and not self.busy(), 55)
        assert self.state()['panelOpened'] and not self.state()['docked'], 'Conversation must continue floating'
        assert next(w for w in clients() if own(w))['floating']

    def local_diagnostic(self):
        if self.provider!='local':
            return None
        directory=data_directory()/'local/pi/sessions'
        try:
            paths=sorted(directory.glob('*.jsonl'),key=lambda p:p.stat().st_mtime,reverse=True)
            if not paths or paths[0].stat().st_mtime<self.started_wall:
                return None
            for line in reversed(paths[0].read_text().splitlines()):
                try:
                    message=json.loads(line).get('message',{})
                except json.JSONDecodeError:
                    continue
                if message.get('role')=='assistant':
                    return {key:message.get(key) for key in ('stopReason','model','provider','usage','errorMessage')}
        except OSError:
            return None
        return None

    def finish(self):
        report = {'inputs':getattr(self,'utterances',[]), 'localDiagnostic':self.local_diagnostic(), 'provider':self.provider, 'language':self.language, 'model':{k:self.state().get(k) for k in ('modelProvider','modelName')}, 'steps': self.steps, 'events': self.events,
                  'recognized': self.transcript('user'), 'spoken': self.transcript('assistant')}
        (self.artifacts / 'evidence.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        self.db.close()
        if not hasattr(self, 'original'):
            return
        try:
            ipc('restoreFloating')
            ipc('stop')
            doc = self.document()
            owned=[w for w in clients() if w['address'] not in self.before and 'OmaText' in w['title'] and w['workspace']['id']==self.workspace]
            # Archive only this test's new unnamed buffer before resetting the fixture.
            # A named file or a pre-existing document is never discarded by cleanup.
            reset=doc.get('url','') in ('',self.fixture_url) and (owned or getattr(self,'editor_used',False))
            if reset and doc.get('modified') and doc.get('opened'):
                try:
                    if doc.get('editor',{}).get('modalOpen'):
                        self.cancel_editor_dialogs()
                    text=self.content()
                    (self.artifacts/'test-document.txt').write_text(text)
                except Exception as error:
                    reset=False
                    print('Preserving failed document: '+str(error),flush=True)
            if reset:
                run('omarchy','plugin','disable',EDITOR)
                run('omarchy-shell','shell','rescanPlugins')
                time.sleep(1)
                run('omarchy','plugin','enable',EDITOR)
            elif doc.get('opened') and not doc.get('modified') and not doc.get('editor',{}).get('modalOpen'):
                for w in owned:
                    run('hyprctl','dispatch',f'hl.dsp.window.close({{window="address:{w["address"]}"}})')
            elif doc.get('opened'):
                print('Preserved the document for inspection on workspace '+str(self.workspace),flush=True)
        finally:
            try:
                restore_microphone(self.microphone)
            finally:
                try:
                    if self.source_module:
                        run('pactl', 'unload-module', self.source_module)
                finally:
                    if getattr(self,'neighbor',None) is not None:
                        self.neighbor.terminate()
                        self.neighbor.wait(timeout=5)
                    if self.module:
                        run('pactl', 'unload-module', self.module)
                    run('hyprctl', 'dispatch', f'hl.dsp.focus({{workspace="{self.original}"}})')
        ipc('viewMode',self.original_mode)
        assert self.state()['microphoneTarget'] == self.microphone, 'Microphone setting changed'


def scenario(name, h):
    if name in ('document', 'empty', 'retained-document', 'empty-with-neighbor'):
        h.say('write' if name == 'document' else 'new')
        h.wait('document ready', lambda: h.document().get('opened') and h.state()['docked'] and not h.busy() and (h.document().get('length', 0)>0 if name=='document' else True), 90)
        h.layout()
        doc = h.document()
        assert not doc['url'] and not doc['editor']['modalOpen'], doc
        if name=='document':
            actual=h.content()
            expected=expected_document(h.manifest,h.language)
            assert actual == expected, 'Document differs: '+repr(actual)+'; expected '+repr(expected)
        else:
            assert doc['length']==0
        run('grim', str(h.artifacts / 'document.png'))
        h.close_editor(modified=name == 'document')
        if name=='empty-with-neighbor':
            assert h.neighbor.poll() is None and any(w['pid']==h.neighbor.pid for w in clients()), 'Unrelated neighbor was closed'
        h.goodbye()
        if name=='empty-with-neighbor':
            assert h.neighbor.poll() is None, 'Goodbye closed the unrelated neighbor'
    elif name == 'modes':
        h.say('mini')
        h.wait('mini mode', lambda: h.state()['viewMode']=='mini' and any(w['title']=='O.M.A. Mini' for w in clients()))
        before = h.say('question')
        h.wait('reply while mini', lambda: numeric_reply(h.transcript('assistant')[len(before):],2), 30)
        if not h.state()['panelOpened']:raise UnsafeOperation('O.M.A. closed without an end request')
        h.say('normal')
        h.wait('normal mode', lambda: h.state()['viewMode']=='normal' and any(w['title']=='O.M.A.' for w in clients()))
        h.goodbye()
    elif name == 'logs':
        h.say('logs')
        h.wait('log viewer', lambda: h.document().get('opened') and '/transcripts/' in h.document().get('url','') and h.state()['docked'] and not h.busy())
        h.layout()
        h.close_editor('close_logs')
        h.goodbye()
    elif name == 'quoted-goodbye':
        before = h.say('quoted_bye')
        h.wait('translated farewell without ending', lambda: bool(re.search(r'bye|goodbye|sayonara|さようなら|さよなら|またね|バイバイ|じゃあね', h.transcript('assistant')[len(before):], re.I)), 30)
        if not h.state()['panelOpened']:raise UnsafeOperation('Quoted farewell ended conversation')
        followup=h.say('question')
        h.wait('conversation continues after translation', lambda: numeric_reply(h.transcript('assistant')[len(followup):],2),30)
        if not h.state()['panelOpened']:raise UnsafeOperation('O.M.A. closed without an end request')
        h.goodbye()
    elif name == 'interruption':
        counting=h.say('long_reply')
        h.wait('counting before interruption', lambda: h.state()['level']>.04 and re.search(r'(?:1|一|one).*(?:2|二|two)',h.transcript('assistant')[len(counting):],re.I|re.S) is not None, 25)
        before = h.say('interrupt')
        h.wait('answers the interruption', lambda: numeric_reply(h.transcript('assistant')[len(before):],4), 30)
        if not h.state()['panelOpened']:raise UnsafeOperation('O.M.A. closed without an end request')
        h.goodbye()
    elif name == 'farewell':
        h.goodbye()
    elif name == 'idle':
        h.wait('idle prompt and farewell', lambda: not h.state()['panelOpened'], 65, allow_closed=True)
        assert not h.transcript('user').strip(), 'Silence produced user text'
        lines = [x for x in h.transcript('assistant').splitlines() if x.strip()]
        assert len(lines)>=3, 'Expected opening, idle prompt and farewell: '+repr(lines)
    assert not h.state()['panelOpened']



def wait_setting(key, value, timeout=60):
    start=time.monotonic()
    while time.monotonic()-start<timeout:
        state=json.loads(ipc('status'))
        if state.get(key)==value and (key!='voiceProvider' or (state['modelReady'] and state['speechReady'])):
            return
        time.sleep(.25)
    raise AssertionError('Setting did not become ready: '+key+'='+str(value))


def restore_microphone(target):
    # Cleanup only, outside scored operation time. PipeWire may reject a transient
    # echo-cancel module startup; do not silently abandon the original selection.
    for attempt in range(3):
        ipc('microphone',target)
        try:
            wait_setting('microphoneTarget',target)
            return
        except AssertionError:
            if attempt==2:raise
            print('Retrying original microphone restoration after device startup failure',flush=True)
            time.sleep(.5)


def configure(provider, language):
    assert not json.loads(ipc('status'))['panelOpened']
    state=json.loads(ipc('status'))
    if state['voiceProvider']!=provider:
        ipc('voiceProvider',provider)
        wait_setting('voiceProvider',provider)
    if json.loads(ipc('status'))['responseLanguage']!=language:
        ipc('responseLanguage',language)
        wait_setting('responseLanguage',language)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, default=Path('/tmp/oma-voice-fixtures'))
    parser.add_argument('--artifacts', type=Path, default=Path('/tmp/oma-voice-results'))
    parser.add_argument('--workspace', type=int, default=98)
    parser.add_argument('--providers', nargs='+', choices=('gpt-live','local'), default=['gpt-live','local'])
    parser.add_argument('--languages', nargs='+', choices=('ja','en'), default=['ja','en'])
    parser.add_argument('--cases', nargs='+', choices=SCENARIOS, default=list(SCENARIOS))
    parser.add_argument('--keep-going', action='store_true')
    parser.add_argument('--repeat', type=int, default=1)
    args = parser.parse_args()
    args.artifacts=args.artifacts/(time.strftime('%Y%m%d-%H%M%S')+'-'+str(os.getpid()))
    args.artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
    print('ARTIFACTS '+str(args.artifacts.resolve()),flush=True)
    original=json.loads(ipc('status'))
    original_workspace=json_run('hyprctl','-j','activeworkspace')['id']
    assert not original['panelOpened'], 'Close O.M.A. before running tests'
    results = matrix_results(args.providers,args.languages,args.cases,args.repeat)
    try:
        for provider in args.providers:
            for language in args.languages:
                try:
                    configure(provider,language)
                except Exception as error:
                    for result in results:
                        if result['provider']==provider and result['language']==language:
                            result.update(passed=False,status='setup_failed',error=str(error))
                    if not args.keep_going:
                        raise
                    continue
                for result in [r for r in results if r['provider']==provider and r['language']==language]:
                    name=result['case']
                    label=provider+'/'+language+'/'+name+'/'+str(result['repeat'])
                    print('SCENARIO '+label, flush=True)
                    destination=args.artifacts/provider/language/name
                    if args.repeat>1:
                        destination=destination/str(result['repeat'])
                    destination.mkdir(parents=True,exist_ok=True,mode=0o700)
                    h=VoiceDesktop(args.fixtures/language,destination,args.workspace,provider,language)
                    h.case=name
                    start=time.monotonic()
                    failure=None
                    try:
                        h.start()
                        scenario(name,h)
                        h.passed=True
                        result.update(passed=True,status='passed',seconds=round(time.monotonic()-start,2))
                    except Exception as error:
                        failure=error
                        result.update(passed=False,status='failed',error=str(error),critical_error=isinstance(error,UnsafeOperation),seconds=round(time.monotonic()-start,2))
                        print('FAIL '+label+': '+str(error),flush=True)
                    finally:
                        previous_handler=signal.signal(signal.SIGINT,signal.SIG_IGN)
                        try:
                            h.finish()
                        except Exception as error:
                            failure=error
                            result.update(passed=False,status='cleanup_failed',cleanup_error=str(error))
                            print('CLEANUP FAILED '+label+': '+str(error),flush=True)
                        finally:
                            signal.signal(signal.SIGINT,previous_handler)
                    (args.artifacts/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
                    if failure and (result.get('critical_error') or result['status']=='cleanup_failed' or not args.keep_going):
                        raise failure
                    time.sleep(2)
    finally:
        try:
            ipc('stop')
            configure(original['voiceProvider'],original['responseLanguage'])
            ipc('viewMode',original['viewMode'])
            restore_microphone(original['microphoneTarget'])
            # Provider restoration may restart the worker after per-case cleanup.
            run('hyprctl','dispatch',f'hl.dsp.focus({{workspace="{original_workspace}"}})')
            time.sleep(.25)
            assert json_run('hyprctl','-j','activeworkspace')['id']==original_workspace, 'Workspace restoration failed'
        except Exception as error:
            results.append({'case':'restore-settings','passed':False,'status':'cleanup_failed','error':str(error)})
            raise
        finally:
            (args.artifacts/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    if any(result['passed'] is not True for result in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
