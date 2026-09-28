# Opt-in billed integration: creates a disposable terminal on empty workspace 98.
import subprocess,time,json
j=lambda args:json.loads(subprocess.check_output(args))
def ipc(*a):return subprocess.check_output(['omarchy-shell','io.github.komagata.oma',*a]).decode()
def dispatch(e):return subprocess.check_output(['hyprctl','dispatch',e])
assert not json.loads(ipc('status'))['panelOpened'], 'Close the conversation before running this test'
assert not any(w['class']=='oma-layout-ai' for w in j(['hyprctl','-j','clients']))
original=j(['hyprctl','-j','activeworkspace'])['id']
try:
 assert not any(w['workspace']['id']==98 for w in j(['hyprctl','-j','clients']))
 dispatch('hl.dsp.focus({workspace="98"})');ipc('viewMode','normal')
 ipc('send','動作確認です。kitty --detach --class oma-layout-ai --title OMA-layout-AI を使って新しい端末アプリを開いてください。その端末には何も入力しないでください。')
 start=time.monotonic();state={}
 while time.monotonic()-start<55:
  state=json.loads(ipc('status'))
  if state.get('docked'):break
  if state.get('error'):raise Exception(state['error'])
  time.sleep(1)
 assert state.get('docked'), 'AI did not accompany the application'
 rows=j(['hyprctl','-j','clients']);app=next(w for w in rows if w['class']=='oma-layout-ai');oma=next(w for w in rows if w['title']=='O.M.A.')
 assert not oma['floating'] and app['at'][0]+app['size'][0]<=oma['at'][0]
 print('AI opened application and tiled alongside:',{'app':app['size'],'oma':oma['size'],'seconds':round(time.monotonic()-start)},flush=True)
 dispatch('hl.dsp.window.close({window="address:'+app['address']+'"})');time.sleep(2)
 assert not json.loads(ipc('status'))['docked']
 oma=next(w for w in j(['hyprctl','-j','clients']) if w['title']=='O.M.A.')
 assert oma['floating'];print('Automatic return after app closure: PASS',flush=True)
finally:
 ipc('restoreFloating');ipc('stop')
 for w in j(['hyprctl','-j','clients']):
  if w['class']=='oma-layout-ai':dispatch('hl.dsp.window.close({window="address:'+w['address']+'"})')
 dispatch('hl.dsp.focus({workspace="'+str(original)+'"})')
