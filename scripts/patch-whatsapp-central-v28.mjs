import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v28] ${label}: ${status}`);
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

function insertBefore(label, needle, block, flag) {
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, block + "\n" + needle);
  changed = true;
  log(label, "aplicado");
}

// Estado visual específico para ligação outbound, para o usuário saber se está discando/conectando.
insertAfter(
  "outbound status state",
  "  const [pendingIncomingCallV27, setPendingIncomingCallV27] = useState<any | null>(null);",
  "  const [outboundCallStatusV28, setOutboundCallStatusV28] = useState<string>(\"\");",
  "outboundCallStatusV28"
);

// Mostra status no fluxo outbound.
insertAfter(
  "outbound status start",
  "    setCallBusy(true);\n    setCallState({ callId: null, status: \"calling\" });",
  "    setOutboundCallStatusV28(\"Preparando microfone e iniciando chamada...\");",
  "Preparando microfone e iniciando chamada"
);

insertAfter(
  "outbound status offer",
  "      await waitForIceGatheringComplete(peer);",
  "\n      setOutboundCallStatusV28(\"Conectando pelo WhatsApp...\");",
  "Conectando pelo WhatsApp"
);

replace(
  "outbound status wait answer",
  "        console.log(\"WHATSAPP_CALL_WAITING_FOR_REMOTE_ANSWER_SDP_V24\", { callId });",
  "        setOutboundCallStatusV28(\"Cliente chamado. Aguardando aceite e áudio remoto...\");\n        console.log(\"WHATSAPP_CALL_WAITING_FOR_REMOTE_ANSWER_SDP_V24\", { callId });"
);

replace(
  "outbound status connected immediate",
  "        console.log(\"WHATSAPP_CALL_IMMEDIATE_ANSWER_SDP_APPLIED_V24\", { callId });",
  "        setOutboundCallStatusV28(\"Chamada conectada. Verificando áudio...\");\n        console.log(\"WHATSAPP_CALL_IMMEDIATE_ANSWER_SDP_APPLIED_V24\", { callId });"
);

insertAfter(
  "clear outbound status stop",
  "    if (remoteAudioRef.current) {\n      remoteAudioRef.current.srcObject = null;\n    }",
  "\n    setOutboundCallStatusV28(\"\");",
  "setOutboundCallStatusV28(\"\")"
);

// Quando aplicar SDP remoto, atualiza status visual.
replace(
  "remote sdp status",
  "      console.log(\"WHATSAPP_CALL_REMOTE_SDP_APPLIED_V24\", { callId });",
  "      setOutboundCallStatusV28(\"Áudio remoto conectado. Teste fala/escuta agora.\");\n      console.log(\"WHATSAPP_CALL_REMOTE_SDP_APPLIED_V24\", { callId });"
);

// Fallback: quando uma mensagem de chamada connect chegar na conversa ativa, o overlay deve aparecer sem depender de clicar no card.
insertAfter(
  "active message opens pending overlay",
  "      const latestCallV25 = callRowsV25[callRowsV25.length - 1];",
  [
    "      if (latestCallV25 && !callStateRef.current?.callId) {",
    "        const infoV28 = getWhatsAppCallInfo(latestCallV25);",
    "        const bodyV28 = String(latestCallV25.body || \"\").toLowerCase();",
    "        const ageV28 = latestCallV25.created_at ? Date.now() - new Date(latestCallV25.created_at).getTime() : Number.POSITIVE_INFINITY;",
    "        const activeInboundConnectV28 = latestCallV25.direction === \"inbound\" && !!infoV28.callId && !!infoV28.sdp && (infoV28.event === \"connect\" || infoV28.sdpType === \"offer\") && ageV28 >= 0 && ageV28 <= 90 * 1000 && !bodyV28.includes(\"terminate\") && !bodyV28.includes(\"reject\") && !bodyV28.includes(\"media_update_failed\");",
    "        if (activeInboundConnectV28 && !dismissedIncomingCallIds.includes(infoV28.callId)) {",
    "          setPendingIncomingCallV27({",
    "            id: latestCallV25.id,",
    "            call_id: infoV28.callId,",
    "            phone: active?.whatsapp_contacts?.telefone || active?.whatsapp_contacts?.wa_id || null,",
    "            wa_id: active?.whatsapp_contacts?.wa_id || null,",
    "            direction: \"inbound\",",
    "            status: \"connect\",",
    "            created_at: latestCallV25.created_at,",
    "            raw_payload: latestCallV25.raw_payload,",
    "          });",
    "        }",
    "      }",
  ].join("\n"),
  "activeInboundConnectV28"
);

// Barra de status da chamada no topo do drawer, para outbound ficar claro.
insertBefore(
  "call status banner function",
  "  function IncomingCallOverlay() {",
  [
    "  function CallStatusBannerV28() {",
    "    if (!outboundCallStatusV28 && callState.status === \"idle\") return null;",
    "",
    "    const activeStatus = outboundCallStatusV28 || (callState.status !== \"idle\" ? `Status da chamada: ${callState.status}` : \"\");",
    "    if (!activeStatus) return null;",
    "",
    "    return (",
    "      <div className=\"mx-4 mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800\">",
    "        <div className=\"flex items-center gap-2 font-bold\">",
    "          <Phone className=\"h-4 w-4\" />",
    "          <span>{activeStatus}</span>",
    "        </div>",
    "        {callState.callId && <p className=\"mt-1 text-xs text-emerald-700/80\">ID da chamada: {callState.callId}</p>}",
    "      </div>",
    "    );",
    "  }",
  ].join("\n"),
  "function CallStatusBannerV28"
);

replace(
  "render call status banner",
  "        <div className=\"flex-1 space-y-3 overflow-auto bg-slate-50 px-4 py-3\">",
  "        <CallStatusBannerV28 />\n        <div className=\"flex-1 space-y-3 overflow-auto bg-slate-50 px-4 py-3\">"
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v28] concluído");
