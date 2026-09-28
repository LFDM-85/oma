#!/usr/bin/env python3
"""Synthetic coordinate-adapter probe only. Never operates the desktop."""
import argparse,base64,hashlib,json,subprocess,time,urllib.request
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from environment import environment
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--model',required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
(a.output/'environment.json').write_text(json.dumps(environment(a.model),indent=2)+'\n')
font_path=Path(subprocess.check_output(['fc-match','-f','%{file}','sans'],text=True))
font=ImageFont.truetype(str(font_path),20)
(a.output/'font.json').write_text(json.dumps({'path':str(font_path),'sha256':hashlib.sha256(font_path.read_bytes()).hexdigest()},indent=2)+'\n')
with (a.output/'results.jsonl').open('w') as output:
 for index,(width,height,left,top) in enumerate([(1440,810,500,350),(900,600,130,180)]):
  image=Image.new('RGB',(width,height),'#101510');draw=ImageDraw.Draw(image)
  draw.rectangle((left-35,top-100,left+440,top+90),fill='#080b08',outline='#a0db8c',width=2)
  draw.text((left,top-75),'Save changes?',font=font,fill='#e3f5dc')
  draw.text((left,top-40),'The document has unsaved changes.',font=font,fill='#e3f5dc')
  boxes={}
  for offset,label in enumerate(['Cancel',"Don't Save",'Save']):
   box=(left+offset*140,top+15,left+offset*140+125,top+65);boxes[label]=box
   draw.rectangle(box,outline='#a0db8c',width=1)
   draw.text((box[0]+8,box[1]+12),label,font=font,fill='#e3f5dc')
  path=a.output/f'layout-{index}.png';image.save(path)
  (a.output/f'layout-{index}.json').write_text(json.dumps({'width':width,'height':height,'boxes':boxes,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2)+'\n')
  for label,box in boxes.items():
   payload={'model':a.model,'temperature':0,'reasoning_effort':'none','max_tokens':300,'stream':False,'messages':[{'role':'user','content':[{'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()}},{'type':'text','text':f'Locate the center of the button labeled {label!r}. Return only JSON {{"x":number,"y":number}} using normalized coordinates 0–1000 on both axes. If absent return {{"found":false}}.'}]}]}
   row={'layout':index,'label':label,'model':a.model};start=time.monotonic()
   try:
    request=urllib.request.Request('http://127.0.0.1:11435/v1/chat/completions',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    response=json.load(urllib.request.urlopen(request,timeout=180));text=response['choices'][0]['message']['content'];row['response']=text
    point=json.loads(text[text.index('{'):text.rindex('}')+1]);x=point['x']*width/1000;y=point['y']*height/1000
    row.update(pixel_point=[x,y],passed=box[0]<=x<=box[2] and box[1]<=y<=box[3],usage=response.get('usage'))
   except Exception as error:row.update(passed=False,error=str(error))
   row['seconds']=time.monotonic()-start;output.write(json.dumps(row)+'\n');output.flush();print(json.dumps(row),flush=True)
