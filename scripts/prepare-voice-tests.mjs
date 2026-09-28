// Opt-in paid TTS preparation. Cache keys include exact text and synthesis settings.
import {readFileSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Speech,wav} from '../runtime/speech.mjs';
import {loadApiKey} from '../runtime/credentials.mjs';
const directory=resolve(process.argv[2]||'/tmp/oma-voice-fixtures');
const language=process.argv[3]||'ja';
const phrases=JSON.parse(readFileSync(new URL('../tests/voice/phrases.json',import.meta.url)))[language];
if(!phrases)throw Error('Supported fixture languages: ja, en');
const settings={model:'gpt-4o-mini-tts',voice:'alloy',locale:language==='ja'?'ja-JP':'en-US',version:1};
mkdirSync(directory,{recursive:true,mode:0o700});
const key=await loadApiKey();if(!key)throw Error('Configure the existing O.M.A. API key first');
const speech=new Speech({key,locale:settings.locale,env:{OMA_TTS_MODEL:settings.model,OMA_TTS_VOICE:settings.voice}});
const manifest={language,settings,phrases:{}};
for(const [id,text] of Object.entries(phrases)){
 const hash=createHash('sha256').update(JSON.stringify({text,settings})).digest('hex').slice(0,16);
 const file=id+'-'+hash+'.wav';const path=join(directory,file);
 if(!existsSync(path)){const chunks=[];await speech.speak(text,chunk=>chunks.push(chunk));writeFileSync(path,wav(Buffer.concat(chunks)),{mode:0o600});}
 manifest.phrases[id]={text,file};console.log(id+': ready');
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
console.log('Fixtures: '+directory);
