import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../runtime/window-references.mjs');
const windows=[{address:'0xabc123',pid:10,title:'Draft — OmaText',class:'editor',workspace:{id:98},mapped:true},{address:'0xdef456',pid:20,title:'Other app',class:'browser',workspace:{id:98},mapped:true}];
test('window observation excludes inactive workspaces while retaining visible monitors and pinned windows',async()=>{
 const {visibleWorkspaceWindows}=await load();
 const monitors=[{id:0,activeWorkspace:{id:98},specialWorkspace:{id:-4}},{id:1,activeWorkspace:{id:3},specialWorkspace:{id:0}}];
 const clients=[...windows,{...windows[0],address:'background',workspace:{id:2}},
  {...windows[0],address:'other-monitor',workspace:{id:3}},
  {...windows[0],address:'special',workspace:{id:-4}},
  {...windows[0],address:'pinned',workspace:{id:2},monitor:0,pinned:true},
  {...windows[0],address:'hidden',hidden:true}];
 assert.deepEqual(visibleWorkspaceWindows(clients,monitors).map(w=>w.address),['0xabc123','0xdef456','other-monitor','special','pinned']);
 assert.deepEqual(visibleWorkspaceWindows(clients,[]),[]);
});
test('short window references resolve only the observed target and expire on refresh',async()=>{
 const {WindowReferences}=await load(),refs=new WindowReferences();
 const observed=refs.observe(windows);
 assert.equal(observed[0].windowId,'w1');assert.equal(observed[0].address,undefined);
 assert.equal(refs.resolve('w2',windows),'0xdef456');
 assert.throws(()=>refs.resolve('0xdef456',windows),/reference|list_windows/i);
 refs.observe(windows);
 assert.throws(()=>refs.resolve('w2',windows),/reference|list_windows/i);
 assert.equal(refs.resolve('w4',windows),'0xdef456');
});
test('reused addresses, hidden windows and moved targets cannot use a stale reference',async()=>{
 const {WindowReferences}=await load();
 for(const patch of [{pid:30},{title:'A different document'}, {workspace:{id:2}},{hidden:true},{mapped:false}]){
  const refs=new WindowReferences();refs.observe(windows);
  assert.throws(()=>refs.resolve('w1',[{...windows[0],...patch},windows[1]]),/changed|unavailable/i);
 }
});
