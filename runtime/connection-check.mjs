export async function checkConnection({agent,speech,signal}){
 const text=await agent.notice('Say only a short greeting in the configured response language, inviting the user to start a conversation if they can hear you.');
 signal.throwIfAborted();if(!text?.trim())throw Error('No response received from the AI.');
 const chunks=[];let bytes=0;
 await speech.speak(text,b=>{bytes+=b.length;if(bytes>24000*2*30)throw Error('The test audio exceeded the time limit.');chunks.push(b)},signal);
 if(!bytes)throw Error('No speech audio received.');
 const pcm=Buffer.concat(chunks);const transcript=await speech.transcribe(pcm,signal);
 signal.throwIfAborted();if(!transcript?.trim())throw Error('Speech recognition could not be verified.');
 return pcm;
}
