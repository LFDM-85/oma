// Stateful 24-band, fixed 110 Hz carrier vocoder for 24 kHz PCM16.
// A causal filter bank keeps processing continuous across network packets.
const carrierTable=Float64Array.from({length:24000},(_,i)=>{
 let value=0;for(let harmonic=1;harmonic<=80;harmonic++)value+=Math.sin(2*Math.PI*110*harmonic*i/24000)/harmonic;
 return value;
});
class Band {
 constructor(frequency){const w=2*Math.PI*frequency/24000,alpha=Math.sin(w)/(2*4);this.b=alpha/(1+alpha);this.a1=-2*Math.cos(w)/(1+alpha);this.a2=(1-alpha)/(1+alpha);this.reset();}
 reset(){this.x1=0;this.x2=0;this.y1=0;this.y2=0;}
 sample(x){const y=this.b*(x-this.x2)-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
export class Vocoder {
 constructor({mix=.5}={}){this.mix=mix;this.bands=Array.from({length:24},(_,i)=>{const f=90*(10000/90)**((i+1)/25);return {source:new Band(f),carrier:new Band(f),power:0,carrierPower:0}});this.reset();}
 reset(){this.phase=0;this.seed=42;this.inputPower=0;this.wetPower=0;for(const b of this.bands){b.source.reset();b.carrier.reset();b.power=0;b.carrierPower=0;}}
 process(pcm){
  const output=Buffer.alloc(pcm.length),smooth=1-Math.exp(-1/(24000*.008)),levelSmooth=1-Math.exp(-1/(24000*.15));
  for(let i=0;i+1<pcm.length;i+=2){
   const dry=pcm.readInt16LE(i)/32768;
   const carrierTone=carrierTable[this.phase];this.phase=(this.phase+1)%carrierTable.length;
   this.seed=(1664525*this.seed+1013904223)>>>0;
   const carrier=carrierTone+.10*(this.seed/2147483648-1);
   let wet=0;
   for(const b of this.bands){const x=b.source.sample(dry),c=b.carrier.sample(carrier);b.power+=smooth*(x*x-b.power);b.carrierPower+=smooth*(c*c-b.carrierPower);wet+=Math.sqrt(Math.max(0,b.power)/Math.max(.000001,b.carrierPower))*c;}
   this.inputPower+=levelSmooth*(dry*dry-this.inputPower);this.wetPower+=levelSmooth*(wet*wet-this.wetPower);
   wet*=Math.min(4,Math.sqrt(this.inputPower/Math.max(1e-10,this.wetPower)));
   let mixed=dry*(1-this.mix)+wet*this.mix;
   output.writeInt16LE(Math.round(Math.max(-1,Math.min(32767/32768,mixed))*32768),i);
  }
  return output;
 }
}
