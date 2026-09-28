import {captionText} from './caption-text.mjs';
export const transcriptSchema=`CREATE TABLE IF NOT EXISTS transcript_sessions(id INTEGER PRIMARY KEY,at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transcript_entries(id INTEGER PRIMARY KEY,session INTEGER NOT NULL,at TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL);`;
export class TranscriptLog {
 constructor(db){this.db=db;db.exec(transcriptSchema);this.session=null;this.lines={user:[],assistant:[]};}
 begin(baseline={}){if(this.session)return;this.baseline=baseline;this.session=Number(this.db.prepare('INSERT INTO transcript_sessions(at) VALUES(?)').run(new Date().toISOString()).lastInsertRowid);this.lines={user:[],assistant:[]};}
 end(){this.session=null;this.lines={user:[],assistant:[]};}
 update(patch){
  if(!this.session)return;
  for(const role of ['user','assistant']){
   const key=role==='user'?'userText':'assistantText';if(patch[key]===undefined)continue;
   let text=String(patch[key]);const prefix=this.baseline[key]||'';if(prefix&&text.startsWith(prefix))text=text.slice(prefix.length).replace(/^\n/,'');else if(text)this.baseline[key]='';
   const lines=captionText(text).split('\n');
   const previous=this.lines[role];
   lines.forEach((body,i)=>{body=body.trim();const old=previous[i];if(old?.body===body)return;
    if(old?.id){if(body)this.db.prepare('UPDATE transcript_entries SET body=? WHERE id=?').run(body,old.id);else this.db.prepare('DELETE FROM transcript_entries WHERE id=?').run(old.id);previous[i]={id:body?old.id:null,body};}
    else if(body){const id=Number(this.db.prepare('INSERT INTO transcript_entries(session,at,role,body) VALUES(?,?,?,?)').run(this.session,new Date().toISOString(),role,body).lastInsertRowid);previous[i]={id,body};}
   });
   for(const old of previous.slice(lines.length))if(old?.id)this.db.prepare('DELETE FROM transcript_entries WHERE id=?').run(old.id);
   previous.length=lines.length;
  }
 }
 read(today=false){return readTranscript(this.db,today);}
}
export function readTranscript(db,today=false){
 const available=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transcript_sessions'").get();
 const session=available&&db.prepare('SELECT id FROM transcript_sessions ORDER BY id DESC LIMIT 1').get();
 if(!session)return db.prepare("SELECT id,at,role,body FROM events WHERE role IN ('user','assistant') "+(today?"AND date(at,'localtime')=date('now','localtime') ":'')+'ORDER BY id').all();
 if(today){
  const old=db.prepare("SELECT id,at,role,body FROM events WHERE role IN ('user','assistant') AND date(at,'localtime')=date('now','localtime') AND at < (SELECT MIN(at) FROM transcript_sessions) ORDER BY id").all();
  return [...old,...db.prepare("SELECT * FROM transcript_entries WHERE date(at,'localtime')=date('now','localtime') ORDER BY id").all()];
 }
 return db.prepare('SELECT * FROM transcript_entries WHERE session=? ORDER BY id').all(session.id);
}
export function renderTranscript(rows){return rows.map(row=>`${new Date(row.at).toLocaleString()}  ${row.role==='user'?'YOU':'O.M.A.'}\n${captionText(row.body).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'')}\n`).join('\n');}
