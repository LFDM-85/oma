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
export class WindowCompanion {
 constructor({emit,run=runDesktopCommand,wait=pause,poll=true}){Object.assign(this,{emit,run,wait,poll});}
 async json(name){return JSON.parse((await this.run('hyprctl',['-j',name])).toString());}
 async dispatch(code){const result=(await this.run('hyprctl',['dispatch',code])).toString().trim();if(result!=='ok')throw Error(result);}
 async accompany(targetAddress){
  address(targetAddress);
  await this.checking;
  if(this.busy)throw Error('Window layout is changing');
  this.busy=true;let changedLayout=false;
  try{
   if(this.saved?.target.address===targetAddress)return {alongside:true};
   let clients=await this.json('clients');let {oma,target}=companionWindows(clients,targetAddress);
   if(this.saved){await this.restore(clients);clients=await this.json('clients');({oma,target}=companionWindows(clients,targetAddress));}
   const layout=JSON.parse((await this.run('hyprctl',['-j','getoption','general:layout'])).toString());
   if(layout.str!=='dwindle')throw Error('Side-by-side mode currently requires the dwindle layout');
   this.saved={oma,target};changedLayout=true;this.emit({docked:true});await this.wait(120);
   const o=address(oma.address),t=address(target.address);
   if(oma.workspace.id!==target.workspace.id)await this.dispatch(`hl.dsp.window.move({window=${o},workspace="${target.workspace.id}",follow=false})`);
   if(target.floating)await this.dispatch(`hl.dsp.window.float({window=${t},action="unset"})`);
   await this.dispatch(`hl.dsp.focus({window=${t}})`);
   await this.dispatch('hl.dsp.layout("preselect r")');
   await this.dispatch(`hl.dsp.window.float({window=${o},action="unset"})`);
   await this.dispatch(`hl.dsp.focus({window=${o}})`);
   const width=oma.title.endsWith(' Mini')?200:360;
   const ratio=Math.min(1.8,2*(1-width/Math.max(target.size[0],width*2)));
   await this.dispatch(`hl.dsp.layout("splitratio ${ratio.toFixed(3)} exact")`);
   await this.dispatch(`hl.dsp.focus({window=${t}})`);
   if(this.poll){this.timer=setInterval(()=>this.check().catch(()=>{}),500);this.timer.unref();}
   return {alongside:true,target:target.address};
  }catch(e){if(changedLayout&&this.saved)await this.restore().catch(()=>{});throw e;}finally{this.busy=false;}
 }
 async closeTarget(targetAddress){
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
    if(!remaining.some(w=>w.address===target.address&&w.mapped)){if(this.saved?.target.address===target.address)await this.restore(remaining);return {closed:true,conversationContinues:true};}
    await this.wait(100);
   }
   return {closed:false,conversationContinues:true,requiresAttention:true,message:'The application is still open. Check for an unsaved-changes dialog. A request to close does NOT authorize discarding or saving changes. Ask save, discard, or cancel and STOP this turn to wait for the user unless they already explicitly chose one. Without an explicit choice, never press Enter or click a choice on their behalf. Once the user chooses, use desktop tools to apply that choice to the existing dialog and verify the result; do not ask again or repeat the close request.'};
  }finally{this.busy=false;}
 }
 check(){
  if(this.busy||!this.saved)return Promise.resolve();
  this.busy=true;
  const watched=this.saved.target.address;
  this.checking=(async()=>{
   try{const clients=await this.json('clients');if(this.saved?.target.address===watched&&!clients.some(w=>w.address===watched&&w.mapped))await this.restore(clients);}
   finally{this.busy=false;this.checking=null;}
  })();
  return this.checking;
 }
 async restore(clients){
  clearInterval(this.timer);this.timer=null;
  const saved=this.saved;if(!saved)return {floating:true,viewModeChanged:false,message:'Mini/normal presentation is unchanged. Use set_view_mode to switch between the face-only mini and normal view.'};
  clients??=await this.json('clients');
  // Undocking may hide the face during a desktop action and replace its
  // Wayland surface. Restore compositor state while that surface is still live.
  // A hide/show cycle can replace the Wayland surface and its address.
  const currentOma=clients.find(c=>c.address===saved.oma.address&&c.mapped)||clients.find(own);
  const originalOma={...saved.oma,address:currentOma?.address||saved.oma.address};
  for(const w of [originalOma,...(saved.target.floating?[saved.target]:[])]){
   if(!clients.some(c=>c.address===w.address&&c.mapped))continue;
   const a=address(w.address);
   await this.dispatch(`hl.dsp.window.float({window=${a},action="${w.floating?'set':'unset'}"})`);
   if(w.workspace.id>0)await this.dispatch(`hl.dsp.window.move({window=${a},workspace="${w.workspace.id}",follow=false})`);
   if(w.floating){await this.dispatch(`hl.dsp.window.resize({window=${a},x=${w.size[0]},y=${w.size[1]}})`);await this.dispatch(`hl.dsp.window.move({window=${a},x=${w.at[0]},y=${w.at[1]}})`);}
  }
  this.saved=null;this.emit({docked:false});return {floating:true,viewModeChanged:false,message:'Mini/normal presentation is unchanged. Use set_view_mode to switch between the face-only mini and normal view.'};
 }
}
