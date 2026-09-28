#!/usr/bin/env python3
"""Copy the dirty checkout into a separate reproducible evaluation source root."""
import argparse,hashlib,json,shutil
from pathlib import Path

def freeze(root,output,copy_dependencies=False):
    root=Path(root).resolve();output=Path(output).resolve()
    output.mkdir(parents=True,exist_ok=False)
    for name in ['runtime','skills','tests','native','assets','scripts','demo']:
        if (root/name).exists():shutil.copytree(root/name,output/name,ignore=shutil.ignore_patterns('__pycache__'))
    for pattern in ['*.qml','*.json','.npmrc','*.md','docs/*.md']:
        for path in root.glob(pattern):
            if path.is_file():
                target=output/path.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    hashes={str(path.relative_to(output)):hashlib.sha256(path.read_bytes()).hexdigest() for path in output.rglob('*') if path.is_file() and not path.is_symlink()}
    (output/'snapshot-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
    if copy_dependencies:shutil.copytree(root/'node_modules',output/'node_modules')
    else:(output/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
    return hashes

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--copy-dependencies',action='store_true',help='Copy dependencies for full manifest validation; default links them for lightweight model probes')
    a=p.parse_args();hashes=freeze(Path(__file__).resolve().parents[3],a.output,a.copy_dependencies)
    print(json.dumps({'source':str(a.output.resolve()),'files':len(hashes),'dependencies':('node_modules copy' if a.copy_dependencies else 'node_modules symlink')+'; package-lock.json is recorded'}))

if __name__=='__main__':main()
