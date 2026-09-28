// Qwen3.5 visual grounding uses 0..1000 coordinates, even when asked for
// pixels. Keep the shared desktop implementation and other models in pixels.
export function adaptDesktopTool(tool,space){
 if(space!=='normalized1000'||!['desktop_screenshot','desktop_click'].includes(tool.name))return tool;
 const description=tool.name==='desktop_screenshot'
  ?tool.description.replace('coordinates for clicks are pixels in this image.','click coordinates are normalized from 0 to 1000 on each axis of the whole image, NOT image pixels.')
  :tool.description+' x and y are normalized coordinates from 0 to 1000 relative to the whole screenshot, NOT pixels.';
 const inputSchema=structuredClone(tool.inputSchema);
 if(tool.name==='desktop_click')for(const axis of ['x','y'])Object.assign(inputSchema.properties[axis],{minimum:0,maximum:1000,description:'Normalized whole-image coordinate (0 to 1000).'});
 return {...tool,description,inputSchema};
}
export function adaptDesktopArguments(name,args,frame,space){
 if(space!=='normalized1000'||name!=='desktop_click')return args;
 if(!frame)throw Error('Take a fresh screenshot before acting');
 if([args.x,args.y].some(n=>!Number.isFinite(n)||n<0||n>1000))throw Error('Coordinates outside normalized screenshot');
 return {...args,x:Math.min(frame.width-1,args.x*frame.width/1000),y:Math.min(frame.height-1,args.y*frame.height/1000)};
}
export function adaptDesktopResult(items,space){
 if(space!=='normalized1000')return items;
 return items.map(item=>{
  if(item.type!=='inputText')return item;
  const value=JSON.parse(item.text);
  return value.frameId?{...item,text:JSON.stringify({...value,coordinateSystem:space,coordinateRange:[0,1000]})}:item;
 });
}
