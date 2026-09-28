"""Persistent offline STT/TTS worker. stdout is exclusively the JSON protocol."""
import base64
import contextlib
import io
import json
import math
import os
import pathlib
import queue
import subprocess
import sys
import threading
import wave


def speech_thread_count(available=None):
    if available is None:
        available = len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else (os.cpu_count() or 1)
    return max(1, min(8, available))


def trim_start_padding(pcm):
    # Kokoro prepends digital silence. Preserve every nonzero sample, however
    # quiet, and 20 ms of onset padding. Never threshold away consonants.
    for offset in range(0, len(pcm), 2):
        if pcm[offset:offset + 2] != b'\x00\x00':
            return pcm[max(0, offset - 960):]
    return pcm


def voice_for(language):
    return {
        'en': ('a', 'am_michael'), 'ja': ('j', 'jm_kumo'),
        'zh': ('z', 'zm_yunxi'), 'es': ('e', 'em_alex'),
        'fr': ('f', 'ff_siwis'), 'hi': ('h', 'hm_omega'),
        'it': ('i', 'im_nicola'), 'pt': ('p', 'pm_alex'),
    }.get(language)


ASR_CONTEXT = 'Voice commands to the O.M.A. desktop assistant. Applications, documents, conversation history. O.M.A., OmaText.'
QWEN_LANGUAGES = frozenset('zh en yue ar de fr es pt id it ko ru th vi ja tr hi ms nl sv da fi pl cs fil fa el hu mk ro'.split())


def check_cancelled(cancelled):
    if cancelled is not None and cancelled.is_set():
        raise InterruptedError('Recognition cancelled')


@contextlib.contextmanager
def recognition_affinity(cpus):
    """Optional host-specific ASR placement; restore the speech worker afterwards."""
    if cpus is None:
        yield
        return
    if not isinstance(cpus, list) or not cpus or any(type(cpu) is not int or cpu < 0 for cpu in cpus):
        raise ValueError('asr_cpu_affinity must be a nonempty list of CPU numbers')
    if not hasattr(os, 'sched_getaffinity'):
        raise ValueError('ASR CPU affinity is unsupported on this platform')
    available = os.sched_getaffinity(0)
    selected = set(cpus)
    if not selected <= available:
        raise ValueError('ASR CPU affinity includes unavailable CPUs')
    tasks = pathlib.Path('/proc/self/task')
    previous = {}
    for task in tasks.iterdir():
        try:
            previous[int(task.name)] = os.sched_getaffinity(int(task.name))
        except ProcessLookupError:
            pass
    try:
        for tid in previous:
            try:
                os.sched_setaffinity(tid, selected)
            except ProcessLookupError:
                pass
        yield
    finally:
        # Torch/ONNX may create threads during inference. They inherited the
        # restricted mask, so restore those too before the next TTS request.
        for task in tasks.iterdir():
            tid = int(task.name)
            try:
                os.sched_setaffinity(tid, previous.get(tid, available))
            except ProcessLookupError:
                pass


def speech_requests(stream):
    """Read cancellation while inference owns the single model execution thread."""
    requests = queue.Queue()
    pending = {}
    lock = threading.Lock()
    def read():
        try:
            for line in stream:
                try:
                    request = json.loads(line)
                    request_id = request['id']
                    with lock:
                        if request['action'] == 'cancel':
                            event = pending.get(request_id)
                            if event is not None:
                                event.set()
                            continue
                        event = threading.Event()
                        pending[request_id] = event
                    requests.put((request, event, None))
                except Exception as error:
                    requests.put(({}, None, error))
        finally:
            requests.put(None)
    threading.Thread(target=read, daemon=True).start()
    while (item := requests.get()) is not None:
        request, event, error = item
        try:
            yield request, event, error
        finally:
            with lock:
                if pending.get(request.get('id')) is event:
                    pending.pop(request.get('id'), None)


class Engines:
    def __init__(self, home):
        self.home = pathlib.Path(home)
        config = self.home / 'speech.json'
        settings = json.loads(config.read_text()) if config.exists() else {}
        self.stt = settings.get('stt', 'whisper-small')
        self.asr_cpu_affinity = settings.get('asr_cpu_affinity')
        if self.stt not in ('whisper-small', 'qwen3-asr-1.7b'):
            raise ValueError('Unknown local STT model: ' + str(self.stt))
        self.asr_model = None
        self.asr_processor = None
        self.whisper = None
        self.model = None
        self.pipelines = {}

    def asr_backend(self, language):
        return self.stt if language in QWEN_LANGUAGES else 'whisper-small'

    def prepare_recognition(self, language):
        if self.asr_backend(language) == 'qwen3-asr-1.7b':
            if self.asr_model is None:
                import torch
                from transformers import AutoProcessor, AutoModelForMultimodalLM
                torch.set_num_threads(speech_thread_count())
                model_id = 'Qwen/Qwen3-ASR-1.7B-hf'
                self.asr_processor = AutoProcessor.from_pretrained(model_id, local_files_only=True)
                self.asr_model = AutoModelForMultimodalLM.from_pretrained(
                    model_id, dtype=torch.float32, local_files_only=True).eval()
        elif self.whisper is None:
            from faster_whisper import WhisperModel
            self.whisper = WhisperModel(str(self.home / 'whisper'), device='cpu',
                                        compute_type='int8', cpu_threads=4,
                                        local_files_only=True)

    def transcribe(self, pcm, language, cancelled=None):
        with recognition_affinity(self.asr_cpu_affinity):
            return self._transcribe(pcm, language, cancelled)

    def _transcribe(self, pcm, language, cancelled=None):
        check_cancelled(cancelled)
        import numpy as np
        from scipy.signal import resample_poly
        audio = resample_poly(np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768, 2, 3)
        if self.asr_backend(language) == 'qwen3-asr-1.7b':
            return self.transcribe_qwen(audio, language, cancelled)
        self.prepare_recognition(language)
        check_cancelled(cancelled)
        segments, _ = self.whisper.transcribe(audio, language=language, beam_size=5,
                                              vad_filter=True, condition_on_previous_text=False,
                                              initial_prompt=ASR_CONTEXT)
        text = []
        for segment in segments:
            check_cancelled(cancelled)
            text.append(segment.text)
        check_cancelled(cancelled)
        return ''.join(text).strip()

    def transcribe_qwen(self, audio, language, cancelled=None):
        import numpy as np
        import torch
        from faster_whisper.vad import get_speech_timestamps, collect_chunks
        torch.set_num_threads(speech_thread_count())
        segments = get_speech_timestamps(audio)
        if not segments:
            return ''
        chunks, _ = collect_chunks(audio, segments)
        self.prepare_recognition(language)
        check_cancelled(cancelled)
        request = self.asr_processor.apply_transcription_request(
            audio=np.concatenate(chunks), language=language, prompt=ASR_CONTEXT
        ).to(self.asr_model.device, self.asr_model.dtype)
        options = {}
        if cancelled is not None:
            from transformers import StoppingCriteria, StoppingCriteriaList
            class Cancelled(StoppingCriteria):
                def __call__(self, input_ids, scores, **kwargs):
                    return torch.full((input_ids.shape[0],), cancelled.is_set(), dtype=torch.bool, device=input_ids.device)
            options['stopping_criteria'] = StoppingCriteriaList([Cancelled()])
        check_cancelled(cancelled)
        with torch.inference_mode():
            result = self.asr_model.generate(**request, max_new_tokens=256, do_sample=False, **options)
        check_cancelled(cancelled)
        tokens = result[:, request['input_ids'].shape[1]:]
        if tokens.shape[1] >= 256:
            raise ValueError('Local transcription reached its output limit')
        return self.asr_processor.decode(tokens, return_format='transcription_only')[0].strip()

    def speak(self, text, language):
        import numpy as np
        selection = voice_for(language)
        if selection:
            import torch
            from kokoro import KModel, KPipeline
            torch.set_num_threads(speech_thread_count())
            code, voice = selection
            if self.model is None:
                self.model = KModel(repo_id='hexgrad/Kokoro-82M').eval()
            if code not in self.pipelines:
                self.pipelines[code] = KPipeline(lang_code=code, model=self.model,
                                                 repo_id='hexgrad/Kokoro-82M')
            first = True
            for result in self.pipelines[code](text, voice=voice, speed=1):
                pcm = (np.clip(result.audio.numpy(), -1, 32767/32768) * 32768).astype('<i2').tobytes()
                yield trim_start_padding(pcm) if first else pcm
                first = False
        else:
            # Other installed eSpeak languages stay offline as well. Unknown
            # languages return an error instead of sending text to a cloud API.
            from scipy.signal import resample_poly
            rendered = subprocess.run(['espeak-ng', '--stdout', '-v', language, '--stdin'],
                                      input=text.encode(), capture_output=True, check=True)
            with wave.open(io.BytesIO(rendered.stdout)) as wav:
                rate = wav.getframerate()
                samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32)
            divisor = math.gcd(rate, 24000)
            yield np.clip(resample_poly(samples, 24000 // divisor, rate // divisor),
                          -32768, 32767).astype('<i2').tobytes()


def main(home):
    output = sys.stdout
    def emit(message):
        output.write(json.dumps(message, ensure_ascii=False) + '\n')
        output.flush()
    engines = Engines(home)
    for request, cancelled, parse_error in speech_requests(sys.stdin):
        try:
            if parse_error is not None:
                raise parse_error
            check_cancelled(cancelled)
            language = request.get('language') or 'en'
            with contextlib.redirect_stdout(sys.stderr):
                if request['action'] == 'prepare_recognition':
                    engines.prepare_recognition(language)
                    emit({'id': request['id'], 'done': True})
                elif request['action'] == 'transcribe':
                    text = engines.transcribe(base64.b64decode(request['pcm'], validate=True), language, cancelled)
                    emit({'id': request['id'], 'text': text, 'done': True})
                elif request['action'] == 'speak':
                    for pcm in engines.speak(request['text'], language):
                        emit({'id': request['id'], 'pcm': base64.b64encode(pcm).decode()})
                    emit({'id': request['id'], 'done': True})
                else:
                    raise ValueError('Unknown local speech action')
        except InterruptedError:
            emit({'id': request.get('id'), 'cancelled': True, 'done': True})
        except Exception as error:
            emit({'id': request.get('id'), 'error': str(error)[:800]})


if __name__ == '__main__':
    main(sys.argv[1])
