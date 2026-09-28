// Run after creating a red fixture: magick -size 320x240 xc:red /tmp/oma-local-vision-red.png
import assert from 'node:assert/strict';
import {PiAgent} from '../runtime/pi.mjs';
import {localAgentConfig} from '../runtime/local-agent.mjs';
import {Memory} from '../runtime/memory.mjs';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const home=mkdtempSync(join(tmpdir(),'oma-local-tools-'));const memory=new Memory(join(home,'memory.sqlite'));let allow=false,dismissed=false;const tools=[];
const agent=new PiAgent({home:join(home,'pi'),cwd:home,memory,locale:'ja-JP',env:{...process.env,PI_CODING_AGENT_DIR:localAgentConfig(home)},emit:p=>{if(p.taskStatus)tools.push(p.taskStatus);if(p.approval)queueMicrotask(()=>agent.approve(p.approval.id,allow));}});
agent.onDismiss=()=>dismissed=true;
const timer=setTimeout(()=>agent.cancel(),180000);
try{
 const run=async text=>{tools.length=0;const start=performance.now();const answer=await agent.run(text);console.log(JSON.stringify({text,answer,tools:[...tools],ms:Math.round(performance.now()-start)}));return answer;};
 await run('confirm_actionで「テスト用ファイルを作成しますか」と確認して、承認された場合のみ、作業ディレクトリのapproval-check.txtへapprovedと書いてください。拒否されたら絶対に作成しないでください。');
 assert.ok(tools.includes('confirm_action'));assert.equal(existsSync(join(home,'approval-check.txt')),false);
 allow=true;
 await run('先ほどのテスト用ファイル作成について、もう一度confirm_actionで確認してください。承認されたらapproval-check.txtへapprovedと書いてください。');
 assert.ok(tools.includes('confirm_action'));assert.match(readFileSync(join(home,'approval-check.txt'),'utf8'),/approved/);
 const image=await run('/tmp/oma-local-vision-red.png をreadツールで見て、画像全体の色だけを日本語で答えてください。');assert.match(image,/赤/);
 await run('rememberツールでtest_favoriteというキーに「紫」を保存して。');assert.equal(memory.facts().find(f=>f.key==='test_favorite')?.value,'紫');
 await run('search_memoryツールでtest_favoriteを検索し、保存されている色を答えて。');assert.ok(tools.includes('search_memory'));
 await run('forgetツールでtest_favoriteの記憶を消して。');assert.equal(memory.facts().some(f=>f.key==='test_favorite'),false);
 await run('バイバイ。会話を終了して。');assert.equal(dismissed,true);
 console.log('ALL LOCAL TOOL CHECKS PASSED');
}finally{clearTimeout(timer);await agent.close();memory.close();rmSync(home,{recursive:true,force:true});}
