import test from 'node:test';
import assert from 'node:assert/strict';
import {spokenText} from '../runtime/spoken-text.mjs';

const reply='A rede está funcional e sem dramas: estás ligado por Wi-Fi à rede `Meo-casa` com IP local `192.168.2.139` e sinal a 63%, tendo o gateway em `192.168.2.1`. A rota default responde perfeitamente, o ping para `1.1.1.1` ronda os 15 ms com zero perda de pacotes e a resolução de nomes (DNS) está operacional. O túnel `tailscale0` está ativo com o IP `100.81.90.8`, pelo que a máquina tem conectividade total.';

test('IP addresses and decimals never make the voice skip or start mid-sentence',()=>{
 const spoken=spokenText(reply);
 assert.ok(spoken.startsWith('A rede está funcional'),spoken);
 assert.ok(spoken.includes('192.168.2.139'));
 const plain=reply.replaceAll('`','');
 assert.ok(plain.startsWith(spoken),'Spoken text is a prefix of the reply, with nothing skipped');
});
test('a normal multi-sentence reply is read in full',()=>{
 const long='O NVMe do pve01 está a falhar. '.repeat(20).trim();
 assert.equal(spokenText(long),long);
});
test('vault links are spoken as the note name, web links not at all',()=>{
 assert.equal(spokenText('According to (file:///home/u/Vault/reference/Homelab/Homelab%20-%20Where%20we%20left%20off.md), all is stable.'),'According to Homelab - Where we left off, all is stable.');
 assert.equal(spokenText('See https://example.com/x for details.'),'See for details.');
});
test('runaway replies stop at a sentence boundary within the cap',()=>{
 const spoken=spokenText('Primeira frase curta. '+'Segunda frase com versão 2.5 e mais texto. '.repeat(40));
 assert.ok(spoken.length<=1200);assert.match(spoken,/\.$/);
 assert.ok(spoken.startsWith('Primeira frase curta. Segunda frase com versão 2.5'));
});
