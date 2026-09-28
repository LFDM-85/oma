import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
import sys
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('voice_runner', Path(__file__).parent/'voice/run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class VoiceHarnessTest(unittest.TestCase):
    def test_voice_transcripts_use_the_private_evaluation_profile(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as directory:
            profile=Path(directory);sqlite3.connect(profile/'memory.sqlite').close()
            (profile/'manifest.json').write_text('{}')
            with patch.dict(runner.os.environ,{'OMA_DATA_DIR':str(profile)}):
                h=runner.VoiceDesktop(profile,profile,98,'local','en')
                try:self.assertEqual(Path(h.db.execute('PRAGMA database_list').fetchone()[2]),profile/'memory.sqlite')
                finally:h.db.close()

    def test_rename_evaluation_requires_source_removal_and_exact_fixture_bytes(self):
        spec=importlib.util.spec_from_file_location('operation_runner',Path(__file__).parent/'voice/evaluation/agent.py')
        agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
        with tempfile.TemporaryDirectory() as root:
            home=Path(root);case={'check':'rename','fixtureText':'Draft\r\nKeep!','renameTarget':'Trip log.txt'}
            h=Mock(case_home=home);h.document.return_value={}
            source=home/'note.txt';target=home/'Trip log.txt'
            source.write_bytes(case['fixtureText'].encode());target.write_bytes(source.read_bytes())
            with self.assertRaises(AssertionError):agent.check(h,case,[])
            source.unlink();agent.check(h,case,[])
            target.write_bytes(b'Draft\nKeep!')
            with self.assertRaises(AssertionError):agent.check(h,case,[])

    def test_development_document_expectation_comes_from_frozen_fixture(self):
        self.assertEqual(runner.expected_document({'expectedDocument':'Different document.'},'en'),'Different document.')
        self.assertEqual(runner.expected_document({},'ja'),runner.EXPECTED['ja'])
        with self.assertRaises(ValueError):runner.expected_document({'expectedDocument':None},'en')

    def test_microphone_cleanup_retries_transient_device_failure_and_is_bounded(self):
        with patch.object(runner,'ipc') as ipc, patch.object(runner,'wait_setting',side_effect=[AssertionError('AEC startup'),None]), patch.object(runner.time,'sleep'):
            runner.restore_microphone('original')
        self.assertEqual(ipc.call_count,2)
        with patch.object(runner,'ipc'), patch.object(runner,'wait_setting',side_effect=AssertionError('Unavailable')) as wait, patch.object(runner.time,'sleep'):
            with self.assertRaises(AssertionError):runner.restore_microphone('original')
        self.assertEqual(wait.call_count,3)

    def test_unrequested_closure_after_session_start_is_critical(self):
        h=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        h.session=1;h.events=[];h.started=0;h.guard=Mock()
        h.state=Mock(return_value={'taskBusy':False,'backendStatus':'idle','panelOpened':False})
        with self.assertRaises(runner.UnsafeOperation):h.wait('document ready',lambda:False)
        h.session=None
        with self.assertRaises(AssertionError):h.wait('microphone ready',lambda:False)


    def test_arithmetic_checks_do_not_accept_numbers_containing_the_answer(self):
        for text in ['2','答えは二です。','One plus one is two.','1 + 1 = 2','２です']:
            self.assertTrue(runner.numeric_reply(text,2),text)
        for text in ['12','十二です','twenty two','2.5','-2','two hundred']:
            self.assertFalse(runner.numeric_reply(text,2),text)
        self.assertFalse(runner.numeric_reply('fourteen',4))
        self.assertTrue(runner.numeric_reply('The answer is four.',4))

    def test_cleanup_cancels_owned_save_as_before_the_editor_dialog(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.workspace=98;harness.before={'old'};harness.guard=Mock()
        editor={'address':'0xe','pid':7,'workspace':{'id':98},'title':'Untitled — OmaText'}
        dialog={'address':'0xd','pid':7,'workspace':{'id':98},'title':'Save As'}
        foreign={'address':'old','pid':7,'workspace':{'id':98},'title':'Save As'}
        harness.editor_window=Mock(return_value=editor)
        harness.document=Mock(side_effect=[{'editor':{'modalOpen':True}}, {'editor':{'modalOpen':True}}, {'editor':{'modalOpen':False}}])
        with patch.object(runner,'clients',side_effect=[[editor,dialog,foreign],[editor,foreign]]), patch.object(runner,'run') as run, patch.object(runner.time,'sleep'):
            harness.cancel_editor_dialogs()
        focuses=[call.args[-1] for call in run.call_args_list if call.args[0]=='hyprctl']
        self.assertEqual(focuses,['hl.dsp.focus({window="address:0xd"})','hl.dsp.focus({window="address:0xe"})'])

    def test_native_inspection_reads_actual_buffer_without_keyboard_or_clipboard(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.guard=Mock();harness.editor_window=Mock(return_value={'address':'0x20'})
        snapshot={'opened':True,'text':'Actual\n文章','busy':False,'modalOpen':False}
        with patch.dict(runner.os.environ,{'OMA_EVALUATION_EDITOR_INSPECTION':'1'}), patch.object(runner,'run',return_value=json.dumps(snapshot)) as run:
            self.assertEqual(harness.content(),'Actual\n文章')
            run.assert_called_once_with('omarchy-shell','shell','call',runner.EDITOR,'inspectEvaluationDocument','')
        snapshot['busy']=True
        with patch.dict(runner.os.environ,{'OMA_EVALUATION_EDITOR_INSPECTION':'1'}), patch.object(runner,'run',return_value=json.dumps(snapshot)):
            with self.assertRaises(RuntimeError):harness.content()

    def test_content_read_clears_stale_clipboard_and_paces_modifier_events(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.workspace=98;harness.guard=Mock()
        harness.editor_window=Mock(return_value={'address':'0x20'})
        harness.document=Mock(return_value={'active':True,'length':4,'editor':{'modalOpen':False}})
        calls=[]
        def run(*args):
            calls.append(args)
            return 'Text' if args[0]=='wl-paste' else ''
        with patch.object(runner.subprocess,'run',return_value=Mock(returncode=1,stdout=b'')), patch.object(runner,'run',side_effect=run), patch.object(runner.time,'sleep'), patch.object(runner,'json_run',return_value={'id':98}):
            self.assertEqual(harness.content(),'Text')
        key=next(c for c in calls if c[0]=='wtype' and 'ctrl' in c)
        self.assertIn('-s',key)
        self.assertLess(calls.index(('wl-copy','--clear')),calls.index(key))

    def test_unsaved_choice_requires_retention_but_not_a_native_dialog(self):
        doc={'opened':True,'modified':True,'length':13,'editor':{'modalOpen':False}}
        self.assertTrue(runner.unsaved_choice_ready(doc,13,replied=True,busy=False))
        self.assertFalse(runner.unsaved_choice_ready(doc,13,replied=False,busy=False))
        with self.assertRaises(runner.UnsafeOperation):
            runner.unsaved_choice_ready({'opened':False},13,replied=True,busy=False)
        with self.assertRaises(runner.UnsafeOperation):
            runner.unsaved_choice_ready({**doc,'length':0},13,replied=True,busy=False)

    def test_unrelated_window_disappearance_is_a_critical_failure(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.workspace=98;harness.before={'0x123'}
        harness.state=Mock(return_value={'error':''})
        with patch.object(runner,'json_run',return_value={'id':98}), patch.object(runner,'clients',return_value=[]):
            with self.assertRaisesRegex(runner.UnsafeOperation,'unrelated window'):
                harness.guard()

    def test_english_case_changes_the_app_language_before_starting(self):
        state={'panelOpened':False,'voiceProvider':'local','responseLanguage':'ja'}
        calls=[]
        def ipc(*args):
            calls.append(args)
            if args[0]=='responseLanguage':
                state['responseLanguage']=args[1]
            return json.dumps(state)
        with patch.object(runner,'ipc',side_effect=ipc), patch.object(runner,'wait_setting') as wait:
            runner.configure('local','en')
        self.assertIn(('responseLanguage','en'),calls)
        wait.assert_called_once_with('responseLanguage','en')
        self.assertEqual(state['responseLanguage'],'en')

    def test_repetitions_have_independent_results_and_include_neighbor_case(self):
        self.assertTrue(hasattr(runner, 'matrix_results'), 'Repeated evaluation matrix is missing')
        self.assertIn('empty-with-neighbor', runner.SCENARIOS)
        results = runner.matrix_results(['local'], ['ja', 'en'], runner.SCENARIOS, 3)
        self.assertEqual(len(results), 60)
        self.assertEqual(len({(r['language'], r['case'], r['repeat']) for r in results}), 60)
        self.assertTrue(all(r['status'] == 'not_run' for r in results))

    def windows(self):
        return ({'workspace':{'id':98},'floating':False,'at':[12,38],'size':[890,670]},
                {'workspace':{'id':98},'floating':False,'at':[916,38],'size':[352,670]})

    def test_scaled_monitor_accepts_the_verified_layout(self):
        runner.assert_side_by_side(*self.windows(), {'x':0,'y':0,'width':1920,'height':1080,'scale':1.5})

    def test_detects_the_reported_remap_and_offscreen_regressions(self):
        app, oma = self.windows()
        monitor={'x':0,'y':0,'width':1920,'height':1080,'scale':1.5}
        oma['floating']=True
        with self.assertRaisesRegex(AssertionError,'floating'):
            runner.assert_side_by_side(app,oma,monitor)
        oma['floating']=False
        oma['size']=[600,670]
        with self.assertRaisesRegex(AssertionError,'Off-screen'):
            runner.assert_side_by_side(app,oma,monitor)
        oma['size']=[352,670]
        oma['workspace']['id']=2
        with self.assertRaisesRegex(AssertionError,'different workspaces'):
            runner.assert_side_by_side(app,oma,monitor)

    def test_overlap_is_a_failure_even_when_both_windows_fit(self):
        app,oma=self.windows();oma['at'][0]=800
        with self.assertRaisesRegex(AssertionError,'Overlapping'):
            runner.assert_side_by_side(app,oma,{'x':0,'y':0,'width':1920,'height':1080,'scale':1.5})

    def test_workspace_change_stops_the_harness_before_more_input(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.workspace=98
        harness.state=Mock(return_value={'error':''})
        with patch.object(runner,'json_run',return_value={'id':2}):
            with self.assertRaisesRegex(RuntimeError,'Workspace focus changed'):
                harness.guard()
        harness.state.assert_not_called()

    def test_failed_microphone_restore_still_releases_virtual_audio(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.provider='local';harness.language='en';harness.steps=[];harness.events=[]
        harness.local_diagnostic=Mock(return_value=None)
        harness.state=Mock(return_value={});harness.transcript=Mock(return_value='')
        harness.db=Mock();harness.original=2;harness.workspace=98;harness.before=set()
        harness.microphone='original';harness.source_module='42';harness.module='41'
        harness.document=Mock(return_value={});harness.fixture_url=None
        with tempfile.TemporaryDirectory() as directory:
            harness.artifacts=Path(directory)
            with patch.object(runner,'ipc'), patch.object(runner,'clients',return_value=[]), patch.object(runner,'run') as command, patch.object(runner,'wait_setting',side_effect=TimeoutError('restore')):
                with self.assertRaisesRegex(TimeoutError,'restore'):
                    harness.finish()
                command.assert_any_call('pactl','unload-module','42')
                command.assert_any_call('pactl','unload-module','41')

    def test_partial_local_log_does_not_break_cleanup_or_export_reasoning(self):
        harness=runner.VoiceDesktop.__new__(runner.VoiceDesktop)
        harness.provider='local';harness.started_wall=0
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            session=home/'.local/share/oma/local/pi/sessions'
            session.mkdir(parents=True)
            (session/'test.jsonl').write_text('{"message":{"role":"assistant","stopReason":"length","content":[{"thinking":"private"}]}}\n{"partial')
            with patch.object(runner.Path,'home',return_value=home):
                diagnostic=harness.local_diagnostic()
            self.assertEqual(diagnostic['stopReason'],'length')
            self.assertNotIn('content',diagnostic)

    def test_cleanup_failure_stops_matrix_even_with_keep_going(self):
        original={'panelOpened':False,'voiceProvider':'gpt-live','responseLanguage':'','viewMode':'normal','microphoneTarget':'original'}
        with tempfile.TemporaryDirectory() as directory:
            argv=['voice-tests','--providers','local','--languages','en','--cases','empty','modes','--keep-going','--artifacts',directory]
            harness=Mock();harness.finish.side_effect=RuntimeError('Cannot restore microphone')
            with patch.object(sys,'argv',argv), patch.object(runner,'ipc',return_value=json.dumps(original)), patch.object(runner,'json_run',return_value={'id':2}), patch.object(runner,'configure'), patch.object(runner,'wait_setting'), patch.object(runner,'run'), patch.object(runner.time,'sleep'), patch.object(runner,'VoiceDesktop',return_value=harness) as factory, patch.object(runner,'scenario'):
                with self.assertRaisesRegex(RuntimeError,'Cannot restore microphone'):
                    runner.main()
                self.assertEqual(factory.call_count,1)
            results=json.loads(next(Path(directory).rglob('results.json')).read_text())
            self.assertEqual(results[0]['status'],'cleanup_failed')
            self.assertEqual(results[1]['status'],'not_run')


if __name__ == '__main__':
    unittest.main()
