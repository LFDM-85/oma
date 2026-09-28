import test from 'node:test';import assert from 'node:assert/strict';
const module=await import('../runtime/speech.mjs').catch(()=>({}));
test('speech sends WAV with the locale and streams aligned 24 kHz PCM, without Realtime',async()=>{
 assert.equal(typeof module.Speech,'function','Independent speech transport missing');const requests=[];
 const speech=new module.Speech({key:'fixture',locale:'ja-JP',env:{},fetch:async(url,options)=>{
 requests.push({url,options});return url.endsWith('/transcriptions')?Response.json({text:'こんにちは'}):new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.enqueue(new Uint8Array([4]));c.close();}}));
 }});
 assert.equal(await speech.transcribe(Buffer.alloc(4800),new AbortController().signal),'こんにちは');
 assert.equal(requests[0].options.body.get('language'),'ja');
 assert.equal(Buffer.from(await requests[0].options.body.get('file').arrayBuffer()).toString('ascii',0,4),'RIFF');
 const chunks=[];await speech.speak('こんにちは',b=>chunks.push(b));assert.deepEqual(Buffer.concat(chunks),Buffer.from([1,2,3,4]));assert.ok(chunks.every(b=>b.length%2===0));
 assert.equal(JSON.parse(requests[1].options.body).response_format,'pcm');
 assert.ok(requests.every(r=>r.options.redirect==='error'));
});
test('speech command providers work without an API key and pass content over stdin',async()=>{
 assert.equal(typeof module.Speech,'function');
 const env={OMA_STT_COMMAND:JSON.stringify([process.execPath,'-e','process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("local transcript"))']),OMA_TTS_COMMAND:JSON.stringify([process.execPath,'-e','process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(Buffer.alloc(8)))'])};
 const speech=new module.Speech({env});assert.equal(speech.ready,true);assert.equal(await speech.transcribe(Buffer.alloc(4800)),'local transcript');const chunks=[];await speech.speak('hello',b=>chunks.push(b));assert.equal(Buffer.concat(chunks).length,8);
});
test('O.M.A. is pronounced as one name while written text stays unchanged',async()=>{
 for(const [locale,expected] of [['ja-JP','オーマ'],['en-US','OH-mah']]){
  let body;const speech=new module.Speech({locale,key:'fixture',env:{},fetch:async(u,o)=>{body=JSON.parse(o.body);return new Response(Buffer.alloc(2));}});
  const text='O.M.A.です。';await speech.speak(text,()=>{});assert.equal(text,'O.M.A.です。');assert.equal(body.input,expected+'です。');
 }
});
