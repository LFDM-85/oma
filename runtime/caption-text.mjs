// Each speaker has its own stream state: annotation fragments can interleave.
export class CaptionText {
 constructor(){this.depth=0;}
 append(text){let result='';for(const c of String(text||'')){if(c==='['||c==='［'){this.depth++;continue;}if((c===']'||c==='］')&&this.depth){this.depth--;continue;}if(!this.depth)result+=c;}return result;}
}
export function captionText(text){return new CaptionText().append(text);}
