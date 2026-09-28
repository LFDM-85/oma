// GPT-Live has no output-audio-done event. Use played voice activity to wait
// for the requested notice, then allow a short drain/silence margin to close.
export class LiveIdle {
 constructor({ready,speak,dismiss,now=Date.now}){Object.assign(this,{ready,speak,dismiss,now});this.active=false;this.activity();this.transcript='';}
 show(active){if(this.active===active)return;this.active=active;this.transcript='';this.activity();}
 activity(){this.stage='waiting';this.since=this.now();}
 input(text){const spoken=String(text||'').replace(/\[[^\]]*\]/g,'').trim();if(spoken&&spoken!==this.transcript)this.activity();this.transcript=spoken;}
 output(){this.since=this.now();if(this.stage==='promptRequested')this.stage='prompted';else if(this.stage==='farewellRequested')this.stage='farewell';}
 tick(){
  if(!this.active)return;
  if(!this.ready()){this.since=this.now();return;}
  const elapsed=this.now()-this.since;
  if(this.stage==='promptRequested'||this.stage==='farewellRequested'){if(elapsed>=15000)this.activity();return;}
  if(this.stage==='farewell'){if(elapsed>=1500){this.active=false;this.dismiss();}return;}
  if(elapsed<10000)return;
  const farewell=this.stage==='prompted';this.stage=farewell?'farewellRequested':'promptRequested';this.since=this.now();this.speak(farewell);
 }
}
