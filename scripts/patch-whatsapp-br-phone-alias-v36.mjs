import fs from "node:fs";

const marker = "patch-whatsapp-br-phone-alias-v36";

function patchFile(file, patcher) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(marker)) {
    console.log(`${marker}: ${file} already applied`);
    return;
  }
  src = patcher(src);
  fs.writeFileSync(file, src);
  console.log(`${marker}: ${file} applied`);
}

function mustReplace(src, search, replace, label) {
  if (!src.includes(search)) {
    throw new Error(`${marker}: trecho não encontrado para ${label}`);
  }
  return src.replace(search, replace);
}

function mustReplaceRegex(src, regex, replace, label) {
  if (!regex.test(src)) {
    throw new Error(`${marker}: trecho não encontrado para ${label}`);
  }
  return src.replace(regex, replace);
}

const phoneHelpers = `
// patch-whatsapp-br-phone-alias-v36
function brPhoneVariants(value?: string | null) {
  const digits = onlyDigits(value);
  const set = new Set<string>();

  if (!digits) return [];

  set.add(digits);

  if (digits.startsWith("55")) {
    const local = digits.slice(2);
    set.add(local);

    if (local.length === 11 && local[2] === "9") {
      const withoutNine = local.slice(0, 2) + local.slice(3);
      set.add(withoutNine);
      set.add("55" + withoutNine);
    }

    if (local.length === 10) {
      const withNine = local.slice(0, 2) + "9" + local.slice(2);
      set.add(withNine);
      set.add("55" + withNine);
    }
  } else {
    set.add("55" + digits);

    if (digits.length === 11 && digits[2] === "9") {
      const withoutNine = digits.slice(0, 2) + digits.slice(3);
      set.add(withoutNine);
      set.add("55" + withoutNine);
    }

    if (digits.length === 10) {
      const withNine = digits.slice(0, 2) + "9" + digits.slice(2);
      set.add(withNine);
      set.add("55" + withNine);
    }
  }

  return Array.from(set).filter(Boolean);
}

async function findWhatsAppContactByPhoneVariants(value?: string | null) {
  const variants = brPhoneVariants(value);
  if (variants.length === 0) return null;

  const byWaId = await supabaseAdmin
    .from("whatsapp_contacts")
    .select("id,lead_id,wa_id,telefone,nome")
    .in("wa_id", variants)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!byWaId.error && byWaId.data?.id) return byWaId.data;

  const byPhone = await supabaseAdmin
    .from("whatsapp_contacts")
    .select("id,lead_id,wa_id,telefone,nome")
    .in("telefone", variants)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!byPhone.error && byPhone.data?.id) return byPhone.data;

  return null;
}
`;

patchFile("api/whatsapp/webhook.ts", (src) => {
  src = mustReplace(
    src,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n`,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n${phoneHelpers}\n`,
    "helpers de telefone no webhook"
  );

  const contactRegex = /  const \{ data: contact, error: contactError \} = await supabaseAdmin[\s\S]*?  if \(contactError \|\| !contact\?\.id\) \{\n    console\.error\("WHATSAPP_CONTACT_UPSERT_ERROR", contactError\);\n    return;\n  \}/;

  src = mustReplaceRegex(
    src,
    contactRegex,
    `  const existingContactByAlias = await findWhatsAppContactByPhoneVariants(waId);\n\n  const contactResult = existingContactByAlias?.id\n    ? await supabaseAdmin\n        .from("whatsapp_contacts")\n        .update({\n          wa_id: waId,\n          telefone: waId,\n          nome: existingContactByAlias.nome || nome,\n          updated_at: inboundAt,\n        })\n        .eq("id", existingContactByAlias.id)\n        .select("id, lead_id")\n        .single()\n    : await supabaseAdmin\n        .from("whatsapp_contacts")\n        .upsert(\n          {\n            wa_id: waId,\n            telefone: waId,\n            nome,\n            updated_at: inboundAt,\n          },\n          { onConflict: "wa_id" }\n        )\n        .select("id, lead_id")\n        .single();\n\n  const contact = contactResult.data;\n  const contactError = contactResult.error;\n\n  if (contactError || !contact?.id) {\n    console.error("WHATSAPP_CONTACT_UPSERT_ERROR", contactError);\n    return;\n  }`,
    "merge de contato inbound por alias BR"
  );

  return src;
});

const sendHelpers = `${phoneHelpers}
async function resolveWhatsAppSendPhone(to?: string | null, conversationId?: string | null) {
  const inputPhone = onlyDigits(to);

  if (conversationId) {
    const { data: conversation } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("contact_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversation?.contact_id) {
      const { data: contact } = await supabaseAdmin
        .from("whatsapp_contacts")
        .select("wa_id,telefone")
        .eq("id", conversation.contact_id)
        .maybeSingle();

      const storedPhone = onlyDigits(contact?.wa_id || contact?.telefone);
      if (storedPhone) return storedPhone;
    }
  }

  const contactByAlias = await findWhatsAppContactByPhoneVariants(inputPhone);
  return onlyDigits(contactByAlias?.wa_id || contactByAlias?.telefone || inputPhone);
}

async function getOrCreateWhatsAppContactForSend(phoneValue?: string | null, nome?: string | null) {
  const phone = onlyDigits(phoneValue);
  const now = new Date().toISOString();
  const existing = await findWhatsAppContactByPhoneVariants(phone);

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_contacts")
      .update({
        nome: existing.nome || nome || null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id,lead_id,wa_id,telefone,nome")
      .single();

    if (error || !data?.id) throw error || new Error("Contato não atualizado.");
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: phone,
        telefone: phone,
        nome: nome || null,
        updated_at: now,
      },
      { onConflict: "wa_id" }
    )
    .select("id,lead_id,wa_id,telefone,nome")
    .single();

  if (error || !data?.id) throw error || new Error("Contato não criado.");
  return data;
}
`;

patchFile("api/whatsapp/send.ts", (src) => {
  src = mustReplace(
    src,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n`,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n${sendHelpers}\n`,
    "helpers de telefone no send"
  );

  src = src.replace(
    `  const phone = onlyDigits(to);\n\n  const response = await fetch`,
    `  const phone = await resolveWhatsAppSendPhone(to, conversation_id);\n\n  const response = await fetch`
  );

  src = src.replace(
    `  const phone = onlyDigits(to);\n  const mimeType = String(mime_type || "application/octet-stream");`,
    `  const phone = await resolveWhatsAppSendPhone(to, conversation_id);\n  const mimeType = String(mime_type || "application/octet-stream");`
  );

  const ensureRegex = /  const phone = onlyDigits\(contact\.telefone_digits \|\| contact\.telefone\);\n  const now = new Date\(\)\.toISOString\(\);\n\n  const \{ data: waContact, error: contactError \} = await supabaseAdmin[\s\S]*?  if \(contactError \|\| !waContact\?\.id\) throw contactError \|\| new Error\("Contato não criado\."\);/;

  src = mustReplaceRegex(
    src,
    ensureRegex,
    `  const phone = onlyDigits(contact.telefone_digits || contact.telefone);\n  const now = new Date().toISOString();\n\n  const waContact = await getOrCreateWhatsAppContactForSend(phone, contact.nome || null);`,
    "ensureCampaignConversation por alias BR"
  );

  return src;
});
