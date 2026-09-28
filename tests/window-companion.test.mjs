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
  if(args[1]?.includes('window.float')&&args[1]?.includes('action="set"'))restored=true;
  return run(command,args);
 };
 f.c.emit=patch=>{if(patch.docked===false)assert.equal(restored,true,'Undocking can hide and replace the surface before its compositor state is restored');};
 await f.c.restore();
});
