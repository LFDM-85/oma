// Opt-in billed input fixture for Live smoke tests only; never imported by the app.
// Keeps the previous synthetic Japanese input without the configurable STT/TTS runtime.
export class Speech {
 constructor({key}){this.key=key;}
 async speak(text,onChunk){
  if(!this.key)throw Error('Synthetic input requires an API key');
  const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+this.key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'cedar',input:text.replace(/O\.M\.A\./g,'オーマ'),response_format:'pcm',instructions:'Calm, clear, concise computer-like delivery. No laughter or filler.'}),signal:AbortSignal.timeout(60000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Error('Synthetic speech failed (HTTP '+response.status+')');}
  let carry=Buffer.alloc(0),size=0;
  for await(const chunk of response.body){
   size+=chunk.length;if(size>24*1024*1024)throw Error('Synthetic speech exceeded size limit');
   const packet=Buffer.concat([carry,chunk]),length=packet.length-packet.length%2;
   carry=packet.subarray(length);if(length)onChunk(packet.subarray(0,length));
  }
  if(carry.length)throw Error('Incomplete synthetic PCM sample');
 }
}
