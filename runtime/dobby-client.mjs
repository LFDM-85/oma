import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {join,resolve,dirname,basename} from 'node:path';
import {homedir} from 'node:os';

export const requestId=()=>randomUUID().replaceAll('-','');
export function dailyReportPath(state,stateHome=process.env.XDG_STATE_HOME||join(homedir(),'.local/state')){
 const file=state?.autonomy?.advisor?.report;
 const directory=resolve(stateHome,'omarchy-dobby/autonomy-reports');
 if(typeof file!=='string'||dirname(resolve(file))!==directory||!/^\d{4}-\d{2}-\d{2}\.md$/.test(basename(file)))throw Error('No valid local daily report yet.');
 return resolve(file);
}
// What the panel shows of Dobby's sentinel; fresh while its latest event is under 10 minutes old.
export function autonomyPatch(state,now=Date.now()){
 const autonomy=state&&typeof state.autonomy==='object'&&!Array.isArray(state.autonomy)?state.autonomy:{};
 const list=value=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object').slice(0,5):[];
 const events=list(autonomy.events),proposals=list(autonomy.proposals);
 const advisor=autonomy.advisor&&typeof autonomy.advisor==='object'&&!Array.isArray(autonomy.advisor)?autonomy.advisor:null;
 return {events,proposals,fresh:!!events.length&&now/1000-Number(events[0].ts||0)<600,...(advisor?{advisor}:{}),lastChecked:Number(autonomy.last_checked||0)};
}
export class DobbyClient {
 constructor({socketPath=join(process.env.XDG_RUNTIME_DIR||join(homedir(),'.local/state'),'omarchy-dobby/control.sock')}={}){this.socketPath=socketPath;this.active=null;}
 command(message){
  // Match Python's ASCII JSON wire bound, including non-ASCII text.
  const wire=JSON.stringify(message).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
  if(wire.length>32768)return Promise.reject(Error('Pedido demasiado longo para o Dobby.'));
  return new Promise((resolve,reject)=>{
   const socket=net.createConnection(this.socketPath);let buffer='',settled=false;
   const finish=(err,value)=>{if(settled)return;settled=true;socket.destroy();err?reject(err):resolve(value)};
   socket.setTimeout(5000,()=>finish(Error('O Dobby não respondeu.')));
   socket.on('connect',()=>socket.write(wire));
   socket.on('error',()=>finish(Error('Serviço Dobby indisponível. Verifica dobby status.')));
   socket.on('data',data=>{buffer+=data.toString();if(buffer.length>1024*1024)return finish(Error('Resposta do Dobby demasiado longa.'));const i=buffer.indexOf('\n');if(i>=0){try{finish(null,JSON.parse(buffer.slice(0,i)))}catch{finish(Error('Resposta inválida do Dobby.'))}}});
   socket.on('end',()=>{if(!settled)finish(Error('O Dobby fechou a ligação sem resposta.'))});
  });
 }
 status(){return this.command({action:'status'});}
 async waitUntilIdle({timeoutMs=10000,pollMs=80}={}){
  const deadline=Date.now()+timeoutMs;
  while(true){
   const state=await this.status();if(!state.busy&&!state.pending)return;
   if(Date.now()>=deadline)throw Error('O.M.A. is still stopping the interrupted request. Your update was kept; try again shortly.');
   await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
 }
 async submit(text,sessionId,{instructions='',legacy=''}={}){
  if(this.active||this.submitting)throw Error('Termina o pedido atual primeiro.');
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Pedido vazio ou demasiado longo.');
  this.submitting=(async()=>{
   const before=await this.status();if(before.busy||before.pending)throw Error('O Dobby está ocupado com outro pedido.');
   const id=requestId();this.active=id;
   // Older daemons only know text: they get the whole turn folded into it.
   const separate=!instructions||before.capabilities?.includes('instructions');
   const message=separate?{text,...(instructions?{instructions,client:'oma'}:{})}:{text:legacy||text};
   try{
    const reply=await this.command({action:'say',version:2,request_id:id,session_id:sessionId,...message,silent:true});
    if(reply?.error||reply?.request_id!==id||reply?.status!=='accepted')throw Error(reply?.error||'O Dobby não aceitou o pedido.');
    return id;
   }catch(error){this.active=null;throw error;}
  })();
  try{return await this.submitting}finally{this.submitting=null}
 }
 async confirm(id,allow){
  if(!id||id!==this.active)throw Error('Confirmação pertence a outro pedido.');
  const current=await this.status();if(current.request_id!==id||!current.pending)throw Error('Esta confirmação já não está pendente.');
  return this.command({action:allow?'confirm':'cancel',request_id:id,silent:true});
 }
 async cancel(){
  await this.submitting?.catch(()=>{});
  const id=this.active;if(!id)return;
  const current=await this.status();
  if(current.request_id===id&&(current.busy||current.pending))await this.command({action:'cancel',request_id:id});
  if(this.active===id)this.active=null;
 }
}
