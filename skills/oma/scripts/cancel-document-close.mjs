// Cancel a verified OmaText dialog through normal input, preserving its buffer.
export async function cancelOmaTextClose({desktop,address}){
 desktop.check();
 const windows=await desktop.json(['clients']);
 const target=windows.find(w=>w.address===address&&w.mapped&&!w.hidden&&/ — OmaText$/.test(w.title));
 if(!target)throw Error('Could not identify the pending OmaText target');
 const siblings=windows.filter(w=>w.address!==address&&w.mapped&&!w.hidden&&w.pid===target.pid&&w.workspace?.id===target.workspace?.id&&!/^O\.M\.A\.( Mini)?$/.test(w.title));
 if(siblings.length)throw Error('A separate modal or ambiguous shell window is present. Inspect the current dialog before acting.');
 const inspect=async()=>JSON.parse((await desktop.command('omarchy-shell',['shell','call','io.github.komagata.omatext','inspectState',''])).toString());
 const before=await inspect();
 if(!before.opened||before.busy)throw Error('The editor is not available for cancellation');
 if(!before.editor?.modalOpen)return {cancelled:true,documentOpen:true,alreadyReady:true,address};
 await desktop.dispatch(`hl.dsp.focus({window="address:${address}"})`);
 let state=await inspect();
 if(!state.active)await desktop.command('omatext',[]);
 for(let n=0;n<20;n++){
  desktop.check();state=await inspect();
  if(state.active)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!state.active)throw Error('The editor did not become active for cancellation');
 await desktop.screenshot();
 if(desktop.frame?.active!==address)throw Error('The pending editor is no longer focused');
 await desktop.call('desktop_key',{frameId:desktop.frame.id,key:'Escape'});
 for(let n=0;n<20;n++){
  desktop.check();state=await inspect();
  if(!state.opened||state.length!==before.length||state.url!==before.url||state.modified!==before.modified)throw Error('The document changed while cancelling; preserved work could not be verified');
  if(!state.editor?.modalOpen&&!state.busy)return {cancelled:true,documentOpen:true,address};
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('The native dialog is still open; cancellation is incomplete');
}
