import {execFile} from 'node:child_process';
import {lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export async function renameFile({cwd,from,to,signal}){
 signal?.throwIfAborted();
 if([from,to].some(path=>typeof path!=='string'||!path.trim()))throw Error('Provide an existing source file and a new destination path');
 const source=resolve(cwd,from),destination=resolve(cwd,to),before=lstatSync(source);
 if(!before.isFile())throw Error('Rename source must be a regular file');
 if(source===destination)return {renamed:false,unchanged:true,from:source,to:destination};
 // GNU mv refuses a destination that appears concurrently too. --no-copy
 // requires a rename, preserving the inode and all bytes; cross-device moves
 // return an error rather than quietly becoming a copy-and-delete operation.
 await execute('mv',['--no-copy','--update=none-fail','--no-target-directory','--',source,destination],{signal,timeout:5000});
 const after=lstatSync(destination);
 let remaining;try{remaining=lstatSync(source);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(remaining||after.ino!==before.ino||after.dev!==before.dev)throw Error('Rename result changed concurrently; inspect both paths before continuing');
 return {renamed:true,from:source,to:destination,bytes:after.size};
}
