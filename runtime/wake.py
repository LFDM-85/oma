"""Offline wake phrase recognition. Never emits transcripts or writes audio."""
import json, sys
from wake_match import is_wake, EnglishWake, ENGLISH_GRAMMAR
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
# O.M.A. is not in the Japanese dictionary; these words provide its sounds.
recognizers = [(KaldiRecognizer(Model(sys.argv[1]), 16000, json.dumps(['ヘイ オー マ', 'ヘイ 大間', 'ヘイ オマ', '[unk]'], ensure_ascii=False)), is_wake)]
# The English model is optional so installations from before it still wake.
if len(sys.argv) > 2:
    recognizers.append((KaldiRecognizer(Model(sys.argv[2]), 16000, json.dumps(ENGLISH_GRAMMAR)), EnglishWake().accept))
for recognizer, _ in recognizers:
    recognizer.SetWords(True)
print('{"ready":true}', flush=True)
while chunk := sys.stdin.buffer.read(3200):
    for recognizer, matches in recognizers:
        if recognizer.AcceptWaveform(chunk) and matches(json.loads(recognizer.Result())):
            print('{"wake":true}', flush=True)
            for other, _ in recognizers:
                other.Reset()
            break
