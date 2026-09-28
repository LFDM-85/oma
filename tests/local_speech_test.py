import importlib.util
import pathlib
import unittest


class LocalSpeechTest(unittest.TestCase):
    def test_recognition_affinity_restores_existing_and_new_threads_after_cancellation(self):
        import subprocess,sys
        path=pathlib.Path(__file__).parents[1]/'runtime/local-speech.py'
        program='''
import importlib.util,json,os,pathlib,sys,tempfile,threading
spec=importlib.util.spec_from_file_location('worker',sys.argv[1])
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
original=os.sched_getaffinity(0);selected={min(original)}
stop=threading.Event();started=threading.Event()
def wait():started.set();stop.wait()
existing=threading.Thread(target=wait);existing.start();started.wait();started.clear()
new=None
try:
 try:
  with worker.recognition_affinity(list(selected)):
   assert os.sched_getaffinity(0)==selected
   assert os.sched_getaffinity(existing.native_id)==selected
   new=threading.Thread(target=wait);new.start();started.wait()
   assert os.sched_getaffinity(new.native_id)==selected
   raise InterruptedError('cancel')
 except InterruptedError:pass
 assert os.sched_getaffinity(0)==original
 assert os.sched_getaffinity(existing.native_id)==original
 assert os.sched_getaffinity(new.native_id)==original
 with tempfile.TemporaryDirectory() as home:
  (pathlib.Path(home)/'speech.json').write_text(json.dumps({'asr_cpu_affinity':list(selected)}))
  engine=worker.Engines(home)
  engine._transcribe=lambda pcm,language,cancelled:os.sched_getaffinity(0)
  assert engine.transcribe(b'', 'en')==selected
  assert os.sched_getaffinity(0)==original
finally:
 stop.set();existing.join()
 if new is not None:new.join()
'''
        result=subprocess.run([sys.executable,'-c',program,str(path)],capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_cancelled_recognition_releases_worker_without_reloading_engines(self):
        import json, select, subprocess, sys
        path=pathlib.Path(__file__).parents[1]/'runtime/local-speech.py'
        program='''
import importlib.util,sys,time
spec=importlib.util.spec_from_file_location('worker',sys.argv[1])
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class FakeEngines:
 def __init__(self,home):self.calls=0
 def transcribe(self,pcm,language,cancelled=None):
  self.calls+=1
  if self.calls==1:
   print('started',file=sys.stderr,flush=True)
   if cancelled is None:time.sleep(10)
   elif not cancelled.wait(10):raise RuntimeError('Cancellation never arrived')
   worker.check_cancelled(cancelled)
  return str(self.calls)
worker.Engines=FakeEngines
worker.main('.')
'''
        child=subprocess.Popen([sys.executable,'-u','-c',program,str(path)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            def send(message):
                child.stdin.write(json.dumps(message)+'\n');child.stdin.flush()
            send({'id':1,'action':'transcribe','pcm':'AAA=','language':'en'})
            self.assertTrue(select.select([child.stderr],[],[],2)[0],'Worker never started')
            self.assertEqual(child.stderr.readline().strip(),'started')
            send({'id':2,'action':'transcribe','pcm':'AAA=','language':'en'})
            send({'id':2,'action':'cancel'})
            send({'id':3,'action':'transcribe','pcm':'AAA=','language':'en'})
            send({'id':1,'action':'cancel'})
            self.assertTrue(select.select([child.stdout],[],[],2)[0],'Cancelled work still blocks the queue')
            first=json.loads(child.stdout.readline())
            self.assertEqual(first,{'id':1,'cancelled':True,'done':True})
            second=json.loads(child.stdout.readline())
            self.assertEqual(second,{'id':2,'cancelled':True,'done':True})
            third=json.loads(child.stdout.readline())
            self.assertEqual(third,{'id':3,'text':'2','done':True})
            child.stdin.close();child.wait(timeout=2)
            self.assertEqual(child.returncode,0)
        finally:
            if child.poll() is None:child.kill();child.wait()
            for stream in (child.stdin,child.stdout,child.stderr):stream.close()

    def test_preparation_loads_recognition_only_and_preserves_language_fallback(self):
        import tempfile,json,types
        from unittest.mock import Mock,patch
        path=pathlib.Path(__file__).parents[1]/'runtime/local-speech.py'
        spec=importlib.util.spec_from_file_location('local_speech',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        processor=Mock();model=Mock();model.eval.return_value=model
        processor_loader=Mock(return_value=processor);model_loader=Mock(return_value=model);whisper=Mock()
        modules={'torch':types.SimpleNamespace(set_num_threads=Mock(),float32='float32'),
                 'transformers':types.SimpleNamespace(AutoProcessor=types.SimpleNamespace(from_pretrained=processor_loader),AutoModelForMultimodalLM=types.SimpleNamespace(from_pretrained=model_loader)),
                 'faster_whisper':types.SimpleNamespace(WhisperModel=whisper)}
        with tempfile.TemporaryDirectory() as directory,patch.dict('sys.modules',modules):
            (pathlib.Path(directory)/'speech.json').write_text(json.dumps({'stt':'qwen3-asr-1.7b'}))
            engine=module.Engines(directory)
            engine.prepare_recognition('ja');engine.prepare_recognition('en')
            self.assertEqual(model_loader.call_count,1);self.assertEqual(processor_loader.call_count,1)
            self.assertIsNone(engine.model);self.assertEqual(engine.pipelines,{})
            engine.prepare_recognition('uk');engine.prepare_recognition('uk')
            self.assertEqual(whisper.call_count,1)
            self.assertTrue(model_loader.call_args.kwargs['local_files_only'])

    def test_speech_thread_budget_uses_available_cpus_without_oversubscription(self):
        path = pathlib.Path(__file__).parents[1] / 'runtime/local-speech.py'
        spec = importlib.util.spec_from_file_location('local_speech', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, 'speech_thread_count'), 'Speech CPU budget is missing')
        self.assertEqual(module.speech_thread_count(32), 8)
        self.assertEqual(module.speech_thread_count(2), 2)
        self.assertEqual(module.speech_thread_count(1), 1)

    def test_trimming_removes_only_digital_silence_and_keeps_onset_padding(self):
        path = pathlib.Path(__file__).parents[1] / 'runtime/local-speech.py'
        spec = importlib.util.spec_from_file_location('local_speech', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, 'trim_start_padding'), 'Leading silence trimming is missing')
        quiet = bytes(12000)
        speech = b'\x01\x00\xff\xff' + bytes(2000)
        self.assertEqual(module.trim_start_padding(quiet + speech), bytes(960) + speech)
        self.assertEqual(module.trim_start_padding(speech), speech)
        self.assertEqual(module.trim_start_padding(quiet), quiet)

    def test_optional_asr_selection_preserves_unsupported_languages(self):
        import tempfile,json
        path = pathlib.Path(__file__).parents[1] / 'runtime/local-speech.py'
        spec = importlib.util.spec_from_file_location('local_speech', path)
        module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(module.Engines(directory).asr_backend('ja'), 'whisper-small')
            (pathlib.Path(directory)/'speech.json').write_text(json.dumps({'stt':'qwen3-asr-1.7b'}))
            engine=module.Engines(directory)
            for language in ('ja','en','de','ar'):
                self.assertEqual(engine.asr_backend(language), 'qwen3-asr-1.7b')
            self.assertEqual(engine.asr_backend('uk'), 'whisper-small')
            (pathlib.Path(directory)/'speech.json').write_text(json.dumps({'stt':'misspelled-model'}))
            with self.assertRaises(ValueError):module.Engines(directory)

    def test_voice_language_selection_does_not_silently_use_english(self):
        path = pathlib.Path(__file__).parents[1] / 'runtime/local-speech.py'
        self.assertTrue(path.exists(), 'Local speech worker is missing')
        spec = importlib.util.spec_from_file_location('local_speech', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.voice_for('ja'), ('j', 'jm_kumo'))
        self.assertEqual(module.voice_for('en'), ('a', 'am_michael'))
        self.assertEqual(module.voice_for('fr'), ('f', 'ff_siwis'))
        self.assertIsNone(module.voice_for('de'))


if __name__ == '__main__':
    unittest.main()
