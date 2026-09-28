// Explicit local integration test. Uses installed models, a fresh conversation
// database, and the real audio output. No cloud credentials are needed.
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {Memory} from '../runtime/memory.mjs';
const data=mkdtempSync(join(tmpdir(),'oma-local-integration-'));
mkdirSync(join(data,'local'));
const installed=process.env.OMA_DATA_DIR||join(homedir(),'.local/share/oma');
for(const name of ['venv','whisper','huggingface','ready.json','ollama','ollama-models'])symlinkSync(join(installed,'local',name),join(data,'local',name));
const memory=new Memory(join(data,'memory.sqlite'));
memory.set('voiceProvider','local');memory.set('wakeEnabled','false');memory.set('responseLanguage','ja');memory.close();
const child=spawn(process.execPath,[new URL('../runtime/main.mjs',import.meta.url).pathname],{env:{...process.env,OMA_DATA_DIR:data,OMA_WORKSPACE:data,OPENAI_API_KEY:''},stdio:['pipe','pipe','pipe']});
child.stderr.pipe(process.stderr);
let sent=false,passed=false,stopping=false;
const stop=()=>{if(stopping)return;stopping=true;child.stdin.end();};
const deadline=setTimeout(()=>{console.error('Local integration timed out.');child.kill('SIGKILL')},120000);
createInterface({input:child.stdout}).on('line',line=>{
 const patch=JSON.parse(line);
 if(patch.error||patch.connectionTestError){console.error(line);stop();}
 if(patch.keyConfigured&&!sent){sent=true;child.stdin.write(JSON.stringify({action:'testConnection'})+'\n');}
 if(patch.connectionTestPassed){passed=true;console.log('Local Japanese agent → TTS → STT passed.');setTimeout(stop,5000);}
});
const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(deadline);
rmSync(data,{recursive:true,force:true});
if(!passed||code!==0)throw Error('Local pipeline integration failed.');
