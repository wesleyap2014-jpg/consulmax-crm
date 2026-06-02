import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v25] ${label}: ${status}`);
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
  s = s.replace(needle, `${needle}\n${block}`);
  changed = true;
  log(label, "aplicado");
}

function insertBefore(label, needle, block, flag) {
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, `${block}\n${needle}`);
  changed = true;
  log(label, "aplicado");
}

// 1) Em outbound, o evento connect precisa completar o SDP remoto como answer, não ser atendido como chamada inbound.
replace(
  "applyRemoteAnswer aceita callId diferente",
  `    if (!sdp || (currentCallId && callId && currentCallId !== callId)) return false;
    if (peer.remoteDescription?.sdp === sdp) return true;`,
  `    if (!sdp) return false;
    if (currentCallId && callId && currentCallId !== callId) {
      console.warn("WHATSAPP_CALL_REMOTE_SDP_CALL_ID_DIFF_V25", { currentCallId, incomingCallId: callId });
    }
    if (peer.remoteDescription?.sdp === sdp) return true;`
);

insertAfter(
  "accept usa connect como answer outbound",
  `    const info = getWhatsAppCallInfo(msg);`,
  `
    const hasOutboundPeerV25 = !!peerRef.current && !!callStateRef.current?.callId;
    const eventV25 = String(info.event || "").toLowerCase();

    if (hasOutboundPeerV25 && info.sdp && (eventV25 === "connect" || info.sdpType === "answer" || peerRef.current?.signalingState === "have-local-offer")) {
      setCallBusy(true);
      try {
        const applied = await applyRemoteAnswerSdpFromPayloadV24(msg.raw_payload || { call: info.call, session: info.session, meta_call_id: info.callId });
        if (applied) {
          setCallState((prev) => ({ ...prev, callId: prev.callId || info.callId || null, status: "connected" }));
          console.log("WHATSAPP_OUTBOUND_CONNECT_AUDIO_COMPLETED_V25", { callId: info.callId });
          return;
        }
      } finally {
        setCallBusy(false);
      }
    }`,
  "WHATSAPP_OUTBOUND_CONNECT_AUDIO_COMPLETED_V25"
);

// 2) Quando o evento de chamada chegar via mensagem, se houver peer outbound esperando, tenta completar automaticamente.
insertAfter(
  "auto apply call message sdp",
  `    } else {
      setMessages((data || []) as Message[]);
    }`,
  `

    try {
      const callRowsV25 = ((data || []) as Message[]).filter((msg) => String(msg.message_type || "").toLowerCase() === "call");
      const latestCallV25 = callRowsV25[callRowsV25.length - 1];
      if (latestCallV25 && peerRef.current && callStateRef.current?.callId) {
        await applyRemoteAnswerSdpFromPayloadV24(latestCallV25.raw_payload || latestCallV25);
      }
    } catch (error) {
      console.warn("WHATSAPP_AUTO_APPLY_CALL_SDP_V25_WARN", error);
    }`,
  "WHATSAPP_AUTO_APPLY_CALL_SDP_V25_WARN"
);

// 3) Overlay de chamada recebida. Deriva do último card call/connect com oferta ativa e sem chamada conectada.
insertBefore(
  "incoming call overlay function",
  `  function ConversationDrawer() {`,
  `  const incomingCallMessage = useMemo(() => {
    if (callState.callId && callState.status !== "idle") return null;

    const callMessages = messages.filter((msg) => String(msg.message_type || "").toLowerCase() === "call");

    for (let i = callMessages.length - 1; i >= 0; i--) {
      const msg = callMessages[i];
      const info = getWhatsAppCallInfo(msg);
      const event = String(info.event || "").toLowerCase();
      const canAnswer = !!info.callId && !!info.sdp && (event === "connect" || info.sdpType === "offer");
      const body = String(msg.body || "").toLowerCase();
      const ended = body.includes("terminate") || body.includes("encerrar") || body.includes("reject") || body.includes("recusar");

      if (canAnswer && !ended && msg.direction === "inbound") return msg;
    }

    return null;
  }, [messages, callState.callId, callState.status]);

  useEffect(() => {
    if (!incomingCallMessage) return;

    let closed = false;
    let audioContext: AudioContext | null = null;
    let interval: number | null = null;

    async function beep() {
      try {
        audioContext = audioContext || new AudioContext();
        if (audioContext.state === "suspended") await audioContext.resume();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.045;
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        window.setTimeout(() => {
          try { osc.stop(); } catch {}
          try { osc.disconnect(); gain.disconnect(); } catch {}
        }, 220);
      } catch {}
    }

    beep();
    interval = window.setInterval(() => {
      if (!closed) beep();
    }, 1800);

    return () => {
      closed = true;
      if (interval) window.clearInterval(interval);
      try { audioContext?.close(); } catch {}
    };
  }, [incomingCallMessage?.id]);

  function IncomingCallOverlay() {
    if (!incomingCallMessage) return null;

    const caller = conversationName(active) || "Cliente WhatsApp";
    const phone = formatPhoneBR(active?.whatsapp_contacts?.telefone || active?.whatsapp_contacts?.wa_id);

    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-[32px] border border-white/15 bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-black text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${C.red}, ${C.navy})` }}>
            <Phone className="h-9 w-9 animate-pulse" />
          </div>

          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Chamada WhatsApp</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">{caller}</h2>
          <p className="mt-1 text-sm text-slate-500">{phone}</p>
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Chamada recebida pelo WhatsApp oficial da Consulmax.</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" disabled={callBusy} onClick={() => rejectWhatsAppCall(incomingCallMessage)} className="h-12 rounded-2xl border-red-100 bg-red-50 font-black text-red-700 hover:bg-red-100">
              Recusar
            </Button>
            <Button type="button" disabled={callBusy} onClick={() => acceptWhatsAppCall(incomingCallMessage)} className="h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-700">
              {callBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
              Atender
            </Button>
          </div>
        </div>
      </div>
    );
  }
`,
  "function IncomingCallOverlay()"
);

replace(
  "render incoming overlay",
  `      <ConversationDrawer />`,
  `      <ConversationDrawer />
      <IncomingCallOverlay />`
);

replace(
  "render incoming overlay function mode",
  `      {ConversationDrawer()}`,
  `      {ConversationDrawer()}
      {IncomingCallOverlay()}`
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v25] concluído");
