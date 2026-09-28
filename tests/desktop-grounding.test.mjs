import test from 'node:test';
import assert from 'node:assert/strict';
import {targetClickTool,parseGroundingPoint,locateDesktopTarget} from '../runtime/desktop-grounding.mjs';
import {desktopTools} from '../runtime/desktop.mjs';
test('target clicks request a visible target instead of conversational coordinates',()=>{
 const source=desktopTools.find(t=>t.name==='desktop_click');const tool=targetClickTool(source);
 assert.deepEqual(tool.inputSchema.required,['frameId','target','button']);
 assert.equal(tool.inputSchema.properties.x,undefined);assert.ok(source.inputSchema.properties.x);
});
test('grounding accepts one bounded point and refuses absent or ambiguous targets',()=>{
 assert.deepEqual(parseGroundingPoint('```json\n[{"point_2d":[463,539],"label":"Don’t Save"}]\n```'),{x:463,y:539});
 assert.deepEqual(parseGroundingPoint('{"x":40,"y":60}'),{x:40,y:60});
 for(const text of ['[]','null','[{"point_2d":[2,3]},{"point_2d":[4,5]}]','{"x":1001,"y":3}','{"x":"40","y":60}','I cannot see it'])assert.throws(()=>parseGroundingPoint(text));
});
test('grounding has only the observed image and target, no conversation or tools',async()=>{
 const frame={id:'f',time:Date.now(),image:{mimeType:'image/png',data:'eA=='}};
 const signal=new AbortController().signal;
 let calls=0;
 const complete=async(context,options)=>{
  calls++;assert.equal(context.messages.length,1);assert.equal(context.tools,undefined);
  assert.equal(options.reasoning,'off');assert.equal(options.signal,signal);
  const payload={};options.onPayload(payload);
  assert.equal(payload.response_format.type,'json_schema');
  assert.deepEqual(payload.response_format.json_schema.schema.required,['x','y']);
  assert.equal(payload.response_format.json_schema.schema.additionalProperties,false);
  assert.match(context.messages[0].content[0].text,/Don't Save/);
  return {stopReason:'stop',content:[{type:'text',text:'{"x":463,"y":539}'}]};
 };
 const args={frameId:'f',target:"Don't Save button",button:'left'};
 assert.deepEqual(await locateDesktopTarget({frame,args,complete,signal}),{frameId:'f',x:463,y:539,button:'left'});
 await assert.rejects(()=>locateDesktopTarget({frame,args:{...args,frameId:'old'},complete,signal}),/fresh screenshot/);
 assert.equal(calls,1);
});
