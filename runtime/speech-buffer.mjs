// Faster playback must not outrun a realtime source. Collect speech until a
// 300 ms quiet boundary, retaining leading/trailing audio instead of cutting words.
export class SpeechBuffer {
 constructor(deliver,{quietFrames=15}={}){this.deliver=deliver;this.quietFrames=quietFrames;this.reset();}
 reset(){this.pending=Buffer.alloc(0);this.frames=[];this.leading=[];this.quiet=0;}
 append(chunk){
  const data=Buffer.concat([this.pending,chunk]);let at=0;
  for(;at+960<=data.length;at+=960){
   const frame=Buffer.from(data.subarray(at,at+960));let sum=0;
   for(let i=0;i<960;i+=2)sum+=frame.readInt16LE(i)**2;
   const voiced=Math.sqrt(sum/480)>100;
   if(!this.frames.length&&!voiced){this.leading.push(frame);if(this.leading.length>3)this.leading.shift();continue;}
   if(!this.frames.length){this.frames.push(...this.leading);this.leading=[];}
   this.frames.push(frame);this.quiet=voiced?0:this.quiet+1;
   if(this.quiet>=this.quietFrames||this.frames.length>=1500){const pcm=Buffer.concat(this.frames);this.frames=[];this.quiet=0;this.deliver(pcm);}
  }
  this.pending=Buffer.from(data.subarray(at));
 }
}
