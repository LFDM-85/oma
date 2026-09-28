#!/usr/bin/env python3
"""Compare captured PipeWire audio with deterministic generated reference WAVs.
Cross-correlation tolerates output onset delay. This is not a listening rating.
"""
import argparse,json
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import correlate,correlation_lags
p=argparse.ArgumentParser();p.add_argument('capture',type=Path);p.add_argument('baseline',type=Path);p.add_argument('candidate',type=Path);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();assert not a.output.exists()
with a.output.open('w') as out:
 for line in (a.capture/'results.jsonl').read_text().splitlines():
  row=json.loads(line);label=row['configuration'];name=label+'-'+row['id'];source=(a.baseline if label=='baseline' else a.candidate)/(row['id']+'.wav')
  reference,rate=sf.read(source,dtype='float32');assert rate==24000
  captured=np.fromfile(a.capture/(name+'.s16le'),dtype='<i2').astype(np.float32)/32768
  correlations=correlate(captured,reference,mode='full',method='fft');lags=correlation_lags(len(captured),len(reference));lag=int(lags[int(np.argmax(correlations))])
  start=max(0,lag);offset=max(0,-lag);n=min(len(captured)-start,len(reference)-offset)
  x=reference[offset:offset+n];y=captured[start:start+n]
  cosine=float(np.dot(x,y)/(np.linalg.norm(x)*np.linalg.norm(y))) if n and np.linalg.norm(y) else 0
  missing=0
  for begin in range(0,n-480+1,480):
   xr=x[begin:begin+480];yr=y[begin:begin+480]
   if np.sqrt(np.mean(xr*xr))>.01 and np.sqrt(np.mean(yr*yr))<.0001:missing+=1
  result={'id':row['id'],'configuration':label,'reference_frames':len(reference),'captured_frames':len(captured),'lag_frames':lag,'aligned_frames':n,'cosine':cosine,'silent_20ms_blocks_where_reference_is_voiced':missing,'source_frame_count_matches':row['source_frames']==len(reference),'interpretation':'digital capture similarity, not naturalness'}
  out.write(json.dumps(result)+'\n');print(json.dumps(result),flush=True)
