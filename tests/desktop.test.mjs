import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../runtime/desktop.mjs').catch(()=>({}));
test('screenshot coordinates map to scaled and rotated monitors',()=>{
 assert.equal(typeof mod.monitorRect,'function');
 const rect=mod.monitorRect({x:-1280,y:0,width:3840,height:2160,scale:1.5,transform:0});
 assert.deepEqual(rect,{x:-1280,y:0,width:2560,height:1440});
 assert.deepEqual(mod.screenPoint({rect,width:1280,height:720},640,360),{x:0,y:720});
 assert.deepEqual(mod.monitorRect({x:0,y:0,width:1920,height:1080,scale:1,transform:1}),{x:0,y:0,width:1080,height:1920});
 assert.throws(()=>mod.screenPoint({rect,width:1280,height:720},1280,0));
});
test('desktop shortcuts work on an empty desktop while typing still needs a focused window',async()=>{
 const calls=[],monitor={name:'Virtual-1',x:0,y:0,width:1920,height:1080,scale:1,transform:0};
 const d=new mod.Desktop({emit(){},async run(cmd,args){
  calls.push([cmd,args]);
  return Buffer.from(JSON.stringify(args.includes('monitors')?[monitor]:{}));
 }});
 d.begin();d.screenshot=async()=>[];
 const frame=()=>({id:'observed',time:Date.now(),monitor:'Virtual-1',monitorBounds:mod.monitorRect(monitor),active:undefined});
 d.frame=frame();await d.call('desktop_key',{frameId:'observed',key:'SUPER+Return'});
 assert.equal(calls.some(([cmd])=>cmd==='wtype'),true);
 d.frame=frame();await assert.rejects(d.call('desktop_type',{frameId:'observed',text:'hello'}),/focused window/i);
});
test('desktop actions require a fresh screenshot and reject unsupported input',async()=>{
 assert.equal(typeof mod.Desktop,'function');
 const desktop=new mod.Desktop({emit(){}});desktop.begin();
 await assert.rejects(desktop.call('desktop_click',{frameId:'made-up',x:3,y:4,button:'left'}),/screenshot/i);
 await assert.rejects(desktop.call('desktop_shell',{command:'anything'}),/Unknown/);
 desktop.cancel();
 await assert.rejects(desktop.call('desktop_screenshot',{}),/cancel/i);
});
test('modifier spelling is case insensitive without allowing unknown modifiers',async()=>{
 const monitor={name:'test',x:0,y:0,width:1280,height:720,scale:1,transform:0};
 const calls=[];
 const d=new mod.Desktop({emit(){},run:async(command,args)=>{
  if(command==='wtype'){calls.push(args);return Buffer.alloc(0)}
  return Buffer.from(JSON.stringify(args.includes('monitors')?[monitor]:{address:'0x20'}));
 }});
 d.begin();d.screenshot=async()=>[];
 const observe=()=>{d.frame={id:'f',time:Date.now(),monitor:'test',monitorBounds:mod.monitorRect(monitor),active:'0x20'}};
 observe();await d.call('desktop_key',{frameId:'f',key:'ctrl+a'});
 assert.ok(calls[0].includes('ctrl'));
 observe();await assert.rejects(d.call('desktop_key',{frameId:'f',key:'unknown+a'}),/Invalid shortcut/);
 assert.equal(calls.length,1);
});
test('hides the floating assistant before checking focus and sending a shortcut',async()=>{
 let hidden=false,sent=false;
 const monitor={name:'test',x:0,y:0,width:1280,height:720,scale:1,transform:0};
 const d=new mod.Desktop({emit:p=>{if(p.computerUsing)hidden=true},run:async(cmd,args)=>{
  if(cmd==='wtype'){assert.equal(hidden,true);sent=true;return Buffer.alloc(0)}
  return Buffer.from(JSON.stringify(args.includes('monitors')?[monitor]:{address:hidden?'0x20':'0x10'}));
 }});
 d.begin();d.screenshot=async()=>[];
 d.frame={id:'f',time:Date.now(),monitor:'test',monitorBounds:mod.monitorRect(monitor),active:'0x20'};
 await d.call('desktop_key',{frameId:'f',key:'CTRL+n'});assert.equal(sent,true);
});

test('window listing exposes exact targets without requiring screenshots or focus inference',async()=>{
 const desktop=new mod.Desktop({emit(){},async run(){return Buffer.from(JSON.stringify([
  {address:'0x12',title:'notes — OmaText',class:'app',mapped:true,hidden:false,workspace:{id:2},irrelevant:'large data'},
  {address:'0x13',title:'hidden',mapped:true,hidden:true,workspace:{id:3}}
 ]))}});desktop.begin();
 const result=await desktop.call('list_windows',{});
 assert.deepEqual(JSON.parse(result[0].text),{windows:[{address:'0x12',title:'notes — OmaText',application:'app',workspace:2}]});
});

test('command abort completes even when a launcher exited but a descendant holds its pipes',async()=>{
 const controller=new AbortController();
 const started=Date.now();
 const command=mod.runDesktopCommand(process.execPath,['-e',"require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},1500)'],{stdio:['ignore',1,2]}).unref()"],{signal:controller.signal});
 const timer=setTimeout(()=>controller.abort(),200);
 try{await assert.rejects(command,/abort/i);assert.ok(Date.now()-started<1200,'Cancellation waited for the launched application');}
 finally{clearTimeout(timer)}
});
