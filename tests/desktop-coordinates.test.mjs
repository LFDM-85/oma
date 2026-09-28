import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptDesktopTool,adaptDesktopArguments,adaptDesktopResult} from '../runtime/desktop-coordinates.mjs';
import {desktopTools,screenPoint} from '../runtime/desktop.mjs';
test('Qwen normalized coordinates map through image size and monitor scaling',()=>{
 const frame={width:1440,height:810,rect:{x:-1920,y:120,width:1920,height:1080}};
 const args=adaptDesktopArguments('desktop_click',{frameId:'f',x:463,y:539,button:'left'},frame,'normalized1000');
 assert.equal(args.x,666.72);assert.equal(args.y,436.59);
 assert.deepEqual(screenPoint(frame,args.x,args.y),{x:-1032,y:702});
 assert.throws(()=>adaptDesktopArguments('desktop_click',{x:1001,y:1},frame,'normalized1000'),/outside/i);
 assert.throws(()=>adaptDesktopArguments('desktop_click',{x:NaN,y:1},frame,'normalized1000'),/outside/i);
 const edge=adaptDesktopArguments('desktop_click',{x:1000,y:1000},frame,'normalized1000');
 assert.equal(edge.x,1439);assert.equal(edge.y,809);
});
test('pixel clients and non-click actions retain their original arguments',()=>{
 const args={x:55,y:60};assert.equal(adaptDesktopArguments('desktop_click',args,null,'pixels'),args);
 assert.equal(adaptDesktopArguments('desktop_type',args,null,'normalized1000'),args);
});
test('normalized tool schemas and frame metadata state the same coordinate contract',()=>{
 const original=desktopTools.find(t=>t.name==='desktop_click');
 const adapted=adaptDesktopTool(original,'normalized1000');
 assert.match(adapted.description,/0.*1000/);
 assert.equal(adapted.inputSchema.properties.x.maximum,1000);
 assert.equal(original.inputSchema.properties.x.maximum,undefined);
 const items=[{type:'inputText',text:JSON.stringify({frameId:'f',width:1440,height:810})},{type:'inputImage',imageUrl:'data:image/png;base64,eA=='}];
 const output=adaptDesktopResult(items,'normalized1000');
 assert.equal(JSON.parse(output[0].text).coordinateSystem,'normalized1000');
 assert.equal(output[1],items[1]);
 assert.equal(adaptDesktopResult(items,'pixels'),items);
});
