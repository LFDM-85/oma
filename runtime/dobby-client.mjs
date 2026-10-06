import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {homedir} from 'node:os';

export const requestId=()=>randomUUID().replaceAll('-','');
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
 async submit(text,sessionId){
  if(this.active||this.submitting)throw Error('Termina o pedido atual primeiro.');
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Pedido vazio ou demasiado longo.');
  this.submitting=(async()=>{
   const before=await this.status();if(before.busy||before.pending)throw Error('O Dobby está ocupado com outro pedido.');
   const id=requestId();this.active=id;
   try{
    const reply=await this.command({action:'say',version:2,request_id:id,session_id:sessionId,text,silent:true});
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
