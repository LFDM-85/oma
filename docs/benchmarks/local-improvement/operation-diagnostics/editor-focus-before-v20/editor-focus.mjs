// Direct diagnostic only: exercise the production helper without a model.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Desktop,runDesktopCommand as run} from '../../../runtime/desktop.mjs';
import {dockingReady} from './desktop-state.mjs';
const job=JSON.parse(readFileSync(process.argv[2]));
const {newOmaTextDocument}=await import(pathToFileURL(job.module));
const out=value=>console.log(JSON.stringify(value));
const ipc=(...args)=>run('omarchy-shell',['io.github.komagata.oma',...args]);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let updates=Promise.resolve();
const guarded=async(command,args,options)=>{
 await updates;
 const workspace=JSON.parse(await run('hyprctl',['-j','activeworkspace']));
 if(workspace.id!==job.workspace)throw Error('Workspace changed');
 const result=await run(command,args,options);
 if(command==='omarchy-shell'&&args.includes('inspectState'))out({event:'native_state',state:JSON.parse(result)});
 if(command==='hyprctl'&&args.includes('activewindow'))out({event:'focus',state:JSON.parse(result)});
 return result;
};
const desktop=new Desktop({run:guarded,emit:patch=>{
 if(typeof patch.computerUsing==='boolean')updates=updates.then(()=>ipc('computerUse',String(patch.computerUsing)));
}});
const companion={async accompany(address){
 const target=JSON.parse(await guarded('hyprctl',['-j','clients'])).find(w=>w.address===address);
 if(target?.workspace?.id!==job.workspace)throw Error('Target outside fixture workspace');
 await ipc('accompany',address);let previous;
 for(let i=0;i<60;i++){
  const state=JSON.parse(await ipc('status'));
  const clients=JSON.parse(await guarded('hyprctl',['-j','clients']));
  const active=JSON.parse(await guarded('hyprctl',['-j','activewindow']));
  const geometry=JSON.stringify(clients.filter(w=>w.address===address||/^O\.M\.A\.( Mini)?$/.test(w.title)).map(w=>[w.address,w.at,w.size]));
  if(dockingReady(state,clients,active.address,address)&&geometry===previous)return {alongside:true,target:address};
  previous=geometry;await wait(100);
 }
 throw Error('Docking did not settle');
}};
const heartbeat=setInterval(()=>{updates=updates.then(()=>ipc('send',''));},5000);
try{
 desktop.begin();
 await wait(job.delayMs||0);
 out({event:'result',result:await newOmaTextDocument({desktop,companion,text:job.text})});
}catch(error){out({event:'error',error:error.message});process.exitCode=1;}
finally{clearInterval(heartbeat);desktop.cancel();await updates;}
