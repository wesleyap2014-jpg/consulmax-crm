import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v24] ${label}: ${status}`);
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

// Mantém uma referência atualizada do estado da chamada para callbacks Realtime.
replace(
  "call state ref",
  `  const [callBusy, setCallBusy] = useState(false);
  const [callState, setCallState] = useState<{ callId: string | null; status: string }>({ callId: null, status: "idle" });`,
  `  const [callBusy, setCallBusy] = useState(false);
  const [callState, setCallState] = useState<{ callId: string | null; status: string }>({ callId: null, status: "idle" });
  const callStateRef = useRef<{ callId: string | null; status: string }>({ callId: null, status: "idle" });`
);

insertAfter(
  "sync callStateRef",
  `  useEffect(() => {
    activeRef.current = active;
  }, [active]);`,
  `
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);`,
  "callStateRef.current = callState"
);

// Helpers de áudio remoto e aplicação tardia de SDP de resposta.
insertAfter(
  "helper remote audio",
  `  async function waitForIceGatheringComplete(peer: RTCPeerConnection) {
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
  }`,
  `

  async function playRemoteWhatsAppAudio(stream: MediaStream | null) {
    if (!stream || !remoteAudioRef.current) return;

    const audio = remoteAudioRef.current;
    audio.srcObject = stream;
    audio.muted = false;
    audio.volume = 1;

    try {
      await audio.play();
      console.log("WHATSAPP_CALL_REMOTE_AUDIO_PLAYING_V24", {
        audioTracks: stream.getAudioTracks().length,
      });
    } catch (error) {
      console.warn("WHATSAPP_CALL_REMOTE_AUDIO_PLAY_WARN_V24", error);
    }
  }

  async function applyRemoteAnswerSdpFromPayloadV24(raw: any) {
    const peer = peerRef.current;
    if (!peer || peer.signalingState === "closed") return false;

    const call = raw?.call || raw?.raw_payload?.call || raw?.value?.calls?.[0] || raw?.calls?.[0] || raw;
    const callId = call?.id || call?.call_id || raw?.meta_call_id || raw?.call_id || raw?.id || null;
    const session = call?.session || raw?.session || raw?.data?.session || raw?.raw_payload?.session || null;
    const sdp = session?.sdp || call?.session?.sdp || null;
    const currentCallId = callStateRef.current?.callId;

    if (!sdp || (currentCallId && callId && currentCallId !== callId)) return false;
    if (peer.remoteDescription?.sdp === sdp) return true;

    try {
      await peer.setRemoteDescription({ type: "answer", sdp });
      setCallState((prev) => ({ ...prev, callId: prev.callId || callId || null, status: "connected" }));
      console.log("WHATSAPP_CALL_REMOTE_SDP_APPLIED_V24", { callId });
      return true;
    } catch (error) {
      console.warn("WHATSAPP_CALL_REMOTE_SDP_APPLY_WARN_V24", error);
      return false;
    }
  }`,
  "playRemoteWhatsAppAudio"
);

// Fortalece inbound answer.
s = s.replaceAll(
  `      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));`,
  `      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
      if (peer.getTransceivers().every((t) => t.receiver.track?.kind !== "audio" && t.sender.track?.kind !== "audio")) {
        peer.addTransceiver("audio", { direction: "sendrecv" });
      }`
);
if (s.includes(`peer.addTransceiver("audio", { direction: "sendrecv" });`)) {
  changed = true;
  log("audio transceiver sendrecv", "aplicado ou já presente");
}

s = s.replaceAll(
  `          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => null);`,
  `          playRemoteWhatsAppAudio(stream);`
);
if (s.includes(`playRemoteWhatsAppAudio(stream);`)) {
  changed = true;
  log("remote audio play helper", "aplicado ou já presente");
}

// Logs de conexão ICE/WebRTC para diagnosticar mudo.
insertAfter(
  "connection state logs",
  `      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        setCallState((prev) => ({ ...prev, status: state }));`,
  `
        console.log("WHATSAPP_CALL_CONNECTION_STATE_V24", {
          state,
          iceConnectionState: peer.iceConnectionState,
          iceGatheringState: peer.iceGatheringState,
          signalingState: peer.signalingState,
        });`,
  "WHATSAPP_CALL_CONNECTION_STATE_V24"
);

// No outbound, depois do connect, aguarda um pouco por SDP tardio via webhook se a API não retornar answer na hora.
replace(
  "outbound answer wait",
  `      if (callId) setCallState({ callId, status: "calling" });
      if (answerSdp) await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });`,
  `      if (callId) setCallState({ callId, status: answerSdp ? "connected" : "calling" });
      if (answerSdp) {
        await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
        console.log("WHATSAPP_CALL_IMMEDIATE_ANSWER_SDP_APPLIED_V24", { callId });
      } else {
        console.log("WHATSAPP_CALL_WAITING_FOR_REMOTE_ANSWER_SDP_V24", { callId });
      }`
);

// Realtime em whatsapp_calls para aplicar session.sdp que chegue depois do cliente atender.
replace(
  "realtime whatsapp calls",
  `      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        loadConversations({ silent: true });
      })
      .subscribe();`,
  `      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        loadConversations({ silent: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_calls" }, async (payload) => {
        const row: any = payload.new || {};
        console.log("WHATSAPP_CALL_REALTIME_EVENT_V24", {
          id: row.id,
          call_id: row.call_id,
          status: row.status,
          direction: row.direction,
        });
        await applyRemoteAnswerSdpFromPayloadV24(row.raw_payload || row);
      })
      .subscribe();`
);

// Elemento de áudio visível tecnicamente, mas pequeno, para evitar bloqueios difíceis de diagnosticar.
replace(
  "remote audio element controls",
  `<audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />`,
  `<audio ref={remoteAudioRef} autoPlay playsInline controls className="h-0 w-0 opacity-0" />`
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v24] concluído");
