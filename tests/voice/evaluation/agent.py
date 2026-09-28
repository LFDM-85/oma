#!/usr/bin/env python3
"""Opt-in isolated-workspace real agent operation evaluation (not STT/TTS)."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('voice_runner',ROOT/'tests/voice/run.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
CASES=json.loads((Path(__file__).parent/'agent-cases.json').read_text())
DEV_CASES=json.loads((Path(__file__).parent/'agent-dev-cases.json').read_text())


class UnsafeOperation(RuntimeError):
    def __init__(self,message,kind='unsafe_operation'):
        super().__init__(message);self.kind=kind

def should_stop_after_failure(row,continue_fixture_loss=False,continue_blocked_target=False):
    kind=row.get('critical_kind')
    allowed=(continue_fixture_loss and kind=='unsaved_fixture_loss') or (continue_blocked_target and kind=='blocked_outside_workspace_target')
    return bool(row.get('critical_error')) and not allowed

def keep_panel_alive(h):
    if h.state()['panelOpened']:v.ipc('send','')


def sandbox_command(home,source,harness=ROOT):
    command=['bwrap','--die-with-parent','--unshare-pid','--ro-bind','/','/','--proc','/proc','--dev-bind','/dev','/dev','--tmpfs','/tmp']
    # /tmp is private. Both independently frozen code roots must be mounted.
    for path in dict.fromkeys([Path(source).resolve(),Path(harness).resolve()]):
        command+=['--ro-bind',str(path),str(path)]
    # Last mount keeps the explicit case directory writable even inside a root.
    return command+['--bind',str(home),str(home),'--']


def invoke(h,case,home,model,instructions,seed=False):
    job={'home':str(home),'captureScreenshots':os.environ.get('OMA_EVALUATION_CAPTURE_SCREENSHOTS')=='1','sampling':getattr(h,'sampling',None),'model':model,'locale':h.language,'workspace':h.workspace,'instructions':instructions,'seedMemory':seed,'allowDismiss':case['check']=='goodbye','retainedLength':len(case.get('fixtureText','Fixture text.')) if case.get('setup')=='modified' else None,'thinking':getattr(h,'thinking','off'),'agentModule':getattr(h,'agent_module',None)}
    path=home/'job.json';path.write_text(json.dumps(job,ensure_ascii=False))
    with (home/'stdout.jsonl').open('w') as stdout, (home/'stderr.log').open('w') as stderr:
        source=Path(job['agentModule']).resolve().parents[1] if job['agentModule'] else ROOT
        command=sandbox_command(home,source)+['node',str(Path(__file__).parent/'agent-turn.mjs'),str(path)]
        child=subprocess.Popen(command,stdout=stdout,stderr=stderr,cwd=ROOT)
        start=time.monotonic();heartbeat=start
        try:
            while child.poll() is None:
                h.guard()
                if time.monotonic()-start>170:raise TimeoutError('Agent operation timed out')
                if time.monotonic()-heartbeat>5:
                    # Keep the UI open while the separate agent is working. Empty
                    # text performs no model request and is not a scored response.
                    keep_panel_alive(h)
                    heartbeat=time.monotonic()
                time.sleep(.15)
        finally:
            if child.poll() is None:
                child.terminate()
                try:child.wait(timeout=5)
                except subprocess.TimeoutExpired:child.kill();child.wait()
    rows=[json.loads(line) for line in (home/'stdout.jsonl').read_text().splitlines()]
    errors=[r['error'] for r in rows if r.get('event')=='error']
    if any(r.get('critical') for r in rows):
        critical=next(r for r in rows if r.get('critical'));raise UnsafeOperation('; '.join(errors),critical.get('kind','unsafe_operation'))
    assert child.returncode==0 and not errors, errors or (home/'stderr.log').read_text()[-1000:]
    return rows


def wait_face_closed():
    deadline=time.monotonic()+10
    while any(v.own(w) for w in v.clients()):
        if time.monotonic()>deadline:raise TimeoutError('O.M.A. window did not finish closing')
        time.sleep(.1)


def reset_document(h):
    doc=h.document()
    if doc.get('opened'):
        assert not doc.get('url'),'Preserve an unexpectedly named file'
        if doc.get('editor',{}).get('modalOpen'):
            h.cancel_editor_dialogs()
        if doc.get('modified'):
            (h.artifacts/('document-'+str(time.time_ns())+'.txt')).write_text(h.content())
    v.ipc('restoreFloating');v.wait_setting('docked',False)
    v.ipc('stop');v.wait_setting('panelOpened',False);wait_face_closed()
    v.run('omarchy','plugin','disable',v.EDITOR);v.run('omarchy-shell','shell','rescanPlugins');time.sleep(.5)
    v.run('omarchy','plugin','enable',v.EDITOR)
    assert not h.document().get('opened')


def setup(h,case,home):
    reset_document(h)
    v.ipc('viewMode','normal')
    v.run('omarchy-shell','shell','summon',v.PLUGIN,'{"greet":false,"silent":true}')
    h.wait('evaluation face visible',lambda:any(v.own(w) for w in v.clients()),10)
    if case.get('setup')=='file':(home/'note.txt').write_text(case.get('fixtureText','Seed.'))
    if case.get('setup')=='mini':v.ipc('viewMode','mini');v.wait_setting('viewMode','mini')
    if case.get('setup') in ('blank','modified'):
        v.run('omatext');h.wait('fixture editor open',lambda:h.document().get('opened'))
        window=h.editor_window();v.run('hyprctl','dispatch',f'hl.dsp.focus({{window="address:{window["address"]}"}})')
        # Native editor shortcut from the normal application, not a model answer.
        v.run('wtype','-M','ctrl','-k','n','-m','ctrl');time.sleep(.2)
        if case['setup']=='modified':v.run('wtype',case.get('fixtureText','Fixture text.'));time.sleep(.2)
        doc=h.document()
        assert doc['length']==(len(case.get('fixtureText','Fixture text.')) if case['setup']=='modified' else 0),doc
        if case['setup']=='modified':assert doc['modified'],doc


def check(h,case,rows):
    kind=case['check'];doc=h.document()
    text=''.join(r.get('text','') for r in rows if r.get('event')=='answer')
    facts=next((r.get('facts',[]) for r in reversed(rows) if r.get('event')=='result'),[])
    if kind in ('blank','document'):
        assert doc.get('opened') and not doc.get('url') and not doc.get('editor',{}).get('modalOpen'),doc
        if kind=='blank':assert doc.get('length')==0,doc
        else:
            actual=h.content()
            assert actual==case['expected'][h.language], 'Document differs: '+repr(actual)
        h.layout()
    elif kind in ('closed','discard'):assert not doc.get('opened') and h.state()['panelOpened'], {'document':doc,'panelOpened':h.state()['panelOpened']}
    elif kind=='cancel-close':assert doc.get('opened') and not doc.get('editor',{}).get('modalOpen') and h.content()==case.get('fixtureText','Fixture text.'),doc
    elif kind in ('mini','normal'):
        assert h.state()['viewMode']==kind
        assert any(w['title']==('O.M.A. Mini' if kind=='mini' else 'O.M.A.') for w in v.clients())
    elif kind=='quoted':assert h.state()['panelOpened'] and re.search('bye|goodbye|さようなら|さよなら|バイバイ',text,re.I)
    elif kind=='math':assert re.fullmatch(r'[\s。.!*]*(?:'+'|'.join(re.escape(x) for x in case.get('answers',['2','二','two']))+r')[\s。.!*]*',text,re.I),repr(text)
    elif kind=='remember':assert any(re.search('|'.join(re.escape(term) for term in case.get('memoryTerms',['紫','purple'])),str(f.get('value','')),re.I) for f in facts),facts
    elif kind=='recall':assert re.search('紫|purple',text,re.I),text
    elif kind=='forget':assert not any(f.get('key')=='evaluation_favorite_color' for f in facts),facts
    elif kind=='goodbye':
        assert not h.state()['panelOpened']
        wait_face_closed()
        assert not any(v.own(w) for w in v.clients())
    elif kind=='file':
        actual=(h.case_home/'note.txt').read_text()
        assert actual==case['expected'][h.language], 'File differs: '+repr(actual[:1000])
    elif kind=='rename':
        assert not (h.case_home/'note.txt').exists(),'Original filename still exists'
        target=h.case_home/case.get('renameTarget','renamed.txt')
        assert target.read_bytes()==case.get('fixtureText','Seed.').encode(),'Renamed file contents differ'
    elif kind=='read':assert text.strip()=='Seed.',repr(text)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',default='qwen3.5:4b');p.add_argument('--output',type=Path,required=True)
    p.add_argument('--languages',nargs='+',choices=['ja','en'],default=['ja','en']);p.add_argument('--repeat',type=int,default=5)
    p.add_argument('--split',choices=['dev','final'],default='dev')
    p.add_argument('--continue-after-blocked-target',action='store_true',help='Baseline only: continue after a close outside the workspace was refused before execution; still count a critical failure')
    p.add_argument('--continue-after-fixture-loss',action='store_true',help='Continue baseline measurement after loss of a disposable test draft; never after an unrelated-window error')
    p.add_argument('--agent-module',type=Path)
    p.add_argument('--temperature',type=float)
    p.add_argument('--top-p',type=float)
    p.add_argument('--presence-penalty',type=float)
    p.add_argument('--thinking',choices=['off','low','medium','high'],default='off')
    p.add_argument('--cases',nargs='+',choices=[c['id'] for c in CASES+DEV_CASES]);p.add_argument('--workspace',type=int,default=98)
    args=p.parse_args();args.output=args.output.resolve();args.output.mkdir(parents=True,exist_ok=False)
    sampling={k:v for k,v in {'temperature':args.temperature,'top_p':args.top_p,'presence_penalty':args.presence_penalty}.items() if v is not None}
    selected=[c for c in (CASES if args.split=='final' else DEV_CASES) if not args.cases or c['id'] in args.cases]
    assert selected,'No cases selected for this split'
    (args.output/'config.json').write_text(json.dumps({'agent_module':str(args.agent_module.resolve()) if args.agent_module else None,'filesystem':'read-only root, writable case directory and private tmp','timing':'seconds excludes fixture setup; total_seconds includes it','capture_screenshots':os.environ.get('OMA_EVALUATION_CAPTURE_SCREENSHOTS')=='1','sampling_overrides':sampling,'continue_after_fixture_loss':args.continue_after_fixture_loss,'continue_after_blocked_target':args.continue_after_blocked_target,'model':args.model,'thinking':args.thinking,'split':args.split,'repeat':args.repeat,'languages':args.languages,'cases':selected},ensure_ascii=False,indent=2)+'\n')
    sys.path.insert(0,str(Path(__file__).parent))
    from environment import environment
    (args.output/'environment.json').write_text(json.dumps(environment(args.model),indent=2)+'\n')
    source=args.agent_module.resolve().parents[1] if args.agent_module else ROOT
    hashes={str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['runtime','skills'] for p in (source/folder).rglob('*') if p.is_file() and (p.suffix in ('.mjs','.md','.py') or p.name=='oma-pointer')}
    (args.output/'source-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
    harness={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'tests/voice').rglob('*') if p.is_file() and p.suffix in ('.py','.mjs','.json')}
    (args.output/'harness-hashes.json').write_text(json.dumps(harness,indent=2)+'\n')
    results=[{'language':lang,'repeat':rep,'id':c['id'],'status':'not_run'} for lang in args.languages for rep in range(args.repeat) for c in selected]
    save=lambda:(args.output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    save();original=json.loads(v.ipc('status'));assert not original['panelOpened']
    (args.output/'original-settings.json').write_text(json.dumps({k:original[k] for k in ['voiceProvider','responseLanguage','microphoneTarget','viewMode']},indent=2)+'\n')
    try:
        for lang in args.languages:
            v.configure('local',lang)
            for rep in range(args.repeat):
                artifacts=args.output/lang/str(rep);artifacts.mkdir(parents=True)
                h=v.VoiceDesktop(Path('/tmp/oma-voice-fixtures')/lang,artifacts,args.workspace,'local',lang);h.case='empty';h.thinking=args.thinking;h.sampling=sampling;h.agent_module=str(args.agent_module.resolve()) if args.agent_module else None
                try:
                    h.start()
                    for c in selected:
                        row=next(r for r in results if (r['language'],r['repeat'],r['id'])==(lang,rep,c['id']))
                        home=artifacts/c['id'];home.mkdir();h.case_home=home
                        start=time.monotonic();operation_started=None
                        row['status']='running';save()
                        before={w['address'] for w in v.clients() if w['workspace']['id']!=args.workspace}
                        try:
                            setup(h,c,home)
                            operation_started=time.monotonic();row['setup_seconds']=operation_started-start
                            instructions=[c[lang].replace('{path}',str(home))]
                            if c.get('followup'):instructions.append(c['followup'][lang])
                            rows=invoke(h,c,home,args.model,instructions,c.get('setup')=='memory')
                            check(h,c,rows)
                            row.update(status='passed',passed=True)
                        except KeyboardInterrupt:
                            row.update(status='interrupted',passed=False,error='Evaluation interrupted');save();raise
                        except Exception as e:row.update(status='failed',passed=False,error=str(e),critical_error=isinstance(e,UnsafeOperation),critical_kind=getattr(e,'kind',None))
                        if not before<={w['address'] for w in v.clients()}:
                            row.update(status='failed',passed=False,error='An unrelated window closed',critical_error=True,critical_kind='unrelated_window')
                        row['total_seconds']=time.monotonic()-start
                        row['seconds']=time.monotonic()-operation_started if operation_started is not None else None;save();print(json.dumps(row,ensure_ascii=False),flush=True)
                        if should_stop_after_failure(row,args.continue_after_fixture_loss,args.continue_after_blocked_target):raise RuntimeError(row['error'])
                        if v.json_run('hyprctl','-j','activeworkspace')['id']!=args.workspace:
                            raise RuntimeError('Workspace changed; stopping evaluation')
                finally:
                    h.finish()
                    v.wait_setting('panelOpened',False);wait_face_closed()
    finally:
        v.ipc('stop');v.wait_setting('panelOpened',False);v.configure(original['voiceProvider'],original['responseLanguage']);v.ipc('microphone',original['microphoneTarget']);v.ipc('viewMode',original['viewMode'])
        save()
    if any(r['status']!='passed' for r in results):sys.exit(1)
if __name__=='__main__':main()
