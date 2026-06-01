import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";

function save(file, s) {
  fs.writeFileSync(file, s);
}

function log(label, status) {
  console.log(`[patch-whatsapp-central-v16] ${label}: ${status}`);
}

function patch(file, label, from, to) {
  let s = fs.readFileSync(file, "utf8");
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  save(file, s);
  log(label, "aplicado");
}

function appendAfter(file, label, needle, block, flag) {
  let s = fs.readFileSync(file, "utf8");
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, `${needle}\n${block}`);
  save(file, s);
  log(label, "aplicado");
}

// Visual: força o composer a ficar realmente compacto mesmo se patches anteriores já tiverem mexido.
{
  let s = fs.readFileSync(pageFile, "utf8");
  let changed = false;

  const variants = [
    `                  className="min-h-[72px] resize-none text-base leading-relaxed"`,
    `                  className="min-h-[46px] max-h-[96px] resize-none text-base leading-relaxed"`,
    `                  className="min-h-[44px] max-h-[92px] resize-none text-sm leading-relaxed py-2"`,
  ];

  const compactTextarea = `                  rows={1}\n                  className="min-h-[38px] max-h-[72px] resize-none rounded-2xl py-2 text-sm leading-snug"`;

  if (!s.includes(`rows={1}\n                  className="min-h-[38px] max-h-[72px]`)) {
    for (const v of variants) {
      if (s.includes(v)) {
        s = s.replace(v, compactTextarea);
        changed = true;
        break;
      }
    }
  }

  const composerVariants = [
    `<div className="border-t bg-white p-4">`,
    `<div className="border-t bg-white p-3">`,
  ];

  if (!s.includes(`<div className="border-t bg-white px-3 py-2">`)) {
    for (const v of composerVariants) {
      const idx = s.lastIndexOf(v);
      if (idx >= 0) {
        s = s.slice(0, idx) + `<div className="border-t bg-white px-3 py-2">` + s.slice(idx + v.length);
        changed = true;
        break;
      }
    }
  }

  s = s.replaceAll(`className="h-auto min-w-[48px]"`, `className="h-10 min-w-[42px] rounded-2xl"`);
  s = s.replaceAll(`className="min-w-[60px] px-4 text-white"`, `className="h-10 min-w-[48px] rounded-2xl px-3 text-white"`);

  if (changed) {
    save(pageFile, s);
    log("visual composer compacto forçado", "aplicado");
  } else {
    log("visual composer compacto forçado", "já aplicado ou trecho não encontrado");
  }
}

// Diagnóstico de webhook: logar explicitamente cada mensagem recebida antes de qualquer processamento.
appendAfter(
  webhookFile,
  "log bruto de inbound message",
  `  const optIn = isOptInMessage(body);`,
  `
  console.log("WHATSAPP_INBOUND_DIAGNOSTIC_V16", {
    waId,
    nome,
    messageType,
    body,
    metaMessageId,
    phoneNumberId,
    displayPhoneNumber,
    hasMedia: !!mediaId,
  });`,
  "WHATSAPP_INBOUND_DIAGNOSTIC_V16"
);

// Diagnóstico de atualização/criação de conversa.
appendAfter(
  webhookFile,
  "log conversa encontrada",
  `  let conversation = await findActiveConversation(contact.id);`,
  `
  console.log("WHATSAPP_CONVERSATION_MATCH_V16", {
    contactId: contact.id,
    conversationId: conversation?.id || null,
    status: conversation?.status || null,
    stage: conversation?.stage || null,
    queue: conversation?.queue || null,
  });`,
  "WHATSAPP_CONVERSATION_MATCH_V16"
);

appendAfter(
  webhookFile,
  "log mensagem salva",
  `  if (messageError) {
    console.error("WHATSAPP_MESSAGE_INSERT_ERROR", messageError);
    return;
  }`,
  `
  console.log("WHATSAPP_MESSAGE_SAVED_V16", {
    conversationId: conversation.id,
    metaMessageId,
    messageType,
    bodyPreview: String(body || "").slice(0, 120),
  });`,
  "WHATSAPP_MESSAGE_SAVED_V16"
);

console.log("[patch-whatsapp-central-v16] concluído");
