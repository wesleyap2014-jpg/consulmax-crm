import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v29] ${label}: ${status}`);
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

function insertAfter(label, needle, block, flag) {
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, needle + "\n" + block);
  changed = true;
  log(label, "aplicado");
}

// 1) Quando chegar evento de encerramento/falha, limpa estado visual da ligação automaticamente.
insertAfter(
  "clear call status from realtime terminal event",
  "        const hasSdp = !!(call?.session?.sdp || raw?.session?.sdp || raw?.data?.session?.sdp);",
  [
    "        const isTerminalCallEventV29 = [\"terminate\", \"reject\", \"media_update_failed\"].includes(status);",
    "        if (isTerminalCallEventV29) {",
    "          setOutboundCallStatusV28(\"\");",
    "          if (callId && callStateRef.current?.callId === callId) {",
    "            setCallState({ callId: null, status: \"idle\" });",
    "            stopLocalCallResources();",
    "          }",
    "          if (callId) setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, callId])));",
    "          setPendingIncomingCallV27(null);",
    "        }",
  ].join("\n"),
  "isTerminalCallEventV29"
);

// 2) Também limpa a faixa se a mensagem terminal entrar por loadMessages, não só por realtime de whatsapp_calls.
insertAfter(
  "clear call status from message history",
  "      const latestCallV25 = callRowsV25[callRowsV25.length - 1];",
  [
    "      if (latestCallV25) {",
    "        const latestInfoV29 = getWhatsAppCallInfo(latestCallV25);",
    "        const latestBodyV29 = String(latestCallV25.body || \"\").toLowerCase();",
    "        const latestEventV29 = String(latestInfoV29.event || \"\").toLowerCase();",
    "        const terminalV29 = latestBodyV29.includes(\"terminate\") || latestBodyV29.includes(\"reject\") || latestBodyV29.includes(\"media_update_failed\") || latestEventV29 === \"terminate\" || latestEventV29 === \"reject\" || latestEventV29 === \"media_update_failed\";",
    "        if (terminalV29) {",
    "          setPendingIncomingCallV27(null);",
    "          setOutboundCallStatusV28(\"\");",
    "          if (latestInfoV29.callId) setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, latestInfoV29.callId])));",
    "          if (latestInfoV29.callId && callStateRef.current?.callId === latestInfoV29.callId) {",
    "            setCallState({ callId: null, status: \"idle\" });",
    "            stopLocalCallResources();",
    "          }",
    "        }",
    "      }",
  ].join("\n"),
  "terminalV29"
);

// 3) O overlay deve abrir pelo card/conversa assim que o ticket atualizar, mesmo sem clicar no nome.
// Se a central receber chamada e atualizar mensagens da conversa ativa, força pending global.
replace(
  "active inbound connect opens pending sooner",
  "        if (activeInboundConnectV28 && !dismissedIncomingCallIds.includes(infoV28.callId)) {",
  "        if (activeInboundConnectV28 && !dismissedIncomingCallIds.includes(infoV28.callId)) {\n          console.log(\"WHATSAPP_INCOMING_OVERLAY_FROM_MESSAGE_V29\", { callId: infoV28.callId, messageId: latestCallV25.id });"
);

// 4) Se chegar chamada em uma conversa não aberta, tentar abrir automaticamente a conversa relacionada pelo telefone/wa_id.
insertAfter(
  "realtime call auto open conversation",
  "        if (direction === \"inbound\" && status === \"connect\" && hasSdp && !dismissedIncomingCallIds.includes(callId)) {\n          setPendingIncomingCallV27(row);\n        }",
  [
    "",
    "        if (direction === \"inbound\" && status === \"connect\" && hasSdp && !activeRef.current) {",
    "          loadConversations({ silent: true });",
    "        }",
  ].join("\n"),
  "realtime call auto open conversation"
);

// 5) Se outbound ficar aguardando áudio remoto por muito tempo, mostrar falha em vez de ficar pendurado indefinidamente.
insertAfter(
  "outbound remote audio timeout",
  "        setOutboundCallStatusV28(\"Cliente chamado. Aguardando aceite e áudio remoto...\");",
  [
    "        window.setTimeout(() => {",
    "          if (callStateRef.current?.callId === callId && !peer.remoteDescription) {",
    "            setOutboundCallStatusV28(\"Cliente atendeu, mas o áudio remoto não foi confirmado pela Meta. Tente encerrar e ligar novamente.\");",
    "            console.warn(\"WHATSAPP_OUTBOUND_REMOTE_AUDIO_TIMEOUT_V29\", { callId });",
    "          }",
    "        }, 12000);",
  ].join("\n"),
  "WHATSAPP_OUTBOUND_REMOTE_AUDIO_TIMEOUT_V29"
);

// 6) Botão do histórico: se aparecer evento terminal, nunca exibir ações.
replace(
  "MessageContent canAnswer inclui media_update_failed",
  "    const callEnded = callBody.includes(\"terminate\") || callBody.includes(\"encerrar\") || callBody.includes(\"reject\") || callBody.includes(\"recusar\") || callInfo.event === \"terminate\" || callInfo.event === \"reject\" || callInfo.event === \"media_update_failed\";",
  "    const callEnded = callBody.includes(\"terminate\") || callBody.includes(\"encerrar\") || callBody.includes(\"reject\") || callBody.includes(\"recusar\") || callBody.includes(\"media_update_failed\") || callInfo.event === \"terminate\" || callInfo.event === \"reject\" || callInfo.event === \"media_update_failed\";"
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v29] concluído");
