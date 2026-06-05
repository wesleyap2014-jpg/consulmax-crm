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

// O webhook não pode tentar trocar wa_id/telefone de um contato encontrado por alias,
// porque pode bater em unique constraint e impedir a mensagem inbound de ser salva.
// Quando encontrar contato por variação BR, atualizamos só nome/updated_at e mantemos o fluxo funcionando.
patchIfExists("api/whatsapp/webhook.ts", (src) => {
  return src.replace(
    `? await supabaseAdmin.from("whatsapp_contacts").update({ wa_id: waId, telefone: waId, nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`,
    `? await supabaseAdmin.from("whatsapp_contacts").update({ nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`
  );
});

// O campo de mensagem perdia foco porque o Chat estava sendo renderizado como
// componente interno <Chat />, que é recriado a cada render.
// Em posição de filho JSX usamos {Chat()}; dentro de ternário usamos Reports() sem chaves extras.
patchIfExists("src/pages/whatsapp/WhatsAppAtendimento.tsx", (src) => {
  return src
    .replace(/<Chat \/>/g, "{Chat()}")
    .replace(/<Reports \/>/g, "Reports()")
    .replace(/\? \{Reports\(\)\} :/g, "? Reports() :")
    .replace(/\? \{Chat\(\)\} :/g, "? Chat() :");
});

// Mantém o gate de consentimento das campanhas sem reativar a troca insegura acima.
await import("./patch-whatsapp-consent-gate-v37a.mjs");
await import("./patch-whatsapp-module-fixes-v38b.mjs");
await import("./patch-whatsapp-atendimento-web-layout-v39.mjs");

console.log(`${marker}: concluído`);
