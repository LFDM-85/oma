export const voiceProviders=[{value:'gpt-live',label:'GPT-Live · OpenAI'},{value:'local',label:'Local · Offline'}];
export function voiceProvider(memory){return memory.get('voiceProvider')==='local'?'local':'gpt-live';}
export function setVoiceProvider(memory,value){
 if(!voiceProviders.some(provider=>provider.value===value))throw Error('Unknown voice provider.');
 memory.set('voiceProvider',value);
}
export async function switchVoiceProvider({memory,value,stop,emit}){
 if(!voiceProviders.some(provider=>provider.value===value))throw Error('Unknown voice provider.');
 await stop();setVoiceProvider(memory,value);
 emit({voiceProvider:value,modelReady:false,speechReady:false,keyConfigured:false,connectionTestPassed:false,userText:'',assistantText:'',restartWorker:true});
}
