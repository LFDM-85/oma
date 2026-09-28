import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const profileSkills=['oma','oma-camera'];
const sources=profileSkills.map(name=>({name,source:readFileSync(new URL('../skills/'+name+'/SKILL.md',import.meta.url),'utf8')}));
export const omaProfile=sources.map(({source})=>source.replace(/^---\n[\s\S]*?\n---\n/,'').replace(/## Voice delegation policy\n[\s\S]*?(?=\n## |$)/,'').trim()).join('\n\n');
export const profileRevision=createHash('sha256').update(sources.map(({source})=>source).join('\n')).digest('hex');

// Voice routing comes from the same skill as backend operation instructions.
export const omaTranscriptInstructions=sources.find(s=>s.name==='oma').source.match(/## Open conversation transcripts\n[\s\S]*?(?=\n## |$)/)?.[0]||'';

export const omaPresentationInstructions=sources.find(s=>s.name==='oma').source.match(/## Change presentation mode\n[\s\S]*?(?=\n## |$)/)?.[0]||'';

export const omaCompanionInstructions=sources.find(s=>s.name==='oma').source.match(/## Accompany an opened application\n[\s\S]*?(?=\n## |$)/)?.[0]||'';

export const omaDelegationInstructions=sources.find(s=>s.name==='oma').source.match(/## Voice delegation policy\n[\s\S]*?(?=\n## |$)/)?.[0]||'';
