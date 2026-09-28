import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function localModelReady(request=fetch){
 try{const response=await request('http://127.0.0.1:11435/api/tags',{signal:AbortSignal.timeout(2000)});return response.ok&&(await response.json()).models?.some(model=>model.name==='qwen3.5:4b')===true;}catch{return false;}
}
export async function startLocalModel(data){
 if(await localModelReady())return null;
 const home=join(data,'local'),binary=join(home,'ollama/bin/ollama');
 if(!existsSync(binary))return null;
 // A process already listening may still be downloading its model.
 try{if((await fetch('http://127.0.0.1:11435/api/version',{signal:AbortSignal.timeout(1000)})).ok)return null;}catch{}
 const child=spawn(binary,['serve'],{stdio:'ignore',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_MODELS:join(home,'ollama-models'),OLLAMA_NO_CLOUD:'1',OLLAMA_CONTEXT_LENGTH:'32768'}});
 let failure;child.on('error',error=>{failure=error});
 for(let attempt=0;attempt<40;attempt++){
  if(failure)throw failure;if(child.exitCode!==null)throw Error('Local model server stopped.');
  if(await localModelReady())return child;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 return child;
}
export function installLocalModels(data,emit){
 emit({localSetupBusy:true,localSetupMessage:'Downloading local models. This can take several minutes.'});
 const child=spawn('bash',[fileURLToPath(new URL('../scripts/setup-local',import.meta.url))],{stdio:['ignore','pipe','pipe'],env:{...process.env,OMA_DATA_DIR:data}});
 return new Promise((resolve,reject)=>{
  let detail='';child.stderr.on('data',b=>{detail=(detail+b).slice(-1500)});
  child.stdout.on('data',b=>emit({localSetupMessage:String(b).trim().slice(-400)}));
  child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Local setup failed. '+detail.slice(-500))));
 }).finally(()=>emit({localSetupBusy:false}));
}
