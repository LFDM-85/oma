import {ModelRuntime,SettingsManager} from '@earendil-works/pi-coding-agent';
import {homedir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';import {Writable} from 'node:stream';import {spawn} from 'node:child_process';
export async function connectModel({runtime,settings,choose,interaction,defaults={}}){
 let models=await runtime.getAvailable();
 const existing=models.find(m=>m.provider===settings.getDefaultProvider()&&m.id===settings.getDefaultModel());
 if(existing)return existing;
 const providers=runtime.getProviders().filter(p=>models.some(m=>m.provider===p.id)||p.auth.oauth||p.auth.apiKey?.login);
 const preferred=['openai-codex','anthropic','openai','google','github-copilot'];
 providers.sort((a,b)=>(preferred.includes(a.id)?preferred.indexOf(a.id):99)-(preferred.includes(b.id)?preferred.indexOf(b.id):99));
 if(!providers.length)throw Error('No providers are available. Check your connection in Advanced settings.');
 const provider=await choose('Choose an AI provider you have an account or API key for.',providers.map(p=>({label:p.name+(models.some(m=>m.provider===p.id)?' (connected)':''),value:p})));
 if(!models.some(m=>m.provider===provider.id)){
  const methods=[];if(provider.auth.oauth)methods.push({label:'Sign in with an account',value:'oauth'});if(provider.auth.apiKey?.login)methods.push({label:'Connect with an API key (usage-based billing)',value:'api_key'});
  const method=await choose('Choose a connection method.',methods);await runtime.login(provider.id,method,interaction);models=await runtime.getAvailable();
 }
 const available=models.filter(m=>m.provider===provider.id);
 if(!available.length)throw Error('Signed in, but no models are available. Check your subscription and connection.');
 const recommended=available.find(m=>m.id===defaults[provider.id]);
 const choices=[...(recommended?[{label:'Recommended model: '+recommended.name+' (Pi default)',value:recommended}]:[]),...available.filter(m=>m!==recommended).map(m=>({label:m.name,value:m}))];
 const model=await choose('Choose a conversation model. This is saved in your shared AI settings.',choices);
 settings.setDefaultModelAndProvider(model.provider,model.id);await settings.flush();if(settings.drainErrors?.().length)throw Error('Could not save AI settings.');return model;
}
async function main(){
 process.umask(0o077);const controller=new AbortController();let muted=false;
 const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
 rl.on('SIGINT',()=>{controller.abort();rl.close()});
 const ask=async(message,secret=false,signal=controller.signal)=>{console.log('\n'+message);if(secret)console.log('Input is hidden. Paste your value and press Enter.');muted=secret;try{return (await rl.question('> ',{signal})).trim();}finally{muted=false;if(secret)console.log();}};
 const choose=async(message,choices)=>{console.log('\n'+message);choices.forEach((c,i)=>console.log(`${i+1}. ${c.label}`));while(true){const value=await ask('Enter a number (Ctrl+C to cancel)');const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=choices.length)return choices[n-1].value;console.log('Enter one of the listed numbers.');}};
 const open=url=>{try{const parsed=new URL(url);if(parsed.protocol!=='https:')return;const p=spawn('xdg-open',[url],{stdio:'ignore'});p.on('error',()=>{});}catch{}};
 try{
  console.log('O.M.A. — Connect your AI\n\nSign in to your AI provider.\nConversations are sent to that provider and billed under your plan.\nReturn to O.M.A. afterward to test voice input and output.');
  const config=process.env.PI_CODING_AGENT_DIR||join(homedir(),'.pi/agent');
  const runtime=await ModelRuntime.create({authPath:join(config,'auth.json'),modelsPath:join(config,'models.json'),modelsStorePath:join(config,'models-cache.json'),allowModelNetwork:false});
  const settings=SettingsManager.create(process.cwd(),config);
  // The version is pinned; use Pi's defaults rather than an O.M.A. model list.
  const {defaultModelPerProvider}=await import(new URL('./core/model-resolver.js',import.meta.resolve('@earendil-works/pi-coding-agent')));
  const model=await connectModel({runtime,settings,choose,defaults:defaultModelPerProvider,interaction:{signal:controller.signal,prompt:async p=>p.type==='select'?choose(p.message,p.options.map(o=>({label:o.label,value:o.id}))):ask(p.message,p.type==='secret'||p.type==='manual_code',p.signal?AbortSignal.any([controller.signal,p.signal]):controller.signal),notify:e=>{if(e.type==='auth_url'){console.log('Sign in using your browser.\n'+e.url);if(e.instructions)console.log(e.instructions);open(e.url);}else if(e.type==='device_code'){console.log('Enter this code in your browser: '+e.userCode+'\n'+e.verificationUri);open(e.verificationUri);}else if(e.message)console.log(e.message);}}});
  console.log('\nConnected: '+model.name+'\nClose this terminal to continue setup in O.M.A.');await ask('Press Enter to return');
 }catch(e){if(!controller.signal.aborted){console.error('\nConnection was not completed. Select Connect AI provider to try again.');await ask('Press Enter to return').catch(()=>{});}process.exitCode=1;}finally{rl.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
