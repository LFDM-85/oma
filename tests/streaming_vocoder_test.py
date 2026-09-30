"""Offline PCM checks for the production FFT worker; no audio device or API."""
from pathlib import Path
import subprocess
import threading
import unittest
import numpy as np

WORKER = Path(__file__).resolve().parent.parent / 'runtime/streaming-vocoder.py'


def render(pcm, fragmented=False):
    if not fragmented:
        return subprocess.run(['python3', '-u', str(WORKER)], input=pcm, capture_output=True, check=True).stdout
    process = subprocess.Popen(['python3', '-u', str(WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def write():
        for start in range(0, len(pcm), 137):
            process.stdin.write(pcm[start:start + 137])
            process.stdin.flush()
        process.stdin.close()

    thread = threading.Thread(target=write)
    thread.start()
    out = process.stdout.read()
    error = process.stderr.read()
    thread.join()
    code = process.wait(timeout=10)
    process.stdout.close()
    process.stderr.close()
    if code:
        raise AssertionError(error.decode())
    return out


class VocoderTest(unittest.TestCase):
    def test_packet_boundaries_preserve_pcm_and_lookahead(self):
        time = np.arange(24000) / 24000
        pcm = np.rint(6000 * np.sin(2 * np.pi * 330 * time) + 1800 * np.sin(2 * np.pi * 1100 * time)).astype('<i2').tobytes()
        output = render(pcm)
        self.assertEqual(output, render(pcm, fragmented=True))
        # 25 input hops retain four hops of FFT lookahead, exactly as before.
        self.assertEqual(len(output), 21 * 960 * 2)
        samples = np.frombuffer(output, dtype='<i2').astype(float)
        self.assertGreater(np.sqrt(np.mean(samples ** 2)), 500)
        self.assertLess(np.max(np.abs(samples)), 32767)
        self.assertNotEqual(output, pcm[:len(output)])

    def test_silence_stays_silent_and_new_process_resets_state(self):
        pcm = bytes(24000 * 2)
        self.assertEqual(render(pcm), bytes(21 * 960 * 2))
        self.assertEqual(render(pcm, fragmented=True), render(pcm))


if __name__ == '__main__':
    unittest.main()
