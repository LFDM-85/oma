#!/usr/bin/env python3
"""Development-only tool serialization probe. Never executes returned commands."""
import argparse,json,time,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--model',default='qwen3.5:4b');p.add_argument('--url',default='http://127.0.0.1:11437');p.add_argument('--output',type=Path,required=True)
a=p.parse_args();assert not a.output.exists()
cases=[('ja','月曜日の予定です。'),('en','Plans for Monday.'),('ja','\n先頭に改行があります。'),('en','  Keep these spaces.  ')]
with a.output.open('w') as out:
 for variant in ['string','object','lines']:
  field={'string':{'type':'string'},'object':{'type':'object','properties':{'text':{'type':'string'}},'required':['text'],'additionalProperties':False},'lines':{'type':'array','items':{'type':'string'}}}[variant]
  tool={'type':'function','function':{'name':'new_text_document','description':'Create a document with the exact requested content. Preserve every whitespace character. For an object, use its text field. For an array, each item is a line joined by newline.','parameters':{'type':'object','properties':{'content':field},'required':['content'],'additionalProperties':False}}}
  for language,expected in cases:
   for repeat in range(3):
    instruction=('新しい文書を作成してください。内容は次のJSON文字列をデコードしたものをそのまま使ってください: ' if language=='ja' else 'Create a document with exactly the decoded contents of this JSON string: ')+json.dumps(expected,ensure_ascii=False)
    if expected=='月曜日の予定です。':instruction='OmaTextの新しい文書に「月曜日の予定です。」と書いて。引用符は入れないで。'
    if expected=='Plans for Monday.':instruction='Create a new OmaText document containing exactly Plans for Monday. without quotation marks.'
    payload={'model':a.model,'messages':[{'role':'user','content':instruction}],'tools':[tool],'temperature':.2,'reasoning_effort':'none','max_tokens':1024,'stream':False}
    start=time.monotonic();row={'model':a.model,'variant':variant,'language':language,'repeat':repeat,'expected':expected}
    try:
     request=urllib.request.Request(a.url+'/v1/chat/completions',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
     response=json.load(urllib.request.urlopen(request,timeout=120));message=response['choices'][0]['message'];calls=message.get('tool_calls',[])
     row['calls']=calls
     args=json.loads(calls[0]['function']['arguments']);content=args['content']
     actual=content if variant=='string' else content['text'] if variant=='object' else '\n'.join(content)
     row.update(actual=actual,success=actual==expected)
    except Exception as error:row.update(success=False,error=str(error))
    row['seconds']=time.monotonic()-start;out.write(json.dumps(row,ensure_ascii=False)+'\n');out.flush();print(json.dumps(row,ensure_ascii=False),flush=True)
