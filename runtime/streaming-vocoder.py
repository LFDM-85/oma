"""Windowed version of the original FFT vocoder: 40 ms hops, 151 ms lookahead."""
import os,sys
import numpy as np
rate=24000; hop=960; size=8192; margin=(size-hop)//2
freq=np.fft.rfftfreq(size,1/rate); centers=np.geomspace(90,10000,26)
bands=np.array([np.maximum(0,np.minimum((freq-lo)/(mid-lo),(hi-freq)/(hi-mid))) for lo,mid,hi in zip(centers[:-2],centers[1:-1],centers[2:])])
smooth=np.exp(-.5*(2*np.pi*freq*.008)**2)
t=np.arange(rate)/rate
carrier_table=sum(np.sin(2*np.pi*110*k*t)/k for k in range(1,81))
rng=np.random.default_rng(42); position=0
speech=np.zeros(margin); carrier=np.zeros(margin); pending=b''; wet_gain=1.; mix_gain=1.
def render():
 global speech,carrier,wet_gain,mix_gain
 s=speech[:size]; c=carrier[:size]
 sb=np.fft.irfft(np.fft.rfft(s)[None,:]*bands,axis=1)
 envelope=np.sqrt(np.maximum(0,np.fft.irfft(np.fft.rfft(sb*sb,axis=1)*smooth,axis=1)))
 cb=np.fft.irfft(np.fft.rfft(c)[None,:]*bands,axis=1)
 cb/=np.maximum(np.sqrt(np.mean(cb*cb,axis=1,keepdims=True)),1e-9)
 robot=np.sum(envelope*cb,axis=0)
 rms=lambda x:np.sqrt(np.mean(x*x))
 target_wet=min(4.,rms(s)/max(rms(robot),1e-9))
 # Smooth gain transitions; the FFT envelope and carrier phase overlap across hops.
 dry=s[margin:margin+hop]; wet=robot[margin:margin+hop]
 gains=np.linspace(wet_gain,target_wet,hop);wet_gain=target_wet
 wet*=gains
 mixed=.5*dry+.5*wet
 target_mix=min(2.,rms(s)/max(rms(.5*s+.5*robot*target_wet),1e-9))
 mixed*=np.linspace(mix_gain,target_mix,hop);mix_gain=target_mix
 out=np.rint(np.clip(mixed,-1,32767/32768)*32768).astype('<i2').tobytes()
 sys.stdout.buffer.write(out);sys.stdout.buffer.flush()
 speech=speech[hop:];carrier=carrier[hop:]
while True:
 chunk=os.read(0,65536)
 if not chunk:break
 pending+=chunk
 while len(pending)>=hop*2:
  frame=pending[:hop*2];pending=pending[hop*2:]
  samples=np.frombuffer(frame,dtype='<i2').astype(float)/32768
  indices=(np.arange(hop)+position)%rate;position+=hop
  speech=np.concatenate((speech,samples));carrier=np.concatenate((carrier,carrier_table[indices]+.10*rng.standard_normal(hop)))
  while len(speech)>=size:render()
