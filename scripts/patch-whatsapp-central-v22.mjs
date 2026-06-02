import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v22] ${label}: ${status}`);
}

let s = fs.readFileSync(pageFile, "utf8");
let changed = false;

function replace(label, from, to) {
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

// 1) Botão de telefone: usar endpoint do template aprovado em vez da mensagem antiga.
replace(
  "callSoon usa template aprovado",
  `  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }`,
  `  async function callSoon() {
    if (!active || !activePhone) {
      alert("Telefone do contato não identificado.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/whatsapp/call-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: active.id, to: activePhone, user_id: authUserId }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        console.error("WHATSAPP_CALL_PERMISSION_FRONT_ERROR", result);
        alert("Não foi possível enviar o modelo oficial de permissão de chamada. Confira os logs da Vercel para WHATSAPP_CALL_PERMISSION_TEMPLATE_ERROR.");
        return;
      }

      await loadMessages(active.id);
      await loadConversations({ silent: true });
      alert("Solicitação oficial de permissão para ligação enviada pelo WhatsApp.");
    } catch (error) {
      console.error("WHATSAPP_CALL_PERMISSION_FRONT_EXCEPTION", error);
      alert("Erro ao enviar solicitação oficial de permissão de chamada.");
    } finally {
      setSending(false);
    }
  }`
);

// 2) Finalização: perguntar se envia pesquisa de satisfação.
replace(
  "finalizar pergunta pesquisa",
  `  async function finalizarConversa() {
    if (!active) return;

    const sent = await sendMessage(EVALUATION_MESSAGE);

    const ok = await updateActiveConversationPatch({
      status: "fechada",
      stage: "finalizado",
      queue: "finalizado",
      closed_at: new Date().toISOString(),
    });

    if (ok && !sent) alert("Atendimento finalizado, mas não foi possível enviar a mensagem de avaliação.");
  }`,
  `  async function finalizarConversa() {
    if (!active) return;

    const sendSurvey = confirm("Deseja enviar a pesquisa de satisfação para este cliente?");
    const sent = sendSurvey ? await sendMessage(EVALUATION_MESSAGE) : true;

    const ok = await updateActiveConversationPatch({
      status: "fechada",
      stage: "finalizado",
      queue: "finalizado",
      closed_at: new Date().toISOString(),
    });

    if (ok && sendSurvey && !sent) alert("Atendimento finalizado, mas não foi possível enviar a mensagem de avaliação.");
  }`
);

// 3) Perda de foco: chamar overlays como função de render, não como componente recriado a cada render.
replace(
  "render StartConversationOverlay sem remount",
  `      {startOpen && <StartConversationOverlay />}`,
  `      {startOpen && StartConversationOverlay()}`
);

replace(
  "render CampaignOverlay sem remount",
  `      {campaignOpen && <CampaignOverlay />}`,
  `      {campaignOpen && CampaignOverlay()}`
);

// 4) Cliente WhatsApp/mensagem sem texto: melhorar fallback visual para eventos sem body.
replace(
  "fallback mensagem sem texto mais claro",
  `  return "Mensagem sem texto";`,
  `  if (type === "interactive") return "Resposta interativa recebida";
  if (type === "button") return "Botão recebido";
  if (type === "reaction") return "Reação recebida";
  if (type === "contacts") return "Contato recebido";
  if (type === "location") return "Localização recebida";

  return "Evento recebido pelo WhatsApp";`
);

// 5) Nome genérico: se não veio nome, mostrar telefone para diferenciar melhor.
replace(
  "conversationName usa telefone",
  `function conversationName(conv?: Conversation | null) {
  return conv?.whatsapp_contacts?.nome || "Cliente WhatsApp";
}`,
  `function conversationName(conv?: Conversation | null) {
  return conv?.whatsapp_contacts?.nome || formatPhoneBR(conv?.whatsapp_contacts?.telefone || conv?.whatsapp_contacts?.wa_id) || "Cliente WhatsApp";
}`
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v22] concluído");
