import test from 'node:test';
import assert from 'node:assert/strict';
test('a docked flag alone does not mean the real window operation completed',async()=>{
 const {dockingReady}=await import('./voice/evaluation/desktop-state.mjs');
 const editor={address:'0x20',title:'Untitled — OmaText',mapped:true,floating:false,at:[0,0],size:[900,700]};
 const face={address:'0x10',title:'O.M.A.',mapped:true,floating:true,at:[300,100],size:[300,500]};
 assert.equal(dockingReady({docked:true},[editor,face],'0x20','0x20'),false);
 face.floating=false;face.at=[910,0];
 assert.equal(dockingReady({docked:true},[editor,face],'0x10','0x20'),false);
 assert.equal(dockingReady({docked:true},[editor,face],'0x20','0x20'),true);
});
