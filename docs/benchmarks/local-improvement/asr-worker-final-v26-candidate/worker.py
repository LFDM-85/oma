"""Persistent offline STT/TTS worker. stdout is exclusively the JSON protocol."""
import base64
import contextlib
import io
import json
import math
import os
import pathlib
import subprocess
import sys
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


class Engines:
    def __init__(self, home):
        self.home = pathlib.Path(home)
        config = self.home / 'speech.json'
        self.stt = json.loads(config.read_text()).get('stt', 'whisper-small') if config.exists() else 'whisper-small'
        if self.stt not in ('whisper-small', 'qwen3-asr-1.7b'):
            raise ValueError('Unknown local STT model: ' + str(self.stt))
        self.asr_model = None
        self.asr_processor = None
        self.whisper = None
        self.model = None
        self.pipelines = {}

    def asr_backend(self, language):
        return self.stt if language in QWEN_LANGUAGES else 'whisper-small'

    def transcribe(self, pcm, language):
        import numpy as np
        from scipy.signal import resample_poly
        from faster_whisper import WhisperModel
        audio = resample_poly(np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768, 2, 3)
        if self.asr_backend(language) == 'qwen3-asr-1.7b':
            return self.transcribe_qwen(audio, language)
        if self.whisper is None:
            self.whisper = WhisperModel(str(self.home / 'whisper'), device='cpu',
                                        compute_type='int8', cpu_threads=4,
                                        local_files_only=True)
        segments, _ = self.whisper.transcribe(audio, language=language, beam_size=5,
                                              vad_filter=True, condition_on_previous_text=False,
                                              initial_prompt=ASR_CONTEXT)
        return ''.join(segment.text for segment in segments).strip()

    def transcribe_qwen(self, audio, language):
        import numpy as np
        import torch
        from faster_whisper.vad import get_speech_timestamps, collect_chunks
        torch.set_num_threads(speech_thread_count())
        segments = get_speech_timestamps(audio)
        if not segments:
            return ''
        chunks, _ = collect_chunks(audio, segments)
        if self.asr_model is None:
            from transformers import AutoProcessor, AutoModelForMultimodalLM
            model_id = 'Qwen/Qwen3-ASR-1.7B-hf'
            self.asr_processor = AutoProcessor.from_pretrained(model_id, local_files_only=True)
            self.asr_model = AutoModelForMultimodalLM.from_pretrained(
                model_id, dtype=torch.float32, local_files_only=True).eval()
        request = self.asr_processor.apply_transcription_request(
            audio=np.concatenate(chunks), language=language, prompt=ASR_CONTEXT
        ).to(self.asr_model.device, self.asr_model.dtype)
        with torch.inference_mode():
            result = self.asr_model.generate(**request, max_new_tokens=256, do_sample=False)
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
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            language = request.get('language') or 'en'
            with contextlib.redirect_stdout(sys.stderr):
                if request['action'] == 'transcribe':
                    text = engines.transcribe(base64.b64decode(request['pcm'], validate=True), language)
                    emit({'id': request['id'], 'text': text, 'done': True})
                elif request['action'] == 'speak':
                    for pcm in engines.speak(request['text'], language):
                        emit({'id': request['id'], 'pcm': base64.b64encode(pcm).decode()})
                    emit({'id': request['id'], 'done': True})
                else:
                    raise ValueError('Unknown local speech action')
        except Exception as error:
            emit({'id': request.get('id'), 'error': str(error)[:800]})


if __name__ == '__main__':
    main(sys.argv[1])
