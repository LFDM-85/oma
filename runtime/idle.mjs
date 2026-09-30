import {languageInstruction} from './locale.mjs';
export function idleInstruction(locale,farewell=false){
 // The farewell line is shared by idle dismissal and an explicit goodbye.
 const source=farewell?'Ending the session.':'Standing by for input.';
 return languageInstruction(locale)+' Speak only this line, translated naturally into the response language if needed: '+JSON.stringify(source)+'. Use a calm retro computer voice. Do not answer previous requests or call tools.';
}
