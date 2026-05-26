import fs from 'node:fs';

const file = 'api/whatsapp/send.ts';
let s = fs.readFileSync(file, 'utf8');

const marker = 'async function sendMediaMessage(params: {';
const block = `
function campaignFirstName(nome?: string | null) {
  return String(nome || "").trim().split(/\\s+/)[0] || "";
}

function renderCampaignBody(template: string, contact: any) {
  let body = String(template || "")
    .replace(/{{\\s*nome\\s*}}/gi, contact?.nome || "")
    .replace(/{{\\s*primeiro_nome\\s*}}/gi, campaignFirstName(contact?.nome))
    .replace(/{{\\s*telefone\\s*}}/gi, onlyDigits(contact?.telefone_digits || contact?.telefone));

  if (!/\\b(SAIR|PARAR|CANCELAR|DESCADASTRAR|STOP)\\b/i.test(body)) {
    body += "\\n\\nPara não receber mais mensagens da Consulmax, responda SAIR.";
  }

  return body.trim();
}

async function ensureCampaignConversation(contact: any) {
  const phone = onlyDigits(contact.telefone_digits || contact.telefone);
  const now = new Date().toISOString();

  const { data: waContact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert({ wa_id: phone, telefone: phone, nome: contact.nome || null, updated_at: now }, { onConflict: "wa_id" })
    .select("id,lead_id")
    .single();

  if (contactError || !waContact?.id) throw contactError || new Error("Contato não criado.");

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("contact_id", waContact.id)
    .neq("queue", "finalizado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: conv, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      contact_id: waContact.id,
      lead_id: waContact.lead_id,
      status: "humano",
      stage: "entrada",
      queue: "novos_contatos",
      last_message: "Campanha iniciada",
      last_message_at: now,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error || !conv?.id) throw error || new Error("Conversa não criada.");
  return conv.id;
}

async function runScheduledCampaigns() {
  const now = new Date().toISOString();

  const { data: campaigns, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("*")
    .in("status", ["scheduled", "running"])
    .or("scheduled_at.is.null,scheduled_at.lte." + now)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) throw error;
  const campaign = campaigns?.[0];
  if (!campaign) return { message: "Nenhuma campanha pendente." };

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({ status: "running", started_at: campaign.started_at || now, updated_at: now })
    .eq("id", campaign.id);

  const { data: recipients, error: recError } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id,contact_book_id,telefone_digits,nome,status")
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(Number(process.env.WHATSAPP_CAMPAIGN_BATCH_LIMIT || 10));

  if (recError) throw recError;

  if (!recipients || recipients.length === 0) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "finished", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    return { campaign_id: campaign.id, sent: 0, failed: 0, skipped: 0, finished: true };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const phone = onlyDigits(recipient.telefone_digits);

    try {
      const { data: blocked } = await supabaseAdmin
        .from("whatsapp_opt_outs")
        .select("id")
        .eq("telefone_digits", phone)
        .limit(1);

      if (blocked && blocked.length > 0) {
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .update({ status: "skipped", error_message: "Contato descadastrado." })
          .eq("id", recipient.id);
        skipped++;
        continue;
      }

      const conversation_id = await ensureCampaignConversation(recipient);
      const body = renderCampaignBody(campaign.message_body || "", recipient);

      const result = await sendTextMessage({ conversation_id, to: phone, body, user_id: campaign.created_by || null });
      if (!result.ok) throw new Error(JSON.stringify(result.error || result).slice(0, 800));

      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", recipient.id);
      sent++;
    } catch (err) {
      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({ status: "failed", error_message: String((err && err.message) || err).slice(0, 800) })
        .eq("id", recipient.id);
      failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  const { count } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "failed"]);

  if (!count) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "finished", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
  } else {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
  }

  return { campaign_id: campaign.id, sent, failed, skipped, finished: !count };
}

`;

if (!s.includes('async function runScheduledCampaigns()')) {
  s = s.replace(marker, block + marker);
}

s = s.replace(
  '  if (req.method !== "POST") {\n    return res.status(405).json({ error: "Method not allowed" });\n  }\n\n  try {',
  '  if (req.method === "GET") {\n    try {\n      const result = await runScheduledCampaigns();\n      return res.status(200).json({ ok: true, ...result });\n    } catch (error: any) {\n      console.error("WHATSAPP_CAMPAIGN_CRON_ERROR", error);\n      return res.status(500).json({ ok: false, error: error?.message || "Erro ao processar campanhas." });\n    }\n  }\n\n  if (req.method !== "POST") {\n    return res.status(405).json({ error: "Method not allowed" });\n  }\n\n  try {'
);

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-send-campaign-cron] ok');
