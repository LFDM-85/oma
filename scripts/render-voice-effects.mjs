import {readFileSync,writeFileSync} from 'node:fs';
import {renderPcmSync,pcmWav} from '../runtime/offline-voice-effects.mjs';
export function renderEffects(inputPath,outputPath,options){
 const wav=readFileSync(inputPath);
 if(wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(24)!==24000||wav.readUInt16LE(22)!==1)throw Error('Expected 24 kHz mono PCM WAV');
 const pcm=renderPcmSync(wav.subarray(44),options);writeFileSync(outputPath,pcmWav(pcm));return {seconds:pcm.length/48000};
}
