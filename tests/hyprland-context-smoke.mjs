// Read-only: no screenshot, mutation, model request, or title output.
import {HyprlandContext} from '../runtime/hyprland-context.mjs';
const context=new HyprlandContext();
try{
 await context.start();
 await new Promise(resolve=>setTimeout(resolve,250));
 const s=context.snapshot();
 console.log(JSON.stringify({status:s.status,reason:s.reason||null,windows:s.windows?.length??null,monitors:s.monitors?.length??null,omaWindows:s.omaWindows?.length??null,truncated:s.truncated||null}));
}finally{context.stop();}
console.log(JSON.stringify({stopped:context.snapshot().reason==='stopped'}));
