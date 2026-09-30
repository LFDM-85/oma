// Conservative fallback for explicit utterances; other languages/intents still
// use the OMA Skill and end_conversation tool. Never match a substring.
export function directFarewell(text){
 const clean=text.normalize('NFKC').trim().replace(/^(?:じゃあ?|もう)(?:いいや)?[、,\s]*/u,'').replace(/[。.!！?？]+$/u,'').toLowerCase();
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
