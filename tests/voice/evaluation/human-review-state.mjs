const refStates=['pending','confirmed','corrected','uncertain'];
const values=['pending','correct','misread','unclear'];
export function fresh(d){return {version:1,dataset:d.id,refs:Object.fromEntries(d.cases.map(c=>[c.id,{status:'pending',readings:[...c.readings],revision:0}])),ratings:{}};}
export function reference(s,id,status,readings,d){
 if(!d.cases.some(c=>c.id===id)||!refStates.includes(status)||!Array.isArray(readings)||!readings.length||readings.some(r=>typeof r!=='string'||!r.trim()))throw Error('Provide at least one reading.');
 const old=s.refs[id];if(old.status!==status||JSON.stringify(old.readings)!==JSON.stringify(readings))s.refs[id]={status,readings,revision:old.revision+1};
}
export function rate(s,id,value,note,d){const sample=d.samples.find(x=>x.id===id);if(!sample||!values.includes(value)||typeof note!=='string')throw Error('Invalid rating');s.ratings[id]={value,note,revision:s.refs[sample.case_id].revision,updated:new Date().toISOString()};}
export function summary(s,d){const out={total:d.samples.length,eligible:0,correct:0,misread:0,unclear:0,stale:0};for(const x of d.samples){const r=s.ratings[x.id],ref=s.refs[x.case_id];if(!r||r.value==='pending')continue;if(r.revision!==ref.revision){out.stale++;continue;}if(!['confirmed','corrected'].includes(ref.status))continue;out.eligible++;out[r.value]++;}return out;}
export function restore(raw,d){const s=JSON.parse(raw);if(!s||s.version!==1||s.dataset!==d.id||!s.refs||!s.ratings||Array.isArray(s.refs)||Array.isArray(s.ratings))throw Error('Incompatible review file.');const clean=fresh(d);
 if(Object.keys(s.refs).length!==d.cases.length)throw Error('Invalid references');
 for(const [id,r] of Object.entries(s.refs)){if(!r||!Number.isSafeInteger(r.revision)||r.revision<0)throw Error('Invalid revision');reference(clean,id,r.status,r.readings,d);clean.refs[id].revision=r.revision;}
 for(const [id,r] of Object.entries(s.ratings)){if(!r||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.updated!=='string')throw Error('Invalid rating');rate(clean,id,r.value,r.note,d);const x=d.samples.find(x=>x.id===id);if(r.revision>clean.refs[x.case_id].revision)throw Error('Invalid rating revision');clean.ratings[id]={...clean.ratings[id],revision:r.revision,updated:r.updated};}return clean;}
