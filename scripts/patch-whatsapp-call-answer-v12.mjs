import fs from "node:fs";

const file = "src/pages/AtendimentoWhatsApp.tsx";
let s = fs.readFileSync(file, "utf8");
let changed = false;

function patch(label, from, to) {
  if (s.includes(to)) {
    console.log(`[patch-whatsapp-call-answer-v12] ${label}: já aplicado`);
    return;
  }

  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-call-answer-v12] ${label}: trecho não encontrado`);
    return;
  }

  s = s.replace(from, to);
  changed = true;
  console.log(`[patch-whatsapp-call-answer-v12] ${label}: aplicado`);
}

const callInfoHelper = `
function getWhatsAppCallInfo(msg: Message) {
  const raw = msg.raw_payload || {};
  const call = raw.call || raw?.raw_payload?.call || null;
  const session = call?.session || raw?.session || null;
  const callId = call?.id || raw?.meta_call_id || call?.call_id || null;
  const event = String(call?.event || call?.status || "").toLowerCase();
  const sdp = session?.sdp || null;
  const sdpType = session?.sdp_type || null;

  return { call, session, callId, event, sdp, sdpType };
}
`;

patch(
  "helper-getWhatsAppCallInfo",
  `function isMediaMessage(msg: Message) {
  const type = String(msg.message_type || "").toLowerCase();
  return ["audio", "voice", "image", "video", "document", "sticker"].includes(type) || !!getStoredMedia(msg)?.storage_path;
}`,
  `function isMediaMessage(msg: Message) {
  const type = String(msg.message_type || "").toLowerCase();
  return ["audio", "voice", "image", "video", "document", "sticker"].includes(type) || !!getStoredMedia(msg)?.storage_path;
}
${callInfoHelper}`
);

patch(
  "MessageContent-signature",
  `function MessageContent({ msg, mediaUrl, outbound }: { msg: Message; mediaUrl?: string; outbound: boolean }) {`,
  `function MessageContent({
  msg,
  mediaUrl,
  outbound,
  onAcceptCall,
  onRejectCall,
  onEndCall,
  activeCallId,
  callBusy,
}: {
  msg: Message;
  mediaUrl?: string;
  outbound: boolean;
  onAcceptCall?: (msg: Message) => void;
  onRejectCall?: (msg: Message) => void;
  onEndCall?: (msg: Message) => void;
  activeCallId?: string | null;
  callBusy?: boolean;
}) {`
);

patch(
  "MessageContent-call-ui",
  `  const linkClass = outbound ? "text-white/90 underline" : "text-slate-700 underline";

  if ((type === "audio" || type === "voice") && mediaUrl) {`,
  `  const linkClass = outbound ? "text-white/90 underline" : "text-slate-700 underline";

  if (type === "call") {
    const callInfo = getWhatsAppCallInfo(msg);
    const canAnswer = !!callInfo.callId && !!callInfo.sdp && (callInfo.event === "connect" || callInfo.sdpType === "offer");
    const isCurrentCall = !!callInfo.callId && activeCallId === callInfo.callId;

    return (
      <div className="min-w-[260px] space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4" />
          <span>{msg.body || "Chamada WhatsApp"}</span>
        </div>

        {canAnswer ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={callBusy} onClick={() => onAcceptCall?.(msg)} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
              {callBusy && isCurrentCall ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Phone className="mr-1 h-3.5 w-3.5" />}
              Atender
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={callBusy} onClick={() => onRejectCall?.(msg)} className={outbound ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "text-red-700"}>
              Recusar
            </Button>
          </div>
        ) : (
          <p className={outbound ? "text-xs text-white/70" : "text-xs text-slate-400"}>
            Evento de chamada registrado. Esta etapa não trouxe oferta de áudio ativa.
          </p>
        )}

        {isCurrentCall && (
          <Button type="button" size="sm" variant="outline" disabled={callBusy} onClick={() => onEndCall?.(msg)} className={outbound ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "text-slate-700"}>
            Encerrar chamada
          </Button>
        )}
      </div>
    );
  }

  if ((type === "audio" || type === "voice") && mediaUrl) {`
);

patch(
  "call-refs-state",
  `  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);`,
  `  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const [callState, setCallState] = useState<{ callId: string | null; status: string }>({ callId: null, status: "idle" });`
);

const callFunctions = `
  function stopLocalCallResources() {
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {}

    localStreamRef.current = null;

    try {
      peerRef.current?.close();
    } catch {}

    peerRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }

  async function waitForIceGatheringComplete(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return;

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }, 2500);

      function onStateChange() {
        if (peer.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          peer.removeEventListener("icegatheringstatechange", onStateChange);
          resolve();
        }
      }

      peer.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  async function sendCallAction(params: { action: "accept" | "reject" | "terminate"; callId: string; sdp?: string | null }) {
    const response = await fetch("/api/whatsapp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: params.action,
        call_id: params.callId,
        sdp: params.sdp || undefined,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      console.error("WHATSAPP_CALL_FRONT_ACTION_ERROR", result);
      throw new Error(
        result?.data?.error?.error_user_msg ||
          result?.data?.error?.message ||
          result?.error ||
          "Não foi possível executar a ação da chamada."
      );
    }

    return result;
  }

  async function acceptWhatsAppCall(msg: Message) {
    const info = getWhatsAppCallInfo(msg);

    if (!info.callId || !info.sdp) {
      alert("Esta chamada não possui oferta de áudio ativa para atender.");
      return;
    }

    setCallBusy(true);
    setCallState({ callId: info.callId, status: "connecting" });

    try {
      stopLocalCallResources();

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = localStream;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerRef.current = peer;

      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

      peer.ontrack = (event) => {
        const stream = event.streams?.[0];

        if (stream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => null);
        }
      };

      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        setCallState((prev) => ({ ...prev, status: state }));

        if (["failed", "closed", "disconnected"].includes(state)) {
          stopLocalCallResources();
        }
      };

      await peer.setRemoteDescription({ type: "offer", sdp: info.sdp });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGatheringComplete(peer);

      const finalSdp = peer.localDescription?.sdp || answer.sdp;
      await sendCallAction({ action: "accept", callId: info.callId, sdp: finalSdp });

      setCallState({ callId: info.callId, status: "connected" });
    } catch (error: any) {
      stopLocalCallResources();
      setCallState({ callId: null, status: "idle" });
      alert(error?.message || "Não foi possível atender a chamada pelo CRM.");
    } finally {
      setCallBusy(false);
    }
  }

  async function rejectWhatsAppCall(msg: Message) {
    const info = getWhatsAppCallInfo(msg);
    if (!info.callId) return alert("Call ID não encontrado.");

    setCallBusy(true);

    try {
      await sendCallAction({ action: "reject", callId: info.callId });
      stopLocalCallResources();
      setCallState({ callId: null, status: "idle" });
    } catch (error: any) {
      alert(error?.message || "Não foi possível recusar a chamada.");
    } finally {
      setCallBusy(false);
    }
  }

  async function endWhatsAppCall(msg?: Message) {
    const info = msg ? getWhatsAppCallInfo(msg) : null;
    const callId = info?.callId || callState.callId;

    if (!callId) {
      stopLocalCallResources();
      setCallState({ callId: null, status: "idle" });
      return;
    }

    setCallBusy(true);

    try {
      await sendCallAction({ action: "terminate", callId });
    } catch (error) {
      console.warn("WHATSAPP_CALL_TERMINATE_WARN", error);
    } finally {
      stopLocalCallResources();
      setCallState({ callId: null, status: "idle" });
      setCallBusy(false);
    }
  }
`;

patch(
  "call-functions",
  `  function addEmoji(emoji: string) {`,
  `${callFunctions}
  function addEmoji(emoji: string) {`
);

patch(
  "remote-audio-element",
  `      <div className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl">
        <div className="border-b bg-white p-4">`,
  `      <div className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        <div className="border-b bg-white p-4">`
);

patch(
  "MessageContent-props",
  `<MessageContent msg={msg} mediaUrl={mediaUrls[msg.id]} outbound={outbound} />`,
  `<MessageContent
                      msg={msg}
                      mediaUrl={mediaUrls[msg.id]}
                      outbound={outbound}
                      onAcceptCall={acceptWhatsAppCall}
                      onRejectCall={rejectWhatsAppCall}
                      onEndCall={endWhatsAppCall}
                      activeCallId={callState.callId}
                      callBusy={callBusy}
                    />`
);

if (changed) {
  fs.writeFileSync(file, s);
  console.log("[patch-whatsapp-call-answer-v12] arquivo atualizado");
} else {
  console.log("[patch-whatsapp-call-answer-v12] nenhuma alteração necessária");
}
