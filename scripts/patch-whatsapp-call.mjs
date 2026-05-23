import fs from "node:fs";

const filePath = "src/pages/AtendimentoWhatsApp.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldSnippet = `  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }`;

const newSnippet = `  async function callSoon() {
    if (!active || !activePhone) return;

    const callUrl = \`https://wa.me/\${activePhone}\`;
    const note = "📞 Tentativa de ligação iniciada pelo CRM";

    window.open(callUrl, "_blank", "noopener,noreferrer");

    try {
      await supabase.from("whatsapp_messages").insert({
        conversation_id: active.id,
        direction: "outbound",
        sender_type: "usuario",
        user_id: authUserId || null,
        message_type: "call_attempt",
        body: note,
        raw_payload: {
          kind: "call_attempt",
          provider: "whatsapp_web_fallback",
          status: "started",
          phone: activePhone,
          url: callUrl,
          created_from: "AtendimentoWhatsApp.callSoon",
          calling_api: {
            desired: true,
            enabled: false,
            note: "Preparado para futura integração com Meta WhatsApp Calling API quando a conta/app tiver o recurso habilitado.",
          },
        },
      });

      await supabase
        .from("whatsapp_conversations")
        .update({
          last_message: note,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", active.id);

      await loadMessages(active.id);
      await loadConversations({ silent: true });
    } catch (error) {
      console.error("WHATSAPP_CALL_ATTEMPT_LOG_ERROR", error);
    }
  }`;

if (source.includes(oldSnippet)) {
  source = source.replace(oldSnippet, newSnippet);
} else {
  console.warn("[patch-whatsapp-call] callSoon original não encontrado; nada alterado.");
}

fs.writeFileSync(filePath, source);
console.log("[patch-whatsapp-call] Botão de ligação agora registra tentativa e abre WhatsApp.");
