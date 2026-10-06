#!/usr/bin/env python3
"""O.M.A. local audio adapter. No API credentials or daemon restarts."""
import json
import os
from pathlib import Path
import select
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import queue
import wave

launcher = shutil.which('dobby')
repo = Path(os.environ['OMA_DOBBY_ROOT']).expanduser() if os.environ.get('OMA_DOBBY_ROOT') else Path(launcher).resolve().parent.parent if launcher else None
if repo:
    sys.path.insert(0, str(repo / 'src'))
try:
    from omarchy_voice.dobby import settings, Segmenter, transcript_from_output, Dobby
except ImportError:
    print(json.dumps({'error': 'Dobby modules unavailable. Install Dobby or set OMA_DOBBY_ROOT and OMA_DOBBY_PYTHON.'}), flush=True)
    sys.exit(1)

os.umask(0o077)
cfg = settings()
children = set()
output_lock = threading.Lock()

def cleanup(*_):
    for child in list(children):
        if child.poll() is None:
            child.terminate()
    raise SystemExit(0)

signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

def emit(**patch):
    with output_lock:
        print(json.dumps(patch), flush=True)

def run(args, input=None, **kwargs):
    if input is not None:
        kwargs['stdin'] = subprocess.PIPE
    proc = subprocess.Popen(args, **kwargs)
    children.add(proc)
    try:
        out, _ = proc.communicate(input, timeout=120)
        if proc.returncode:
            raise RuntimeError(f'{Path(args[0]).name} terminou com código {proc.returncode}.')
        return out
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        children.discard(proc)

def transcribe(path, language=''):
    args = ['voxtype']
    source = Path.home() / '.config/voxtype/config.toml'
    if source.exists():
        args += ['--config', str(source)]
    args += ['--model', str(cfg['whisper_model'])]
    language = language or str(cfg.get('language', '') or '')
    if language and language != 'auto':
        args += ['--language', language]
    args += ['transcribe', str(path)]
    return transcript_from_output(run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).decode())

def listen(target='', language='', continuous=False):
    segmenter = Segmenter(cfg)
    args = ['pw-record', '--rate', '16000', '--channels', '1', '--format', 's16', '--raw', '-P', '{"node.name":"oma-input","application.name":"O.M.A. Conversation"}']
    if target:
        args += ['--target', target]
    proc = subprocess.Popen([*args, '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    children.add(proc)
    emit(listeningReady=True)
    clips=queue.Queue(maxsize=4)
    def recognize():
        while True:
            utterance, pcm=clips.get()
            try:
                with tempfile.TemporaryDirectory(prefix='oma-dobby-') as directory:
                    path=Path(directory)/'input.wav'
                    with wave.open(str(path), 'wb') as out:
                        out.setnchannels(1);out.setsampwidth(2);out.setframerate(16000);out.writeframes(pcm)
                    emit(transcript=transcribe(path, language), utteranceId=utterance)
            except Exception as error:
                emit(transcriptionError=str(error), utteranceId=utterance)
            finally:
                clips.task_done()
    if continuous:
        threading.Thread(target=recognize, daemon=True).start()
    try:
        buffer = b'';utterance=0;started=False
        while True:
            if not select.select([proc.stdout], [], [], .2)[0]:
                if proc.poll() is not None:
                    raise RuntimeError('Microfone indisponível. Verifica o PipeWire.')
                continue
            chunk = os.read(proc.stdout.fileno(), 3200-len(buffer))
            if not chunk:
                raise RuntimeError('O microfone fechou a captura.')
            buffer += chunk
            if len(buffer) < 3200:
                continue
            pcm, level = segmenter.feed(buffer)
            buffer = b''
            emit(inputLevel=min(1, level*12))
            # Three voiced frames (300ms), including preroll, distinguish speech
            # from a short click. Emit before transcription to stop output early.
            if not started and (segmenter.voiced >= 3 or pcm):
                utterance+=1;started=True
                emit(speechStarted=True,utteranceId=utterance)
            if pcm:
                if not continuous:break
                try:clips.put_nowait((utterance,pcm))
                except queue.Full:emit(transcriptionError='Please pause briefly; recognition is catching up.',utteranceId=utterance)
                started=False
            elif started and not segmenter.frames:
                emit(speechDiscarded=True,utteranceId=utterance)
                started=False
    finally:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
        children.discard(proc)
    emit(state='transcribing', listeningReady=False, inputLevel=0)
    with tempfile.TemporaryDirectory(prefix='oma-dobby-') as directory:
        path = Path(directory)/'input.wav'
        with wave.open(str(path), 'wb') as out:
            out.setnchannels(1); out.setsampwidth(2); out.setframerate(16000); out.writeframes(pcm)
        emit(transcript=transcribe(path, language))

def synthesize(text, effects=True):
    import numpy as np
    binary = Path(cfg['tts_binary']).expanduser()
    model = Path(cfg['tts_model']).expanduser()
    if not binary.is_file() or not model.is_file():
        raise RuntimeError('Voz Piper do Dobby não está instalada.')
    with tempfile.TemporaryDirectory(prefix='oma-dobby-speech-') as directory:
        path=Path(directory)/'reply.wav'
        args=[str(binary), '--model', str(model), '--output-file', str(path), '--length-scale', str(cfg['tts_length_scale']), '--sentence-silence', str(cfg['tts_sentence_silence'])]
        proc=subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.add(proc)
        try:
            proc.communicate((Dobby._speakable(text)+'\n').encode(), timeout=120)
            if proc.returncode: raise RuntimeError('Piper não produziu voz.')
        finally:
            if proc.poll() is None: proc.kill(); proc.wait()
            children.discard(proc)
        with wave.open(str(path),'rb') as wav:
            if wav.getsampwidth()!=2 or wav.getnchannels()!=1: raise RuntimeError('Formato Piper não suportado.')
            rate=wav.getframerate(); samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2')
        if not samples.size: raise RuntimeError('Piper produziu áudio vazio.')
        count=round(samples.size*24000/rate)
        output=np.interp(np.arange(count)*rate/24000,np.arange(samples.size),samples).clip(-32768,32767).astype('<i2')
        pcm=output.tobytes()
        if effects:
            # Match O.M.A.'s original FFT effect and its greeting preparation:
            # pad the worker's lookahead, drain it, then retain the full speech.
            pcm=run([sys.executable, '-u', str(Path(__file__).with_name('streaming-vocoder.py'))], input=pcm+bytes(24000), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)[:len(pcm)]
        sys.stdout.buffer.write(pcm); sys.stdout.buffer.flush()

if __name__ == '__main__':
    try:
        mode=sys.argv[1]
        if mode=='config':
            emit(planner=cfg['planner'],model=cfg.get('claude_model') if cfg['planner']=='claude' else cfg['model'],responseLanguage=cfg.get('response_language',''),whisperModel=cfg['whisper_model'],ttsModel=str(Path(cfg['tts_model']).expanduser()),speechReady=Path(cfg['tts_binary']).expanduser().is_file() and Path(cfg['tts_model']).expanduser().is_file(),microphoneTarget='')
        elif mode=='listen': listen(*sys.argv[2:4],continuous=len(sys.argv)>4 and sys.argv[4]=='continuous')
        elif mode=='transcribe': emit(transcript=transcribe(Path(sys.argv[2]),sys.argv[3] if len(sys.argv)>3 else ''))
        elif mode=='synthesize': synthesize(sys.stdin.read(24000), effects=len(sys.argv)<3 or sys.argv[2]!='raw')
        else: raise RuntimeError('Modo de áudio desconhecido.')
    except Exception as error:
        if sys.argv[1]=='synthesize': print(str(error),file=sys.stderr)
        else: emit(error=str(error))
        sys.exit(1)
