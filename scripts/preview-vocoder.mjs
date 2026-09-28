// Restore the original offline preview, including its RMS normalization.
import {execFileSync} from 'node:child_process';
import {writeFileSync,copyFileSync} from 'node:fs';
import {homedir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const directory=join(homedir(),'.local/share/oma/voice-preview'),report=[];
for(const voice of ['cedar','vesper'])for(const [name,mix] of [['original',0],['light',.35],['medium',.5],['strong',1]]){
 const file=`${voice}-vocoder-${name}.wav`;
 execFileSync('python3',[fileURLToPath(new URL('./preview-vocoder.py',import.meta.url)),'--input',join(directory,voice+'.wav'),'--mix',String(mix),'--output',join(directory,file)]);
 report.push({voice,mix,file,method:'original-offline-fft'});
 if(voice==='vesper')copyFileSync(join(directory,file),join(directory,`vocoder-${name}.wav`));
}
writeFileSync(join(directory,'vocoder.json'),JSON.stringify(report,null,2));
