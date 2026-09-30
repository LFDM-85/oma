// Exercise the real entry point without keyring, microphone, compositor or network access.
import {registerHooks} from 'node:module';
const stubs={
 'credentials.mjs':"export async function loadApiKey(){return 'fictional-never-sent'};export async function saveApiKey(){}",
 'microphones.mjs':"export async function listMicrophones(){return []};export async function microphoneNode(){return {}}",
 'wake.mjs':"export class WakeListener {start(){}pause(){}close(){}setEnabled(){}};export async function microphoneAvailable(){return true}",
 'audio.mjs':"export class Audio {async stopRecording(){}stop(){}enqueue(){}finish(){}}",
 'startup.mjs':"export class StartupCue {stop(){}play(){}}",
 'main-pipeline.mjs':"throw Error('Removed pipeline was selected')",
};
registerHooks({
 resolve(specifier,context,next){
  if(specifier==='openai')return {url:'oma-test:openai',shortCircuit:true};
  if(specifier==='openai/resources/live/ws')return {url:'oma-test:live',shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  let source;
  if(url==='oma-test:openai')source='export default class OpenAI {}';
  if(url==='oma-test:live')source="export class LiveWS {constructor(){process.stdout.write(JSON.stringify({unexpectedApiConnection:true})+'\\n');throw Error('Network forbidden in idle test')}}";
  for(const [name,value] of Object.entries(stubs))if(url.endsWith('/runtime/'+name))source=value;
  return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};
 }
});
await import('../../runtime/main.mjs');
