import fs from "node:fs";

const marker = "patch-whatsapp-br-phone-alias-v36-safe";

function patchIfExists(file, patcher) {
  if (!fs.existsSync(file)) return;
  let src = fs.readFileSync(file, "utf8");
  const next = patcher(src);
  if (next !== src) {
    fs.writeFileSync(file, next);
    console.log(`${marker}: ${file} ajustado`);
  } else {
    console.log(`${marker}: ${file} sem alterações`);
  }
}

patchIfExists("api/whatsapp/send.ts", (src) => {
  src = src
    .replace(/await resolveWhatsAppSendPhone\(to, conversation_id\)/g, "onlyDigits(to)")
    .replace(/await resolveWhatsAppSendPhone\(phoneValue, null\)/g, "onlyDigits(phoneValue)");

  if (!src.includes("async function sendTemplateMessage")) {
    const templateSender = [
      "async function sendTemplateMessage(params: {",
      "  conversation_id: string;",
      "  to: string;",
      "  template_name: string;",
      "  template_language?: string | null;",
      "  user_id?: string | null;",
      "  sender_type?: string;",
      "  raw_payload_extra?: Record<string, any>;",
      "}) {",
      "  const { conversation_id, to, template_name, template_language = \"pt_BR\", user_id, sender_type = \"usuario\", raw_payload_extra } = params;",
      "  const phone = onlyDigits(to);",
      "  const cleanTemplateName = String(template_name || \"\").trim();",
      "",
      "  if (!cleanTemplateName) return { ok: false, status: 400, error: \"template_name é obrigatório.\" };",
      "",
      "  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {",
      "    method: \"POST\",",
      "    headers: { Authorization: `Bearer ${META_TOKEN}`, \"Content-Type\": \"application/json\" },",
      "    body: JSON.stringify({",
      "      messaging_product: \"whatsapp\",",
      "      to: phone,",
      "      type: \"template\",",
      "      template: { name: cleanTemplateName, language: { code: template_language || \"pt_BR\" } },",
      "    }),",
      "  });",
      "",
      "  const data = await readJson(response);",
      "  if (!response.ok) {",
      "    console.error(\"META_SEND_TEMPLATE_ERROR\", data);",
      "    return { ok: false, status: response.status, error: data };",
      "  }",
      "",
      "  const metaMessageId = data?.messages?.[0]?.id || null;",
      "  const body = `[Modelo enviado: ${cleanTemplateName}]`;",
      "",
      "  await supabaseAdmin.from(\"whatsapp_messages\").insert({",
      "    conversation_id,",
      "    direction: \"outbound\",",
      "    sender_type,",
      "    user_id: user_id || null,",
      "    message_type: \"template\",",
      "    body,",
      "    meta_message_id: metaMessageId,",
      "    raw_payload: { ...data, template_name: cleanTemplateName, template_language, ...(raw_payload_extra || {}) },",
      "  });",
      "",
      "  await supabaseAdmin",
      "    .from(\"whatsapp_conversations\")",
      "    .update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: \"humano\", updated_at: new Date().toISOString() })",
      "    .eq(\"id\", conversation_id);",
      "",
      "  return { ok: true, status: 200, data };",
      "}",
      "",
      "async function sendMediaMessage(params: {",
    ].join("\n");

    src = src.replace("async function sendMediaMessage(params: {", templateSender);
  }

  src = src.replace(
    `const { conversation_id, to, body, user_id, file_base64, file_name, mime_type, caption, media_type } = req.body || {};`,
    `const { conversation_id, to, body, user_id, file_base64, file_name, mime_type, caption, media_type, template_name, template_language } = req.body || {};`
  );

  src = src.replace(
    `if (file_base64 && mime_type) {`,
    `if (template_name) {
      const result = await sendTemplateMessage({ conversation_id, to, template_name, template_language, user_id });
      if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, data: result.data });
    }

    if (file_base64 && mime_type) {`
  );

  return src;
});

patchIfExists("api/whatsapp/webhook.ts", (src) => {
  src = src.replace(
    `? await supabaseAdmin.from("whatsapp_contacts").update({ wa_id: waId, telefone: waId, nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`,
    `? await supabaseAdmin.from("whatsapp_contacts").update({ nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`
  );

  src = src.replace(
    `if (Array.isArray(value?.statuses) && value.statuses.length > 0) console.log("WHATSAPP_STATUS_EVENT", value.statuses);`,
    `if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
        for (const status of value.statuses) {
          const messageId = status?.id;
          if (messageId) {
            const { error: statusUpdateError } = await supabaseAdmin
              .from("whatsapp_messages")
              .update({ raw_payload: { meta_status: status?.status || null, status_payload: status, updated_from_status_webhook_at: new Date().toISOString() } })
              .eq("meta_message_id", messageId);
            if (statusUpdateError) console.error("WHATSAPP_STATUS_UPDATE_ERROR", statusUpdateError);
          }
        }
      }`
  );

  return src;
});

patchIfExists("src/pages/whatsapp/WhatsAppAtendimento.tsx", (src) => {
  src = src.replace(/board: "comercial" \| "operacional"/g, `board: "comercial" | "pos_vendas" | "operacional"`);
  src = src.replace(/useState<"todos" \| "comercial" \| "operacional" \| "relatorios">\("todos"\)/g, `useState<"todos" | "comercial" | "pos_vendas" | "operacional" | "relatorios">("todos")`);
  src = src.replace(/useState<"comercial" \| "operacional">\("comercial"\)/g, `useState<"comercial" | "pos_vendas" | "operacional">("comercial")`);

  src = src.replace(
    `const OPERATIONAL: Queue[] = [
  { key: "op_novo_cliente", label: "Novo Cliente", board: "operacional", color: C.red, desc: "Entrada operacional" },
  { key: "op_sucesso", label: "Sucesso do Cliente", board: "operacional", color: C.green, desc: "Acompanhamento" },
  { key: "op_suporte", label: "Suporte ao Cliente", board: "operacional", color: C.green, desc: "Suporte geral" },`,
    `const POST_SALES: Queue[] = [
  { key: "pos_novo_cliente", label: "Novo Cliente", board: "pos_vendas", color: C.red, desc: "Entrada do pós-vendas" },
  { key: "pos_sucesso", label: "Sucesso do Cliente", board: "pos_vendas", color: C.green, desc: "Acompanhamento e sucesso" },
  { key: "pos_boletos", label: "Boletos", board: "pos_vendas", color: C.gold, desc: "Solicitação e envio de boletos" },
  { key: "pos_res_assembleia", label: "Res. Assembleia", board: "pos_vendas", color: C.gold, desc: "Resultado de assembleia" },
  { key: "pos_recup_clientes", label: "Recup. Clientes", board: "pos_vendas", color: C.red, desc: "Recuperação de clientes" },
];
const OPERATIONAL: Queue[] = [
  { key: "op_suporte", label: "Suporte ao Cliente", board: "operacional", color: C.green, desc: "Suporte geral" },`
  );

  src = src.replace(`const ALL_QUEUES = [...COMMERCIAL, ...OPERATIONAL];`, `const ALL_QUEUES = [...COMMERCIAL, ...POST_SALES, ...OPERATIONAL];`);
  src = src.replace(`cliente_ativo: "op_novo_cliente",`, `cliente_ativo: "pos_novo_cliente",`);
  src = src.replace(`pos_venda: "op_sucesso",`, `pos_venda: "pos_sucesso",`);
  src = src.replace(`const kanbanQueues = (tab === "comercial" ? COMMERCIAL : OPERATIONAL).filter((q) => !q.terminal);`, `const kanbanQueues = (tab === "comercial" ? COMMERCIAL : tab === "pos_vendas" ? POST_SALES : OPERATIONAL).filter((q) => !q.terminal);`);
  src = src.replace(`useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : "op_novo_cliente"); }, [startBoard]);`, `useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : startBoard === "pos_vendas" ? "pos_novo_cliente" : "op_suporte"); }, [startBoard]);`);
  src = src.replace(/\(startBoard === "comercial" \? COMMERCIAL : OPERATIONAL\)/g, `(startBoard === "comercial" ? COMMERCIAL : startBoard === "pos_vendas" ? POST_SALES : OPERATIONAL)`);
  src = src.replace(/q\.board === "comercial" \? "Comercial" : "Operacional"/g, `q.board === "comercial" ? "Comercial" : q.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(/item\.board === "comercial" \? "Comercial" : "Operacional"/g, `item.board === "comercial" ? "Comercial" : item.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(`{(["todos", "comercial", "operacional", "relatorios"] as const).map((item)`, `{(["todos", "comercial", "pos_vendas", "operacional", "relatorios"] as const).map((item)`);
  src = src.replace(/item === "relatorios" \? "Relatórios" : item\.charAt\(0\)\.toUpperCase\(\) \+ item\.slice\(1\)/g, `item === "relatorios" ? "Relatórios" : item === "pos_vendas" ? "Pós-Vendas" : item.charAt(0).toUpperCase() + item.slice(1)`);
  src = src.replace(`<option value="operacional">Operacional</option>`, `<option value="pos_vendas">Pós-Vendas</option><option value="operacional">Operacional</option>`);

  src = src.replace(/<Chat \/>/g, "{Chat()}");
  src = src.replace(/<Reports \/>/g, "Reports()");
  src = src.replace(/\? \{Reports\(\)\} :/g, "? Reports() :");
  src = src.replace(/\? \{Chat\(\)\} :/g, "? Chat() :");

  return src;
});

await import("./patch-whatsapp-consent-gate-v37a.mjs");
await import("./patch-whatsapp-module-fixes-v38b.mjs");
await import("./patch-whatsapp-atendimento-web-layout-v39.mjs");

console.log(`${marker}: concluído`);
