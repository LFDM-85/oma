// Append literal text without asking the model to regenerate existing contents.
import {openSync,fstatSync,appendFileSync,closeSync,constants} from 'node:fs';
import {resolve} from 'node:path';
export function appendTextFile({cwd,path,text}){
 if(typeof path!=='string'||!path.trim()||typeof text!=='string'||text.length>10000)throw Error('Provide an existing file path and literal text of at most 10000 characters');
 const target=resolve(cwd,path);
 // No O_CREAT: a misspelled append target must not silently become a new file.
 const fd=openSync(target,constants.O_WRONLY|constants.O_APPEND|constants.O_NONBLOCK);
 try{
  const before=fstatSync(fd);if(!before.isFile())throw Error('Append target must be a regular file');
  const data=Buffer.from(text,'utf8');appendFileSync(fd,data);
  return {appended:true,path:target,bytesAppended:data.length,previousBytes:before.size,totalBytes:fstatSync(fd).size};
 }finally{closeSync(fd);}
}
