import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const apiFile = "api/whatsapp/call.ts";
let changed = false;

function write(file, s) {
  fs.writeFileSync(file, s);
  changed = true;
}

function patchPage(label, from, to) {
  let s = fs.readFileSync(pageFile, "utf8");
  if (s.includes(to)) {
    console.log(`[patch-whatsapp-outbound-call-v13] ${label}: já aplicado`);
    return;
  }
  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-outbound-call-v13] ${label}: trecho não encontrado`);
    return;
  }
  s = s.replace(from, to);
  write(pageFile, s);
  console.log(`[patch-whatsapp-outbound-call-v13] ${label}: aplicado`);
}

let api = fs.readFileSync(apiFile, "utf8");

if (!api.includes("connect", api.indexOf("valid_actions"))) {
  api = api
    .replace(
      `  if (["accept", "answer", "atender"].includes(action)) return "accept";`,
      `  if (["connect", "call", "start", "iniciar", "ligar"].includes(action)) return "connect";\n  if (["accept", "answer", "atender"].includes(action)) return "accept";`
    )
    .replace(
      `    const callId = String(body.call_id || body.id || "").trim();\n    const action = normalizeAction(body.action);`,
      `    const callId = String(body.call_id || body.id || "").trim();\n    const to = onlyDigits(body.to || body.phone || body.wa_id || "");\n    const action = normalizeAction(body.action);`
    )
    .replace(
      `    if (!callId) {\n      return res.status(400).json({ ok: false, error: "Missing call_id" });\n    }\n\n    if (!action || !["accept", "reject", "terminate"].includes(action)) {\n      return res.status(400).json({ ok: false, error: "Invalid action", valid_actions: ["accept", "reject", "terminate"] });\n    }`,
      `    if (!action || !["connect", "accept", "reject", "terminate"].includes(action)) {\n      return res.status(400).json({ ok: false, error: "Invalid action", valid_actions: ["connect", "accept", "reject", "terminate"] });\n    }\n\n    if (action === "connect") {\n      if (!to) return res.status(400).json({ ok: false, error: "Missing to for connect action" });\n      if (!sdp) return res.status(400).json({ ok: false, error: "Missing SDP offer for connect action" });\n    } else if (!callId) {\n      return res.status(400).json({ ok: false, error: "Missing call_id" });\n    }`
    )
    .replace(
      `    const payload: Record<string, any> = {\n      messaging_product: "whatsapp",\n      call_id: callId,\n      action,\n    };`,
      `    const payload: Record<string, any> = {\n      messaging_product: "whatsapp",\n      action,\n    };\n\n    if (action === "connect") {\n      payload.to = to;\n      payload.session = {\n        sdp_type: "offer",\n        sdp,\n      };\n    } else {\n      payload.call_id = callId;\n    }`
    )
    .replace(
      `        callId,\n        phoneNumberId: onlyDigits(phoneNumberId),`,
      `        callId,\n        to,\n        phoneNumberId: onlyDigits(phoneNumberId),`
    )
    .replace(
      `      call_id: callId,\n      data,`,
      `      call_id: callId || data?.calls?.[0]?.id || data?.id || data?.call_id || null,\n      to: to || null,\n      data,`
    );

  write(apiFile, api);
  console.log("[patch-whatsapp-outbound-call-v13] api outbound connect aplicado");
} else {
  console.log("[patch-whatsapp-outbound-call-v13] api outbound connect já aplicado");
}

patchPage(
  "textarea-altura-menor",
  `                  className="min-h-[72px] resize-none text-base leading-relaxed"`,
  `                  className="min-h-[46px] max-h-[96px] resize-none text-base leading-relaxed"`
);

const oldSendCallAction = `  async function sendCallAction(params: { action: "accept" | "reject" | "terminate"; callId: string; sdp?: string | null }) {
    const response = await fetch("/api/whatsapp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: params.action,
        call_id: params.callId,
        sdp: params.sdp || undefined,
      }),
    });`;

const newSendCallAction = `  async function sendCallAction(params: { action: "connect" | "accept" | "reject" | "terminate"; callId?: string | null; to?: string | null; sdp?: string | null }) {
    const response = await fetch("/api/whatsapp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: params.action,
        call_id: params.callId || undefined,
        to: params.to || undefined,
        sdp: params.sdp || undefined,
      }),
    });`;

patchPage("sendCallAction-connect", oldSendCallAction, newSendCallAction);

const outboundFunction = `
  async function startOutboundWhatsAppCall() {
    if (!activePhone) {
      alert("Telefone do contato não identificado.");
      return;
    }

    setCallBusy(true);
    setCallState({ callId: null, status: "calling" });

    try {
      stopLocalCallResources();

      const to = activePhone.startsWith("55") ? activePhone : "55" + activePhone;
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
        if (["failed", "closed", "disconnected"].includes(state)) stopLocalCallResources();
      };

      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);

      const result = await sendCallAction({
        action: "connect",
        to,
        sdp: peer.localDescription?.sdp || offer.sdp,
      });

      const callId = result?.call_id || result?.data?.calls?.[0]?.id || result?.data?.id || null;
      const answerSdp = result?.data?.session?.sdp || result?.data?.calls?.[0]?.session?.sdp || null;

      if (callId) setCallState({ callId, status: "calling" });
      if (answerSdp) await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error: any) {
      stopLocalCallResources();
      setCallState({ callId: null, status: "idle" });

      const rawMessage = String(error?.message || "");
      const needsPermission = /permiss|permission|aprova|approved|destinat/i.test(rawMessage);

      if (needsPermission) {
        const permissionMessage = "Olá! Aqui é da Consulmax. Posso te ligar agora pelo WhatsApp para agilizar seu atendimento? Responda SIM para autorizar a ligação.";
        const sent = await sendMessage(permissionMessage);

        if (sent) {
          alert("O WhatsApp ainda não liberou chamada iniciada pela Consulmax para este contato. Enviei uma solicitação de autorização pelo próprio WhatsApp. Quando o cliente responder SIM, tente ligar novamente pelo CRM.");
        } else {
          alert("Este cliente ainda não autorizou chamadas iniciadas pela Consulmax e não foi possível enviar a solicitação automática pelo WhatsApp. Envie uma mensagem manual pedindo autorização e tente novamente após a resposta.");
        }

        return;
      }

      alert(error?.message || "Não foi possível iniciar a ligação pelo WhatsApp no CRM.");
    } finally {
      setCallBusy(false);
    }
  }
`;

patchPage(
  "startOutboundWhatsAppCall-function",
  `  function addEmoji(emoji: string) {`,
  `${outboundFunction}
  function addEmoji(emoji: string) {`
);

patchPage(
  "callSoon-direct-whatsapp",
  `  function callSoon() {
    if (!activePhone) {
      alert("Telefone do contato não identificado.");
      return;
    }

    const normalizedPhone = activePhone.startsWith("55") ? activePhone : \`55\${activePhone}\`;

    // A Cloud API do WhatsApp não inicia chamada de voz nativa.
    // Este botão aciona o discador do dispositivo como solução imediata.
    window.location.href = \`tel:+\${normalizedPhone}\`;
  }`,
  `  function callSoon() {
    startOutboundWhatsAppCall();
  }`
);

if (changed) {
  console.log("[patch-whatsapp-outbound-call-v13] patches aplicados");
} else {
  console.log("[patch-whatsapp-outbound-call-v13] nenhuma alteração necessária");
}
