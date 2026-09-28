import json, math, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.signal import butter,sosfilt
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).parent
W,H,FPS,DUR,SR=1280,720,24,32,24000
mesh=json.loads((ROOT/'assets/face.json').read_text()); verts=np.array(mesh['vertices']); shapes=mesh['shapes']; rng=np.random.default_rng(18)
font='/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf'
def f(n):return ImageFont.truetype(font,n)
fonts={n:f(n) for n in [14,18,22,28,36,48,64,100]}
audio=np.zeros(SR*DUR); vocal=np.zeros_like(audio); envelopes=[]
def put(dest,x,start,amp=1):
 p=int(start*SR); n=min(len(x),len(dest)-p)
 if n>0:dest[p:p+n]+=x[:n]*amp
# Original 120 BPM beat and a four-note bass sequence.
for beat in range(DUR*2):
 t=np.arange(int(.35*SR))/SR
 kick=np.sin(2*np.pi*(48*t+7*(1-np.exp(-t*30))))*np.exp(-t*16)
 put(audio,kick,beat*.5,.34)
 if beat%2:
  noise=rng.normal(0,1,len(t)); sn=sosfilt(butter(2,1500,fs=SR,btype='high',output='sos'),noise)*np.exp(-t*25)
  put(audio,sn,beat*.5,.10)
 for off in [0,.25]:
  ht=np.arange(int(.10*SR))/SR; hiss=rng.normal(0,1,len(ht))*np.exp(-ht*65)
  put(audio,hiss,beat*.5+off,.025)
 freq=[65.406,65.406,77.782,58.270][(beat//4)%4];t=np.arange(int(.42*SR))/SR
 bass=(np.sin(2*np.pi*freq*t)+.25*np.sin(2*np.pi*freq*2*t))*np.minimum(t*100,1)*np.exp(-t*7)
 put(audio,bass,beat*.5,.15)
# Syllables articulated by a local formant synthesizer, passed through a pitched vocoder.
for name,word in [('o','oh'),('m','em'),('a','ay')]:
 subprocess.run(['espeak-ng','-v','en-us','-p','28','-s','125','-w',str(OUT/(name+'.wav')),word],check=True)
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(OUT/(name+'.wav')),'-ar',str(SR),'-ac','1',str(OUT/(name+'-24.wav'))],check=True)
for base in [2,6,24,28]:
 for j,name in enumerate(['o','m','a']):
  with wave.open(str(OUT/(name+'-24.wav'))) as w:x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
  nz=np.flatnonzero(abs(x)>.008);x=x[max(0,nz[0]-150):min(len(x),nz[-1]+300)]
  x=np.interp(np.linspace(0,len(x)-1,int(.68*SR)),np.arange(len(x)),x)
  t=np.arange(len(x))/SR; freq=[130.813,155.563,116.541][j]
  carrier=sum(np.sin(2*np.pi*freq*h*t)/h for h in range(1,35)); y=np.zeros_like(x)
  edges=np.geomspace(100,9000,17)
  for lo,hi in zip(edges[:-1],edges[1:]):
   filt=butter(2,[lo,hi],fs=SR,btype='band',output='sos');band=sosfilt(filt,x)
   env=sosfilt(butter(2,35,fs=SR,output='sos'),abs(band));y+=sosfilt(filt,carrier)*env
  y=y/(max(abs(y))+.0001)*.34+x*.13;start=base+j*.75
  put(vocal,y,start);envelopes.append((start,start+.68,name))
audio+=vocal
# A light stereo-like echo remains mono-compatible.
put(audio,vocal[:-int(.19*SR)],.19,.16)
audio*=np.minimum(np.arange(len(audio))/SR/1,1)*np.minimum((len(audio)-np.arange(len(audio)))/SR/1,1)
audio=np.tanh(audio*1.25)*.85
with wave.open(str(OUT/'soundtrack.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((audio*32767).astype('<i2').tobytes())
green=(166,244,117);muted=(103,137,100)
def text(draw,xy,s,size=22,color=green):draw.text(xy,s,font=fonts[size],fill=color)
def face(draw,t,cx,cy,scale,wire=False):
 active=next(((a,b,n) for a,b,n in envelopes if a<=t<=b),None)
 opening=0;rounding=0;wide=0
 if active:
  a,b,n=active;pos=int(t*SR);energy=np.sqrt(np.mean(vocal[pos:pos+240]**2))
  opening=min(.85,energy*7);rounding=.8 if n=='o' else .1;wide=.65 if n=='a' else 0
 points=verts.copy()
 for key,amount in [('jawOpen',opening),('lipRound',rounding),('lipWide',wide)]:points+=np.array(shapes[key])*amount
 angle=.35*math.sin(t*.7);x=points[:,0]*math.cos(angle)+points[:,2]*math.sin(angle);z=points[:,2]*math.cos(angle)-points[:,0]*math.sin(angle)
 boot=min(1,t/1.2,(DUR-t)/1.1);points2=np.column_stack([cx+x*scale,cy-points[:,1]*scale*max(.025,boot)])
 for tri in sorted(mesh['triangles'],key=lambda q:sum(z[i] for i in q[:3])):
  poly=[tuple(points2[i]) for i in tri[:3]];g=min(255,int(tri[3]));col=(int(g*.30),int(g*.85),int(g*.14))
  draw.polygon(poly,fill=None if wire else col,outline=(43,110,42) if wire else col)
 if not wire:draw.polygon([tuple(points2[i]) for i in mesh['mouth']],fill=(1,5,2))
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-i',str(OUT/'soundtrack.wav'),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(OUT/'oma-promo-v1.mp4')],stdin=subprocess.PIPE)
for frame in range(DUR*FPS):
 t=frame/FPS;im=Image.new('RGB',(W,H),(5,10,7));d=ImageDraw.Draw(im)
 for gx in range(0,W,80):d.line([(gx,0),(gx,H)],fill=(12,23,15))
 for gy in range(0,H,80):d.line([(0,gy),(W,gy)],fill=(12,23,15))
 text(d,(42,28),'O.M.A.',28);text(d,(1030,35),'VOICE / ACTION',14,muted)
 if t<10 or t>=24:
  wire=t<2 or (int(t*2)%8==0 and t<30)
  face(d,t,640,350,255 if t<24 else 245,wire)
  for i in range(48):
   amp=12+35*abs(math.sin(i*.65+t*8))*(.3+abs(math.sin(t*math.pi*2)))
   xx=170+i*20;d.line([(xx,350-amp),(xx,350+amp)],fill=(35,70,30),width=2) if abs(xx-640)>200 else None
  line='YOUR COMPUTER. A CONVERSATION.' if t<2 else 'O  ·  M  ·  A' if t<9 or t>=24 and t<30 else 'SPEAK. IT HAPPENS.'
  text(d,(640-d.textbbox((0,0),line,font=fonts[36])[2]/2,615),line,36)
  if t>=30:text(d,(463,566),'Made for Omarchy',22,muted)
 else:
  face(d,t,1060,347,160,False)
  phase=0 if t<15 else 1 if t<20 else 2
  heading=['OPEN APPS','PUT WORDS TO WORK','STAY IN YOUR FLOW'][phase]
  text(d,(65,105),heading,48)
  prompt=['“Open a new document.”','“Write: Hello, world.”','“Switch to mini mode.”'][phase]
  text(d,(65,191),prompt,28)
  d.rounded_rectangle((65,275,855,574),radius=10,fill=(14,24,17),outline=(71,98,67),width=2)
  if phase<2:
   text(d,(90,292),'Untitled — Text editor',18,muted);d.line([(65,335),(855,335)],fill=(71,98,67))
   if phase==1:
    n=min(13,int((t-15)*7));text(d,(95,372),'Hello, world.'[:n]+'▏',36)
   else:text(d,(95,372),'▏',36)
  else:
   text(d,(95,300),'More room for your work.',28);face(d,t,747,462, seventy:=70,True)
  text(d,(65,610),'ILLUSTRATED WORKFLOW · NOT A LIVE RECORDING',14,muted)
 pixels=np.array(im);pixels[::4]=(pixels[::4]*.78).astype(np.uint8);im=Image.fromarray(pixels)
 if frame in [72,300,444,648]:im.save(OUT/f'frame-{frame}.jpg')
 proc.stdin.write(im.tobytes())
 if frame%192==0:print(f'Rendered {frame}/{DUR*FPS}',flush=True)
proc.stdin.close();assert proc.wait()==0
print(OUT/'oma-promo-v1.mp4')
