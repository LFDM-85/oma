import {Vocoder} from './vocoder.mjs';
class Filter {
 constructor(type,hz){const w=2*Math.PI*hz/24000,c=Math.cos(w),a=Math.sin(w)/(2*Math.SQRT1_2),d=1+a;this.b0=(type==='high'?(1+c):(1-c))/2/d;this.b1=(type==='high'?-(1+c):(1-c))/d;this.b2=this.b0;this.a1=-2*c/d;this.a2=(1-a)/d;this.reset();}
 reset(){this.x1=this.x2=this.y1=this.y2=0;}
 sample(x){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
// Fixed processing order: vocoder -> radio band -> short metallic ambience.
// This is a lightweight delay-network reverb, not a physical plate emulation.
export class VoiceEffects {
 constructor({vocoder=0,radio=false,reverb=false}={}){
  if(!Number.isFinite(vocoder)||vocoder<0||vocoder>1)throw Error('Invalid vocoder mix');
  this.vocoder=vocoder?new Vocoder({mix:vocoder}):null;this.radio=radio;this.reverb=reverb;
  this.filters=[new Filter('high',300),new Filter('high',300),new Filter('low',3400),new Filter('low',3400)];
  this.delays=[.0297,.0371,.0411,.0437].map((seconds,i)=>({buffer:new Float64Array(Math.round(24000*seconds)),position:0,feedback:.62-i*.035,low:0}));
 }
 reset(){this.vocoder?.reset();this.filters.forEach(f=>f.reset());for(const d of this.delays){d.buffer.fill(0);d.position=0;d.low=0;}}
 process(input){
  const pcm=this.vocoder?this.vocoder.process(input):input;if(!this.radio&&!this.reverb)return pcm;
  const out=Buffer.alloc(pcm.length);
  for(let i=0;i+1<pcm.length;i+=2){
   let x=pcm.readInt16LE(i)/32768;
   if(this.radio)for(const f of this.filters)x=f.sample(x);
   if(this.reverb){let wet=0;for(const d of this.delays){const delayed=d.buffer[d.position];d.low+=.65*(delayed-d.low);d.buffer[d.position]=x+d.low*d.feedback;d.position=(d.position+1)%d.buffer.length;wet+=delayed;}x+=.18*wet/4;}
   out.writeInt16LE(Math.round(Math.max(-1,Math.min(32767/32768,x))*32768),i);
  }return out;
 }
}
