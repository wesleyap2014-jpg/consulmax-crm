import fs from "node:fs";

const file = "api/whatsapp/send.ts";
const marker = "patch-whatsapp-consent-gate-v37a";
let src = fs.readFileSync(file, "utf8");

if (src.includes(marker)) {
  console.log(`${marker}: already applied`);
  process.exit(0);
}

function mustReplace(search, replace, label) {
  if (!src.includes(search)) {
    throw new Error(`${marker}: trecho não encontrado para ${label}`);
  }
  src = src.replace(search, replace);
}

const helpers = `
// patch-whatsapp-consent-gate-v37a
const MARKETING_AUTH_TEMPLATE_NAME = process.env.WHATSAPP_MARKETING_AUTH_TEMPLATE || "autorizacao_marketing_consulmax";
const MARKETING_AUTH_TEMPLATE_LANGUAGE = process.env.WHATSAPP_MARKETING_AUTH_TEMPLATE_LANGUAGE || "pt_BR";

async function hasMarketingConsent(phoneValue?: string | null) {
  const variants = typeof brPhoneVariants === "function" ? brPhoneVariants(phoneValue) : [onlyDigits(phoneValue)];
  const phones = variants.filter(Boolean);
  if (phones.length === 0) return false;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_marketing_consents")
    .select("id")
    .in("telefone_digits", phones)
    .eq("consent_status", "accepted")
    .limit(1);

  if (error) {
    console.warn("WHATSAPP_CONSENT_CHECK_WARNING", error.message || error);
    return false;
  }

  return !!data?.length;
}

async function alreadyAskedConsent(campaignId: string, phoneValue?: string | null) {
  const variants = typeof brPhoneVariants === "function" ? brPhoneVariants(phoneValue) : [onlyDigits(phoneValue)];
  const phones = variants.filter(Boolean);
  if (!campaignId || phones.length === 0) return false;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_campaign_pending_authorizations")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("telefone_digits", phones)
    .limit(1);

  if (error) {
    console.warn("WHATSAPP_PENDING_AUTH_CHECK_WARNING", error.message || error);
    return false;
  }

  return !!data?.length;
}

async function sendConsentTemplate(campaign: any, recipient: any, phoneValue: string) {
  const phone = typeof resolveWhatsAppSendPhone === "function" ? await resolveWhatsAppSendPhone(phoneValue, null) : onlyDigits(phoneValue);
  const first = firstName(recipient?.nome) || "cliente";

  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: MARKETING_AUTH_TEMPLATE_NAME,
        language: { code: MARKETING_AUTH_TEMPLATE_LANGUAGE },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: first }],
          },
        ],
      },
    }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: data };
  }

  const now = new Date().toISOString();

  await supabaseAdmin.from("whatsapp_campaign_pending_authorizations").upsert(
    {
      campaign_id: campaign.id,
      recipient_id: recipient.id || null,
      telefone_digits: onlyDigits(phoneValue),
      nome: recipient.nome || null,
      status: "authorization_sent",
      authorization_template_name: MARKETING_AUTH_TEMPLATE_NAME,
      authorization_sent_at: now,
      updated_at: now,
    },
    { onConflict: "campaign_id,telefone_digits" }
  );

  if (recipient.id) {
    await supabaseAdmin
      .from("whatsapp_campaign_recipients")
      .update({ status: "authorization_sent", error_message: null })
      .eq("id", recipient.id);
  }

  return { ok: true, status: 200, data };
}
`;

mustReplace(
  `function renderCampaignBody(template: string, contact: any) {`,
  `${helpers}\nfunction renderCampaignBody(template: string, contact: any) {`,
  "helpers"
);

const oldBlock = `      const conversation_id = await ensureCampaignConversation(recipient);
      const body = renderCampaignBody(campaign.message_body || "", recipient);

      const result = attachment
        ? await sendMediaMessage({`;

const newBlock = `      const consent = await hasMarketingConsent(phone);

      if (!consent) {
        const asked = await alreadyAskedConsent(campaign.id, phone);

        if (!asked) {
          const ask = await sendConsentTemplate(campaign, recipient, phone);
          if (!ask.ok) throw new Error(JSON.stringify(ask.error || ask).slice(0, 800));
        } else if (recipient.id) {
          await supabaseAdmin
            .from("whatsapp_campaign_recipients")
            .update({ status: "authorization_sent", error_message: null })
            .eq("id", recipient.id);
        }

        skipped++;
        continue;
      }

      const conversation_id = await ensureCampaignConversation(recipient);
      const body = renderCampaignBody(campaign.message_body || "", recipient);

      const result = attachment
        ? await sendMediaMessage({`;

mustReplace(oldBlock, newBlock, "gate de consentimento");

fs.writeFileSync(file, src);
console.log(`${marker}: applied`);
