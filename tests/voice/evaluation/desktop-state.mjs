export function dockingReady(state,clients,activeAddress,targetAddress){
 const face=clients.find(w=>/^O\.M\.A\.( Mini)?$/.test(w.title)&&w.mapped&&!w.hidden);
 const target=clients.find(w=>w.address===targetAddress&&w.mapped&&!w.hidden);
 return !!(state.docked&&face&&target&&!face.floating&&!target.floating&&
  target.size[0]>0&&face.size[0]>0&&target.at[0]+target.size[0]<=face.at[0]&&activeAddress===targetAddress);
}
