// Opt-in, real local model comparison. Tool calls are inspected, never executed.
import {PiAgent,createResources} from '../../runtime/pi.mjs';
import {Memory} from '../../runtime/memory.mjs';
import {localAgentConfig} from '../../runtime/local-agent.mjs';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {homedir} from 'node:os';
const models=process.argv.slice(2);
const reasoning=process.env.OMA_COMPARE_REASONING||undefined;
if(!models.length)throw Error('Pass installed Ollama model names');
const endpoint='http://127.0.0.1:11437';
try{await fetch(endpoint+'/api/version');throw Error('Comparison port 11437 is occupied');}catch(e){if(e.message.includes('occupied'))throw e;}
const local=homedir()+'/.local/share/oma/local';
const server=spawn(local+'/ollama/bin/ollama',['serve'],{stdio:'ignore',env:{...process.env,
 OLLAMA_HOST:'127.0.0.1:11437',OLLAMA_MODELS:local+'/ollama-models',OLLAMA_CONTEXT_LENGTH:'32768',OLLAMA_NO_CLOUD:'1'}});
const home=mkdtempSync('/tmp/oma-model-comparison-'),memory=new Memory(home+'/memory.sqlite');
const agent=new PiAgent({home,cwd:home,memory,emit(){},locale:'ja',env:{PI_CODING_AGENT_DIR:localAgentConfig(home)}});
const cases=[
 {id:'blank',text:'OmaTextで空の新規ファイルを開いてください。',tool:'new_text_document',args:{text:''}},
 {id:'dictation',text:'OmaTextで空の新規ファイルを開いて、次の文章を書いてください。こんにちは。今日の天気は雨です。こんにちはと今日の間は全角スペース1つだけで区切って、句読点は文章の最後の丸だけにしてください。',tool:'new_text_document',args:{text:'こんにちは　今日の天気は雨です。'}},
 {id:'mini',text:'ミニモードにして。',tool:'set_view_mode',args:{mode:'mini'}},
 {id:'normal',text:'ノーマルモードに戻して。',tool:'set_view_mode',args:{mode:'normal'}},
 {id:'close',text:'今開いたOmaTextのファイルを閉じてください。',tool:'list_windows',args:{}},
 {id:'quoted-goodbye',text:'バイバイという言葉を英語に訳してください。会話はまだ続けます。',answer:/bye/i},
 {id:'math',text:'一足す一の答えだけ教えてください。',answer:/2|二/},
 {id:'goodbye',text:'バイバイ。',tool:'end_conversation',args:{}},
];
try{
 for(let i=0;i<40;i++){
  try{if((await fetch(endpoint+'/api/version')).ok)break;}catch{}
  if(i===39)throw Error('Comparison server did not start');
  await new Promise(r=>setTimeout(r,250));
 }
 await agent.configure();const loader=await createResources({home,cwd:home,memory,locale:'ja'});
 const tools=agent.tools().map(({name,description,parameters})=>({name,description,parameters}));
 for(const id of models){
  const model={...agent.modelRuntime.getModel(agent.provider,agent.modelId),id,name:id,baseUrl:endpoint+'/v1',maxTokens:reasoning?4096:2048};
  for(let attempt=0;attempt<2;attempt++)for(const c of cases){
   const start=Date.now();
   try{
    const response=await agent.modelRuntime.completeSimple(model,{systemPrompt:loader.getSystemPrompt(),
     messages:[{role:'user',content:c.text,timestamp:Date.now()}],tools},
     {reasoning,temperature:.2,signal:AbortSignal.timeout(90000)});
    const calls=response.content.filter(x=>x.type==='toolCall');
    const text=response.content.filter(x=>x.type==='text').map(x=>x.text).join('');
    const passed=c.tool?calls.length===1&&calls[0].name===c.tool&&JSON.stringify(calls[0].arguments)===JSON.stringify(c.args):calls.length===0&&c.answer.test(text);
    console.log(JSON.stringify({model:id,reasoning:reasoning||'off',case:c.id,attempt,passed,ms:Date.now()-start,stop:response.stopReason,
     text,calls:calls.map(({name,arguments:args})=>({name,args}))}));
   }catch(error){console.log(JSON.stringify({model:id,case:c.id,attempt,passed:false,ms:Date.now()-start,error:error.message}));}
  }
 }
}finally{memory.close();server?.kill();}
