import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../skills/oma/scripts/new-document.mjs').catch(()=>({}));
function fixture({modified=false,modal=false,activationDelay=0,requiresClick=false,requiresRaise=false,requiresBounce=false,omaWorkspace=98,ignoreTyping=false}={}){
 const actions=[];let created=false,inspections=0,active=false,clicked=false,insertedLength=0,launches=0,bounced=false;
 const window={address:'0x123',title:'previous.txt — OmaText',mapped:true,hidden:false,at:[100,100],size:[600,400],workspace:{id:98}};
 const oma={address:'0x456',title:'O.M.A.',mapped:true,hidden:false,workspace:{id:omaWorkspace}};
 const desktop={frame:null,check(){},async command(command,args){actions.push([command,args]);if(command==='omatext')launches++;if(command==='omarchy-shell')active=++inspections>activationDelay&&(!requiresClick||clicked)&&(!requiresRaise||launches>1)&&(!requiresBounce||bounced);return command==='omarchy-shell'?Buffer.from(JSON.stringify({opened:true,active,url:created?'':'file:///previous.txt',length:created?insertedLength:12,modified,editor:{modalOpen:modal}})):Buffer.alloc(0)},async json(args){return args[0]==='clients'?[window,oma]:window},async dispatch(value){actions.push(value);if(value.includes('address:0x456'))bounced=true},async screenshot(){this.frame={id:'frame',active:window.address,rect:{x:0,y:0,width:1000,height:800},width:1000,height:800};return [{type:'inputText',text:'frame'},{type:'inputImage',imageUrl:'data:image/png;base64,AA=='}]},async call(name,args){actions.push([name,args]);if(name==='desktop_type'&&!ignoreTyping)insertedLength=args.text.length;if(name==='desktop_click')clicked=true;if(name==='desktop_key'){assert.equal(active,true,'Wait for application activation before sending shortcut');created=true;window.title='Untitled — OmaText'}return this.screenshot()}};
 return {desktop,companion:{async accompany(address){actions.push(['accompany',address])}},actions};
}
test('new document replaces a retained file before typing and accompanies its exact window',async()=>{
 const f=fixture();assert.equal(typeof module.newOmaTextDocument,'function');
 const result=await module.newOmaTextDocument({...f,text:'Hello.'});
 assert.equal(result.created,true);assert.equal(result.address,'0x123');
 assert.equal(result.textInserted,true);
 assert.equal(result.insertedCharacters,6);
 assert.equal(result.observations,undefined,'A completed operation does not expose a reusable input frame');
 assert.equal(result.images,undefined,'Verified document actions need not expose the assistant UI to the model');
 assert.ok(f.actions.some(a=>a[0]==='accompany'&&a[1]==='0x123'));
 const inputs=f.actions.filter(a=>Array.isArray(a)&&a[0].startsWith('desktop_'));
 assert.deepEqual(inputs.map(a=>a[0]),['desktop_key','desktop_type']);
 assert.equal(inputs[0][1].key,'CTRL+n');assert.equal(inputs[1][1].text,'Hello.');
});
test('new document never discards or types over unsaved work',async()=>{
 const f=fixture({modified:true});assert.equal(typeof module.newOmaTextDocument,'function');
 const result=await module.newOmaTextDocument({...f,text:'replacement'});
 assert.equal(result.created,false);assert.equal(result.needsDecision,true);
 assert.equal(f.actions.some(a=>Array.isArray(a)&&a[0].startsWith('desktop_')),false);
});

test('new document waits for native application activation before the shortcut',async()=>{
 const f=fixture({activationDelay:3});
 assert.equal((await module.newOmaTextDocument(f)).created,true);
});

test('an inactive native editor receives a targeted click before a shortcut',async()=>{
 const f=fixture({requiresClick:true});
 const result=await module.newOmaTextDocument(f);assert.equal(result.created,true);
 const click=f.actions.find(a=>a[0]==='desktop_click');
 assert.deepEqual(click[1],{frameId:'frame',x:400,y:300,button:'left'});
});

test('new document refuses to report lost typing as inserted',async()=>{
 await assert.rejects(module.newOmaTextDocument({...fixture({ignoreTyping:true}),text:"Hello."}),/text length/);
});

test('an editor that lost native activation while tiling is raised through its own launcher',async()=>{
 const f=fixture({requiresRaise:true});
 assert.equal((await module.newOmaTextDocument({...f,text:'Ordinary note.'})).created,true);
 assert.equal(f.actions.filter(a=>a[0]==='omatext').length,2);
});

// A mapped compositor target can retain stale Qt activation after tiling.
test('new document reacquires native focus through its own companion only',async()=>{
 const f=fixture({requiresBounce:true});
 assert.equal((await module.newOmaTextDocument({...f,text:'A note.'})).created,true);
 const focus=f.actions.filter(a=>typeof a==='string');
 assert.ok(focus.includes('hl.dsp.focus({window="address:0x456"})'));
 assert.equal(focus.at(-1),'hl.dsp.focus({window="address:0x123"})');
});

test('focus recovery never borrows an assistant from another workspace',async()=>{
 const f=fixture({requiresBounce:true,omaWorkspace:99});
 await assert.rejects(module.newOmaTextDocument({...f,text:'A note.'}),/active and ready/);
 assert.equal(f.actions.some(a=>typeof a==='string'&&a.includes('address:0x456')),false);
 assert.equal(f.actions.some(a=>Array.isArray(a)&&a[0]==='desktop_type'),false);
});
