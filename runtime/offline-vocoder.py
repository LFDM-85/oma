"""Original offline FFT preview vocoder. Intentionally separate from live DSP."""
import argparse,json,wave,pathlib,io,sys
import numpy as np
parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--mix',type=float,default=.5)
parser.add_argument('--output')
args=parser.parse_args()
assert args.mix in (0,.35,.5,1)
with wave.open(io.BytesIO(sys.stdin.buffer.read()) if args.input=='-' else args.input) as f:
    rate=f.getframerate(); assert rate==24000 and f.getnchannels()==1 and f.getsampwidth()==2
    speech=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768
n=len(speech); size=1 << (n+rate-1).bit_length()
time=np.arange(n)/rate
rng=np.random.default_rng(42)
carrier=sum(np.sin(2*np.pi*110*k*time)/k for k in range(1,81)) + 0.10*rng.standard_normal(n)
freq=np.fft.rfftfreq(size,1/rate)
source_fft=np.fft.rfft(speech,size); carrier_fft=np.fft.rfft(carrier,size)
centers=np.geomspace(90,10000,26)
robot=np.zeros(n)
for i in range(1,len(centers)-1):
    lo,mid,hi=centers[i-1:i+2]
    band=np.maximum(0,np.minimum((freq-lo)/(mid-lo),(hi-freq)/(hi-mid)))
    source_band=np.fft.irfft(source_fft*band,size)
    power=source_band**2
    envelope=np.sqrt(np.maximum(0,np.fft.irfft(np.fft.rfft(power)*np.exp(-0.5*(2*np.pi*freq*.008)**2),size)[:n]))
    carrier_band=np.fft.irfft(carrier_fft*band,size)[:n]
    carrier_band/=max(np.sqrt(np.mean(carrier_band**2)),1e-9)
    robot+=envelope*carrier_band
rms=lambda x:float(np.sqrt(np.mean(x*x)))
robot*=rms(speech)/max(rms(robot),1e-9)
variants={0:speech,.35:speech*.65+robot*.35,.5:speech*.5+robot*.5,1:robot}
target=min(rms(speech),min(.90*rms(x)/max(np.max(np.abs(x)),1e-9) for x in variants.values()))
x=variants[args.mix];x=x*(target/max(rms(x),1e-9))
assert np.isfinite(x).all() and np.max(np.abs(x))<=.901
buffer=io.BytesIO()
with wave.open(buffer,'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(np.rint(x*32767).astype('<i2').tobytes())
if args.output:pathlib.Path(args.output).write_bytes(buffer.getvalue())
else:sys.stdout.buffer.write(buffer.getvalue())
