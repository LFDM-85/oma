// Resource owners must exit before their PipeWire nodes are replaced.
export function stopChild(child,{graceMs=300,killMs=1000}={}){
 if(!child||child.exitCode!=null||child.signalCode!=null)return Promise.resolve();
 if(!child.pid){child.kill('SIGTERM');return Promise.resolve();}
 return new Promise((resolve,reject)=>{
  let grace,deadline;
  const finish=error=>{clearTimeout(grace);clearTimeout(deadline);child.off('close',closed);child.off('error',failed);error?reject(error):resolve();};
  const closed=()=>finish(),failed=error=>finish(error);
  child.once('close',closed);child.once('error',failed);
  grace=setTimeout(()=>child.kill('SIGKILL'),graceMs);
  deadline=setTimeout(()=>finish(Error('Owned audio process did not exit after termination')),graceMs+killMs);
  child.kill('SIGTERM');
 });
}
