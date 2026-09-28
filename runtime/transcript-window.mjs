import {basename} from 'node:path';
import {runDesktopCommand} from './desktop.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const oma=w=>/^O\.M\.A\.( Mini)?$/.test(w.title);
export function transcriptWindow(clients,before,active,file){
 const visible=clients.filter(w=>w.mapped&&!w.hidden&&!oma(w));
 const named=visible.filter(w=>w.title?.includes(basename(file)));
 if(named.length)return named.find(w=>w.address===active.address)||(named.length===1?named[0]:null);
 const added=visible.filter(w=>!before.some(b=>b.address===w.address));
 return added.length===1&&added[0].address===active.address?added[0]:null;
}
export async function openTranscriptWindow(file,open,{run=runDesktopCommand,sleep=wait}={}){
 const ipc=(...args)=>run('omarchy-shell',['io.github.komagata.oma',...args]);
 const json=async name=>JSON.parse((await run('hyprctl',['-j',name])).toString());
 let before=null;
 try{if(JSON.parse((await ipc('status')).toString()).panelOpened)before=await json('clients');}catch{}
 await open();
 if(!before)return;
 try{
  for(let i=0;i<15;i++){
   const clients=await json('clients'),active=await json('activewindow');
   const target=transcriptWindow(clients,before,active,file);
   if(target){
    await ipc('accompany',target.address);
    for(let j=0;j<15;j++){await sleep(100);const status=JSON.parse((await ipc('status')).toString());if(status.docked)return;if(status.error)throw Error(status.error);}
    throw Error('O.M.A. did not finish moving beside the transcript');
   }
   await sleep(200);
  }
  throw Error('Could not identify the transcript window');
 }catch(error){return 'Transcript opened, but side-by-side placement failed: '+error.message;}
}
