import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parent / 'voice/evaluation'
sys.path.insert(0, str(ROOT))

class STTBenchmarkTest(unittest.TestCase):
    def module(self):
        spec = importlib.util.spec_from_file_location('stt_benchmark', ROOT / 'stt.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_failures_are_not_ranked_as_zero_error(self):
        m = self.module()
        cases = [dict(id='a', language='en', text='Hello', source='synthetic', condition='clean', critical=[['Hello']]),
                 dict(id='b', language='en', text='', source='generated-noise', condition='silence')]
        rows = [dict(id='a', language='en', actual='Hello', seconds=.2, duration=1),
                dict(id='b', language='en', actual='', seconds=.1, duration=1)]
        good = m.score(cases, rows, 'en')
        self.assertEqual(good['wer'], 0)
        self.assertEqual(good['rtf']['median'], .2)
        failed = m.score(cases, rows[:1], 'en')
        self.assertFalse(failed['complete'])
        self.assertIsNone(failed['wer'])
        with self.assertRaises(ValueError):
            m.score(cases, rows + [dict(id='unexpected', language='en', actual='', seconds=0)], 'en')

    def test_source_groups_and_literal_text_remain_separate(self):
        m = self.module()
        cases = [dict(id='a', language='en', text='Hello, world!', source='human', condition='clean'),
                 dict(id='b', language='en', text='Hello world', source='synthetic', condition='quiet')]
        rows = [dict(id='a', language='en', actual='Hello world', seconds=.2, duration=1),
                dict(id='b', language='en', actual='Hello word', seconds=.3, duration=1)]
        score = m.score(cases, rows, 'en')
        self.assertEqual(score['literal_exact_count'], 0)
        self.assertEqual(score['normalized_exact_count'], 1)
        self.assertEqual(score['wer'], .25)
        self.assertEqual(score['sources'], {'human': 1, 'synthetic': 1})
        self.assertEqual(score['by_source']['human']['cer'], 0)
        self.assertGreater(score['by_source']['synthetic']['cer'], 0)

    def test_report_escapes_transcripts_and_keeps_errors(self):
        m = self.module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = {'runs': [{'model': '<model>', 'repeat': 0, 'metadata': {'peak_rss_kib': 1024},
                             'scores': {'en': {'complete': False, 'cer': None, 'wer': None,
                                              'critical_accuracy': None, 'false_activations': None,
                                              'latency': {'median': None, 'p95': None},
                                              'rtf': {'median': None}}},
                             'failures': [{'expected': '<script>alert(1)</script>', 'error': 'model missing'}]}]}
            m.write_report(root, data)
            page = (root / 'index.html').read_text()
            self.assertNotIn('<script>alert(1)</script>', page)
            self.assertIn('&lt;script&gt;', page)
            self.assertIn('model missing', page)
            self.assertIn('incomplete', page)

class TTSComparisonTest(unittest.TestCase):
    def test_missing_audio_or_readback_never_passes_as_complete(self):
        import json
        from corpus import cases, corpus_hash
        spec = importlib.util.spec_from_file_location('tts_report', ROOT / 'tts-report.py')
        module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory);model = root / 'model';model.mkdir()
            (model/'config.json').write_text(json.dumps({'split': 'final', 'corpus_sha256': corpus_hash()}))
            rows = []
            for lang in ['ja', 'en']:
                rows.extend(dict(id=c['id'], language=lang, text=c['text'], seconds=1, first_sound_seconds=1, rtf=.5, simulated_gap_seconds=0) for c in cases(lang, 'final')[:20])
            def save():
                (model/'results.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
            save();back = root/'readback.jsonl';back.write_text('')
            result = module.compare([model], back)['models']['model']['languages']['ja']
            self.assertTrue(result['complete'])
            self.assertFalse(result['readback_complete'])
            self.assertIsNone(result['readback_cer_proxy'])
            rows.pop(0);save()
            result = module.compare([model], back)['models']['model']['languages']['ja']
            self.assertFalse(result['complete'])
            self.assertEqual(len(result['missing']), 1)
            rows[0]['text'] = 'Changed reference';save()
            with self.assertRaises(ValueError):module.compare([model], back)

if __name__ == '__main__':
    unittest.main()
