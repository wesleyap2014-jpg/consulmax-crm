import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v30] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
let changed = false;

function replace(label, from, to) {
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

replace(
  "extractCallPhone robusto",
  `function extractCallPhone(value: any, call: any) {
  return onlyDigits(
    call?.from ||
      call?.to ||
      call?.caller ||
      call?.callee ||
      call?.customer?.wa_id ||
      call?.contact?.wa_id ||
      value?.contacts?.[0]?.wa_id ||
      value?.contacts?.[0]?.input ||
      ""
  );
}`,
  `function extractCallPhone(value: any, call: any) {
  const businessPhone = onlyDigits(value?.metadata?.display_phone_number || value?.metadata?.phone_number || "");
  const from = onlyDigits(call?.from || call?.caller || call?.customer?.wa_id || call?.contact?.wa_id || "");
  const to = onlyDigits(call?.to || call?.callee || "");

  if (businessPhone && from === businessPhone && to) return to;
  if (businessPhone && to === businessPhone && from) return from;

  return onlyDigits(
    call?.customer?.wa_id ||
      call?.contact?.wa_id ||
      value?.contacts?.[0]?.wa_id ||
      value?.contacts?.[0]?.input ||
      call?.from ||
      call?.to ||
      call?.caller ||
      call?.callee ||
      ""
  );
}

function extractCallDirection(value: any, call: any) {
  const businessPhone = onlyDigits(value?.metadata?.display_phone_number || value?.metadata?.phone_number || "");
  const from = onlyDigits(call?.from || call?.caller || call?.customer?.wa_id || call?.contact?.wa_id || "");
  const to = onlyDigits(call?.to || call?.callee || "");
  const explicit = String(call?.direction || call?.call_direction || "").toLowerCase();

  if (explicit === "outbound" || explicit === "incoming_business_initiated") return "outbound";
  if (explicit === "inbound" || explicit === "incoming_user_initiated") return "inbound";

  if (businessPhone && from === businessPhone) return "outbound";
  if (businessPhone && to === businessPhone) return "inbound";

  if (to && !from) return "outbound";
  if (from && !to) return "inbound";

  return "inbound";
}`
);

replace(
  "handleSingleCallEvent direction robusta",
  `  const waId = extractCallPhone(value, call);
  const metaCallId = extractCallId(call);
  const status = extractCallStatus(call);
  const direction = call?.from || call?.caller || call?.customer ? "inbound" : "outbound";

  console.log("WHATSAPP_CALL_EVENT", {
    waId,
    metaCallId,
    status,
    direction,
    keys: Object.keys(call || {}),
  });`,
  `  const waId = extractCallPhone(value, call);
  const metaCallId = extractCallId(call);
  const status = extractCallStatus(call);
  const direction = extractCallDirection(value, call);
  const hasSessionSdp = !!(call?.session?.sdp || call?.session?.description || call?.sdp);

  console.log("WHATSAPP_CALL_EVENT", {
    waId,
    metaCallId,
    status,
    direction,
    from: onlyDigits(call?.from || call?.caller || ""),
    to: onlyDigits(call?.to || call?.callee || ""),
    displayPhoneNumber: onlyDigits(value?.metadata?.display_phone_number || ""),
    hasSessionSdp,
    keys: Object.keys(call || {}),
  });`
);

replace(
  "payload call raw metadata robusta",
  `    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },`,
  `    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api", detected_direction: direction, detected_customer_phone: waId },`
);

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v30] concluído");
