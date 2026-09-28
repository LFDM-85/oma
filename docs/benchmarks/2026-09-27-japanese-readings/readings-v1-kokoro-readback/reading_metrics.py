"""Kana-only readback proxies. Never turn recognized kanji back into a guessed reading."""
import unicodedata

def normalize(text):
 text=unicodedata.normalize('NFKC',text)
 out=[]
 for c in text:
  if '\u30a1'<=c<='\u30f6':c=chr(ord(c)-0x60)
  if '\u3041'<=c<='\u3096' or c=='ー':out.append(c)
  elif c.isspace() or unicodedata.category(c).startswith('P'):continue
  else:raise ValueError('Non-kana recognition output: '+repr(c))
 return ''.join(out)

def distance(a,b):
 prev=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  row=[i]
  for j,y in enumerate(b,1):row.append(min(row[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
  prev=row
 return prev[-1]

def score(readings,actual):
 actual=normalize(actual)
 candidates=[normalize(r) for r in readings]
 if not candidates or any(not r for r in candidates):raise ValueError('Empty reference')
 reference=min(candidates,key=lambda r:(distance(r,actual)/len(r),distance(r,actual)))
 return {'reference':reference,'actual':actual,'edits':distance(reference,actual),'reference_chars':len(reference),'exact':reference==actual}

def summarize(cases,rows):
 expected={c['id']:c for c in cases};ids=[r['id'] for r in rows]
 if len(ids)!=len(set(ids)) or set(ids)-set(expected):raise ValueError('Invalid result IDs')
 missing=sorted(set(expected)-set(ids));errors=[r for r in rows if r.get('error')]
 scored=[dict(id=r['id'],**score(expected[r['id']]['readings'],r['actual'])) for r in rows if not r.get('error')]
 complete=not missing and not errors
 return {'complete':complete,'missing':missing,'errors':errors,'expected':len(cases),'observed':len(rows),'exact':sum(r['exact'] for r in scored),'kana_error_rate':sum(r['edits'] for r in scored)/sum(r['reference_chars'] for r in scored) if complete and scored else None,'scores':scored,'interpretation':'Acoustic kana-ASR proxy, not confirmed pronunciation accuracy'}
