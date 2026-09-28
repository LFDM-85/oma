# Opt-in billed integration: real GPT-Live backend and desktop, text input (not microphone).
# Requires O.M.A. and OmaText closed, and workspace 98 empty.
import subprocess,json,time

def run(*a):return subprocess.check_output(a).decode()
def j(*a):return json.loads(run(*a))
def ipc(*a):return run('omarchy-shell','io.github.komagata.oma',*a)
def clients():return j('hyprctl','-j','clients')
def dispatch(e):return run('hyprctl','dispatch',e)
def status():return json.loads(ipc('status'))
def wait_for(check,seconds=70):
 start=time.monotonic();last=None
 while time.monotonic()-start<seconds:
  s=status();rows=clients();v=(s['taskBusy'],s['backendStatus'],[(w['title'],w['floating'],w['at'],w['size']) for w in rows if w['workspace']['id']==98])
  if v!=last:print(round(time.monotonic()-start,2),v,flush=True);last=v
  if check(s,rows):return s,rows,time.monotonic()-start
  if s['error']:raise Exception(s['error'])
  time.sleep(.5)
 raise Exception('Timed out')
assert not status()['panelOpened']
assert not any(w['workspace']['id']==98 or 'OmaText' in w['title'] for w in clients())
original=j('hyprctl','-j','activeworkspace')['id']
monitor=next(m for m in j('hyprctl','-j','monitors') if m['focused'])
right=monitor['x']+round(monitor['width']/monitor['scale'])
try:
 dispatch('hl.dsp.focus({workspace="98"})')
 ipc('send','OmaTextで新規ファイルを開いて')
 s,rows,elapsed=wait_for(lambda s,r:s['docked'] and not s['taskBusy'])
 app=next(w for w in rows if 'OmaText' in w['title']);oma=next(w for w in rows if w['title']=='O.M.A.')
 run('grim','/tmp/oma-empty-open.png')
 assert app['title']=='Untitled — OmaText',app['title']
 document=j('omarchy-shell','shell','call','io.github.komagata.omatext','inspectState','')
 assert document['length']==0 and not document['url'] and not document['editor']['modalOpen'], document
 assert not oma['floating'] and app['at'][0]+app['size'][0]<=oma['at'][0], 'Overlapping windows'
 assert oma['at'][0]+oma['size'][0]<=right, 'OMA off screen'
 print('OPEN PASS',round(elapsed,2),flush=True)
 ipc('send','今開いたOmaTextを閉じて')
 s,rows,elapsed=wait_for(lambda s,r:not any(w['address']==app['address'] for w in r) and not s['taskBusy'])
 assert s['panelOpened'] and not s['docked'];oma=next(w for w in rows if w['title']=='O.M.A.');assert oma['floating']
 print('CLOSE PASS',round(elapsed,2),flush=True)
 ipc('send','バイバイ')
 s,rows,elapsed=wait_for(lambda s,r:not s['panelOpened'] and not any(w['title'].startswith('O.M.A.') for w in r),25)
 print('BYE PASS',round(elapsed,2),flush=True)
finally:
 run('grim','/tmp/oma-empty-final.png')
 ipc('restoreFloating');ipc('stop')
 for w in clients():
  if w['workspace']['id']==98 and 'OmaText' in w['title']:dispatch('hl.dsp.window.close({window="address:'+w['address']+'"})')
 dispatch('hl.dsp.focus({workspace="'+str(original)+'"})')
