"""Small non-secret environment snapshot for reproducible local evaluations."""
import hashlib,json,os,platform,subprocess
from pathlib import Path
from urllib.request import Request,urlopen

def environment(model):
    row={'platform':platform.platform(),'python':platform.python_version(),'cpu_affinity':sorted(os.sched_getaffinity(0))}
    cpu=Path('/proc/cpuinfo').read_text()
    row['cpu']=next((line.split(':',1)[1].strip() for line in cpu.splitlines() if line.startswith('model name')),None)
    row['mem_total_kib']=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:')))
    for name,command in {'node':['node','--version'],'gpu':['nvidia-smi','--query-gpu=name,driver_version,memory.total','--format=csv,noheader,nounits']}.items():
        try:row[name]=subprocess.check_output(command,timeout=5,text=True).strip()
        except Exception as error:row[name]={'error':str(error)}
    try:
        def api(path,data=None):
            request=Request('http://127.0.0.1:11435/api/'+path,data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json'})
            with urlopen(request,timeout=5) as response:return json.load(response)
        row['ollama_version']=api('version')
        row['model']=next((m for m in api('tags')['models'] if m['name']==model),{'name':model,'missing':True})
        shown=api('show',{'model':model})
        row['model_configuration']={k:shown.get(k) for k in ['parameters','details','capabilities','thinking']}
        row['template_sha256']=hashlib.sha256(shown.get('template','').encode()).hexdigest()
    except Exception as error:row['ollama_error']=str(error)
    # Only allowlisted inference controls; never save arbitrary process environment.
    allowed={'OLLAMA_HOST','OLLAMA_CONTEXT_LENGTH','OLLAMA_FLASH_ATTENTION','OLLAMA_KV_CACHE_TYPE','OLLAMA_NUM_PARALLEL'}
    for process in Path('/proc').glob('[0-9]*'):
        try:
            if (process/'comm').read_text().strip()!='ollama':continue
            values=dict(item.split(b'=',1) for item in (process/'environ').read_bytes().split(b'\0') if b'=' in item)
            if values.get(b'OLLAMA_HOST')!=b'127.0.0.1:11435':continue
            row['ollama_server_environment']={key:values[key.encode()].decode() for key in allowed if key.encode() in values}
            break
        except OSError:continue
    manifest=Path.home()/'.config/omarchy/plugins/io.github.komagata.oma/manifest.json'
    if manifest.exists():row['installed_entrypoints']=json.loads(manifest.read_text()).get('entryPoints')
    editor=Path.home()/'.config/omarchy/plugins/io.github.komagata.omatext'
    if (editor/'manifest.json').exists():
        row['editor_entrypoints']=json.loads((editor/'manifest.json').read_text()).get('entryPoints')
        panel=row['editor_entrypoints'].get('panel','')
        base=editor/Path(panel).parent/'EditorBase.qml'
        if base.exists():row['editor_base_sha256']=hashlib.sha256(base.read_bytes()).hexdigest()
        hashes=base.parent.parent/'source-hashes.json'
        if hashes.exists():row['editor_build_hashes']=json.loads(hashes.read_text())
    row['editor_inspection']='native-read-only' if os.environ.get('OMA_EVALUATION_EDITOR_INSPECTION')=='1' else 'clipboard'
    return row
