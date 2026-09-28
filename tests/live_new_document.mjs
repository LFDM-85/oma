// Opt-in desktop regression: actions are invoked directly, without agent decisions.
// Opening O.M.A. still starts the selected voice provider and microphone.
import {Desktop,runDesktopCommand as run} from '../runtime/desktop.mjs';
import {newOmaTextDocument} from '../skills/oma/scripts/new-document.mjs';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const fixture=join(mkdtempSync(join(tmpdir(),'oma-new-document-')),'previous.txt');
const ipc=(...a)=>run('omarchy-shell',['io.github.komagata.oma',...a]);
const clients=async()=>JSON.parse(await run('hyprctl',['-j','clients']));
if((await clients()).some(w=>w.workspace.id===98||w.title.endsWith(' — OmaText')||/^O\.M\.A\./.test(w.title)))throw Error('Close O.M.A. and OmaText and leave workspace 98 empty first');
const document=JSON.parse(await run('omarchy-shell',['shell','call','io.github.komagata.omatext','inspectState','']));
if(document.modified)throw Error('Save or discard existing OmaText work first');
const original=JSON.parse(await run('hyprctl',['-j','activeworkspace'])).id;
let d;
try{
 await run('hyprctl',['dispatch','hl.dsp.focus({workspace="98"})']);
 writeFileSync(fixture,'Previous probe document.\n');
 await run('omatext',[fixture]);await new Promise(r=>setTimeout(r,600));
 await run('omarchy-shell',['shell','summon','io.github.komagata.oma','{"greet":false,"silent":true}']);
 await new Promise(r=>setTimeout(r,600));
 d=new Desktop({emit(){},run:async(command,args,opts)=>{if(JSON.parse(await run('hyprctl',['-j','activeworkspace'])).id!==98)throw Error('Workspace focus changed');return run(command,args,opts)}});d.begin();
 const companion={async accompany(address){await ipc('accompany',address);await new Promise(r=>setTimeout(r,800));}};
 const result=await newOmaTextDocument({desktop:d,companion,text:''});console.log('CREATED',result.created);
}catch(e){process.exitCode=1;console.log('ERROR',e.message);await new Promise(r=>setTimeout(r,1000));console.log((await run('omarchy-shell',['shell','call','io.github.komagata.omatext','inspectState',''])).toString());}
finally{
 d?.cancel();await ipc('restoreFloating');await ipc('stop');
 for(const w of await clients())if(w.workspace.id===98&&w.title.endsWith(' — OmaText'))await run('hyprctl',['dispatch',`hl.dsp.window.close({window="address:${w.address}"})`]);
 for(let i=0;i<50;i++){if(!(await clients()).some(w=>w.workspace.id===98))break;await new Promise(r=>setTimeout(r,100));}await run('hyprctl',['dispatch',`hl.dsp.focus({workspace="${original}"})`]);
}
