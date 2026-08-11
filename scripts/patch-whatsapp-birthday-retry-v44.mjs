import fs from "node:fs";

const sendFile = "api/whatsapp/send.ts";
const birthdayFile = "api/agenda/birthday-whatsapp.ts";

function fail(message) {
  throw new Error(`[patch-whatsapp-birthday-retry-v44] ${message}`);
}

function log(message) {
  console.log(`[patch-whatsapp-birthday-retry-v44] ${message}`);
}

if (!fs.existsSync(sendFile)) fail(`${sendFile} não encontrado`);
if (!fs.existsSync(birthdayFile)) fail(`${birthdayFile} não encontrado`);

let sendSrc = fs.readFileSync(sendFile, "utf8");
let birthdaySrc = fs.readFileSync(birthdayFile, "utf8");

const resendTemplateHelper = `async function resendStoredTemplate(params: {
  message: any;
  conversation_id: string;
  to: string;
  user_id?: string | null;
}) {
  const raw = params.message?.raw_payload || {};
  const templateName = String(raw.template_name || "").trim();
  const templateLanguage = String(raw.template_language || "pt_BR").trim() || "pt_BR";
  const phone = onlyDigits(params.to);
  if (!templateName || !phone) {
    return { ok: false, status: 400, error: "Modelo ou telefone inválido para reenvio." };
  }

  let components = Array.isArray(raw.template_components)
    ? JSON.parse(JSON.stringify(raw.template_components))
    : [];
  const storedMedia = raw._consulmax_media || null;

  if (storedMedia?.storage_path) {
    const bucket = storedMedia.bucket || MEDIA_BUCKET;
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(storedMedia.storage_path);
    if (downloadError || !blob) {
      return {
        ok: false,
        status: 500,
        error: downloadError?.message || "Não foi possível recuperar a mídia do modelo no Supabase.",
      };
    }

    const mimeType = String(
      storedMedia.mime_type || params.message?.media_mime_type || blob.type || "application/octet-stream",
    );
    const fileName = safeFileName(
      storedMedia.original_file_name ||
        String(storedMedia.storage_path).split("/").pop() ||
        "arquivo",
    );
    const buffer = Buffer.from(await blob.arrayBuffer());
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", bufferToBlob(buffer, mimeType), fileName);
    form.append("type", mimeType);

    const uploadResponse = await fetch(
      GRAPH_BASE + "/" + DEFAULT_PHONE_NUMBER_ID + "/media",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + META_TOKEN },
        body: form,
      },
    );
    const uploadData = await readJson(uploadResponse);
    if (!uploadResponse.ok || !uploadData?.id) {
      return {
        ok: false,
        status: uploadResponse.status || 500,
        error: uploadData || "Falha ao reenviar a mídia do modelo para a Meta.",
      };
    }

    const header = components.find(
      (component: any) => String(component?.type || "").toLowerCase() === "header",
    );
    if (header) {
      const previousParam = Array.isArray(header.parameters) ? header.parameters[0] : null;
      const mediaType = ["image", "video", "document"].includes(
        String(previousParam?.type || "").toLowerCase(),
      )
        ? String(previousParam.type).toLowerCase()
        : detectMediaKind(mimeType);
      const mediaPayload: any = { id: uploadData.id };
      if (mediaType === "document") mediaPayload.filename = fileName;
      header.parameters = [{ type: mediaType, [mediaType]: mediaPayload }];
    }
  }

  const templatePayload: any = {
    name: templateName,
    language: { code: templateLanguage },
  };
  if (components.length) templatePayload.components = components;

  const response = await fetch(
    GRAPH_BASE + "/" + DEFAULT_PHONE_NUMBER_ID + "/messages",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + META_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: templatePayload,
      }),
    },
  );
  const data = await readJson(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: data };
  }

  const sentAt = new Date().toISOString();
  const metaMessageId = data?.messages?.[0]?.id || null;
  const retryOf = {
    message_id: params.message.id,
    meta_message_id: params.message.meta_message_id || null,
  };
  const nextRawPayload: any = {
    ...data,
    meta_status: "sent",
    meta_status_at: sentAt,
    template_name: templateName,
    template_language: templateLanguage,
    template_components: components,
    template_rendered_body: raw.template_rendered_body || params.message.body || "",
    template_header_media: raw.template_header_media || null,
    automation_type: raw.automation_type || null,
    agenda_event_id: raw.agenda_event_id || null,
    _retry_of: retryOf,
  };
  if (storedMedia) nextRawPayload._consulmax_media = storedMedia;

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id: params.conversation_id,
    direction: "outbound",
    sender_type: "usuario",
    user_id: params.user_id || null,
    message_type: params.message.message_type || "template",
    body: params.message.body || raw.template_rendered_body || ("[Modelo enviado: " + templateName + "]"),
    media_mime_type: params.message.media_mime_type || storedMedia?.mime_type || null,
    meta_message_id: metaMessageId,
    raw_payload: nextRawPayload,
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: params.message.body || raw.template_rendered_body || ("[Modelo enviado: " + templateName + "]"),
      last_message_at: sentAt,
      unread_count: 0,
      status: "humano",
      updated_at: sentAt,
    })
    .eq("id", params.conversation_id);

  return { ok: true, status: 200, data };
}

`;

if (!sendSrc.includes("async function resendStoredTemplate(")) {
  const anchor = "async function resendStoredMessage(params: {";
  if (!sendSrc.includes(anchor)) fail("âncora de resendStoredMessage não encontrada");
  sendSrc = sendSrc.replace(anchor, resendTemplateHelper + anchor);
  log("helper de reenvio de template inserido");
} else {
  log("helper de reenvio de template já existe");
}

if (!sendSrc.includes("return resendStoredTemplate({")) {
  const anchor = '  const type = String(message.message_type || "text").toLowerCase();\n\n';
  if (!sendSrc.includes(anchor)) fail("âncora do tipo da mensagem não encontrada");
  const templateRetry = `  const templateName = String(message.raw_payload?.template_name || "").trim();
  if (templateName) {
    return resendStoredTemplate({
      message,
      conversation_id: params.conversation_id,
      to: params.to,
      user_id: params.user_id,
    });
  }

`;
  sendSrc = sendSrc.replace(anchor, anchor + templateRetry);
  log("reenvio prioriza template original");
} else {
  log("prioridade de reenvio de template já aplicada");
}

const alreadySentRegex = /async function alreadySent\(automationKey: string\) \{[\s\S]*?\n\}\n\nasync function sendTemplate/;
if (!birthdaySrc.includes("meta_status !== \"failed\"")) {
  if (!alreadySentRegex.test(birthdaySrc)) fail("função alreadySent não encontrada");
  birthdaySrc = birthdaySrc.replace(
    alreadySentRegex,
    `async function alreadySent(automationKey: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id,raw_payload")
    .contains("raw_payload", { automation_key: automationKey })
    .limit(10);
  if (error) return false;
  return (data || []).some((row: any) => {
    const meta_status = String(row?.raw_payload?.meta_status || "").toLowerCase();
    return meta_status !== "failed";
  });
}

async function sendTemplate`,
  );
  log("aniversário com falha deixou de contar como já enviado");
} else {
  log("regra de falha no alreadySent já aplicada");
}

if (!birthdaySrc.includes("function birthdayStorageMedia()")) {
  const anchor = "async function sendTemplate(to: string, params: any[], templateDefinition: any) {";
  if (!birthdaySrc.includes(anchor)) fail("âncora sendTemplate do aniversário não encontrada");
  const helper = `function birthdayStorageMedia() {
  if (!BIRTHDAY_IMAGE_URL) return null;
  try {
    const url = new URL(BIRTHDAY_IMAGE_URL);
    const marker = "/storage/v1/object/public/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const remainder = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    const slash = remainder.indexOf("/");
    if (slash <= 0) return null;
    const bucket = remainder.slice(0, slash);
    const storagePath = remainder.slice(slash + 1);
    if (!bucket || !storagePath) return null;
    const fileName = storagePath.split("/").pop() || "felicitacao-aniversario.png";
    const lowerName = fileName.toLowerCase();
    const mimeType = lowerName.endsWith(".png") ? "image/png" : lowerName.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return {
      bucket,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: null,
      media_id: null,
      original_file_name: fileName,
    };
  } catch {
    return null;
  }
}

`;
  birthdaySrc = birthdaySrc.replace(anchor, helper + anchor);
  log("mídia do aniversário passa a referenciar o Storage");
} else {
  log("helper de Storage do aniversário já existe");
}

if (!birthdaySrc.includes("const birthdayMediaStorage = birthdayStorageMedia();")) {
  const anchor = "      const rawPayload = {\n        ...sent.data,\n";
  if (!birthdaySrc.includes(anchor)) fail("âncora do rawPayload de aniversário não encontrada");
  birthdaySrc = birthdaySrc.replace(
    anchor,
    `      const birthdayMediaStorage = birthdayStorageMedia();
      const rawPayload = {
        ...sent.data,
        meta_status: "sent",
        meta_status_at: new Date().toISOString(),
`,
  );

  const mediaAnchor = "        template_header_media: sent.media,\n      };";
  if (!birthdaySrc.includes(mediaAnchor)) fail("âncora template_header_media não encontrada");
  birthdaySrc = birthdaySrc.replace(
    mediaAnchor,
    `        template_header_media: sent.media,
        ...(birthdayMediaStorage ? { _consulmax_media: birthdayMediaStorage } : {}),
      };`,
  );
  log("status e referência da mídia gravados no disparo automático");
} else {
  log("rawPayload de aniversário já ajustado");
}

for (const required of [
  "async function resendStoredTemplate(",
  "return resendStoredTemplate({",
  "meta_status !== \"failed\"",
  "function birthdayStorageMedia()",
  "const birthdayMediaStorage = birthdayStorageMedia();",
]) {
  if (!(sendSrc + birthdaySrc).includes(required)) fail(`validação falhou: ${required}`);
}

fs.writeFileSync(sendFile, sendSrc);
fs.writeFileSync(birthdayFile, birthdaySrc);
log("concluído");
