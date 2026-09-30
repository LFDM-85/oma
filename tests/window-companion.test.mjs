import test from 'node:test';import assert from 'node:assert/strict';import {WindowCompanion} from '../runtime/window-companion.mjs';
function fixture(){const oma={address:'0x10',title:'O.M.A.',mapped:true,floating:true,at:[40,60],size:[600,600],workspace:{id:1}},app={address:'0x20',title:'Editor',mapped:true,floating:false,at:[0,0],size:[1200,700],workspace:{id:1}};let clients=[oma,app];const calls=[],patches=[];const c=new WindowCompanion({emit:p=>patches.push(p),poll:false,wait:async()=>{},run:async(_,args)=>{calls.push(args);return Buffer.from(args.includes('clients')?JSON.stringify(clients):args.includes('getoption')?'{"str":"dwindle"}':'ok')}});return {c,calls,patches,setClients:v=>clients=v,oma,app};}
test('tiles on the right; target close restores original floating geometry',async()=>{const f=fixture();await f.c.accompany('0x20');assert.ok(f.calls.some(a=>a[1]?.includes('preselect r')));await f.c.check();assert.equal(f.patches.length,1);f.setClients([f.oma]);await f.c.check();assert.deepEqual(f.patches,[{docked:true},{docked:false}]);assert.ok(f.calls.some(a=>a[1]?.includes('x=40,y=60')));assert.ok(f.calls.some(a=>a[1]?.includes('x=600,y=600')));assert.equal(f.c.saved,null);});
test('does not move an unrelated window or accept injected addresses',async()=>{const f=fixture();await assert.rejects(()=>f.c.accompany('0x20";bad'),/Invalid/);await assert.rejects(()=>f.c.accompany('0x30'),/target/);assert.equal(f.calls.filter(a=>a[0]==='dispatch').length,0);});
test('an invalid new companion target does not undo an existing valid layout',async()=>{
 const f=fixture();await f.c.accompany('0x20');const count=f.calls.filter(a=>a[0]==='dispatch').length;
 await assert.rejects(()=>f.c.accompany('0x10'),/target application/);
 assert.equal(f.c.saved?.target.address,'0x20');
 assert.equal(f.calls.filter(a=>a[0]==='dispatch').length,count);
 assert.deepEqual(f.patches,[{docked:true}]);
});
test('a focus change or unrelated close does not detach; repeated attachment is idempotent',async()=>{const f=fixture();await f.c.accompany('0x20');const count=f.calls.length;await f.c.accompany('0x20');assert.equal(f.calls.length,count);await f.c.check();assert.ok(f.c.saved);await f.c.restore();assert.equal(f.c.saved,null);});
test('temporary hiding during desktop observation does not detach',async()=>{const f=fixture();await f.c.accompany('0x20');f.setClients([f.app]);await f.c.check();assert.ok(f.c.saved);assert.deepEqual(f.patches,[{docked:true}]);});
test('a compositor error restores presentation rather than reporting success',async()=>{const f=fixture(),run=f.c.run;let failed=false;f.c.run=async(c,a)=>{if(!failed&&a[1]?.includes('preselect')){failed=true;throw Error('layout failed');}return run(c,a)};await assert.rejects(()=>f.c.accompany('0x20'),/layout failed/);assert.equal(f.c.saved,null);assert.deepEqual(f.patches,[{docked:true},{docked:false}]);});
test('closing the log targets its address and restores OMA without dismissing it',async()=>{
 const f=fixture();await f.c.accompany('0x20');const run=f.c.run;
 f.c.run=async(c,a)=>{if(a[1]?.includes('window.close')){assert.match(a[1],/address:0x20/);f.setClients([f.oma]);}return run(c,a)};
 assert.deepEqual(await f.c.closeTarget('0x20'),{closed:true,conversationContinues:true});
 assert.equal(f.c.saved,null);assert.equal(f.patches.some(p=>p.dismiss),false);
 assert.equal(f.calls.filter(a=>a[1]?.includes('window.close')).length,1);
});
test('save dialogs keep the conversation and target alive without claiming closure',async()=>{
 const f=fixture();await f.c.accompany('0x20');const result=await f.c.closeTarget('0x20');assert.equal(result.closed,false);assert.equal(result.conversationContinues,true);assert.ok(f.c.saved);
});

test('closing a different identified window leaves the companion attached',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 const other={...f.app,address:'0x30',title:'Other editor'};f.setClients([f.oma,f.app,other]);
 const run=f.c.run;f.c.run=async(c,a)=>{if(a[1]?.includes('window.close')){assert.match(a[1],/address:0x30/);f.setClients([f.oma,f.app]);}return run(c,a)};
 const result=await f.c.closeTarget('0x30');assert.equal(result.closed,true);assert.equal(f.c.saved.target.address,'0x20');
 await assert.rejects(()=>f.c.closeTarget('0x10'),/Refusing/);
});
test('restores the current OMA window if the compositor replaced its address',async()=>{
 const f=fixture();await f.c.accompany('0x20');f.setClients([{...f.oma,address:'0x11',at:[900,38],size:[352,670]}]);
 await f.c.check();assert.ok(f.calls.some(a=>a[1]?.includes('address:0x11')&&a[1]?.includes('x=40,y=60')));
});

test('an unknown window address is not reported as a successful close',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 await assert.rejects(()=>f.c.closeTarget('0x999'),/not found/i);
 assert.equal(f.calls.some(a=>a[1]?.includes('window.close')),false);
 assert.equal(f.c.saved.target.address,'0x20');
});

test('a close request waits for an in-flight companion poll instead of being rejected',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 const run=f.c.run;let release,started;const polling=new Promise(r=>started=r);let intercept=true;
 f.c.run=async(c,a)=>{
  if(intercept&&a.includes('clients')){intercept=false;started();await new Promise(r=>release=r)}
  if(a[1]?.includes('window.close'))f.setClients([f.oma]);
  return run(c,a);
 };
 const check=f.c.check();await polling;
 const close=f.c.closeTarget('0x20');
 const outcome=close.then(value=>({value}),error=>({error}));
 release();await check;
 const result=await outcome;assert.equal(result.error,undefined);assert.equal(result.value.closed,true);
});

test('restoring the window layout explicitly preserves mini/normal presentation',async()=>{
 const {c,patches}=fixture();
 const result=await c.restore();
 assert.equal(result.viewModeChanged,false);
 assert.match(result.message,/set_view_mode/);
 assert.ok(patches.every(p=>p.viewMode===undefined));
});

test('restores compositor geometry before releasing the docked surface visibility',async()=>{
 const f=fixture();await f.c.accompany('0x20');let restored=false;
 const run=f.c.run;
 f.c.run=async(command,args)=>{
  if(args[1]?.includes('window.float')&&args[1]?.includes('action="enable"'))restored=true;
  return run(command,args);
 };
 f.c.emit=patch=>{if(patch.docked===false)assert.equal(restored,true,'Undocking can hide and replace the surface before its compositor state is restored');};
 await f.c.restore();
});

test('restore during accompany waits until tiling completes before restoring geometry',async()=>{
 const f=fixture();let release,started;
 const waiting=new Promise(resolve=>started=resolve);
 f.c.wait=async()=>{started();await new Promise(resolve=>release=resolve)};
 const accompany=f.c.accompany('0x20');await waiting;
 const restore=f.c.restore();release();await Promise.all([accompany,restore]);
 const dispatches=f.calls.filter(args=>args[0]==='dispatch').map(args=>args[1]);
 const tile=dispatches.findLastIndex(code=>code.includes('action="disable"'));
 const resize=dispatches.findLastIndex(code=>code.includes('x=600,y=600'));
 assert.ok(resize>tile,'Restoring before accompany finishes leaves O.M.A. tiled after saved state is cleared');
 assert.equal(f.c.saved,null);
 assert.deepEqual(f.patches,[{docked:true},{docked:false}]);
});

test('an absent OMA surface still restores a floating target and releases docking',async()=>{
 const f=fixture();f.app.floating=true;await f.c.accompany('0x20');
 f.setClients([f.app]);const start=f.calls.length;
 await f.c.restore();
 const dispatches=f.calls.slice(start).filter(args=>args[0]==='dispatch').map(args=>args[1]);
 assert.ok(dispatches.every(code=>code.includes('address:0x20')));
 assert.ok(dispatches.some(code=>code.includes('x=1200,y=700')));
 assert.equal(f.c.saved,null);
 assert.deepEqual(f.patches,[{docked:true},{docked:false}]);
});

test('a recycled OMA address cannot reposition an unrelated application on restore',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 f.setClients([{...f.app,address:f.oma.address,title:'Unrelated application'},f.app]);
 const start=f.calls.length;await f.c.restore();
 assert.equal(f.calls.slice(start).some(args=>args[0]==='dispatch'),false);
 assert.equal(f.c.saved,null);
});

test('multiple restore requests produce one restoration and subsequent cycles save fresh geometry',async()=>{
 const f=fixture();
 for(let cycle=0;cycle<3;cycle++){
  const width=640+cycle*20,height=760-cycle*20;
  f.setClients([{...f.oma,size:[width,height]},f.app]);
  await f.c.accompany('0x20');
  await Promise.all([f.c.restore(),f.c.restore()]);
  assert.equal(f.calls.filter(args=>args[1]?.includes(`x=${width},y=${height}`)).length,1);
 }
 assert.deepEqual(f.patches,Array.from({length:3},()=>[{docked:true},{docked:false}]).flat());
});

test('a mapped but hidden original OMA surface can still recover compositor geometry',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 f.setClients([{...f.oma,hidden:true},f.app]);
 const start=f.calls.length;await f.c.restore();
 assert.ok(f.calls.slice(start).some(args=>args[1]?.includes('address:0x10')&&args[1]?.includes('x=600,y=600')));
});

test('polling cannot start a second restoration while explicit restore is in flight',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 const run=f.c.run;let release,started,queries=0;
 const waiting=new Promise(resolve=>started=resolve);
 f.c.run=async(command,args)=>{
  if(args.includes('clients')){
   queries++;
   if(queries===1){started();await new Promise(resolve=>release=resolve)}
  }
  return run(command,args);
 };
 const restore=f.c.restore();await waiting;
 await f.c.check();release();await restore;
 assert.equal(queries,1);
 assert.deepEqual(f.patches,[{docked:true},{docked:false}]);
});

function automaticFixture(){const f=fixture();f.oma.monitor=0;f.app.monitor=0;return f;}
test('a manual application open automatically accompanies without an AI call',async()=>{
 const f=automaticFixture();f.c.setAutoVisible(true);await f.c.autoOpen('0x20');
 assert.equal(f.c.saved?.target.address,'0x20');assert.ok(f.calls.some(a=>a[1]?.includes('preselect r')));
 const count=f.calls.length;await f.c.accompany('0x20');assert.equal(f.calls.length,count);
});
test('automatic opens exclude unrelated workspace, monitor, self, hidden, dialogs and fullscreen',async()=>{
 for(const patch of [{workspace:{id:2}},{monitor:1},{title:'O.M.A. Mini'},{hidden:true},{modal:true},{transientFor:'0x40'},{windowType:'dialog'},{fullscreen:1},{workspace:{id:-99}}]){
  const f=automaticFixture();Object.assign(f.app,patch);f.c.setAutoVisible(true);await f.c.autoOpen('0x20');
  assert.equal(f.calls.some(a=>a[0]==='dispatch'),false,JSON.stringify(patch));
 }
});
test('automatic mapping retries are bounded and use fresh clients',async()=>{
 const f=automaticFixture();f.setClients([f.oma]);f.c.setAutoVisible(true);let waits=0;
 f.c.wait=async()=>{if(++waits===2)f.setClients([f.oma,f.app]);};await f.c.autoOpen('0x20');assert.equal(f.c.saved?.target.address,'0x20');
 const g=automaticFixture();g.app.mapped=false;g.c.setAutoVisible(true);await g.c.autoOpen('0x20');assert.equal(g.c.saved,undefined);assert.ok(g.calls.length<12);
});
test('close before debounce and hiding OMA cancel pending automatic layouts',async()=>{
 for(const cancel of ['close','hide']){
  const f=automaticFixture();f.c.setAutoVisible(true);let release,started;const waiting=new Promise(r=>started=r);
  f.c.wait=async()=>{started();await new Promise(r=>release=r);};const opening=f.c.autoOpen('0x20');await waiting;
  if(cancel==='close')f.c.autoClose('0x20');else f.c.setAutoVisible(false);
  release();await opening;assert.equal(f.calls.some(a=>a[0]==='dispatch'),false);assert.equal(f.c.saved,undefined);
 }
});
test('automatic replacement and exact target close restore original size including mini',async()=>{
 const f=automaticFixture();f.oma.title='O.M.A. Mini';f.oma.size=[160,200];f.c.setAutoVisible(true);
 await f.c.autoOpen('0x20');const second={...f.app,address:'0x30'};f.setClients([f.oma,f.app,second]);await f.c.autoOpen('0x30');
 assert.equal(f.c.saved.target.address,'0x30');f.setClients([f.oma,f.app]);await f.c.check();assert.equal(f.c.saved,null);
 assert.ok(f.calls.some(a=>a[1]?.includes('x=160,y=200')));
});

test('automatic eligibility is rechecked after debounce and before layout mutation',async()=>{
 for(const change of ['workspace','hide','close']){
  const f=automaticFixture();f.c.setAutoVisible(true);let waits=0;
  f.c.wait=async()=>{if(++waits!==2)return;if(change==='workspace')f.app.workspace={id:2};else if(change==='hide')f.c.setAutoVisible(false);else {f.c.autoClose('0x20');f.setClients([f.oma]);}};
  await f.c.autoOpen('0x20');assert.equal(f.calls.some(a=>a[0]==='dispatch'),false);assert.equal(f.c.saved,undefined);
 }
});
test('automatic requests do not bounce an already explicitly accompanied target',async()=>{
 const f=automaticFixture();await f.c.accompany('0x20');const count=f.calls.filter(a=>a[0]==='dispatch').length;
 f.c.setAutoVisible(true);await Promise.all([f.c.autoOpen('0x20'),f.c.autoOpen('0x20')]);
 assert.equal(f.calls.filter(a=>a[0]==='dispatch').length,count);assert.deepEqual(f.patches,[{docked:true}]);
});
test('automatic requests with missing workspace metadata or unsupported layout quietly skip',async()=>{
 const f=automaticFixture();f.oma.workspace=undefined;f.c.setAutoVisible(true);await f.c.autoOpen('0x20');assert.equal(f.c.saved,undefined);
 const g=automaticFixture(),run=g.c.run;g.c.run=(cmd,args)=>args.includes('getoption')?Promise.resolve(Buffer.from('{"str":"master"}')):run(cmd,args);
 g.c.setAutoVisible(true);assert.deepEqual(await g.c.autoOpen('0x20'),{alongside:false});assert.equal(g.calls.some(a=>a[0]==='dispatch'),false);
});

test('shutdown freezes target-close restoration until the panel is hidden',async()=>{
 const f=fixture();await f.c.accompany('0x20');
 await f.c.setPanelState(true,true);const count=f.calls.length;
 f.setClients([f.oma]);await f.c.check();
 assert.equal(f.calls.length,count);assert.deepEqual(f.patches,[{docked:true}]);
 f.setClients([]);await f.c.setPanelState(false,false);
 assert.deepEqual(f.patches,[{docked:true},{docked:false}]);
});
test('automatic tiling waits after docked emission and cancellation cannot retile or restore a closing panel',async()=>{
 const f=automaticFixture();f.c.setAutoVisible(true);let settled=false;
 f.c.wait=async ms=>{if(ms===120&&f.patches.some(p=>p.docked)){settled=true;await f.c.setPanelState(true,true);f.c.setAutoVisible(false);}};
 await f.c.autoOpen('0x20');assert.equal(settled,true);
 assert.equal(f.calls.some(a=>a[0]==='dispatch'),false);assert.deepEqual(f.patches,[{docked:true}]);
 f.setClients([]);await f.c.setPanelState(false,false);assert.equal(f.c.saved,null);
});
test('next mapped normal and mini panels restore saved floating geometry after hidden restoration',async()=>{
 for(const mini of [false,true]){
  const f=fixture();if(mini){f.oma.title='O.M.A. Mini';f.oma.size=[160,200];}
  await f.c.accompany('0x20');await f.c.setPanelState(true,true);
  f.setClients([f.app]);await f.c.setPanelState(false,false);const count=f.calls.length;
  f.setClients([{...f.oma,address:'0x11',at:[900,40],size:[640,760]},f.app]);
  await f.c.setPanelState(true,false);
  const calls=f.calls.slice(count);assert.ok(calls.some(a=>a[1]?.includes('address:0x11')&&a[1]?.includes('x=40,y=60')));
  assert.ok(calls.some(a=>a[1]?.includes('address:0x11')&&a[1]?.includes(mini?'x=160,y=200':'x=600,y=600')));
 }
});

test('closing during explicit metadata query cannot emit docking after hiding',async()=>{
 const f=fixture(),run=f.c.run;let release,started;const waiting=new Promise(r=>started=r);
 f.c.run=async(c,a)=>{if(a.includes('getoption')){started();await new Promise(r=>release=r);}return run(c,a);};
 const accompany=f.c.accompany('0x20');await waiting;
 await f.c.setPanelState(true,true);release();await accompany;
 assert.deepEqual(f.patches,[]);assert.equal(f.c.saved,undefined);
});
test('a poll already reading clients cannot restore when shutdown starts',async()=>{
 const f=fixture();await f.c.accompany('0x20');const run=f.c.run;let release,started;const waiting=new Promise(r=>started=r);
 f.c.run=async(c,a)=>{if(a.includes('clients')){started();await new Promise(r=>release=r);}return run(c,a);};
 f.setClients([f.oma]);const checking=f.c.check();await waiting;
 await f.c.setPanelState(true,true);const count=f.calls.length;release();await checking;
 assert.equal(f.calls.slice(count).some(a=>a[0]==='dispatch'),false);assert.deepEqual(f.patches,[{docked:true}]);
});
test('reopening during shutdown retains the current tile and cancels hidden restoration',async()=>{
 const f=fixture();await f.c.accompany('0x20');const count=f.calls.length;
 await f.c.setPanelState(true,true);await f.c.setPanelState(true,false);
 assert.equal(f.calls.length,count);assert.deepEqual(f.patches,[{docked:true}]);assert.ok(f.c.saved);
});
test('delayed next-open restoration stops if a new close supersedes it',async()=>{
 const f=fixture();await f.c.accompany('0x20');f.setClients([f.app]);await f.c.setPanelState(false,false);
 const run=f.c.run;let release,started;const waiting=new Promise(r=>started=r);
 f.c.run=async(c,a)=>{if(a.includes('clients')){started();await new Promise(r=>release=r);}return run(c,a);};
 const opening=f.c.setPanelState(true,false);await waiting;
 await f.c.setPanelState(true,true);f.setClients([f.oma,f.app]);const count=f.calls.length;
 release();await opening;assert.equal(f.calls.slice(count).some(a=>a[0]==='dispatch'),false);assert.ok(f.c.pendingOma);
});

test('a stale replacement cannot restore the tile after close animation is cancelled',async()=>{
 const f=fixture();await f.c.accompany('0x20');const second={...f.app,address:'0x30'};f.setClients([f.oma,f.app,second]);
 const run=f.c.run;let release,started;const waiting=new Promise(r=>started=r);let once=true;
 f.c.run=async(c,a)=>{if(once&&a.includes('clients')){once=false;started();await new Promise(r=>release=r);}return run(c,a);};
 const replacement=f.c.accompany('0x30');await waiting;
 await f.c.setPanelState(true,true);const reopening=f.c.setPanelState(true,false);const count=f.calls.length;
 release();await replacement;await reopening;
 assert.equal(f.calls.slice(count).some(a=>a[0]==='dispatch'),false);assert.equal(f.c.saved.target.address,'0x20');
});

// Dispatch acceptance is not a configure acknowledgment. Keep the saved state
// until the mapped surface reports its original floating geometry.
function remapFixture(){
 const f=fixture();f.oma.size=[720,680];
 const run=f.c.run;let live=null;
 f.show=w=>{live=w;f.setClients(w?[w,f.app]:[f.app]);};
 f.c.run=async(cmd,args)=>{
  const code=args[0]==='dispatch'?args[1]:'';
  if(live&&code.includes(`address:${live.address}`)){
   // Hyprland 0.56.2 parseToggleStr: unsupported actions fall back to toggle.
   if(code.includes('window.float')){
    const action=code.match(/action="([^"]+)"/)?.[1];
    live.floating=['enable','on'].includes(action)?true:['disable','off'].includes(action)?false:!live.floating;
   }
   const xy=code.match(/x=(\d+),y=(\d+)/);
   if(xy&&code.includes('window.resize'))live.size=xy.slice(1).map(Number);
   if(xy&&code.includes('window.move'))live.at=xy.slice(1).map(Number);
  }
  return run(cmd,args);
 };
 return f;
}
async function hideCompanion(f){
 await f.c.accompany('0x20');await f.c.setPanelState(true,true);
 f.show(null);await f.c.setPanelState(false,false);
}
test('remap configure after accepted dispatch cannot discard the saved floating geometry',async()=>{
 const f=remapFixture();await hideCompanion(f);
 const remapped={...f.oma,address:'0x11',floating:false,at:[900,38],size:[352,1030]};f.show(remapped);
 let samples=0;f.c.wait=async()=>{
  if(++samples===1){remapped.floating=false;remapped.at=[900,38];remapped.size=[1242,1030];}
 };
 await f.c.setPanelState(true,false);
 assert.ok(samples>=2,'Must read geometry after map/configure instead of trusting dispatch ok');
 assert.equal(remapped.floating,true);assert.deepEqual(remapped.size,[720,680]);assert.deepEqual(remapped.at,[40,60]);
 assert.equal(f.c.pendingOma,null);
});
test('unacknowledged remap restore is bounded and retains the original geometry for retry',async()=>{
 const f=remapFixture();await hideCompanion(f);
 const remapped={...f.oma,address:'0x11',floating:false,size:[1242,1030]};f.show(remapped);
 let waits=0;f.c.wait=async()=>{waits++;remapped.floating=false;remapped.size=[1242,1030];};
 await f.c.setPanelState(true,false);
 assert.ok(waits>0&&waits<=20,'Verification must be bounded');
 assert.deepEqual(f.c.pendingOma?.size,[720,680],'Failed compositor restore must remain recoverable');
});

test('an already-floating remapped surface is not toggled back into the tiling layout',async()=>{
 const f=remapFixture();await hideCompanion(f);
 const remapped={...f.oma,address:'0x11',floating:true,size:[720,680]};f.show(remapped);
 await f.c.setPanelState(true,false);
 assert.equal(remapped.floating,true,'Hyprland treats unsupported action=set as toggle');
 assert.deepEqual(remapped.size,[720,680]);assert.deepEqual(remapped.at,[40,60]);
});

test('float restoration is idempotent for both already-floating and already-tiled surfaces',async()=>{
 // Matches v0.56.2 LuaBindingsInternal.cpp parseToggleStr, which recognizes
 // enable/on and disable/off, not the fullscreen-specific set/unset actions.
 for(const floating of [true,false]){
  const f=remapFixture(),live={...f.oma,floating};f.show(live);
  await f.c.restoreWindow({...live});assert.equal(live.floating,floating);
  await f.c.restoreWindow({...live});assert.equal(live.floating,floating);
 }
});
test('a late own-window open retries retained geometry without accompanying itself',async()=>{
 const f=remapFixture();await hideCompanion(f);
 await f.c.setPanelState(true,false);assert.ok(f.c.pendingOma);
 const live={...f.oma,address:'0x11',floating:true,size:[640,760],at:[500,100]};f.show(live);
 f.c.setAutoVisible(true);const start=f.patches.length;
 assert.deepEqual(await f.c.autoOpen('0x11'),{alongside:false});
 assert.deepEqual(live.size,[720,680]);assert.deepEqual(live.at,[40,60]);
 assert.equal(f.c.pendingOma,null);assert.deepEqual(f.patches.slice(start),[]);
});
test('close during geometry readback cancels restoration and keeps the original snapshot',async()=>{
 const f=remapFixture();await hideCompanion(f);
 const live={...f.oma,address:'0x11',floating:true,size:[640,760]};f.show(live);
 let count;
 f.c.wait=async()=>{await f.c.setPanelState(true,true);count=f.calls.length;};
 await f.c.setPanelState(true,false);
 assert.ok(f.c.pendingOma);assert.deepEqual(f.c.pendingOma.size,[720,680]);
 assert.equal(f.calls.slice(count).some(a=>a[0]==='dispatch'),false);
});
test('failed pending restoration cannot be overwritten by a new automatic layout snapshot',async()=>{
 const f=remapFixture();f.oma.monitor=0;f.app.monitor=0;await hideCompanion(f);
 const live={...f.oma,address:'0x11',floating:false,size:[1242,1030]};f.show(live);
 f.c.wait=async()=>{live.floating=false;live.size=[1242,1030];};
 await f.c.setPanelState(true,false);f.c.setAutoVisible(true);const start=f.patches.length;
 assert.deepEqual(await f.c.autoOpen('0x20'),{alongside:false});
 assert.deepEqual(f.c.pendingOma.size,[720,680]);assert.equal(f.c.saved,null);
 assert.deepEqual(f.patches.slice(start),[]);
});
