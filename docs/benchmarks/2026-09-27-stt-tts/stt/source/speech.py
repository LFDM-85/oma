#!/usr/bin/env python3
"""Offline frozen-corpus recognition and synthesis evaluation, opt-in."""
import argparse
import hashlib
import importlib.util
import json
import os
import resource
from pathlib import Path
import time
import traceback

from corpus import cases,noise_cases,corpus_hash
from metrics import recognition,playback_gaps,distribution

LOCAL=Path.home()/'.local/share/oma/local'
os.environ.setdefault('HF_HOME',str(LOCAL/'huggingface'))
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
CONTEXT='Voice commands to the O.M.A. desktop assistant. Applications, documents, conversation history. O.M.A., OmaText.'


def load_worker(path):
    spec=importlib.util.spec_from_file_location('speech_worker',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def append(path,value):
    with path.open('a') as f:f.write(json.dumps(value,ensure_ascii=False)+'\n')
    print(json.dumps(value,ensure_ascii=False),flush=True)


def prepare(args):
    import numpy as np
    import soundfile as sf
    from kokoro import KModel,KPipeline
    import torch
    torch.set_num_threads(4)
    args.output.mkdir(parents=True,exist_ok=False)
    model=KModel(repo_id='hexgrad/Kokoro-82M').eval()
    manifest={'corpus_sha256':corpus_hash(),'source':'synthetic','generator':'Kokoro-82M','sample_rate':24000,'cases':[]}
    for lang,code,voices in [('ja','j',['jf_alpha','jm_kumo']),('en','a',['af_heart','am_michael'])]:
        pipeline=KPipeline(lang_code=code,model=model,repo_id='hexgrad/Kokoro-82M')
        for split in ('dev','final'):
            for i,c in enumerate(cases(lang,split)):
                voice=voices[i%len(voices)];speed=[.9,1.,1.1][i%3]
                audio=np.concatenate([r.audio.numpy() for r in pipeline(c['text'],voice=voice,speed=speed)])
                rng=np.random.default_rng(i)
                if c['condition']=='quiet':audio=audio*.16
                elif c['condition']=='noise':
                    # Deterministic 18 dB SNR additive noise, not a real noisy room.
                    audio=audio+rng.normal(0,float(np.sqrt(np.mean(audio**2)))/(10**(.9)),len(audio))
                audio=np.concatenate([np.zeros(4800),audio,np.zeros(7200)])
                path=args.output/(c['id']+'.wav');sf.write(path,audio,24000,subtype='PCM_16')
                c.update(file=path.name,source='synthetic',voice=voice,speed=speed,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
                manifest['cases'].append(c)
                print('PREPARED '+c['id'],flush=True)
        for c in noise_cases(lang):
            rng=np.random.default_rng(c['seed']);n=24000*(2+c['seed']%4);t=np.arange(n)/24000
            kind=c['condition'];level=[.001,.005,.02,.05][c['seed']//5]
            if kind=='silence':audio=np.zeros(n)
            elif kind=='white':audio=rng.normal(0,level,n)
            elif kind=='hum':audio=level*(np.sin(2*np.pi*50*t)+.3*np.sin(2*np.pi*100*t))
            elif kind=='clicks':
                audio=np.zeros(n);audio[rng.integers(0,n,20)]=level*5
            else:
                from scipy.signal import lfilter
                audio=lfilter([1],[1,-.97],rng.normal(0,level,n))*.24
            path=args.output/(c['id']+'.wav');sf.write(path,audio,24000,subtype='PCM_16')
            c.update(file=path.name,source='generated-noise',level=level,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            manifest['cases'].append(c)
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


def asr(args):
    import numpy as np
    import soundfile as sf
    import torch
    from faster_whisper.audio import decode_audio
    torch.set_num_threads(args.threads)
    context=args.context or CONTEXT
    manifest=json.loads((args.fixtures/'manifest.json').read_text())
    assert manifest['corpus_sha256']==corpus_hash(),'Corpus changed after recording'
    inputs=[c for c in manifest['cases'] if c['split']==args.split and c['language'] in args.languages]
    args.output.mkdir(parents=True,exist_ok=False)
    start=time.monotonic()
    if args.engine=='whisper':
        from faster_whisper import WhisperModel
        model=WhisperModel(str(args.model or LOCAL/'whisper'),device='cpu',compute_type='int8',cpu_threads=args.threads,local_files_only=True)
    else:
        from transformers import AutoProcessor,AutoModelForMultimodalLM
        name=str(args.model or 'Qwen/Qwen3-ASR-0.6B-hf')
        processor=AutoProcessor.from_pretrained(name,local_files_only=True)
        model=AutoModelForMultimodalLM.from_pretrained(name,dtype=torch.float32,local_files_only=True).eval()
    metadata={'engine':args.engine,'model':str(args.model or ('whisper-small' if args.engine=='whisper' else name)),
              'corpus_sha256':corpus_hash(),'load_seconds':time.monotonic()-start,'threads':args.threads,'context':context,'split':args.split,'beams':5 if args.engine=='whisper' else args.beams,'normalize_quiet_speech':args.normalize}
    (args.output/'config.json').write_text(json.dumps(metadata,indent=2)+'\n')
    metadata['resampler']=args.resampler
    metadata['warmups']=[]
    import importlib.metadata,platform
    metadata['environment']={'python':platform.python_version(),'platform':platform.platform(), 'cpu_affinity':sorted(os.sched_getaffinity(0)), 'packages':{name:importlib.metadata.version(name) for name in ['torch','transformers','faster-whisper','ctranslate2','numpy','scipy','soundfile']}}
    if args.engine=='qwen':metadata['model_revision']=getattr(model.config,'_commit_hash',None)
    rows=[]
    warmed=set()
    measurements=[]
    for c in inputs:
        if c['language'] not in warmed:
            warm=next((item for item in manifest['cases'] if item['language']==c['language'] and item['split']=='dev' and item['text']),None)
            if warm:measurements.append((warm,True))
            warmed.add(c['language'])
        measurements.append((c,False))
    for c,is_warmup in measurements:
        row={'id':c['id'],'language':c['language'],'expected':c['text'],'source':c['source'],'condition':c['condition']}
        path=args.fixtures/c['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==c['sha256']
        start=time.monotonic()
        try:
            if args.resampler=='scipy':
                from scipy.signal import resample_poly
                import math
                audio,rate=sf.read(path,dtype='float32');assert audio.ndim==1,'Expected mono audio'
                divisor=math.gcd(rate,16000);audio=resample_poly(audio,16000//divisor,rate//divisor) if rate!=16000 else audio
            else:audio=decode_audio(str(path),sampling_rate=16000)
            row['duration']=len(audio)/16000
            if args.engine=='whisper':
                segments,_=model.transcribe(audio,language=c['language'],beam_size=5,vad_filter=True,condition_on_previous_text=False,initial_prompt=context)
                actual=''.join(s.text for s in segments).strip()
            else:
                from faster_whisper.vad import get_speech_timestamps,collect_chunks
                segments=get_speech_timestamps(audio)
                if not segments:actual=''
                else:
                    chunks,_=collect_chunks(audio,segments)
                    samples=np.concatenate(chunks)
                    if args.normalize:
                        peak=float(np.max(np.abs(samples)))
                        if 0<peak<.4:samples=samples*min(8,.8/peak)
                    request=processor.apply_transcription_request(audio=samples,language={'ja':'Japanese','en':'English'}[c['language']],prompt=context).to(model.device,model.dtype)
                    with torch.inference_mode():result=model.generate(**request,max_new_tokens=256,do_sample=False,num_beams=args.beams)
                    actual=processor.decode(result[:,request['input_ids'].shape[1]:],return_format='transcription_only')[0]
            row['actual']=actual
        except Exception as e:row.update(error=str(e),traceback=traceback.format_exc())
        row['seconds']=time.monotonic()-start
        if is_warmup:metadata['warmups'].append(row)
        else:rows.append(row);append(args.output/'results.jsonl',row)
    (args.output/'summary.json').write_text(json.dumps({lang:recognition([c for c in inputs if c['language']==lang],[r for r in rows if r['language']==lang]) for lang in args.languages},ensure_ascii=False,indent=2)+'\n')
    metadata['peak_rss_kib']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    (args.output/'config.json').write_text(json.dumps(metadata,indent=2)+'\n')


def tts(args):
    import numpy as np
    import soundfile as sf
    worker=load_worker(args.worker)
    engine=worker.Engines(LOCAL)
    args.output.mkdir(parents=True,exist_ok=False)
    meta={'worker_sha256':hashlib.sha256(args.worker.read_bytes()).hexdigest(),'corpus_sha256':corpus_hash(),'split':args.split,'source':'synthetic','voices':{'ja':'jm_kumo','en':'am_michael'},'timing':'PCM availability plus leading silence, simulated immediate playback; not measured speaker output'}
    (args.output/'config.json').write_text(json.dumps(meta,indent=2)+'\n')
    for lang in args.languages:
        # Explicit cold-start sample, excluded from warm medians.
        start=time.monotonic();list(engine.speak('準備中です。' if lang=='ja' else 'Getting ready.',lang))
        append(args.output/'cold.jsonl',{'language':lang,'seconds':time.monotonic()-start})
        inputs=cases(lang,args.split)[:20]
        for c in inputs:
            start=time.monotonic();chunks=[];audio=[];first_sound=None;offset=0
            row={'id':c['id'],'language':lang,'text':c['text']}
            try:
                for pcm in engine.speak(c['text'],lang):
                    ready=time.monotonic()-start;x=np.frombuffer(pcm,dtype='<i2');duration=len(x)/24000
                    chunks.append({'ready':ready,'duration':duration});audio.append(x)
                    voiced=np.flatnonzero(np.abs(x.astype(np.int32))>100)
                    if first_sound is None and len(voiced):first_sound=ready+float(voiced[0])/24000
                data=np.concatenate(audio) if audio else np.zeros(0,dtype=np.int16)
                sf.write(args.output/(c['id']+'.wav'),data,24000,subtype='PCM_16')
                row.update(seconds=time.monotonic()-start,first_audio_seconds=chunks[0]['ready'] if chunks else None,
                    first_sound_seconds=first_sound,duration=len(data)/24000,chunks=chunks,simulated_gap_seconds=playback_gaps(chunks),
                    peak=int(np.max(np.abs(data.astype(np.int32)))) if len(data) else 0,frames=len(data))
                if first_sound is None:row['error']='No non-silent speech generated'
            except Exception as e:row['error']=str(e)
            append(args.output/'results.jsonl',row)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['prepare','asr','tts'])
    p.add_argument('--output',type=Path,required=True);p.add_argument('--fixtures',type=Path)
    p.add_argument('--engine',choices=['whisper','qwen'],default='whisper');p.add_argument('--model',type=Path)
    p.add_argument('--beams',type=int,default=1)
    p.add_argument('--threads',type=int,default=4)
    p.add_argument('--resampler',choices=['pyav','scipy'],default='pyav')
    p.add_argument('--context')
    p.add_argument('--normalize',action='store_true',help='After VAD only, linearly raise quiet speech without clipping')
    p.add_argument('--split',choices=['dev','final'],default='dev');p.add_argument('--languages',nargs='+',choices=['ja','en'],default=['ja','en'])
    p.add_argument('--worker',type=Path,default=Path(__file__).resolve().parents[3]/'runtime/local-speech.py')
    args=p.parse_args();globals()[args.action](args)
if __name__=='__main__':main()
