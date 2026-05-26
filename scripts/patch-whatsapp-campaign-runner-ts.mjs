import fs from 'node:fs';

const file = 'api/whatsapp/campaign-runner.ts';
let s = fs.readFileSync(file, 'utf8');

const oldLine = '  form.append("file", new Blob([file.buffer], { type: file.mime }), file.name);';
const newBlock = `  const bytes = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
  form.append("file", new Blob([bytes], { type: file.mime }), file.name);`;

if (s.includes(oldLine)) {
  s = s.replace(oldLine, newBlock);
  fs.writeFileSync(file, s);
  console.log('[patch-whatsapp-campaign-runner-ts] Blob Buffer corrigido.');
} else if (s.includes('new Blob([bytes]')) {
  console.log('[patch-whatsapp-campaign-runner-ts] já corrigido.');
} else {
  console.warn('[patch-whatsapp-campaign-runner-ts] linha alvo não encontrada.');
}
