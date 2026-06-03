import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";
const apiCallFile = "api/whatsapp/call.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v31] ${label}: ${status}`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function replaceIn(file, label, from, to) {
  let s = read(file);
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  write(file, s);
  log(label, "aplicado");
}

function insertAfterIn(file, label, needle, block, flag) {
  let s = read(file);
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, needle + "\n" + block);
  write(file, s);
  log(label, "aplicado");
}

// 1) Direção correta: Meta manda BUSINESS_INITIATED / USER_INITIATED, não incoming_business_initiated.
replaceIn(
  webhookFile,
  "direction BUSINESS_INITIATED outbound",
  `  if (explicit === "outbound" || explicit === "incoming_business_initiated") return "outbound";
  if (explicit === "inbound" || explicit === "incoming_user_initiated") return "inbound";`,
  `  if (["outbound", "business_initiated", "incoming_business_initiated"].includes(explicit)) return "outbound";
  if (["inbound", "user_initiated", "incoming_user_initiated"].includes(explicit)) return "inbound";`
);

// 2) Log explícito dos erros da Meta; [Object] não ajuda diagnóstico.
replaceIn(
  webhookFile,
  "log call errors expandido",
  `    hasSessionSdp,
    keys: Object.keys(call || {}),`,
  `    hasSessionSdp,
    errors: call?.errors || value?.errors || null,
    errorDetails: JSON.stringify(call?.errors || value?.errors || null),
    keys: Object.keys(call || {}),`
);

// 3) Log completo da resposta da API /calls para connect/accept.
insertAfterIn(
  apiCallFile,
  "log response api call",
  `    const data = await readJson(response);`,
  `
    console.log("WHATSAPP_CALL_ACTION_RESPONSE_V31", {
      ok: response.ok,
      status: response.status,
      action,
      callId,
      to,
      phoneNumberId: onlyDigits(phoneNumberId),
      responseKeys: data && typeof data === "object" ? Object.keys(data) : [],
      data,
    });`,
  "WHATSAPP_CALL_ACTION_RESPONSE_V31"
);

// 4) Frontend: se realtime não chegar, buscar na tabela whatsapp_calls por alguns segundos e aplicar o SDP answer que a Meta salva no webhook.
const pollBlock = [
  "      if (callId && !answerSdp) {",
  "        const pollStartedAtV31 = Date.now();",
  "        const normalizedPollPhoneV31 = to;",
  "",
  "        const pollOutboundAnswerV31 = async () => {",
  "          try {",
  "            const peerNowV31 = peerRef.current;",
  "            if (!peerNowV31 || peerNowV31.signalingState === \"closed\") return;",
  "            if (peerNowV31.remoteDescription?.sdp) return;",
  "",
  "            const { data: callRowsV31, error: callRowsErrorV31 } = await supabase",
  "              .from(\"whatsapp_calls\")",
  "              .select(\"id, call_id, status, direction, phone, wa_id, raw_payload, created_at\")",
  "              .or(`call_id.eq.${callId},phone.eq.${normalizedPollPhoneV31},wa_id.eq.${normalizedPollPhoneV31}`)",
  "              .order(\"created_at\", { ascending: false })",
  "              .limit(12);",
  "",
  "            if (callRowsErrorV31) {",
  "              console.warn(\"WHATSAPP_OUTBOUND_POLL_ERROR_V31\", callRowsErrorV31);",
  "            }",
  "",
  "            for (const row of callRowsV31 || []) {",
  "              const raw = row.raw_payload || {};",
  "              const call = raw.call || raw.value?.calls?.[0] || raw.calls?.[0] || raw;",
  "              const session = call?.session || raw.session || raw.data?.session || null;",
  "              const sdp = session?.sdp || call?.sdp || null;",
  "              const sdpType = String(session?.sdp_type || call?.sdp_type || \"answer\").toLowerCase();",
  "              const status = String(row.status || call?.event || call?.status || \"\").toLowerCase();",
  "              const rowCallId = call?.id || call?.call_id || raw.meta_call_id || row.call_id || row.id;",
  "",
  "              console.log(\"WHATSAPP_OUTBOUND_POLL_ROW_V31\", {",
  "                rowId: row.id,",
  "                rowCallId,",
  "                expectedCallId: callId,",
  "                status,",
  "                direction: row.direction,",
  "                hasSdp: !!sdp,",
  "                sdpType,",
  "                errors: call?.errors || raw?.errors || null,",
  "              });",
  "",
  "              if (sdp && sdpType === \"answer\") {",
  "                try {",
  "                  await peerNowV31.setRemoteDescription({ type: \"answer\", sdp });",
  "                  setCallState((prev) => ({ ...prev, callId: prev.callId || callId, status: \"connected\" }));",
  "                  setOutboundCallStatusV28(\"Áudio remoto confirmado pela Meta. Teste fala/escuta agora.\");",
  "                  console.log(\"WHATSAPP_OUTBOUND_POLLED_SDP_APPLIED_V31\", { callId, rowId: row.id, status });",
  "                  return;",
  "                } catch (applyErrorV31) {",
  "                  console.warn(\"WHATSAPP_OUTBOUND_POLLED_SDP_APPLY_ERROR_V31\", { callId, rowId: row.id, status, applyErrorV31 });",
  "                }",
  "              }",
  "",
  "              if ([\"terminate\", \"reject\"].includes(status)) {",
  "                setOutboundCallStatusV28(\"Chamada encerrada pela Meta antes da confirmação de áudio.\");",
  "                return;",
  "              }",
  "            }",
  "",
  "            if (Date.now() - pollStartedAtV31 < 24000) {",
  "              window.setTimeout(pollOutboundAnswerV31, 1500);",
  "            }",
  "          } catch (pollErrorV31) {",
  "            console.warn(\"WHATSAPP_OUTBOUND_POLL_EXCEPTION_V31\", pollErrorV31);",
  "          }",
  "        };",
  "",
  "        window.setTimeout(pollOutboundAnswerV31, 1000);",
  "      }",
].join("\n");

insertAfterIn(
  pageFile,
  "poll outbound SDP answer",
  `      if (callId) setCallState({ callId, status: answerSdp ? "connected" : "calling" });`,
  pollBlock,
  "WHATSAPP_OUTBOUND_POLLED_SDP_APPLIED_V31"
);

console.log("[patch-whatsapp-central-v31] concluído");
