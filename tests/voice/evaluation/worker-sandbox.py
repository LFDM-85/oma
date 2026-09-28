#!/usr/bin/env python3
"""Opt-in filesystem isolation for the real local voice worker.

Desktop IPC remains shared with the host; this is not a hostile-code security
boundary. Direct worker/child filesystem writes are confined to the fresh
profile/workspace, private /tmp and device interfaces needed for real audio/UI.
"""
import argparse,json,os,shutil,subprocess
from pathlib import Path


def sandbox_command(profile,roots):
    profile=Path(profile).resolve()
    try:marker=json.loads((profile/'.evaluation-profile.json').read_text())
    except (OSError,ValueError):raise ValueError('A prepared voice evaluation profile is required')
    if marker.get('kind')!='oma-voice-evaluation' or not (profile/'workspace').is_dir():
        raise ValueError('Invalid voice evaluation profile')
    command=['bwrap','--die-with-parent','--unshare-pid','--ro-bind','/','/','--proc','/proc','--dev-bind','/dev','/dev','--tmpfs','/tmp']
    for root in dict.fromkeys(Path(p).resolve() for p in roots):
        command+=['--ro-bind',str(root),str(root)]
    return command+['--bind',str(profile),str(profile),'--setenv','OMA_DATA_DIR',str(profile),'--setenv','OMA_WORKSPACE',str(profile/'workspace'),'--chdir',str(profile/'workspace'),'--']


def prepare(profile,source,microphone=''):
    profile=Path(profile).resolve();source=Path(source).resolve()
    profile.mkdir(parents=True,exist_ok=False,mode=0o700)
    (profile/'workspace').mkdir();local=profile/'local';local.mkdir()
    installed=Path.home()/'.local/share/oma'
    for path in (installed/'local').iterdir():
        if path.name in ('pi','pi-config','agent.json','speech.json'):continue
        (local/path.name).symlink_to(path,target_is_directory=path.is_dir())
    for name in ('models','wake-venv'):
        path=installed/name
        if path.exists():(profile/name).symlink_to(path,target_is_directory=path.is_dir())
    code="const {Memory}=await import(process.argv[1]);const m=new Memory(process.argv[2]);for(const [key,value] of Object.entries(JSON.parse(process.argv[3])))m.set(key,value);m.close();"
    settings={'voiceProvider':'local','responseLanguage':'','microphoneTarget':microphone,'wakeEnabled':'true'}
    subprocess.run(['node','--input-type=module','-e',code,(source/'runtime/memory.mjs').as_uri(),str(profile/'memory.sqlite'),json.dumps(settings)],check=True)
    (profile/'.evaluation-profile.json').write_text(json.dumps({'kind':'oma-voice-evaluation','settings':settings,'models_read_only_from':str(installed/'local'),'scope':'worker filesystem; shared host desktop IPC'},indent=2)+'\n')
    return profile


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--prepare',action='store_true');p.add_argument('--profile',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--microphone',default='');p.add_argument('worker',nargs='?',type=Path)
    a=p.parse_args()
    if a.prepare:print(prepare(a.profile,a.source,a.microphone));return
    if a.worker is None:p.error('A worker path is required')
    command=sandbox_command(a.profile,[a.source])+['node',str(a.worker.resolve())]
    os.execvp(command[0],command)

if __name__=='__main__':main()
