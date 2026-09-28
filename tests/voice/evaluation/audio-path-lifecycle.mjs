// Opt-in live PipeWire test. Owns silent virtual nodes; never changes defaults.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {Audio} from '../../../runtime/audio.mjs';
import {EchoPath} from '../../../runtime/echo-path.mjs';
const execute=promisify(execFile);
const run=async(command,args=[]) => (await execute(command,args,{timeout:10000,maxBuffer:4*1024*1024})).stdout.trim();
const defaults=async()=>({source:await run('pactl',['get-default-source']),sink:await run('pactl',['get-default-sink'])});
const before=await defaults(),prefix=`oma-lifecycle-${process.pid}`,modules=[],errors=[],trials=[];
const path=new EchoPath({inputTarget:prefix+'-source',run});
const audio=new Audio(()=>{},e=>errors.push(e),{inputTarget:path.source,outputTarget:path.sink});
try{
 modules.push(await run('pactl',['load-module','module-null-sink',`sink_name=${prefix}-sink`,'sink_properties=priority.session=0']));
 modules.push(await run('pactl',['load-module','module-remap-source',`master=${prefix}-sink.monitor`,`source_name=${prefix}-source`,'source_properties=priority.session=0']));
 for(let index=0;index<12;index++){
  const start=performance.now();await path.start();audio.record(()=>{});audio.enqueue(Buffer.alloc(24000));
  await new Promise(resolve=>setTimeout(resolve,180));
  const children=[audio.recorder,audio.player,path.child];
  await audio.close();await path.close();
  assert.ok(children.every(child=>!child||child.exitCode!==null||child.signalCode!==null),'An owned audio process survived close');
  const nodes=JSON.parse(await run('pw-dump'));
  assert.ok(!nodes.some(n=>n.info?.props?.['node.name']?.startsWith(path.prefix)),'An echo node survived close');
  trials.push({index,elapsed_ms:performance.now()-start,owned_processes_exited:true,echo_nodes_removed:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await defaults(),before);
}finally{
 await audio.close();await path.close();
 for(const module of modules.reverse())await run('pactl',['unload-module',module]);
}
assert.deepEqual(await defaults(),before);
console.log(JSON.stringify({test:'silent-pipewire-lifecycle',trials,defaults_unchanged:true,errors},null,2));
