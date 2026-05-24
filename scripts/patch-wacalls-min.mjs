import fs from 'node:fs';

const p = 'api/whatsapp/webhook.ts';
let s = fs.readFileSync(p, 'utf8');

const oldText = '  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n  }';
const newText = '  const { data: insertedCall, error: insertCallError } = await supabaseAdmin\n    .from("whatsapp_calls")\n    .insert(payloadToStore)\n    .select("*");\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n    throw insertCallError;\n  }\n\n  console.log("WHATSAPP_CALL_INSERT_OK", insertedCall);';
if (s.includes(oldText)) s = s.replace(oldText, newText);

const oldBody = '  const body = extractMessageBody(message);';
const newBody = '  let body = extractMessageBody(message);\n  if (!String(body || "").trim()) {\n    try {\n      body = `Mensagem técnica recebida: ${JSON.stringify(message).slice(0, 1200)}`;\n    } catch {\n      body = `Mensagem técnica recebida. Tipo: ${message?.type || "indefinido"}`;\n    }\n  }';
s = s.replace(oldBody, newBody);

const ignoreBlock = '\n  if (!String(body || "").trim() && !mediaId) {\n    console.log("WHATSAPP_IGNORED_EMPTY_MESSAGE", { waId, nome, messageType, metaMessageId, keys: Object.keys(message || {}) });\n    return;\n  }\n';
s = s.replace(ignoreBlock, '\n');

fs.writeFileSync(p, s);
console.log('[patch-wacalls-min] ok: technical messages visible');
