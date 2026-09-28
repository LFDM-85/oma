#!/usr/bin/env python3
"""Report complete paired digital playback timing, never a listening verdict."""
import argparse,json
from pathlib import Path
from metrics import playback_timing
p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);a=p.parse_args()
print(json.dumps(playback_timing([json.loads(line) for line in (a.directory/'results.jsonl').read_text().splitlines()]),indent=2,ensure_ascii=False))
