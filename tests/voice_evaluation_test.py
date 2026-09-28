import importlib.util
from pathlib import Path
import unittest
import tempfile

class FrozenSourceTest(unittest.TestCase):
    def test_validation_snapshot_has_real_independent_dependencies_and_demo(self):
        spec=importlib.util.spec_from_file_location('freeze_source',Path(__file__).parent/'voice/evaluation/freeze-source.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'source';output=Path(directory)/'frozen'
            for name in ('runtime','demo','node_modules/example'):(root/name).mkdir(parents=True)
            (root/'runtime/main.mjs').write_text('export const n=1;')
            (root/'demo/run').write_text('#!/bin/sh\ntrue\n')
            (root/'node_modules/example/index.js').write_text('original')
            (root/'package-lock.json').write_text('{}')
            (root/'private.env').write_text('excluded')
            hashes=module.freeze(root,output,copy_dependencies=True)
            self.assertFalse((output/'node_modules').is_symlink())
            self.assertEqual((output/'demo/run').read_text(),'#!/bin/sh\ntrue\n')
            (root/'node_modules/example/index.js').write_text('changed')
            self.assertEqual((output/'node_modules/example/index.js').read_text(),'original')
            self.assertIn('demo/run',hashes)
            self.assertIn('package-lock.json',hashes)
            self.assertNotIn('node_modules/example/index.js',hashes)
            self.assertFalse((output/'private.env').exists())

PATH = Path(__file__).parent / 'voice/evaluation/metrics.py'

class MetricsTest(unittest.TestCase):
    def load(self):
        self.assertTrue(PATH.exists(), 'Evaluation metrics are not implemented')
        spec=importlib.util.spec_from_file_location('metrics', PATH)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    def test_playback_timing_requires_complete_matching_observations(self):
        import copy
        m=self.load()
        rows=[{'configuration':config,'language':lang,'id':f'{lang}-final-{i+1:02}',
               'text':str(i),'monitor_first_sound_ms':delay,'generation_ms':400,
               'generation_rtf':.2,'errors':[]} for lang in ('ja','en')
              for config,delay in [('baseline',1000),('candidate',700)] for i in range(20)]
        self.assertTrue(m.playback_timing(rows)['ja']['timing_gate'])
        self.assertFalse(m.playback_timing(rows[:-1])['en']['timing_gate'])
        duplicate=copy.deepcopy(rows);duplicate[-1]=duplicate[-2]
        self.assertFalse(m.playback_timing(duplicate)['en']['timing_gate'])
        bad=copy.deepcopy(rows);bad[-1]['text']='different input'
        self.assertFalse(m.playback_timing(bad)['en']['timing_gate'])
        bad=copy.deepcopy(rows);bad[-1]['errors']=['playback interrupted']
        self.assertFalse(m.playback_timing(bad)['en']['timing_gate'])
        bad=copy.deepcopy(rows);bad[-1]['monitor_first_sound_ms']=1100
        self.assertFalse(m.playback_timing(bad)['en']['timing_gate'])
        self.assertEqual(m.playback_timing(rows)['ja']['listening'],'pending')

    def test_missing_results_cannot_pass(self):
        m=self.load()
        cases=[{'id':'a','text':'abc','critical':[]},{'id':'b','text':'xyz','critical':[]}]
        report=m.recognition(cases,[{'id':'a','actual':'abc','seconds':1}])
        self.assertEqual(report['missing'],['b'])
        self.assertFalse(report['complete'])
        self.assertIsNone(report['cer'])

    def test_noise_is_separate_from_character_error_denominator(self):
        m=self.load()
        cases=[{'id':'a','text':'abc','critical':[['abc']]},{'id':'n','text':'','critical':[]}]
        report=m.recognition(cases,[{'id':'a','actual':'abd','seconds':1},{'id':'n','actual':'hello','seconds':.1}])
        self.assertAlmostEqual(report['cer'],1/3)
        self.assertEqual(report['false_activations'],1)
        self.assertEqual(report['critical_accuracy'],0)

    def test_critical_negation_cannot_pass_by_substring(self):
        m=self.load()
        self.assertFalse(m.critical_match('保存して閉じて', [['保存しない','保存せず']]))
        self.assertTrue(m.critical_match('保存せずに閉じて', [['保存しない','保存せず']]))

    def test_keyword_report_counts_alternatives_once_and_keeps_phrase_failures(self):
        m=self.load()
        cases=[{'id':'a','text':'Do not close the right window',
                'critical':[['do not close',"don't close"],['right']]}]
        report=m.recognition_keywords(cases,[{'id':'a','actual':"Don't close the left window"}])
        self.assertEqual(report['keyword_count'],2)
        self.assertEqual(report['matched_keywords'],1)
        self.assertEqual(report['keyword_accuracy'],.5)
        self.assertEqual(report['phrase_accuracy'],0)
        self.assertEqual(report['failures'][0]['missing_groups'],[['right']])

    def test_keyword_report_does_not_score_missing_recordings(self):
        m=self.load()
        report=m.recognition_keywords([{'id':'a','text':'Stop','critical':[['stop']]}],[])
        self.assertFalse(report['complete'])
        self.assertIsNone(report['keyword_accuracy'])
        self.assertIsNone(report['matched_keywords'])

    def test_gap_simulation_counts_late_second_chunk(self):
        m=self.load()
        self.assertAlmostEqual(m.playback_gaps([{'ready':1,'duration':2},{'ready':4,'duration':1}]),1)
        self.assertEqual(m.playback_gaps([{'ready':1,'duration':2},{'ready':2,'duration':1}]),0)

    def test_operation_matrix_keeps_missing_and_critical_failures(self):
        m=self.load()
        result=m.operations(['a','b'],[{'id':'a','repeat':0,'status':'passed','seconds':1}],1)
        self.assertEqual(result['successes'],1)
        self.assertEqual(result['expected'],2)
        self.assertFalse(result['complete'])
        self.assertFalse(result['gate'])
        rows=[{'id':'a','repeat':0,'status':'passed','seconds':1},{'id':'b','repeat':0,'status':'failed','critical_error':True,'seconds':2}]
        result=m.operations(['a','b'],rows,1,minimum_successes=1)
        self.assertEqual(result['critical_errors'],1)
        self.assertFalse(result['gate'])

    def test_wrong_assistant_closure_remains_critical_in_older_raw_results(self):
        m=self.load()
        message='O.M.A. ended the conversation instead of completing the requested operation'
        rows=[{'id':'a','repeat':0,'status':'failed','critical_error':False,'error':str([message])}]
        report=m.operations(['a'],rows,1,minimum_successes=0)
        self.assertEqual(report['critical_errors'],1)
        self.assertFalse(report['gate'])
        self.assertFalse(rows[0]['critical_error'], 'Keep the raw observation unchanged')

    def test_duplicate_results_rejected(self):
        m=self.load()
        with self.assertRaises(ValueError):
            m.recognition([{'id':'a','text':'x','critical':[]}],[{'id':'a','actual':'x'},{'id':'a','actual':'x'}])

    def test_supplement_only_fills_never_run_trials(self):
        spec=importlib.util.spec_from_file_location('supplement',PATH.parent/'complete-agent-run.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        old=[{'language':'en','id':'a','repeat':0,'status':'failed'},
             {'language':'en','id':'a','repeat':1,'status':'not_run'}]
        new=[{'language':'en','id':'a','repeat':0,'status':'passed'}]
        merged=module.complete_rows(old,new,1)
        self.assertEqual([r['status'] for r in merged],['failed','passed'])
        self.assertEqual(old[1]['status'],'not_run')
        with self.assertRaises(ValueError):module.complete_rows(old,new,0)
        with self.assertRaises(ValueError):module.complete_rows(old,new,2)
        with self.assertRaises(ValueError):module.complete_rows(old,new+new,1)

class AgentChecksTest(unittest.TestCase):
    def test_only_disposable_fixture_loss_can_be_continued_explicitly(self):
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_failure_policy',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        fixture={'critical_error':True,'critical_kind':'unsaved_fixture_loss'}
        self.assertTrue(module.should_stop_after_failure(fixture,False))
        self.assertFalse(module.should_stop_after_failure(fixture,True))
        self.assertTrue(module.should_stop_after_failure({'critical_error':True,'critical_kind':'unrelated_window'},True))
        self.assertTrue(module.should_stop_after_failure({'critical_error':True},True))
        blocked={'critical_error':True,'critical_kind':'blocked_outside_workspace_target'}
        self.assertTrue(module.should_stop_after_failure(blocked,True,False))
        self.assertFalse(module.should_stop_after_failure(blocked,False,True))
        self.assertTrue(module.should_stop_after_failure({'critical_error':True,'critical_kind':'unrelated_window'},True,True))
        self.assertTrue(module.should_stop_after_failure({'critical_error':True},True,True))

    def test_keepalive_cannot_reopen_an_unexpectedly_closed_assistant(self):
        from unittest.mock import Mock,patch
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_keepalive',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        h=Mock();h.state.return_value={'panelOpened':False}
        with patch.object(module.v,'ipc') as ipc:
            module.keep_panel_alive(h)
            ipc.assert_not_called()
            h.state.return_value={'panelOpened':True}
            module.keep_panel_alive(h)
            ipc.assert_called_once_with('send','')

    def test_goodbye_waits_for_native_window_to_close(self):
        from unittest.mock import Mock,patch
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_goodbye',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        h=Mock();h.state.return_value={'panelOpened':False}
        with patch.object(module.v,'clients',side_effect=[[{'title':'O.M.A.'}],[],[]]), patch.object(module.time,'sleep'):
            module.check(h,{'check':'goodbye'},[])

    def test_blank_document_uses_editor_state_not_stale_clipboard(self):
        from unittest.mock import Mock
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_evaluation',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        h=Mock()
        h.document.return_value={'opened':True,'url':'','length':0,'editor':{'modalOpen':False}}
        h.content.side_effect=AssertionError('Empty editor cannot replace old clipboard contents')
        module.check(h,{'check':'blank'},[])
        h.content.assert_not_called()


class AgentResetTest(unittest.TestCase):
    def test_closing_animation_is_finished_before_next_trial(self):
        from unittest.mock import patch
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_close',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with patch.object(module.v,'clients',side_effect=[[{'title':'O.M.A.'}],[]]) as clients, patch.object(module.time,'sleep'):
            module.wait_face_closed()
        self.assertEqual(clients.call_count,2)

    def test_fixture_reload_happens_only_after_oma_is_closed(self):
        from unittest.mock import Mock,patch
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_reset',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        events=[];h=Mock();h.document.return_value={'opened':False}
        with patch.object(module.v,'ipc',side_effect=lambda *args:events.append(args)), patch.object(module.v,'run',side_effect=lambda *args:events.append(args)), patch.object(module.v,'wait_setting',side_effect=lambda *args:events.append(('wait',*args))), patch.object(module.time,'sleep'), patch.object(module.v,'clients',return_value=[]):
            module.reset_document(h)
        self.assertIn(('wait','panelOpened',False),events)
        self.assertLess(events.index(('wait','panelOpened',False)),events.index(('omarchy','plugin','disable',module.v.EDITOR)))

class ReportCompletenessTest(unittest.TestCase):
    def test_missing_first_sound_cannot_pass_with_other_nineteen(self):
        import sys,tempfile,json
        path=Path(__file__).parent/'voice/evaluation'
        sys.path.insert(0,str(path))
        from report import tts
        with tempfile.TemporaryDirectory() as root:
            dirs=[Path(root)/name for name in ['baseline','candidate']]
            for i,d in enumerate(dirs):
                d.mkdir()
                rows=[{'id':f'{lang}-{n}','language':lang,'first_sound_seconds':1 if i==0 else .7,'simulated_gap_seconds':0} for lang in ['ja','en'] for n in range(20)]
                if i:rows[0]['first_sound_seconds']=None
                (d/'results.jsonl').write_text('\n'.join(json.dumps(r) for r in rows))
            result=tts(*dirs)
            self.assertFalse(result['ja']['complete'])
            self.assertFalse(result['ja']['timing_gate'])

class SandboxMountTest(unittest.TestCase):
    def test_separate_tmp_harness_and_source_are_readable_but_only_case_is_writable(self):
        import tempfile,subprocess,sys,json
        path=Path(__file__).parent/'voice/evaluation/agent.py'
        spec=importlib.util.spec_from_file_location('agent_sandbox',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source';harness=root/'harness';home=root/'case'
            for d in [source,harness,home]:d.mkdir()
            for d in [source,harness]:(d/'marker').write_text(d.name)
            script="""import pathlib,sys
source,harness,home=map(pathlib.Path,sys.argv[1:])
assert (source/'marker').read_text()=='source'
assert (harness/'marker').read_text()=='harness'
for d in [source,harness]:
 try:(d/'marker').write_text('bad')
 except OSError:pass
 else:raise AssertionError('Code unexpectedly writable')
(home/'result').write_text('ok')
"""
            result=subprocess.run(module.sandbox_command(home,source,harness)+[sys.executable,'-c',script,str(source),str(harness),str(home)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual((home/'result').read_text(),'ok')

class VoiceWorkerIsolationTest(unittest.TestCase):
    def test_worker_cannot_write_host_files_but_can_use_its_private_workspace(self):
        import json,subprocess,sys
        path=Path(__file__).parent/'voice/evaluation/worker-sandbox.py'
        self.assertTrue(path.exists(),'Voice worker isolation is missing')
        spec=importlib.util.spec_from_file_location('worker_sandbox',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix='.oma-sandbox-test-',dir=Path.home()) as directory:
            root=Path(directory);profile=root/'profile';profile.mkdir();(profile/'workspace').mkdir()
            (profile/'.evaluation-profile.json').write_text(json.dumps({'kind':'oma-voice-evaluation'}))
            protected=root/'protected.txt';protected.write_text('preserved')
            code="import os,pathlib; p=pathlib.Path(os.environ['OMA_WORKSPACE']); (p/'created').write_text('owned'); blocked=False\ntry:pathlib.Path("+repr(str(protected))+").write_text('damage')\nexcept OSError:blocked=True\nassert blocked; assert os.environ['OMA_DATA_DIR']=="+repr(str(profile))
            result=subprocess.run(module.sandbox_command(profile,[])+[sys.executable,'-c',code],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(protected.read_text(),'preserved')
            self.assertEqual((profile/'workspace/created').read_text(),'owned')
            with self.assertRaises(ValueError):module.sandbox_command(root,[root])

if __name__=='__main__':unittest.main()
