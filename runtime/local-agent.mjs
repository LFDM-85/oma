import {localSamplingOptions} from './local-sampling.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
// O.M.A. owns this directory. Never replace the user's ~/.pi/agent settings.
export function localAgentConfig(data){
 const selection=join(data,'local','agent.json');
 const settings=existsSync(selection)?JSON.parse(readFileSync(selection,'utf8')):{};
 localSamplingOptions(settings.sampling);
 const model=settings.model||'qwen3.5:4b',thinkingLevel=settings.thinkingLevel||'off';
 if(!['qwen3.5:4b','qwen3.5:4b-q8_0','qwen3.5:9b','qwen3.6:35b','gemma4:e2b'].includes(model))throw Error('Unsupported local model: '+model);
 if(!['off','low','medium','high'].includes(thinkingLevel))throw Error('Invalid local thinking level');
 const config=join(data,'local','pi-config');mkdirSync(config,{recursive:true,mode:0o700});
 const write=(name,value)=>writeFileSync(join(config,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 write('settings.json',{defaultProvider:'oma-local',defaultModel:model,defaultThinkingLevel:thinkingLevel,omaLocalSampling:settings.sampling});
 write('models.json',{providers:{'oma-local':{
  baseUrl:'http://127.0.0.1:11435/v1',api:'openai-completions',apiKey:'local',
  models:[{id:model,name:model+' · Local',reasoning:true,
   thinkingLevelMap:{off:'none'},input:['text','image'],contextWindow:32768,maxTokens:2048,
   cost:{input:0,output:0,cacheRead:0,cacheWrite:0},
   compat:{supportsStore:false,supportsDeveloperRole:false,supportsReasoningEffort:true,maxTokensField:'max_tokens'}}]
 }}});
 return config;
}
