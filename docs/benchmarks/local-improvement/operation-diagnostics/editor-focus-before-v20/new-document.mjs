// O.M.A. skill operation for OmaText. Never manufacture a filename for a new buffer.
export async function newOmaTextDocument({desktop,companion,text=''}) {
 if(typeof text!=='string'||text.length>10000||text.includes('\0'))throw Error('Invalid document text');
 await desktop.command('omatext',[]);
 let windows=[];
 for(let i=0;i<30;i++){
  desktop.check();
  windows=(await desktop.json(['clients'])).filter(w=>w.mapped&&!w.hidden&&/ — OmaText$/.test(w.title));
  if(windows.length)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(windows.length!==1)throw Error('Could not identify one OmaText window');
 const address=windows[0].address;
 await companion.accompany(address);
 const inspect=async()=>JSON.parse((await desktop.command('omarchy-shell',['shell','call','io.github.komagata.omatext','inspectState',''])).toString());
 let state=await inspect();
 if(!state.opened)throw Error('OmaText did not open');
 if(state.modified||state.editor?.modalOpen)return {created:false,needsDecision:true,address,reason:'Existing document has unsaved changes or an open dialog. Ask how to handle it.'};
 await desktop.dispatch(`hl.dsp.focus({window="address:${address}"})`);
 await desktop.screenshot();
 if(desktop.frame?.active!==address)throw Error('OmaText is not focused');
 state=await inspect();
 if(!state.active&&!state.modified&&!state.editor?.modalOpen){
  // Tiling can leave compositor focus and Qt activation out of sync. The
  // editor's existing launcher raises its window and calls requestActivate;
  // an empty payload does not open, replace or discard document contents.
  await desktop.command('omatext',[]);
  state=await inspect();
 }
 if(!state.active){
  // Qt may not activate after compositor focus alone. Click the verified editor,
  // using its current bounds after tiling, never a guessed screen position.
  const current=(await desktop.json(['clients'])).find(w=>w.address===address&&w.mapped&&!w.hidden);
  if(!current||state.modified||state.editor?.modalOpen)throw Error('OmaText changed while acquiring focus');
  const frame=desktop.frame;
  const x=Math.floor((current.at[0]+current.size[0]/2-frame.rect.x)*frame.width/frame.rect.width);
  const y=Math.floor((current.at[1]+current.size[1]/2-frame.rect.y)*frame.height/frame.rect.height);
  await desktop.call('desktop_click',{frameId:frame.id,x,y,button:'left'});
 }
 // Compositor focus can precede Qt activation; shortcuts require the latter.
 for(let i=0;i<30;i++){
  desktop.check();state=await inspect();
  if(state.active&&!state.busy)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!state.active||state.busy)throw Error('OmaText has not become active and ready');
 if(state.modified||state.editor?.modalOpen)throw Error('OmaText document changed while waiting for focus');
 await desktop.screenshot();
 if(desktop.frame?.active!==address)throw Error('OmaText is not focused');
 await desktop.call('desktop_key',{frameId:desktop.frame.id,key:'CTRL+n'});
 state=await inspect();
 if(state.url||state.length!==0||state.modified||state.editor?.modalOpen)throw Error('OmaText did not create an empty unsaved document');
 if(text){
  if(desktop.frame?.active!==address)throw Error('OmaText focus changed');
  await desktop.call('desktop_type',{frameId:desktop.frame.id,text});
  state=await inspect();
  if(!state.opened||state.url||state.editor?.modalOpen||state.length!==text.length)throw Error('OmaText text length does not match the requested insertion');
 }
 // Native checks establish the result. Do not feed the assistant's own captions
 // and WORKING label back as document content in an unsolicited full-screen image.
 return {created:true,address,unsaved:true,textInserted:!!text,insertedCharacters:text.length};
}
