// Conservative fallback for explicit utterances; other languages/intents still
// use the OMA Skill and end_conversation tool. Never match a substring.
// Portuguese and more English ways to end ("podes fechar", "já terminei",
// "you can close now", "bye-bye"), optionally after thanks/ok and the name.
const lead=/^(?:(?:ok(?:ay)?|obrigad[oa]|muito obrigad[oa]|thanks|thank you|pronto|então|right)[,.!\s]+)*(?:o\.?\s?m\.?\s?a\.?[,.!\s]+)?/u;
const more=/^(?:(?:já |agora )?(?:podes|pode) (?:fechar|ir|desligar)(?: agora| já)?|(?:já )?(?:terminei|acabei|está feito|é tudo)(?: por agora| por hoje)?|fecha(?:-te)?(?: agora| já)?|adeus|até (?:já|logo|amanhã|mais)|tchau|xau|(?:you can|you may) (?:close|go)(?: now)?|close (?:now|yourself)|(?:i'?m|i am) (?:done|finished)(?: for now)?|that'?s all(?: for now)?|bye[ -]?bye|see you(?: later)?)(?:[,.!\s]+o\.?\s?m\.?\s?a\.?)?$/u;
export function directFarewell(text){
 const clean=text.normalize('NFKC').trim().replace(/^(?:じゃあ?|もう)(?:いいや)?[、,\s]*/u,'').replace(/[。.!！?？]+$/u,'').toLowerCase();
 if(more.test(clean.replace(lead,'')))return true;
 return /^(?:(?:ありがとう(?:ございました|ございます)?[、,。!！\s]*)?(?:バイバイ|ばいば[ー〜]?い|さようなら|さよなら|またね)(?:[。\s]*(?:会話を)?終了(?:して|してください))?|(?:会話を|omaを|o\.m\.a\.を)終了(?:して|してください)|(?:thanks[,.!\s]+)?(?:bye(?:[ -]?bye)?|goodbye|see you)|(?:please )?close (?:oma|o\.m\.a|this conversation))$/u.test(clean);
}
export class FarewellIntent {
 constructor(end){this.end=end;this.reset();}
 reset(){this.text='';this.at=null;this.done=false;}
 // A detected goodbye is being confirmed; the model's own reply is held back meanwhile.
 get pending(){return !this.done&&this.at!==null;}
 input(text,now=Date.now()){
  if(this.done||text===this.text)return;
  this.text=text;this.at=directFarewell(text.split('\n').at(-1))?now:null;
 }
 tick(now=Date.now()){if(!this.done&&this.at!==null&&now-this.at>=800){this.done=true;this.end();}}
}
