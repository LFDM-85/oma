#!/usr/bin/env python3
"""Opt-in: real O.M.A. window restoration while desktop observation hides it.

No model inference. Uses the ordinary settings window and a disposable terminal
on empty workspace 98. Only the owned terminal is closed; settings are restored.
"""
import argparse,json,subprocess,time
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repeat',type=int,default=5);a=p.parse_args()
def run(*args):return subprocess.check_output(args,timeout=15,text=True).strip()
def ipc(*args):return run('omarchy-shell','io.github.komagata.oma',*args)
def clients():return json.loads(run('hyprctl','-j','clients'))
def state():return json.loads(ipc('status'))
def dispatch(code):return run('hyprctl','dispatch',code)
def wait(check):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        value=check()
        if value:return value
        time.sleep(.1)
    raise TimeoutError('Window restoration condition was not reached')
def own(w):return w['title'] in ('O.M.A.','O.M.A. Mini') and w.get('mapped') and not w.get('hidden')
original=state();workspace=json.loads(run('hyprctl','-j','activeworkspace'))['id']
assert not original['panelOpened']
assert not any(w['workspace']['id']==98 for w in clients()),'Workspace 98 must be empty'
terminal=None;results=[]
try:
    dispatch('hl.dsp.focus({workspace="98"})');ipc('viewMode','normal')
    for repeat in range(a.repeat):
        run('omarchy-shell','shell','summon','io.github.komagata.oma','{"settings":true,"greet":false,"silent":true}')
        face=wait(lambda:next((w for w in clients() if own(w)),None));assert face['floating']
        terminal=subprocess.Popen(['foot','--app-id=oma-restore-evaluation','--title=OMA restore evaluation','sleep','120'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        target=wait(lambda:next((w for w in clients() if w['pid']==terminal.pid),None))
        ipc('accompany',target['address']);wait(lambda:state()['docked'] and any(own(w) and not w['floating'] for w in clients()))
        ipc('computerUse','true')
        dispatch('hl.dsp.window.close({window="address:'+target['address']+'"})')
        wait(lambda:not state()['docked']);time.sleep(.3)
        ipc('computerUse','false')
        restored=wait(lambda:next((w for w in clients() if own(w)),None))
        results.append({'repeat':repeat,'floating':restored['floating'],'panel_open':state()['panelOpened']})
        print(json.dumps(results[-1]),flush=True)
        assert restored['floating'],'The remapped O.M.A. window remained tiled'
        terminal.wait(timeout=10);terminal=None
        ipc('stop');wait(lambda:not any(own(w) for w in clients()))
finally:
    ipc('computerUse','false');ipc('restoreFloating');ipc('stop')
    if terminal and terminal.poll() is None:terminal.terminate();terminal.wait(timeout=10)
    ipc('viewMode',original['viewMode'])
    dispatch('hl.dsp.focus({workspace="'+str(workspace)+'"})')
