// The clip has a known end. Audio.onDrained follows pw-play's device drain,
// so no silence timer or remote acknowledgement is needed before dismissal.
export class FarewellPlayback {
 constructor({audio,disconnect,caption,dismiss}){Object.assign(this,{audio,disconnect,caption,dismiss});this.active=false;}
 start(entry){if(this.active)return;this.active=true;this.disconnect();this.audio.stop();this.caption(entry.text);this.audio.enqueue(entry.pcm);this.audio.finish();}
 drained(){if(!this.active)return;this.active=false;this.dismiss();}
 cancel(){this.active=false;}
}
