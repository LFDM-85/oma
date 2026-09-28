// Opt-in billed benchmark; synthetic Japanese audio only. Never records a microphone.
import {Speech} from '../runtime/speech.mjs';import {loadApiKey} from '../runtime/credentials.mjs';
const key=await loadApiKey();if(!key)throw Error('Speech credentials missing');
const samples=['オーマ、こんにちは。短く自己紹介してください。','明日の午後三時に、会議の資料を確認します。','そのファイルは削除しないでください。'];
const source=new Speech({key,locale:'ja-JP',env:{}});const rows=[];
for(const text of samples){const chunks=[];await source.speak(text,b=>chunks.push(b));const pcm=Buffer.concat(chunks);
 for(const model of ['gpt-4o-transcribe','gpt-4o-mini-transcribe']){const speech=new Speech({key,locale:'ja-JP',env:{OMA_STT_MODEL:model}});const start=performance.now();const transcript=await speech.transcribe(pcm);const row={kind:'stt',model,ms:Math.round(performance.now()-start),source:text,transcript};rows.push(row);console.log(JSON.stringify(row));}}
for(let trial=0;trial<3;trial++)for(const model of ['gpt-4o-mini-tts','tts-1']){let first,bytes=0;const speech=new Speech({key,locale:'ja-JP',env:{OMA_TTS_MODEL:model,OMA_TTS_VOICE:'alloy'}});const start=performance.now();await speech.speak('こんにちは。オーマです。ご用件をどうぞ。',b=>{first??=performance.now();bytes+=b.length});const row={kind:'tts',model,trial,firstMs:Math.round(first-start),totalMs:Math.round(performance.now()-start),audioMs:Math.round(bytes/48)};rows.push(row);console.log(JSON.stringify(row));}
