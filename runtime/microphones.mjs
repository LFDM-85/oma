import {runDesktopCommand} from './desktop.mjs';
export async function listMicrophones(run=runDesktopCommand){
 const nodes=JSON.parse((await run('pw-dump',[])).toString());
 return nodes.filter(n=>n.type==='PipeWire:Interface:Node'&&n.info?.props?.['media.class']==='Audio/Source'&&n.info.props['node.name']).map(n=>({
  value:String(n.info.props['node.name']),label:String(n.info.props['node.nick']||n.info.props['node.description']||n.info.props['node.name']),id:String(n.id)
 }));
}
export async function microphoneNode(target,run=runDesktopCommand){
 if(!target)return '@DEFAULT_AUDIO_SOURCE@';
 const microphone=(await listMicrophones(run)).find(m=>m.value===target);
 if(!microphone)throw Error('The selected microphone is disconnected. Choose another input in Settings.');
 return microphone.id;
}
