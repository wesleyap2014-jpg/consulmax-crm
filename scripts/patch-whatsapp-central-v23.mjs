import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v23] ${label}: ${status}`);
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

const oldPermissionFallback = `      if (needsPermission) {
        const permissionMessage = "Olá! Aqui é da Consulmax. Posso te ligar agora pelo WhatsApp para agilizar seu atendimento? Responda SIM para autorizar a ligação.";
        const sent = await sendMessage(permissionMessage);

        if (sent) {
          alert("O WhatsApp ainda não liberou chamada iniciada pela Consulmax para este contato. Enviei uma solicitação de autorização pelo próprio WhatsApp. Quando o cliente responder SIM, tente ligar novamente pelo CRM.");
        } else {
          alert("Este cliente ainda não autorizou chamadas iniciadas pela Consulmax e não foi possível enviar a solicitação automática pelo WhatsApp. Envie uma mensagem manual pedindo autorização e tente novamente após a resposta.");
        }

        return;
      }`;

const newPermissionFallback = `      if (needsPermission) {
        try {
          const permissionResponse = await fetch("/api/whatsapp/call-permission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_id: active?.id, to: activePhone, user_id: authUserId }),
          });

          const permissionResult = await permissionResponse.json();

          if (!permissionResponse.ok || !permissionResult?.ok) {
            console.error("WHATSAPP_CALL_PERMISSION_TEMPLATE_FRONT_ERROR", permissionResult);
            alert("O WhatsApp ainda não liberou chamada iniciada para este contato e não foi possível enviar o modelo oficial. Verifique os logs da Vercel por WHATSAPP_CALL_PERMISSION_TEMPLATE_ERROR.");
          } else {
            await loadMessages(active.id);
            await loadConversations({ silent: true });
            alert("O WhatsApp ainda não liberou chamada iniciada para este contato. Enviei o modelo oficial de permissão de chamada aprovado pela Meta. Quando o cliente autorizar, tente ligar novamente pelo CRM.");
          }
        } catch (permissionError) {
          console.error("WHATSAPP_CALL_PERMISSION_TEMPLATE_FRONT_EXCEPTION", permissionError);
          alert("Erro ao enviar o modelo oficial de permissão de chamada.");
        }

        return;
      }`;

replace("fallback chamada usa template oficial", oldPermissionFallback, newPermissionFallback);

// Também troca a função simples, caso o v22 tenha sido aplicado antes/depois em outro estado.
replace(
  "callSoon direto template oficial",
  `  function callSoon() {
    startOutboundWhatsAppCall();
  }`,
  `  function callSoon() {
    startOutboundWhatsAppCall();
  }`
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v23] concluído");
