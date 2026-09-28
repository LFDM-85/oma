import {openTranscriptWindow} from './transcript-window.mjs';
import {DatabaseSync} from 'node:sqlite';import {existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';import {spawn} from 'node:child_process';
import {readTranscript,renderTranscript} from './transcript.mjs';
export async function main(args=process.argv.slice(2)){
 if(args.includes('--help')||!args.length){console.log('Usage: oma transcript [--today | --follow]\nOpen the current/latest conversation in your default text application.\n--today  Open today’s conversations.\n--follow Watch live captions in this terminal; Ctrl+C to stop.');return;}
 if(args[0]!=='transcript'||args.slice(1).some(a=>!['--today','--follow'].includes(a))||args.length>2)throw Error('Usage: oma transcript [--today | --follow]');
 const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma'),path=join(data,'memory.sqlite');
 if(!existsSync(path))throw Error('No O.M.A. conversations yet.');
 const db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA busy_timeout=1500');
 const read=()=>renderTranscript(readTranscript(db,args.includes('--today')))||'No conversation text yet.\n';
 if(args.includes('--follow')){
  let previous='';const update=()=>{try{const text=read();if(text===previous)return;previous=text;process.stdout.write(process.stdout.isTTY?'\x1b[2J\x1b[H'+text+'\nWatching O.M.A. · Ctrl+C to stop\n':text+'\n');}catch(e){console.error(e.message);}};
  update();const timer=setInterval(update,250);await new Promise(resolve=>{const stop=()=>{clearInterval(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);resolve()};process.on('SIGINT',stop);process.on('SIGTERM',stop)});db.close();return;
 }
 const text=read();db.close();const directory=join(data,'transcripts');mkdirSync(directory,{recursive:true,mode:0o700});const file=join(directory,args.includes('--today')?'today.txt':'latest.txt'),temp=file+'.'+process.pid+'.tmp';writeFileSync(temp,text,{mode:0o600});renameSync(temp,file);
 const warning=await openTranscriptWindow(file,()=>new Promise((resolve,reject)=>{const child=spawn('xdg-open',[file],{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Could not open the default text application. Transcript: '+file)));}));
 if(warning)console.log(warning);
 console.log('Opened '+file);
}
