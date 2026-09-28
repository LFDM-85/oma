// Short, observation-scoped references avoid copying native compositor pointers.
// They never select a target by focus, position, or fuzzy title matching.
export function visibleWorkspaceWindows(windows,monitors){
 const screens=monitors.filter(m=>!m.disabled);
 const workspaces=new Set(screens.flatMap(m=>[m.activeWorkspace?.id,m.specialWorkspace?.id]).filter(id=>Number.isInteger(id)&&id!==0));
 const ids=new Set(screens.map(m=>m.id));
 return windows.filter(w=>w.mapped&&!w.hidden&&(workspaces.has(w.workspace?.id)||(w.pinned&&ids.has(w.monitor))));
}
export class WindowReferences {
 constructor(){this.sequence=0;this.windows=new Map();}
 observe(windows){
  this.windows.clear();
  return windows.filter(w=>w.mapped&&!w.hidden).map(w=>{
   const windowId='w'+(++this.sequence);
   this.windows.set(windowId,{address:w.address,pid:w.pid,title:w.title,application:w.class,workspace:w.workspace?.id});
   return {windowId,title:w.title,application:w.class,workspace:w.workspace?.id};
  });
 }
 resolve(windowId,windows){
  const saved=this.windows.get(windowId);
  if(!saved)throw Error('Unknown or expired window reference. Call list_windows and use its windowId.');
  const current=windows.find(w=>w.address===saved.address&&w.mapped&&!w.hidden);
  if(!current||current.pid!==saved.pid||current.title!==saved.title||current.class!==saved.application||current.workspace?.id!==saved.workspace)throw Error('The observed window changed or is unavailable. Call list_windows again.');
  return saved.address;
 }
}
