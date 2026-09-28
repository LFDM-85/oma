#!/usr/bin/env python3
"""Sample Ollama resident model and runner memory while an evaluation runs.

RSS, model VRAM estimates, and whole-device VRAM usage are different quantities.
The log keeps them separate and never reads credentials or process arguments.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.request import urlopen

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pid',type=int,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--interval',type=float,default=2)
a=p.parse_args()
with a.output.open('x') as output:
    while Path(f'/proc/{a.pid}').exists():
        row={'unix_seconds':time.time()}
        try:
            with urlopen('http://127.0.0.1:11435/api/ps',timeout=3) as response:
                row['ollama']=json.load(response)['models']
            gpu=subprocess.check_output(['nvidia-smi','--query-gpu=memory.used,memory.total','--format=csv,noheader,nounits'],timeout=3).decode().strip()
            row['device_vram_mib']=[dict(zip(['used','total'],map(int,line.split(',')))) for line in gpu.splitlines()]
            row['runners']=[]
            for process in Path('/proc').glob('[0-9]*'):
                try:
                    if (process/'comm').read_text().strip()!='llama-server':continue
                    status=(process/'status').read_text()
                    fields={name:int(re.search(r'^'+name+r':\s+(\d+)',status,re.M)[1]) for name in ['VmRSS','VmHWM']}
                    row['runners'].append({'pid':int(process.name),'rss_kib':fields['VmRSS'],'peak_rss_kib':fields['VmHWM']})
                except (OSError,TypeError):
                    continue
        except Exception as error:
            row['error']=str(error)
        output.write(json.dumps(row)+'\n');output.flush()
        time.sleep(a.interval)
