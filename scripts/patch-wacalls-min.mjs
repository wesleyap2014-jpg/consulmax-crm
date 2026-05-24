import fs from 'node:fs';

const p = 'api/whatsapp/webhook.ts';
let s = fs.readFileSync(p, 'utf8');

const oldText = '  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n  }';

const newText = '  const { data: insertedCall, error: insertCallError } = await supabaseAdmin\n    .from("whatsapp_calls")\n    .insert(payloadToStore)\n    .select("*");\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n    throw insertCallError;\n  }\n\n  console.log("WHATSAPP_CALL_INSERT_OK", insertedCall);';

if (s.includes(oldText)) {
  s = s.replace(oldText, newText);
}

fs.writeFileSync(p, s);
console.log('[patch-wacalls-min] ok: insert diagnostics');
