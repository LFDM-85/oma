import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transcriptionLanguage} from './locale.mjs';
export class LocalSpeech {
 constructor({data,locale,spawnProcess=spawn}){Object.assign(this,{data,locale,spawnProcess});this.pending=new Map();this.sequence=0;}
 get ready(){return existsSync(join(this.data,'local','ready.json'));}
 start(){
  if(this.child)return;
  const home=join(this.data,'local');
  const child=this.spawnProcess(join(home,'venv/bin/python'),['-u',fileURLToPath(new URL('./local-speech.py',import.meta.url)),home],{stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HOME:join(home,'huggingface')}});
  this.child=child;let diagnostic='';
  child.stderr.on('data',b=>{diagnostic=(diagnostic+b).slice(-1000)});
  child.stdin.on('error',()=>{});
  createInterface({input:child.stdout}).on('line',line=>{
   if(this.child!==child)return;
   try{
    const message=JSON.parse(line),request=this.pending.get(message.id);if(!request)return;
    if(message.error){request.finish(Error(message.error));return;}
    if(message.pcm)request.consume(Buffer.from(message.pcm,'base64'));
    if(message.done)request.finish(null,message.text||'');
   }catch(error){this.close(error);}
  });
  child.on('error',error=>{if(this.child===child)this.close(error)});
  child.on('exit',()=>{if(this.child===child)this.close(Error('Local speech stopped. '+diagnostic))});
 }
 request(action,payload,consume=()=>{},signal){
  signal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(120000)]);
  return new Promise((resolve,reject)=>{
   signal.throwIfAborted();this.start();const id=++this.sequence;
   // Pausing mid-sentence cancels a speculative transcript. Killing this shared
   // process also unloads ASR and TTS, forcing a cold reload for the final audio.
   // Stop decoding cooperatively without unloading either model. Synthesis
   // and deadlines still stop the worker immediately.
   const abort=()=>{
    if(action==='transcribe'&&signal.reason?.name!=='TimeoutError'){
     this.child?.stdin.write(JSON.stringify({action:'cancel',id})+'\n');finish(signal.reason);
    }else this.close(signal.reason);
   };
   const finish=(error,result)=>{this.pending.delete(id);signal.removeEventListener('abort',abort);error?reject(error):resolve(result);};
   this.pending.set(id,{consume,finish});signal.addEventListener('abort',abort,{once:true});
   this.child.stdin.write(JSON.stringify({id,action,language:transcriptionLanguage(this.locale)||null,...payload})+'\n');
  });
 }
 async transcribe(pcm,signal){const text=await this.request('transcribe',{pcm:pcm.toString('base64')},undefined,signal);return text.replace(/\[[^\]]*\]/g,'').trim();}
 prepareRecognition(){
  const language=transcriptionLanguage(this.locale)||null;
  if(this.recognitionPreparation?.language===language)return this.recognitionPreparation.promise;
  const preparation={language};this.recognitionPreparation=preparation;
  preparation.promise=this.request('prepare_recognition',{}).catch(error=>{if(this.recognitionPreparation===preparation)this.recognitionPreparation=null;throw error});
  return preparation.promise;
 }
 speak(text,onChunk,signal){return this.request('speak',{text:text.replace(/O\.M\.A\./g,transcriptionLanguage(this.locale)==='ja'?'オーマ':'OH-mah')},onChunk,signal);}
 close(error=new Error('Local speech stopped.')){
  const child=this.child;this.child=null;this.recognitionPreparation=null;child?.kill('SIGKILL');
  for(const request of [...this.pending.values()])request.finish(error);
 }
}
