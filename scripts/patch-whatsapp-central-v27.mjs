import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v27] ${label}: ${status}`);
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

// 1) Estado global de chamada recebida, independente de a conversa estar aberta.
insertAfter(
  "pending incoming global state",
  "  const [dismissedIncomingCallIds, setDismissedIncomingCallIds] = useState<string[]>([]);",
  "  const [pendingIncomingCallV27, setPendingIncomingCallV27] = useState<any | null>(null);",
  "pendingIncomingCallV27"
);

// 2) Helper para extrair dados do raw payload da tabela whatsapp_calls.
insertBefore(
  "helpers pending call v27",
  "  const incomingCallMessage = useMemo(() => {",
  [
    "  function callRowToPseudoMessageV27(row: any): Message | null {",
    "    const raw = row?.raw_payload || row || {};",
    "    const call = raw?.call || raw?.value?.calls?.[0] || raw?.calls?.[0] || raw;",
    "    const callId = call?.id || call?.call_id || raw?.meta_call_id || row?.call_id || row?.id || null;",
    "    const session = call?.session || raw?.session || raw?.data?.session || null;",
    "    const sdp = session?.sdp || null;",
    "    const status = String(row?.status || call?.event || call?.status || \"\").toLowerCase();",
    "    const direction = String(row?.direction || raw?.direction || \"inbound\").toLowerCase();",
    "",
    "    if (!callId || !sdp || direction !== \"inbound\" || status !== \"connect\") return null;",
    "",
    "    return {",
    "      id: String(row?.id || callId),",
    "      conversation_id: active?.id || \"\",",
    "      direction: \"inbound\",",
    "      sender_type: \"cliente\",",
    "      message_type: \"call\",",
    "      body: \"Chamada WhatsApp recebida • connect\",",
    "      created_at: row?.created_at || new Date().toISOString(),",
    "      raw_payload: raw,",
    "    } as Message;",
    "  }",
    "",
    "  function dismissIncomingCallV27(input: any) {",
    "    const pseudo = input?.message_type ? input : callRowToPseudoMessageV27(input);",
    "    const info = pseudo ? getWhatsAppCallInfo(pseudo) : null;",
    "    const id = info?.callId || pseudo?.id || input?.id;",
    "    if (id) setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, id])));",
    "    setPendingIncomingCallV27(null);",
    "  }",
  ].join("\n"),
  "callRowToPseudoMessageV27"
);

// 3) Overlay usa primeiro chamada pendente global; se não houver, usa a chamada da conversa ativa.
replace(
  "incoming overlay pending global",
  "  function IncomingCallOverlay() {\n    if (!incomingCallMessage) return null;\n\n    const caller = conversationName(active) || \"Cliente WhatsApp\";\n    const phone = formatPhoneBR(active?.whatsapp_contacts?.telefone || active?.whatsapp_contacts?.wa_id);",
  [
    "  function IncomingCallOverlay() {",
    "    const overlayMessage = pendingIncomingCallV27 ? callRowToPseudoMessageV27(pendingIncomingCallV27) : incomingCallMessage;",
    "    if (!overlayMessage) return null;",
    "",
    "    const caller = conversationName(active) || pendingIncomingCallV27?.phone || pendingIncomingCallV27?.wa_id || \"Cliente WhatsApp\";",
    "    const phone = formatPhoneBR(active?.whatsapp_contacts?.telefone || active?.whatsapp_contacts?.wa_id || pendingIncomingCallV27?.phone || pendingIncomingCallV27?.wa_id);",
  ].join("\n")
);

replace(
  "overlay recusar usa overlayMessage",
  "onClick={() => { const info = getWhatsAppCallInfo(incomingCallMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || incomingCallMessage.id]))); rejectWhatsAppCall(incomingCallMessage); }}",
  "onClick={() => { const info = getWhatsAppCallInfo(overlayMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || overlayMessage.id]))); setPendingIncomingCallV27(null); rejectWhatsAppCall(overlayMessage); }}"
);

replace(
  "overlay atender usa overlayMessage",
  "onClick={() => { const info = getWhatsAppCallInfo(incomingCallMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || incomingCallMessage.id]))); acceptWhatsAppCall(incomingCallMessage); }}",
  "onClick={() => { const info = getWhatsAppCallInfo(overlayMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || overlayMessage.id]))); setPendingIncomingCallV27(null); acceptWhatsAppCall(overlayMessage); }}"
);

// 4) Realtime da tabela whatsapp_calls abre/fecha overlay independente da conversa ativa.
replace(
  "realtime whatsapp_calls abre overlay",
  [
    "      .on(\"postgres_changes\", { event: \"INSERT\", schema: \"public\", table: \"whatsapp_calls\" }, async (payload) => {",
    "        const row: any = payload.new || {};",
    "        console.log(\"WHATSAPP_CALL_REALTIME_EVENT_V24\", {",
    "          id: row.id,",
    "          call_id: row.call_id,",
    "          status: row.status,",
    "          direction: row.direction,",
    "        });",
    "        await applyRemoteAnswerSdpFromPayloadV24(row.raw_payload || row);",
    "      })",
  ].join("\n"),
  [
    "      .on(\"postgres_changes\", { event: \"INSERT\", schema: \"public\", table: \"whatsapp_calls\" }, async (payload) => {",
    "        const row: any = payload.new || {};",
    "        const raw = row.raw_payload || {};",
    "        const call = raw?.call || raw?.value?.calls?.[0] || raw?.calls?.[0] || raw;",
    "        const callId = call?.id || call?.call_id || raw?.meta_call_id || row.call_id || row.id || null;",
    "        const status = String(row.status || call?.event || call?.status || \"\").toLowerCase();",
    "        const direction = String(row.direction || raw?.direction || \"\").toLowerCase();",
    "        const hasSdp = !!(call?.session?.sdp || raw?.session?.sdp || raw?.data?.session?.sdp);",
    "",
    "        console.log(\"WHATSAPP_CALL_REALTIME_EVENT_V27\", {",
    "          id: row.id,",
    "          call_id: callId,",
    "          status,",
    "          direction,",
    "          hasSdp,",
    "        });",
    "",
    "        if (direction === \"inbound\" && status === \"connect\" && hasSdp && !dismissedIncomingCallIds.includes(callId)) {",
    "          setPendingIncomingCallV27(row);",
    "        }",
    "",
    "        if ([\"terminate\", \"reject\", \"media_update_failed\", \"media_update\"].includes(status)) {",
    "          if (callId) setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, callId])));",
    "          setPendingIncomingCallV27((prev: any) => {",
    "            const prevPseudo = callRowToPseudoMessageV27(prev);",
    "            const prevInfo = prevPseudo ? getWhatsAppCallInfo(prevPseudo) : null;",
    "            return prevInfo?.callId && prevInfo.callId === callId ? null : prev;",
    "          });",
    "        }",
    "",
    "        await applyRemoteAnswerSdpFromPayloadV24(row.raw_payload || row);",
    "      })",
  ].join("\n")
);

// 5) Cards antigos de chamada só mostram Atender/Recusar por até 90s e nunca se o body/status for encerrado/falha.
replace(
  "MessageContent canAnswer recente",
  "    const canAnswer = !!callInfo.callId && !!callInfo.sdp && (callInfo.event === \"connect\" || callInfo.sdpType === \"offer\");",
  [
    "    const callAgeMs = msg.created_at ? Date.now() - new Date(msg.created_at).getTime() : Number.POSITIVE_INFINITY;",
    "    const callBody = String(msg.body || \"\").toLowerCase();",
    "    const callEnded = callBody.includes(\"terminate\") || callBody.includes(\"encerrar\") || callBody.includes(\"reject\") || callBody.includes(\"recusar\") || callInfo.event === \"terminate\" || callInfo.event === \"reject\" || callInfo.event === \"media_update_failed\";",
    "    const canAnswer = !!callInfo.callId && !!callInfo.sdp && (callInfo.event === \"connect\" || callInfo.sdpType === \"offer\") && callAgeMs >= 0 && callAgeMs <= 90 * 1000 && !callEnded;",
  ].join("\n")
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v27] concluído");
