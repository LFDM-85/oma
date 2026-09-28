import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).parent/'voice/evaluation'
class ReadingTest(unittest.TestCase):
 def module(self):
  path=ROOT/'reading_metrics.py'
  self.assertTrue(path.exists(),'Reading scorer not implemented')
  spec=importlib.util.spec_from_file_location('reading_metrics',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_preserves_pronunciation_differences(self):
  m=self.module()
  self.assertEqual(m.normalize('ニンキ、です。'),'にんきです')
  self.assertNotEqual(m.normalize('ひとけ'),m.normalize('にんき'))
  with self.assertRaises(ValueError):m.normalize('人気')
 def test_long_vowel_and_particle_alternatives_explicit_only(self):
  m=self.module()
  self.assertEqual(m.score(['きょうわ'], 'キョウワ')['edits'],0)
  self.assertEqual(m.score(['きょうわ','きょーわ'], 'きょーわ')['edits'],0)
  self.assertGreater(m.score(['きょうわ'],'きよわ')['edits'],0)
 def test_missing_case_never_passes(self):
  m=self.module();r=m.summarize([{'id':'a','readings':['にんき']},{'id':'b','readings':['ひとけ']}],[{'id':'a','actual':'にんき'}])
  self.assertFalse(r['complete']);self.assertIsNone(r['kana_error_rate']);self.assertEqual(r['missing'],['b'])
 def test_phonetic_targets_keep_wrong_readings_distinct(self):
  if importlib.util.find_spec('pyopenjtalk') is None:self.skipTest('Optional phonetic dependency; run with local speech venv')
  m=self.module();self.assertTrue(hasattr(m,'phonetic_target_match'),'Phonetic matching missing')
  self.assertTrue(m.phonetic_target_match(['かいぎょう'],'かいぎょーしてください'))
  self.assertFalse(m.phonetic_target_match(['かいぎょう'],'かいごーしてください'))
  self.assertFalse(m.phonetic_target_match(['ひとけ'],'にんきのないみちです'))
  self.assertTrue(m.phonetic_target_match(['せいぶつ'],'せーぶつです'))
 def test_ctc_keeps_repeats_separated_by_blank(self):
  m=self.module();self.assertTrue(hasattr(m,'decode_ctc'),'CTC decoder missing')
  self.assertEqual(m.decode_ctc([1,1,0,1,2,2,0],{0:'<blank>',1:'か',2:'き'}),'かかき')
 def test_duplicate_or_unknown_rejected(self):
  m=self.module();cases=[{'id':'a','readings':['にんき']}]
  for rows in [[{'id':'b','actual':'にんき'}],[{'id':'a','actual':'にんき'}]*2]:
   with self.assertRaises(ValueError):m.summarize(cases,rows)
if __name__=='__main__':unittest.main()
