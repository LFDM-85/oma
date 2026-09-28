import {renderEffects} from './render-voice-effects.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
const root=join(homedir(),'.local/share/oma/voice-preview'),port=8769,origin='http://127.0.0.1:'+port;
let busy=false;
createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(req.headers.host!==`127.0.0.1:${port}`){send(403,{error:'Invalid host'});return;}
 if(req.method==='POST'&&req.url==='/effects'){
  if(req.headers.origin!==origin){send(403,{error:'Invalid origin'});return;}
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4000){send(413,{error:'Request too large'});return;}}
  try{
   const value=JSON.parse(body),voices='alloy ash ballad beacon bossa cedar cinder coral delta echo gleam marin meridian quartz ripple sage shimmer stone tempo verse vesper willow'.split(' ');
   if(!voices.includes(value.voice)||![0,.35,.5,1].includes(value.vocoder)||typeof value.radio!=='boolean'||typeof value.reverb!=='boolean'){send(400,{error:'Invalid effect options'});return;}
   const file='effects-'+value.voice+'-'+Date.now()+'.wav';
   const details=renderEffects(join(root,value.voice+'.wav'),join(root,file),value);send(200,{file,...details});
  }catch{send(400,{error:'Could not render this combination.'})}return;
 }
 if(req.method==='POST'&&req.url==='/preview'){
  if(req.headers.origin!==origin){send(403,{error:'Invalid origin'});return;}
  if(busy){send(409,{error:'A preview is already being generated.'});return;}
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000){send(413,{error:'Instructions are too long.'});return;}}
  let value;try{value=JSON.parse(body)}catch{send(400,{error:'Invalid request'});return;}
  const voices='alloy ash ballad beacon bossa cedar cinder coral delta echo gleam marin meridian quartz ripple sage shimmer stone tempo verse vesper willow'.split(' ');
  if(typeof value.style!=='string'||!value.style.trim()||value.style.length>4000||!voices.includes(value.voice)){send(400,{error:'Choose a voice and enter up to 4,000 characters.'});return;}
  busy=true;
  execFile(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'preview-live-voices.mjs'),'--voice',value.voice,'--style',value.style],{timeout:35000,maxBuffer:100000},(error,stdout)=>{
   busy=false;
   try{
    const result=stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line))[0];
    if(error||!result||result.error){send(502,{error:result?.error||'Preview generation failed. Try again.'});return;}
    send(200,{file:result.voice+'.wav',transcript:result.transcript});
   }catch{send(502,{error:'Preview generation failed.'})}
  });return;
 }
 if(req.method!=='GET'){send(405,{error:'Method not allowed'});return;}
 const path=req.url==='/'?'index.html':req.url.slice(1);
 if(!/^(index\.html|[a-z0-9-]+\.wav)$/.test(path)){send(404,{error:'Not found'});return;}
 try{const bytes=await readFile(join(root,path));res.writeHead(200,{'Content-Type':path.endsWith('.wav')?'audio/wav':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes)}catch{send(404,{error:'Not found'})}
}).listen(port,'127.0.0.1',()=>console.log(origin));
