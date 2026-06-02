import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v26] ${label}: ${status}`);
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

// Estado local para não deixar o overlay voltar para a mesma chamada já tratada.
insertAfter(
  "dismissed incoming calls state",
  "  const callStateRef = useRef<{ callId: string | null; status: string }>({ callId: null, status: \"idle\" });",
  "  const [dismissedIncomingCallIds, setDismissedIncomingCallIds] = useState<string[]>([]);",
  "dismissedIncomingCallIds"
);

// Substitui a regra do overlay. Ela agora só mostra chamada recente, não encerrada e não tratada.
const oldIncomingBlock = [
  "  const incomingCallMessage = useMemo(() => {",
  "    if (callState.callId && callState.status !== \"idle\") return null;",
  "",
  "    const callMessages = messages.filter((msg) => String(msg.message_type || \"\").toLowerCase() === \"call\");",
  "",
  "    for (let i = callMessages.length - 1; i >= 0; i--) {",
  "      const msg = callMessages[i];",
  "      const info = getWhatsAppCallInfo(msg);",
  "      const event = String(info.event || \"\").toLowerCase();",
  "      const canAnswer = !!info.callId && !!info.sdp && (event === \"connect\" || info.sdpType === \"offer\");",
  "      const body = String(msg.body || \"\").toLowerCase();",
  "      const ended = body.includes(\"terminate\") || body.includes(\"encerrar\") || body.includes(\"reject\") || body.includes(\"recusar\");",
  "",
  "      if (canAnswer && !ended && msg.direction === \"inbound\") return msg;",
  "    }",
  "",
  "    return null;",
  "  }, [messages, callState.callId, callState.status]);",
].join("\n");

const newIncomingBlock = [
  "  const incomingCallMessage = useMemo(() => {",
  "    // Se o usuário iniciou uma chamada pelo CRM, eventos connect não devem virar overlay de chamada recebida.",
  "    if (callState.callId && callState.status !== \"idle\") return null;",
  "",
  "    const callMessages = messages.filter((msg) => String(msg.message_type || \"\").toLowerCase() === \"call\");",
  "    const endedCallIds = new Set<string>();",
  "",
  "    for (const msg of callMessages) {",
  "      const info = getWhatsAppCallInfo(msg);",
  "      const body = String(msg.body || \"\").toLowerCase();",
  "      const event = String(info.event || \"\").toLowerCase();",
  "      const ended = body.includes(\"terminate\") || body.includes(\"encerrar\") || body.includes(\"reject\") || body.includes(\"recusar\") || event === \"terminate\" || event === \"reject\";",
  "      if (ended && info.callId) endedCallIds.add(info.callId);",
  "    }",
  "",
  "    for (let i = callMessages.length - 1; i >= 0; i--) {",
  "      const msg = callMessages[i];",
  "      const info = getWhatsAppCallInfo(msg);",
  "      const event = String(info.event || \"\").toLowerCase();",
  "      const body = String(msg.body || \"\").toLowerCase();",
  "      const callId = info.callId || msg.id;",
  "      const createdAt = msg.created_at ? new Date(msg.created_at).getTime() : 0;",
  "      const ageMs = createdAt ? Date.now() - createdAt : Number.POSITIVE_INFINITY;",
  "      const isRecent = ageMs >= 0 && ageMs <= 90 * 1000;",
  "      const ended = body.includes(\"terminate\") || body.includes(\"encerrar\") || body.includes(\"reject\") || body.includes(\"recusar\") || event === \"terminate\" || event === \"reject\";",
  "      const canAnswer = !!info.callId && !!info.sdp && (event === \"connect\" || info.sdpType === \"offer\");",
  "      const dismissed = dismissedIncomingCallIds.includes(callId);",
  "",
  "      if (canAnswer && !ended && !dismissed && isRecent && !endedCallIds.has(info.callId) && msg.direction === \"inbound\") return msg;",
  "    }",
  "",
  "    return null;",
  "  }, [messages, callState.callId, callState.status, dismissedIncomingCallIds]);",
].join("\n");

replace("incoming overlay regra v26", oldIncomingBlock, newIncomingBlock);

// Ao trocar de conversa, limpa somente descartes antigos para não crescer indefinidamente.
insertAfter(
  "limpa dismissed antigo",
  "  useEffect(() => {\n    if (active?.id) {\n      loadMessages(active.id);\n    } else {\n      setMessages([]);\n    }\n  }, [active?.id]);",
  "\n  useEffect(() => {\n    setDismissedIncomingCallIds([]);\n  }, [active?.id]);",
  "setDismissedIncomingCallIds([])"
);

// No overlay, marcar chamada como tratada ao recusar ou atender, para sumir imediatamente e não voltar.
replace(
  "overlay recusar dismiss",
  "            <Button type=\"button\" variant=\"outline\" disabled={callBusy} onClick={() => rejectWhatsAppCall(incomingCallMessage)} className=\"h-12 rounded-2xl border-red-100 bg-red-50 font-black text-red-700 hover:bg-red-100\">",
  "            <Button type=\"button\" variant=\"outline\" disabled={callBusy} onClick={() => { const info = getWhatsAppCallInfo(incomingCallMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || incomingCallMessage.id]))); rejectWhatsAppCall(incomingCallMessage); }} className=\"h-12 rounded-2xl border-red-100 bg-red-50 font-black text-red-700 hover:bg-red-100\">"
);

replace(
  "overlay atender dismiss",
  "            <Button type=\"button\" disabled={callBusy} onClick={() => acceptWhatsAppCall(incomingCallMessage)} className=\"h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-700\">",
  "            <Button type=\"button\" disabled={callBusy} onClick={() => { const info = getWhatsAppCallInfo(incomingCallMessage); setDismissedIncomingCallIds((prev) => Array.from(new Set([...prev, info.callId || incomingCallMessage.id]))); acceptWhatsAppCall(incomingCallMessage); }} className=\"h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-700\">"
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v26] concluído");
