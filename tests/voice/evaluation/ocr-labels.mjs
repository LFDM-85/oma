// Only exact, unambiguous visible labels are eligible. A word inside a longer
// label (Save inside Don't Save) must never authorize a click on its own.
const normalized=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function locateTextLabel(tsv,label,width,height){
 if(typeof label!=='string'||label.length>160||!normalized(label)||width<=0||height<=0)return null;
 const lines=String(tsv).trimEnd().split('\n');
 if(!lines[0]?.startsWith('level\tpage_num\t'))return null;
 const groups=new Map();
 for(const line of lines.slice(1)){
  const fields=line.split('\t');if(fields[0]!=='5'||!fields[11]?.trim())continue;
  const [x,y,w,h,confidence]=fields.slice(6,11).map(Number);
  if([x,y,w,h,confidence].some(n=>!Number.isFinite(n))||x<0||y<0||w<=0||h<=0||x+w>width||y+h>height)return null;
  const key=fields.slice(1,5).join(':');if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({x,y,w,h,confidence,text:fields.slice(11).join('\t')});
 }
 const matches=[];
 const inspect=words=>{
  if(!words.length||words.some(w=>w.confidence<70)||normalized(words.map(w=>w.text).join(' '))!==normalized(label))return;
  const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
  const right=Math.max(...words.map(w=>w.x+w.w)),bottom=Math.max(...words.map(w=>w.y+w.h));
  matches.push({x:(x+right)/2/width*1000,y:(y+bottom)/2/height*1000});
 };
 for(const words of groups.values()){
  words.sort((a,b)=>a.x-b.x);let run=[];
  for(const word of words){const previous=run.at(-1);if(previous&&word.x-(previous.x+previous.w)>Math.max(previous.h,word.h)*1.5){inspect(run);run=[];}run.push(word);}
  inspect(run);
 }
 return matches.length===1?matches[0]:null;
}
