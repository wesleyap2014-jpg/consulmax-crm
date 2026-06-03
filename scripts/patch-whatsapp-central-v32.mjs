import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";
const callStatusFile = "api/whatsapp/call-status.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v32] ${label}: ${status}`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

// 1) Endpoint server-side para buscar eventos da chamada com service role.
const callStatusContent = [
  'import type { VercelRequest, VercelResponse } from "@vercel/node";',
  'import { createClient } from "@supabase/supabase-js";',
  '',
  'const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;',
  'const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;',
  '',
  'const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);',
  '',
  'function onlyDigits(value?: string | null) {',
  '  return String(value || "").replace(/\\D/g, "");',
  '}',
  '',
  'function extractCall(raw: any) {',
  '  return raw?.call || raw?.value?.calls?.[0] || raw?.calls?.[0] || raw || {};',
  '}',
  '',
  'function extractSession(raw: any) {',
  '  const call = extractCall(raw);',
  '  return call?.session || raw?.session || raw?.data?.session || null;',
  '}',
  '',
  'export default async function handler(req: VercelRequest, res: VercelResponse) {',
  '  if (req.method !== "POST") {',
  '    res.setHeader("Allow", "POST");',
  '    return res.status(405).json({ ok: false, error: "Method not allowed" });',
  '  }',
  '',
  '  try {',
  '    const callId = String(req.body?.call_id || req.body?.callId || "").trim();',
  '    const phone = onlyDigits(req.body?.phone || req.body?.to || req.body?.wa_id || "");',
  '    const sinceIso = req.body?.since_iso || new Date(Date.now() - 90_000).toISOString();',
  '',
  '    if (!callId && !phone) {',
  '      return res.status(400).json({ ok: false, error: "Missing call_id or phone" });',
  '    }',
  '',
  '    let query = supabaseAdmin',
  '      .from("whatsapp_calls")',
  '      .select("id, call_id, status, direction, phone, wa_id, raw_payload, created_at")',
  '      .gte("created_at", sinceIso)',
  '      .order("created_at", { ascending: false })',
  '      .limit(20);',
  '',
  '    if (callId && phone) {',
  '      query = query.or("call_id.eq." + callId + ",phone.eq." + phone + ",wa_id.eq." + phone);',
  '    } else if (callId) {',
  '      query = query.eq("call_id", callId);',
  '    } else if (phone) {',
  '      query = query.or("phone.eq." + phone + ",wa_id.eq." + phone);',
  '    }',
  '',
  '    const { data, error } = await query;',
  '',
  '    if (error) {',
  '      console.error("WHATSAPP_CALL_STATUS_QUERY_ERROR_V32", error);',
  '      return res.status(500).json({ ok: false, error: error.message });',
  '    }',
  '',
  '    const rows = (data || []).map((row: any) => {',
  '      const raw = row.raw_payload || {};',
  '      const call = extractCall(raw);',
  '      const session = extractSession(raw);',
  '      const sdp = session?.sdp || call?.sdp || null;',
  '      const sdpType = String(session?.sdp_type || call?.sdp_type || "").toLowerCase();',
  '      const rawCallId = call?.id || call?.call_id || raw?.meta_call_id || row.call_id || row.id || null;',
  '      const status = String(row.status || call?.event || call?.status || "").toLowerCase();',
  '      const direction = String(row.direction || raw?.detected_direction || call?.direction || "").toLowerCase();',
  '      const errors = call?.errors || raw?.errors || raw?.value?.errors || null;',
  '',
  '      return {',
  '        id: row.id,',
  '        call_id: rawCallId,',
  '        row_call_id: row.call_id,',
  '        expected_call_id: callId || null,',
  '        status,',
  '        direction,',
  '        phone: row.phone || row.wa_id || null,',
  '        created_at: row.created_at,',
  '        has_sdp: !!sdp,',
  '        sdp_type: sdpType,',
  '        answer_sdp: sdp && (!sdpType || sdpType === "answer") ? sdp : null,',
  '        errors,',
  '        error_details: errors ? JSON.stringify(errors) : null,',
  '      };',
  '    });',
  '',
  '    console.log("WHATSAPP_CALL_STATUS_QUERY_V32", {',
  '      callId,',
  '      phone,',
  '      sinceIso,',
  '      count: rows.length,',
  '      rows: rows.map((row) => ({',
  '        id: row.id,',
  '        call_id: row.call_id,',
  '        status: row.status,',
  '        direction: row.direction,',
  '        has_sdp: row.has_sdp,',
  '        sdp_type: row.sdp_type,',
  '        error_details: row.error_details,',
  '      })),',
  '    });',
  '',
  '    return res.status(200).json({ ok: true, rows });',
  '  } catch (error: any) {',
  '    console.error("WHATSAPP_CALL_STATUS_EXCEPTION_V32", error);',
  '    return res.status(500).json({ ok: false, error: error?.message || "Erro ao consultar status da chamada." });',
  '  }',
  '}',
].join("\n");

if (!fs.existsSync(callStatusFile) || !read(callStatusFile).includes("WHATSAPP_CALL_STATUS_QUERY_V32")) {
  write(callStatusFile, callStatusContent);
  log("call-status endpoint", "criado/atualizado");
} else {
  log("call-status endpoint", "já aplicado");
}

// 2) Webhook: corrigir direção de BUSINESS_INITIATED de forma robusta e logar V32.
let webhook = read(webhookFile);
if (!webhook.includes("function extractCallDirectionV32")) {
  webhook = webhook.replace(
    [
      'function extractCallStatus(call: any) {',
      '  return String(call?.event || call?.status || call?.type || call?.state || "received").toLowerCase();',
      '}',
    ].join("\n"),
    [
      'function extractCallStatus(call: any) {',
      '  return String(call?.event || call?.status || call?.type || call?.state || "received").toLowerCase();',
      '}',
      '',
      'function extractCallDirectionV32(value: any, call: any) {',
      '  const explicit = String(call?.direction || call?.call_direction || "").toLowerCase();',
      '  const businessPhone = onlyDigits(value?.metadata?.display_phone_number || value?.metadata?.phone_number || "");',
      '  const from = onlyDigits(call?.from || call?.caller || call?.customer?.wa_id || call?.contact?.wa_id || "");',
      '  const to = onlyDigits(call?.to || call?.callee || "");',
      '',
      '  if (["business_initiated", "outbound", "incoming_business_initiated"].includes(explicit)) return "outbound";',
      '  if (["user_initiated", "inbound", "incoming_user_initiated"].includes(explicit)) return "inbound";',
      '  if (businessPhone && from === businessPhone) return "outbound";',
      '  if (businessPhone && to === businessPhone) return "inbound";',
      '  if (to && !from) return "outbound";',
      '  if (from && !to) return "inbound";',
      '',
      '  return "inbound";',
      '}',
    ].join("\n")
  );
  log("extractCallDirectionV32", "inserido");
}

if (!webhook.includes('console.log("WHATSAPP_CALL_EVENT_V32"')) {
  webhook = webhook.replace(
    /const direction = .*?;\n\n  console\.log\("WHATSAPP_CALL_EVENT", \{/s,
    [
      'const direction = extractCallDirectionV32(value, call);',
      '  const hasSessionSdpV32 = !!(call?.session?.sdp || call?.sdp);',
      '',
      '  console.log("WHATSAPP_CALL_EVENT_V32", {',
      '    waId,',
      '    metaCallId,',
      '    status,',
      '    direction,',
      '    explicitDirection: call?.direction || null,',
      '    from: onlyDigits(call?.from || call?.caller || ""),',
      '    to: onlyDigits(call?.to || call?.callee || ""),',
      '    displayPhoneNumber: onlyDigits(value?.metadata?.display_phone_number || ""),',
      '    hasSessionSdp: hasSessionSdpV32,',
      '    errors: call?.errors || value?.errors || null,',
      '    errorDetails: JSON.stringify(call?.errors || value?.errors || null),',
      '    rawCall: call,',
      '  });',
      '',
      '  console.log("WHATSAPP_CALL_EVENT", {',
    ].join("\n")
  );
}

if (!webhook.includes("detected_direction: direction")) {
  webhook = webhook.replace(
    'raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },',
    'raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api", detected_direction: direction, detected_customer_phone: waId },'
  );
}
write(webhookFile, webhook);
log("webhook direction/log", "aplicado");

// 3) Front: consultar endpoint server-side e aplicar SDP answer. Logs aparecem na Vercel pelo endpoint.
let page = read(pageFile);
if (!page.includes("WHATSAPP_OUTBOUND_SERVER_POLLED_SDP_APPLIED_V32")) {
  const needle = '      if (callId) setCallState({ callId, status: answerSdp ? "connected" : "calling" });';
  const block = [
    '      if (callId && !answerSdp) {',
    '        const pollSinceIsoV32 = new Date(Date.now() - 10_000).toISOString();',
    '        const pollStartedAtV32 = Date.now();',
    '        const pollOutboundAnswerFromServerV32 = async () => {',
    '          try {',
    '            const peerNowV32 = peerRef.current;',
    '            if (!peerNowV32 || peerNowV32.signalingState === "closed") return;',
    '            if (peerNowV32.remoteDescription?.sdp) return;',
    '',
    '            const statusResponseV32 = await fetch("/api/whatsapp/call-status", {',
    '              method: "POST",',
    '              headers: { "Content-Type": "application/json" },',
    '              body: JSON.stringify({ call_id: callId, phone: to, since_iso: pollSinceIsoV32 }),',
    '            });',
    '            const statusResultV32 = await statusResponseV32.json();',
    '            const rowsV32 = Array.isArray(statusResultV32?.rows) ? statusResultV32.rows : [];',
    '',
    '            for (const rowV32 of rowsV32) {',
    '              if (rowV32?.answer_sdp) {',
    '                try {',
    '                  await peerNowV32.setRemoteDescription({ type: "answer", sdp: rowV32.answer_sdp });',
    '                  setCallState((prev) => ({ ...prev, callId: prev.callId || callId, status: "connected" }));',
    '                  setOutboundCallStatusV28("Áudio remoto confirmado pela Meta. Teste fala/escuta agora.");',
    '                  console.log("WHATSAPP_OUTBOUND_SERVER_POLLED_SDP_APPLIED_V32", { callId, rowId: rowV32.id, status: rowV32.status });',
    '                  return;',
    '                } catch (applyErrorV32) {',
    '                  console.warn("WHATSAPP_OUTBOUND_SERVER_POLLED_SDP_APPLY_ERROR_V32", { callId, rowV32, applyErrorV32 });',
    '                }',
    '              }',
    '',
    '              if (["terminate", "reject"].includes(String(rowV32?.status || "").toLowerCase())) {',
    '                setOutboundCallStatusV28("Chamada encerrada pela Meta antes da confirmação de áudio.");',
    '                return;',
    '              }',
    '            }',
    '',
    '            if (Date.now() - pollStartedAtV32 < 24_000) {',
    '              window.setTimeout(pollOutboundAnswerFromServerV32, 1500);',
    '            }',
    '          } catch (pollErrorV32) {',
    '            console.warn("WHATSAPP_OUTBOUND_SERVER_POLL_EXCEPTION_V32", pollErrorV32);',
    '          }',
    '        };',
    '        window.setTimeout(pollOutboundAnswerFromServerV32, 1000);',
    '      }',
  ].join("\n");

  if (page.includes(needle)) {
    page = page.replace(needle, needle + "\n" + block);
    write(pageFile, page);
    log("front server polling", "aplicado");
  } else {
    log("front server polling", "ponto não encontrado");
  }
} else {
  log("front server polling", "já aplicado");
}

console.log("[patch-whatsapp-central-v32] concluído");
