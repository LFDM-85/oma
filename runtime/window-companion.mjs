import {runDesktopCommand} from './desktop.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export const isOmaWindow=w=>/^O\.M\.A\.( Mini)?$/.test(w.title);
const own=w=>isOmaWindow(w)&&w.mapped&&!w.hidden;
const address=value=>{if(!/^0x[0-9a-f]+$/i.test(value))throw Error('Invalid window address');return '"address:'+value+'"';};
export function companionWindows(clients,targetAddress){
 const oma=clients.find(own),target=clients.find(w=>w.address===targetAddress&&w.mapped&&!w.hidden);
 if(!oma||!target||own(target))throw Error('Open O.M.A. and the target application first');
 if(target.workspace.id<0||target.fullscreen)throw Error('Use a regular, non-fullscreen application window');
 return {oma,target};
}
// Automatic avoidance is deliberately narrower than explicit accompany_window.
function automaticWindows(clients,targetAddress){
 const oma=clients.find(own),target=clients.find(w=>w.address===targetAddress);
 if(!oma||!target||!target.mapped||target.hidden||isOmaWindow(target))return null;
 const transient=target.transientFor??target.transient_for??target.parentAddress;
 if(target.modal||target.isModal||(transient&&!['0x0','0x','0'].includes(String(transient)))||
    /dialog|popup|menu|tooltip|notification/i.test(String(target.windowType||target.type||'')))return null;
 if(!Number.isInteger(oma.workspace?.id)||oma.workspace.id<=0||target.workspace?.id!==oma.workspace.id||
    !Number.isInteger(oma.monitor)||target.monitor!==oma.monitor||oma.fullscreen||target.fullscreen)return null;
 return {oma,target};
}
export class WindowCompanion {
 constructor({emit,run=runDesktopCommand,wait=pause,poll=true}){Object.assign(this,{emit,run,wait,poll,panelActive:true,panelClosing:false,panelEpoch:0});}
 async json(name){return JSON.parse((await this.run('hyprctl',['-j',name])).toString());}
 async dispatch(code){const result=(await this.run('hyprctl',['dispatch',code])).toString().trim();if(result!=='ok')throw Error(result);}
 layoutChange(operation){
  const pending=(this.changing||Promise.resolve()).then(operation);
  this.changing=pending.catch(()=>{});
  return pending;
 }
 // Closing freezes layout immediately; only the hidden panel may restore it.
 setPanelState(active,closing){
  active=active===true;closing=closing===true;
  if(this.panelActive===active&&this.panelClosing===closing)return Promise.resolve();
  this.panelActive=active;this.panelClosing=closing;const epoch=++this.panelEpoch;
  if(closing||!active)this.setAutoVisible(false);
  if(closing)return Promise.resolve();
  return this.layoutChange(async()=>{
   await this.checking;
   if(epoch!==this.panelEpoch)return;
   this.busy=true;
   try{if(!active)await this.restoreNow();else await this.restorePendingOma(epoch);}
   finally{this.busy=false;}
  });
 }
 async restorePendingOma(epoch){
  if(!this.pendingOma)return;
  const saved=this.pendingOma,current=()=>epoch===this.panelEpoch&&this.panelActive&&!this.panelClosing&&this.pendingOma===saved;
  let verifiedAddress=null;
  // Mapping and configure are asynchronous. Require two matching readbacks,
  // not merely a dispatch "ok", and retain the snapshot if the bound expires.
  for(let attempt=0;attempt<12;attempt++){
   const clients=await this.json('clients');
   if(!current())return;
   const oma=clients.find(w=>w.address===saved.address&&own(w))||clients.find(own);
   if(oma){
    const matches=oma.floating===saved.floating&&oma.workspace.id===saved.workspace.id&&
     (!saved.floating||(oma.size.every((v,i)=>v===saved.size[i])&&oma.at.every((v,i)=>v===saved.at[i])));
    if(matches){
     if(verifiedAddress===oma.address){this.pendingOma=null;return;}
     verifiedAddress=oma.address;
    }else{
     verifiedAddress=null;
     if(!await this.restoreWindow({...saved,address:oma.address},current))return;
    }
   }else verifiedAddress=null;
   await this.wait(50);
  }
 }
 async restoreWindow(w,current=()=>!this.panelClosing){
  // Hyprland's float action uses enable/disable; set/unset silently toggle.
  const a=address(w.address),commands=[`hl.dsp.window.float({window=${a},action="${w.floating?'enable':'disable'}"})`];
  if(w.workspace.id>0)commands.push(`hl.dsp.window.move({window=${a},workspace="${w.workspace.id}",follow=false})`);
  if(w.floating)commands.push(`hl.dsp.window.resize({window=${a},x=${w.size[0]},y=${w.size[1]}})`,`hl.dsp.window.move({window=${a},x=${w.at[0]},y=${w.at[1]}})`);
  for(const code of commands){if(!current())return false;await this.dispatch(code);}
  return current();
 }
 setAutoVisible(active){
  this.autoVisible=active===true;
  if(!this.autoVisible){this.autoPending?.clear();}
 }
 autoClose(targetAddress){this.autoPending?.delete(targetAddress);}
 autoOpen(targetAddress){
  address(targetAddress);
  if(!this.autoVisible||!this.panelActive||this.panelClosing)return Promise.resolve({alongside:false});
  this.autoPending??=new Map();
  if(this.autoPending.has(targetAddress))return this.autoPending.get(targetAddress).promise;
  if(this.autoPending.size>=16)return Promise.resolve({alongside:false});
  const request={};this.autoPending.set(targetAddress,request);
  const current=()=>this.autoVisible&&this.autoPending.get(targetAddress)===request;
  request.promise=this.layoutChange(async()=>{
   // Hyprland announces opens before mapped client metadata necessarily settles.
   for(let attempt=0;attempt<6;attempt++){
    await this.wait(100);
    if(!current())return {alongside:false};
    const clients=await this.json('clients');
    if(!current())return {alongside:false};
    const target=clients.find(w=>w.address===targetAddress);
    if(!target||!target.mapped)continue;
    // A late O.M.A. map can arrive after the panel's bounded lookup expired.
    if(own(target)&&this.pendingOma){await this.restorePendingOma(this.panelEpoch);return {alongside:false};}
    if(!automaticWindows(clients,targetAddress))return {alongside:false};
    return this.accompanyNow(targetAddress,current);
   }
   return {alongside:false};
  }).finally(()=>{if(this.autoPending.get(targetAddress)===request)this.autoPending.delete(targetAddress);});
  return request.promise;
 }
 accompany(targetAddress){return this.layoutChange(()=>this.accompanyNow(targetAddress));}
 async accompanyNow(targetAddress,automatic=null){
  address(targetAddress);
  await this.checking;
  if(!this.panelActive||this.panelClosing)return {alongside:false};
  if(this.busy)throw Error('Window layout is changing');
  this.busy=true;let changedLayout=false;
  const epoch=this.panelEpoch,current=()=>epoch===this.panelEpoch&&this.panelActive&&!this.panelClosing;
  try{
   if(this.pendingOma){await this.restorePendingOma(epoch);if(this.pendingOma||!current())return {alongside:false};}
   if(this.saved?.target.address===targetAddress)return {alongside:true};
   let clients=await this.json('clients');
   if(!current())return {alongside:false};
   if(automatic&&(!automatic()||!automaticWindows(clients,targetAddress)))return {alongside:false};
   let {oma,target}=companionWindows(clients,targetAddress);
   if(this.saved){await this.restoreNow(clients);clients=await this.json('clients');
    if(!current())return {alongside:false};
    if(automatic&&(!automatic()||!automaticWindows(clients,targetAddress)))return {alongside:false};
    ({oma,target}=companionWindows(clients,targetAddress));}
   const layout=JSON.parse((await this.run('hyprctl',['-j','getoption','general:layout'])).toString());
   if(automatic&&layout.str!=='dwindle')return {alongside:false};
   if(layout.str!=='dwindle')throw Error('Side-by-side mode currently requires the dwindle layout');
   if(automatic){
    await this.wait(120);
    clients=await this.json('clients');
    if(!automatic()||!automaticWindows(clients,targetAddress))return {alongside:false};
    ({oma,target}=automaticWindows(clients,targetAddress));
   }
   if(!current())return {alongside:false};
   this.saved={oma,target};changedLayout=true;this.emit({docked:true});
   // Let QML lower minimumSize after docked:true before compositor tiling.
   await this.wait(120);
   if(!current())return {alongside:false};
   if(automatic&&!automatic()){await this.restoreNow();return {alongside:false};}
   const mutate=async code=>{
    if(!current()||(automatic&&!automatic()))throw Error('Companion placement cancelled');
    await this.dispatch(code);
   };
   const o=address(oma.address),t=address(target.address);
   if(oma.workspace.id!==target.workspace.id)await mutate(`hl.dsp.window.move({window=${o},workspace="${target.workspace.id}",follow=false})`);
   if(target.floating)await mutate(`hl.dsp.window.float({window=${t},action="disable"})`);
   await mutate(`hl.dsp.focus({window=${t}})`);
   await mutate('hl.dsp.layout("preselect r")');
   await mutate(`hl.dsp.window.float({window=${o},action="disable"})`);
   await mutate(`hl.dsp.focus({window=${o}})`);
   const width=oma.title.endsWith(' Mini')?200:360;
   const ratio=Math.min(1.8,2*(1-width/Math.max(target.size[0],width*2)));
   await mutate(`hl.dsp.layout("splitratio ${ratio.toFixed(3)} exact")`);
   await mutate(`hl.dsp.focus({window=${t}})`);
   if(this.poll){this.timer=setInterval(()=>this.check().catch(()=>{}),500);this.timer.unref();}
   return {alongside:true,target:target.address};
  }catch(e){if(changedLayout&&this.saved&&current())await this.restoreNow().catch(()=>{});if(e.message==='Companion placement cancelled')return {alongside:false};throw e;}finally{this.busy=false;}
 }
 closeTarget(targetAddress){return this.layoutChange(()=>this.closeTargetNow(targetAddress));}
 async closeTargetNow(targetAddress){
  address(targetAddress);
  await this.checking;
  if(this.busy)throw Error('Window layout is changing');
  this.busy=true;
  try{
   const target={address:targetAddress};
   const clients=await this.json('clients');
   const current=clients.find(w=>w.address===target.address&&w.mapped);
   if(!current)throw Error('Target window not found. Call list_windows and identify the requested window before closing.');
   if(own(current))throw Error('Refusing to close O.M.A. as an application');
   await this.dispatch(`hl.dsp.window.close({window=${address(target.address)}})`);
   for(let i=0;i<20;i++){
    const remaining=await this.json('clients');
    if(!remaining.some(w=>w.address===target.address&&w.mapped)){if(this.saved?.target.address===target.address)await this.restoreNow(remaining);return {closed:true,conversationContinues:true};}
    await this.wait(100);
   }
   return {closed:false,conversationContinues:true,requiresAttention:true,message:'The application is still open. Check for an unsaved-changes dialog. A request to close does NOT authorize discarding or saving changes. Ask save, discard, or cancel and STOP this turn to wait for the user unless they already explicitly chose one. Without an explicit choice, never press Enter or click a choice on their behalf. Once the user chooses, use desktop tools to apply that choice to the existing dialog and verify the result; do not ask again or repeat the close request.'};
  }finally{this.busy=false;}
 }
 check(){
  if(this.busy||!this.saved||this.panelClosing||!this.panelActive)return Promise.resolve();
  this.busy=true;
  const watched=this.saved.target.address;
  this.checking=(async()=>{
   try{const clients=await this.json('clients');if(this.saved?.target.address===watched&&!clients.some(w=>w.address===watched&&w.mapped))await this.restoreNow(clients);}
   finally{this.busy=false;this.checking=null;}
  })();
  return this.checking;
 }
 restore(){return this.layoutChange(async()=>{
  await this.checking;this.busy=true;
  try{return await this.restoreNow();}finally{this.busy=false;}
 });}
 async restoreNow(clients){
  if(this.panelClosing)return {floating:false};
  clearInterval(this.timer);this.timer=null;
  const saved=this.saved;if(!saved)return {floating:true,viewModeChanged:false,message:'Mini/normal presentation is unchanged. Use set_view_mode to switch between the face-only mini and normal view.'};
  clients??=await this.json('clients');
  if(this.panelClosing)return {floating:false};
  // A fully hidden surface must not be confused with a newly mapped session.
  const currentOma=this.panelActive?(clients.find(c=>c.address===saved.oma.address&&c.mapped&&isOmaWindow(c))||clients.find(own)):null;
  const originalOma=currentOma?{...saved.oma,address:currentOma.address}:null;
  if(!this.panelActive)this.pendingOma=saved.oma;
  for(const w of [...(originalOma?[originalOma]:[]),...(saved.target.floating?[saved.target]:[])]){
   if(!clients.some(c=>c.address===w.address&&c.mapped))continue;
   if(!await this.restoreWindow(w))return {floating:false};
  }
  if(this.panelClosing)return {floating:false};
  this.saved=null;this.emit({docked:false});return {floating:true,viewModeChanged:false,message:'Mini/normal presentation is unchanged. Use set_view_mode to switch between the face-only mini and normal view.'};
 }
}
