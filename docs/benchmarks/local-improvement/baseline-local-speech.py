"""Persistent offline STT/TTS worker. stdout is exclusively the JSON protocol."""
import base64
import contextlib
import io
import json
import math
import pathlib
import subprocess
import sys
import wave


def voice_for(language):
    return {
        'en': ('a', 'am_michael'), 'ja': ('j', 'jm_kumo'),
        'zh': ('z', 'zm_yunxi'), 'es': ('e', 'em_alex'),
        'fr': ('f', 'ff_siwis'), 'hi': ('h', 'hm_omega'),
        'it': ('i', 'im_nicola'), 'pt': ('p', 'pm_alex'),
    }.get(language)


class Engines:
    def __init__(self, home):
        self.home = pathlib.Path(home)
        self.whisper = None
        self.model = None
        self.pipelines = {}

    def transcribe(self, pcm, language):
        import numpy as np
        from scipy.signal import resample_poly
        from faster_whisper import WhisperModel
        if self.whisper is None:
            self.whisper = WhisperModel(str(self.home / 'whisper'), device='cpu',
                                        compute_type='int8', cpu_threads=4,
                                        local_files_only=True)
        audio = resample_poly(np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768, 2, 3)
        segments, _ = self.whisper.transcribe(audio, language=language, beam_size=5,
                                              vad_filter=True, condition_on_previous_text=False,
                                              initial_prompt='Voice commands to the O.M.A. desktop assistant. Applications, documents, conversation history. O.M.A., OmaText.')
        return ''.join(segment.text for segment in segments).strip()

    def speak(self, text, language):
        import numpy as np
        selection = voice_for(language)
        if selection:
            import torch
            from kokoro import KModel, KPipeline
            torch.set_num_threads(4)
            code, voice = selection
            if self.model is None:
                self.model = KModel(repo_id='hexgrad/Kokoro-82M').eval()
            if code not in self.pipelines:
                self.pipelines[code] = KPipeline(lang_code=code, model=self.model,
                                                 repo_id='hexgrad/Kokoro-82M')
            for result in self.pipelines[code](text, voice=voice, speed=1):
                yield (np.clip(result.audio.numpy(), -1, 32767/32768) * 32768).astype('<i2').tobytes()
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
