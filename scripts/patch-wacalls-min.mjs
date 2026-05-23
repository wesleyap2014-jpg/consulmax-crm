import fs from 'node:fs';
const p='api/whatsapp/webhook.ts';
let s=fs.readFileSync(p,'utf8');
const marker='async function handleInboundWebhook(payload: any) {';
const add=`
async function handleWACallEvent(payload: any, value: any, item: any) {
  const now = new Date().toISOString();
  const phone = onlyDigits(item?.from || item?.to || value?.contacts?.[0]?.wa_id || '');
  const metaId = item?.id || item?.call_id || null;
  const status = String(item?.status || item?.event || item?.type || 'received').toLowerCase();
  console.log('WHATSAPP_CALL_EVENT', { phone, metaId, status, keys: Object.keys(item || {}) });
  await supabaseAdmin.from('whatsapp_calls').insert({
    phone: phone || null,
    wa_id: phone || null,
    direction: item?.from ? 'inbound' : 'outbound',
    provider: 'meta_whatsapp_calling_api',
    status,
    meta_call_id: metaId,
    raw_payload: { value, item },
    started_at: now,
    updated_at: now,
  });
}
`;
if(!s.includes('handleWACallEvent')) s=s.replace(marker, add+'\n'+marker);
s=s.replace("      const messages = value?.messages || [];", "      const callItems = value?.calls || value?.call_events || [];\n      if (Array.isArray(callItems) && callItems.length > 0) {\n        for (const item of callItems) await handleWACallEvent(payload, value, item);\n      }\n\n      const messages = value?.messages || [];");
fs.writeFileSync(p,s);
console.log('[patch-wacalls-min] ok');
