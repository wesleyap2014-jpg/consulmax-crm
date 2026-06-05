import fs from "node:fs";

const marker = "patch-whatsapp-br-phone-alias-v36-safe";

function patchIfExists(file, patcher) {
  if (!fs.existsSync(file)) return;
  let src = fs.readFileSync(file, "utf8");
  const next = patcher(src);
  if (next !== src) {
    fs.writeFileSync(file, next);
    console.log(`${marker}: ${file} ajustado`);
  } else {
    console.log(`${marker}: ${file} sem alterações`);
  }
}

// Este patch antigo estava substituindo onlyDigits(to) por resolveWhatsAppSendPhone(...)
// em alguns builds sem garantir que o helper existia no arquivo final.
// Resultado: erro em produção "resolveWhatsAppSendPhone is not defined".
// A partir de agora, ele só desfaz essa troca perigosa, caso apareça.
patchIfExists("api/whatsapp/send.ts", (src) => {
  return src
    .replace(/await resolveWhatsAppSendPhone\(to, conversation_id\)/g, "onlyDigits(to)")
    .replace(/await resolveWhatsAppSendPhone\(phoneValue, null\)/g, "onlyDigits(phoneValue)");
});

// O campo de mensagem perdia foco porque o Chat estava sendo renderizado como
// componente interno <Chat />, que é recriado a cada render. Chamando Chat()
// como função, o textarea não desmonta a cada tecla.
patchIfExists("src/pages/whatsapp/WhatsAppAtendimento.tsx", (src) => {
  return src
    .replace(/<Chat \/>/g, "{Chat()}")
    .replace(/<Reports \/>/g, "{Reports()}");
});

// Mantém o gate de consentimento das campanhas sem reativar a troca insegura acima.
await import("./patch-whatsapp-consent-gate-v37a.mjs");
await import("./patch-whatsapp-module-fixes-v38b.mjs");
await import("./patch-whatsapp-atendimento-web-layout-v39.mjs");

console.log(`${marker}: concluído`);
