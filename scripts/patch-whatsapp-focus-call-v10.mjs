import fs from "node:fs";

const file = "src/pages/AtendimentoWhatsApp.tsx";
let s = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (s.includes(to)) {
    console.log(`[patch-whatsapp-focus-call-v10] ${label}: já aplicado`);
    return;
  }

  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-focus-call-v10] ${label}: trecho não encontrado`);
    return;
  }

  s = s.replace(from, to);
  changed = true;
  console.log(`[patch-whatsapp-focus-call-v10] ${label}: aplicado`);
}

replaceOnce(
  "ligacao-tel",
  `  function callSoon() {\n    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");\n  }`,
  `  function callSoon() {\n    if (!activePhone) {\n      alert("Telefone do contato não identificado.");\n      return;\n    }\n\n    const normalizedPhone = activePhone.startsWith("55") ? activePhone : \`55\${activePhone}\`;\n\n    // A Cloud API do WhatsApp não inicia chamada de voz nativa.\n    // Este botão aciona o discador do dispositivo como solução imediata.\n    window.location.href = \`tel:+\${normalizedPhone}\`;\n  }`
);

replaceOnce(
  "drawer-sem-remount",
  `      <ConversationDrawer />`,
  `      {ConversationDrawer()}`
);

if (changed) {
  fs.writeFileSync(file, s);
  console.log("[patch-whatsapp-focus-call-v10] arquivo atualizado");
} else {
  console.log("[patch-whatsapp-focus-call-v10] nenhuma alteração necessária");
}
