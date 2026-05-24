import fs from "node:fs";

function replaceBetween(text, start, end, replacement) {
  const a = text.indexOf(start);
  if (a < 0) return text;
  const b = text.indexOf(end, a);
  if (b < 0) return text;
  return text.slice(0, a) + replacement + text.slice(b + end.length);
}

function patchFrontend() {
  const p = "src/pages/AtendimentoWhatsApp.tsx";
  let s = fs.readFileSync(p, "utf8");

  const refs = `  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);`;
  const refs2 = `${refs}
  const callPeerRef = useRef<RTCPeerConnection | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [callError, setCallError] = useState<string | null>(null);`;
  if (!s.includes("callPeerRef")) s = s.replace(refs, refs2);

  const newCall = `  function stopCurrentCall() {
    try { callPeerRef.current?.close(); } catch {}
    callPeerRef.current = null;
    try { callStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    callStreamRef.current = null;
    setCallStatus("ended");
  }

  function humanCallError(value: any) {
    const raw = String(value || "");
    if (raw.toLowerCase().includes("calling api not enabled")) {
      return "A Calling API ainda não está habilitada para este app/número na Meta. O CRM já está pronto para chamar; falta a Meta liberar esse recurso na conta.";
    }
    return raw || "Erro ao iniciar chamada.";
  }

  async function callSoon() {
    if (!active || !activePhone) return;
    setCallPanelOpen(true);
    setCallError(null);
    setCallStatus("requesting_mic");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      callStreamRef.current = stream;
      setCallStatus("creating_offer");

      const peer = new RTCPeerConnection();
      callPeerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);

      setCallStatus("calling");
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_call", conversation_id: active.id, to: activePhone, user_id: authUserId, sdp_offer: offer.sdp }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) {
        const msg = result?.error?.error?.message || result?.error?.message || result?.error || "A Meta não aceitou a chamada.";
        throw new Error(humanCallError(msg));
      }
      const answer = result?.answer_sdp || result?.data?.session?.sdp || null;
      if (answer) {
        await peer.setRemoteDescription({ type: "answer", sdp: answer });
        setCallStatus("connected");
      } else {
        setCallStatus("api_pending");
      }
      await loadMessages(active.id);
      await loadConversations({ silent: true });
    } catch (error: any) {
      console.error("WHATSAPP_CALL_FRONT_ERROR", error);
      setCallError(humanCallError(error?.message));
      setCallStatus("error");
      try { callStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    }
  }

  const activeIsMine =`;
  s = replaceBetween(s, "  function callSoon() {", "  const activeIsMine =", newCall);
  s = replaceBetween(s, "  async function callSoon() {", "  const activeIsMine =", newCall);
  s = s.replace(/const activeIsMine =\s*const activeIsMine =\s*/g, "const activeIsMine = ");

  const panelAt = `                      {emojiOpen && (`;
  const panel = `                      {callPanelOpen && (
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Phone className="h-4 w-4" />Ligação pelo CRM</p>
                              <p className="mt-1 text-xs text-slate-500">Status: {callStatus}</p>
                              {callError && <p className="mt-2 text-xs font-semibold text-red-700">{callError}</p>}
                            </div>
                            <Button type="button" variant="outline" onClick={stopCurrentCall}>Encerrar</Button>
                          </div>
                        </div>
                      )}

${panelAt}`;
  if (!s.includes("Ligação pelo CRM")) s = s.replace(panelAt, panel);

  const oldBtn = `<Button type="button" variant="outline" onClick={callSoon} className="h-auto min-w-[52px]" title="Fazer ligação"><Phone className="h-5 w-5" /></Button>`;
  const newBtn = `<Button type="button" variant="outline" onClick={callSoon} disabled={sending || callStatus === "requesting_mic" || callStatus === "creating_offer" || callStatus === "calling"} className="h-auto min-w-[52px]" title="Fazer ligação"><Phone className="h-5 w-5" /></Button>`;
  s = s.replace(oldBtn, newBtn);

  fs.writeFileSync(p, s);
  console.log("[patch-whatsapp-call] Frontend WebRTC pronto.");
}

function patchSend() {
  const p = "api/whatsapp/send.ts";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace('const GRAPH_BASE = "https://graph.facebook.com/v21.0";', 'const GRAPH_BASE = "https://graph.facebook.com/v25.0";');

  if (!s.includes("async function startWhatsAppCall")) {
    const fn = `async function startWhatsAppCall(params: { conversation_id: string; to: string; user_id?: string | null; sdp_offer: string }) {
  const phone = onlyDigits(params.to);
  const now = new Date().toISOString();
  const requestPayload = { messaging_product: "whatsapp", to: phone, action: "connect", session: { sdp_type: "offer", sdp: params.sdp_offer } };

  await supabaseAdmin.from("whatsapp_calls").insert({ conversation_id: params.conversation_id, phone, wa_id: phone, user_id: params.user_id || null, direction: "outbound", status: "starting", raw_payload: { provider: "meta_whatsapp_calling_api", request: requestPayload } });

  const response = await fetch(GRAPH_BASE + "/" + DEFAULT_PHONE_NUMBER_ID + "/calls", { method: "POST", headers: { Authorization: "Bearer " + META_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(requestPayload) });
  const data = await readJson(response);
  if (!response.ok) {
    await supabaseAdmin.from("whatsapp_calls").insert({ conversation_id: params.conversation_id, phone, wa_id: phone, user_id: params.user_id || null, direction: "outbound", status: "meta_error", raw_payload: { provider: "meta_whatsapp_calling_api", request: requestPayload, response: data, http_status: response.status } });
    return { ok: false, status: response.status, error: data };
  }
  const answer_sdp = data?.session?.sdp || data?.sdp || data?.answer?.sdp || null;
  const meta_call_id = data?.id || data?.call_id || data?.calls?.[0]?.id || null;
  await supabaseAdmin.from("whatsapp_calls").insert({ conversation_id: params.conversation_id, phone, wa_id: phone, user_id: params.user_id || null, direction: "outbound", status: answer_sdp ? "connected" : "api_pending", raw_payload: { provider: "meta_whatsapp_calling_api", response: data, meta_call_id, answer_sdp } });
  await supabaseAdmin.from("whatsapp_messages").insert({ conversation_id: params.conversation_id, direction: "outbound", sender_type: "usuario", user_id: params.user_id || null, message_type: "call_attempt", body: "Ligação iniciada pelo CRM", raw_payload: { provider: "meta_whatsapp_calling_api", response: data, meta_call_id } });
  await supabaseAdmin.from("whatsapp_conversations").update({ last_message: "Ligação iniciada pelo CRM", last_message_at: now, unread_count: 0, status: "humano", updated_at: now }).eq("id", params.conversation_id);
  return { ok: true, status: 200, data, answer_sdp, meta_call_id };
}

`;
    s = s.replace("async function sendMediaMessage(params: {", fn + "async function sendMediaMessage(params: {");
  }

  s = s.replace("const { conversation_id, to, body, user_id, file_base64, file_name, mime_type, caption, media_type } = req.body || {};", "const { action, conversation_id, to, body, user_id, file_base64, file_name, mime_type, caption, media_type, sdp_offer } = req.body || {};");

  if (!s.includes('action === "start_call"')) {
    s = s.replace("    if (file_base64 && mime_type) {", "    if (action === \"start_call\") {\n      const result = await startWhatsAppCall({ conversation_id, to, user_id, sdp_offer });\n      if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });\n      return res.status(200).json({ ok: true, data: result.data, answer_sdp: result.answer_sdp, meta_call_id: result.meta_call_id });\n    }\n\n    if (file_base64 && mime_type) {");
  }

  fs.writeFileSync(p, s);
  console.log("[patch-whatsapp-call] send.ts com start_call pronto.");
}

patchFrontend();
patchSend();
