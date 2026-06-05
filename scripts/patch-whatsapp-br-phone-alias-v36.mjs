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
    src = src.replace(
      `async function sendMediaMessage(params: {`,
      `async function sendTemplateMessage(params: {
  conversation_id: string;
  to: string;
  template_name: string;
  template_language?: string | null;
  user_id?: string | null;
  sender_type?: string;
  raw_payload_extra?: Record<string, any>;
}) {
  const { conversation_id, to, template_name, template_language = "pt_BR", user_id, sender_type = "usuario", raw_payload_extra } = params;
  const phone = onlyDigits(to);
  const cleanTemplateName = String(template_name || "").trim();

  if (!cleanTemplateName) return { ok: false, status: 400, error: "template_name é obrigatório." };

  const response = await fetch(\`${GRAPH_BASE}/\${DEFAULT_PHONE_NUMBER_ID}/messages\`, {
    method: "POST",
    headers: { Authorization: \`Bearer \${META_TOKEN}\`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: cleanTemplateName, language: { code: template_language || "pt_BR" } },
    }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    console.error("META_SEND_TEMPLATE_ERROR", data);
    return { ok: false, status: response.status, error: data };
  }

  const metaMessageId = data?.messages?.[0]?.id || null;
  const body = \`[Modelo enviado: \${cleanTemplateName}]\`;

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id,
    direction: "outbound",
    sender_type,
    user_id: user_id || null,
    message_type: "template",
    body,
    meta_message_id: metaMessageId,
    raw_payload: { ...data, template_name: cleanTemplateName, template_language, ...(raw_payload_extra || {}) },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() })
    .eq("id", conversation_id);

  return { ok: true, status: 200, data };
}

async function sendMediaMessage(params: {`
    );
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

  src = src.replace(
    `let handledAsClosedRating = false;
  if (!conversation?.id && isRating) {
    const closedConversation = await findRecentlyClosedConversationForRating(contact.id);
    if (closedConversation?.id) { conversation = closedConversation; handledAsClosedRating = true; }
  }`,
    `let handledAsClosedRating = false;
  let handledAsClosedReply = false;
  if (!conversation?.id) {
    const closedConversation = await findRecentlyClosedConversationForRating(contact.id);
    if (closedConversation?.id) {
      conversation = closedConversation;
      handledAsClosedRating = isRating;
      handledAsClosedReply = !isRating;
    }
  }`
  );

  const oldUpdatePayload = 'const updatePayload = handledAsClosedRating ? { last_message: `Avaliação recebida: ${ratingValue(body) || body}`, last_message_at: inboundAt, unread_count: 0, status: "fechada", stage: "finalizado", queue: "finalizado", updated_at: inboundAt } : { last_message: body || (mediaId ? `${messageType} recebido` : body), last_message_at: inboundAt, unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1, updated_at: inboundAt };';
  const newUpdatePayload = 'const updatePayload = (handledAsClosedRating || handledAsClosedReply) ? { last_message: handledAsClosedRating ? `Avaliação recebida: ${ratingValue(body) || body}` : `Resposta após encerramento: ${body || messageType}`, last_message_at: inboundAt, unread_count: 0, status: "fechada", stage: "finalizado", queue: "finalizado", updated_at: inboundAt } : { last_message: body || (mediaId ? `${messageType} recebido` : body), last_message_at: inboundAt, unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1, updated_at: inboundAt };';
  src = src.replace(oldUpdatePayload, newUpdatePayload);

  src = src.replace(
    `const messagePayload = { conversation_id: conversation.id, direction: "inbound", sender_type: handledAsClosedRating ? "avaliacao" : optOut ? "opt_out" : optIn ? "opt_in" : "cliente", message_type: messageType, body, media_id: mediaId, media_mime_type: storedMedia?.mime_type || mediaMimeType, meta_message_id: metaMessageId, raw_payload: rawPayloadWithMedia };`,
    `const messagePayload = { conversation_id: conversation.id, direction: "inbound", sender_type: handledAsClosedRating ? "avaliacao" : handledAsClosedReply ? "cliente_pos_fechamento" : optOut ? "opt_out" : optIn ? "opt_in" : "cliente", message_type: messageType, body, media_id: mediaId, media_mime_type: storedMedia?.mime_type || mediaMimeType, meta_message_id: metaMessageId, raw_payload: rawPayloadWithMedia };`
  );

  src = src.replace(
    `if (handledAsClosedRating) { await sendEvaluationThanks({ conversationId: conversation.id, phoneNumberId, to: waId, rating: ratingValue(body) }); console.log("WHATSAPP_RATING_RECEIVED", { conversationId: conversation.id, waId, rating: ratingValue(body) }); return; }`,
    `if (handledAsClosedRating) { await sendEvaluationThanks({ conversationId: conversation.id, phoneNumberId, to: waId, rating: ratingValue(body) }); console.log("WHATSAPP_RATING_RECEIVED", { conversationId: conversation.id, waId, rating: ratingValue(body) }); return; }
  if (handledAsClosedReply) { console.log("WHATSAPP_CLOSED_TICKET_REPLY_REGISTERED", { conversationId: conversation.id, waId }); return; }`
  );

  return src;
});

patchIfExists("src/pages/whatsapp/WhatsAppAtendimento.tsx", (src) => {
  src = src.replace(/board: "comercial" \| "operacional"/g, `board: "comercial" | "pos_vendas" | "operacional"`);
  src = src.replace(/useState<"todos" \| "comercial" \| "operacional" \| "relatorios">\("todos"\)/g, `useState<"todos" | "comercial" | "pos_vendas" | "operacional" | "relatorios">("todos")`);
  src = src.replace(/useState<"comercial" \| "operacional">\("comercial"\)/g, `useState<"comercial" | "pos_vendas" | "operacional">("comercial")`);
  src = src.replace(/function boardOf\(c\?: Conv \| null\): "comercial" \| "operacional"/g, `function boardOf(c?: Conv | null): "comercial" | "pos_vendas" | "operacional"`);

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

  src = src.replace(`const [msgs, setMsgs] = useState<Msg[]>([]);`, `const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ratings, setRatings] = useState<Msg[]>([]);`);
  src = src.replace(`const [messageText, setMessageText] = useState("");`, `const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);`);

  src = src.replace(
    `if (!error) setConvs((data || []) as Conv[]); else console.error(error);
    setLoading(false); setRefreshing(false);`,
    `if (!error) setConvs((data || []).filter((c: any) => !isClosed(c)) as Conv[]); else console.error(error);
    const { data: ratingRows } = await supabase.from("whatsapp_messages").select("id,direction,body,message_type,created_at,raw_payload,media_mime_type").eq("sender_type", "avaliacao").order("created_at", { ascending: false }).limit(500);
    setRatings((ratingRows || []) as Msg[]);
    setLoading(false); setRefreshing(false);`
  );

  src = src.replace(
    `return { open, closed, novos, won, lost, winRate, total: convs.length, inbound, outbound, estimatedOpenings: convs.filter((c) => !!c.last_message_at).length, estimatedCostBRL: 0 };`,
    `const ratingNums = ratings.map((r: any) => Number(String(r.body || "").replace(/\\D/g, ""))).filter((n) => n >= 1 && n <= 5);
    const avgRating = ratingNums.length ? (ratingNums.reduce((a, b) => a + b, 0) / ratingNums.length).toFixed(1) : "—";
    return { open, closed, novos, won, lost, winRate, total: convs.length, inbound, outbound, estimatedOpenings: convs.filter((c) => !!c.last_message_at).length, estimatedCostBRL: 0, ratingCount: ratingNums.length, avgRating };`
  );
  src = src.replace(`}, [convs, msgs]);`, `}, [convs, msgs, ratings]);`);

  src = src.replace(`const kanbanQueues = (tab === "comercial" ? COMMERCIAL : OPERATIONAL).filter((q) => !q.terminal);`, `const kanbanQueues = (tab === "comercial" ? COMMERCIAL : tab === "pos_vendas" ? POST_SALES : OPERATIONAL).filter((q) => !q.terminal);`);
  src = src.replace(`useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : "op_novo_cliente"); }, [startBoard]);`, `useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : startBoard === "pos_vendas" ? "pos_novo_cliente" : "op_suporte"); }, [startBoard]);`);
  src = src.replace(/\(startBoard === "comercial" \? COMMERCIAL : OPERATIONAL\)/g, `(startBoard === "comercial" ? COMMERCIAL : startBoard === "pos_vendas" ? POST_SALES : OPERATIONAL)`);

  src = src.replace(/q\.board === "comercial" \? "Comercial" : "Operacional"/g, `q.board === "comercial" ? "Comercial" : q.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(/item\.board === "comercial" \? "Comercial" : "Operacional"/g, `item.board === "comercial" ? "Comercial" : item.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(`{(["todos", "comercial", "operacional", "relatorios"] as const).map((item)`, `{(["todos", "comercial", "pos_vendas", "operacional", "relatorios"] as const).map((item)`);
  src = src.replace(/item === "relatorios" \? "Relatórios" : item\.charAt\(0\)\.toUpperCase\(\) \+ item\.slice\(1\)/g, `item === "relatorios" ? "Relatórios" : item === "pos_vendas" ? "Pós-Vendas" : item.charAt(0).toUpperCase() + item.slice(1)`);
  src = src.replace(`<option value="operacional">Operacional</option>`, `<option value="pos_vendas">Pós-Vendas</option><option value="operacional">Operacional</option>`);

  src = src.replace(
    `const text = String(body ?? messageText).trim();`,
    `const textBase = String(body ?? messageText).trim();
    const text = replyTo && !body ? \`↪ Respondendo: \${replyTo.body || replyTo.message_type || "mensagem"}\n\n\${textBase}\` : textBase;`
  );
  src = src.replace(`setMessageText(""); setFile(null);`, `setMessageText(""); setReplyTo(null); setFile(null);`);

  src = src.replace(
    `{outside && <div className="border-t bg-amber-50 p-3 text-xs font-bold text-amber-800">Cliente fora da janela de 24h. Use modelo aprovado para reabertura antes de enviar texto livre.</div>}`,
    `{outside && <div className="border-t bg-amber-50 p-3 text-xs font-bold text-amber-900"><div className="mb-2">Cliente fora da janela de 24h. Selecione um modelo aprovado para reabrir a conversa.</div><div className="flex flex-col gap-2 md:flex-row"><select value={startTemplate} onChange={(e) => setStartTemplate(e.target.value)} className="flex-1 rounded-xl border bg-white px-3 py-2 text-xs text-slate-700"><option value="">Selecionar modelo aprovado</option>{templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select><button onClick={async () => { if (!startTemplate) return alert("Selecione um modelo aprovado."); setSending(true); try { const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: active.id, to: phoneOf(active), template_name: startTemplate, template_language: "pt_BR" }) }); const json = await res.json().catch(() => null); if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error || "Falha ao enviar modelo"); await loadMessages(active.id); await load(); } catch (e: any) { alert(e?.message || "Não foi possível enviar modelo."); } finally { setSending(false); } }} className="rounded-xl bg-[#A11C27] px-3 py-2 text-xs font-black text-white disabled:opacity-50" disabled={sending || !startTemplate}>Enviar modelo</button></div></div>}`
  );

  src = src.replace(
    `{msgs.map((m) => { const out = m.direction === "outbound"; return <div key={m.id} className={\`flex ${out ? "justify-end" : "justify-start"}\`}>`,
    `{msgs.map((m) => { const out = m.direction === "outbound"; return <div key={m.id} className={\`group flex ${out ? "justify-end" : "justify-start"}\`}>`
  );
  src = src.replace(
    `<p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p><p className="mt-1 text-right text-[10px] text-slate-400">`,
    `<p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p><button onClick={() => setReplyTo(m)} className="mt-1 hidden text-[10px] font-bold text-[#A11C27] group-hover:block">Responder</button><p className="mt-1 text-right text-[10px] text-slate-400">`
  );

  src = src.replace(
    `<div className="flex items-end gap-2"><button onClick={() => alert("Emoji será conectado na próxima etapa visual.")} className="rounded-full p-3 hover:bg-slate-100"><Smile className="h-5 w-5" /></button><button onClick={() => fileRef.current?.click()} className="rounded-full p-3 hover:bg-slate-100"><Paperclip className="h-5 w-5" /></button><button onClick={() => alert("Gravação de áudio será conectada na próxima etapa.")} className="rounded-full p-3 hover:bg-slate-100"><Mic className="h-5 w-5" /></button><button onClick={() => alert("Ligação pelo WhatsApp exige permissão do cliente.")} className="rounded-full p-3 hover:bg-slate-100"><Phone className="h-5 w-5" /></button>`,
    `<div className="flex items-end gap-2"><button onClick={() => setMessageText((v) => v + "😊")} className="rounded-full p-3 hover:bg-slate-100"><Smile className="h-5 w-5" /></button><button onClick={() => fileRef.current?.click()} className="rounded-full p-3 hover:bg-slate-100"><Paperclip className="h-5 w-5" /></button><button onClick={() => fileRef.current?.click()} className="rounded-full p-3 hover:bg-slate-100" title="Anexar áudio"><Mic className="h-5 w-5" /></button><button onClick={async () => { const tpl = templates.find((t) => t.name === "call_permission_optin")?.name || "call_permission_optin"; setSending(true); try { await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: active.id, to: phoneOf(active), template_name: tpl, template_language: "pt_BR" }) }); alert("Solicitação de permissão de ligação enviada."); } finally { setSending(false); } }} className="rounded-full p-3 hover:bg-slate-100"><Phone className="h-5 w-5" /></button>`
  );

  src = src.replace(
    `{file && <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"><span>{file.name}</span><button onClick={() => setFile(null)}>remover</button></div>}`,
    `{replyTo && <div className="mb-2 flex items-center justify-between rounded-xl bg-[#A11C27]/10 px-3 py-2 text-xs font-bold text-[#A11C27]"><span>Respondendo: {replyTo.body || replyTo.message_type || "mensagem"}</span><button onClick={() => setReplyTo(null)}>cancelar</button></div>}{file && <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"><span>{file.name}</span><button onClick={() => setFile(null)}>remover</button></div>}`
  );

  src = src.replace(
    `<div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo estimado</p><p className="mt-2 text-3xl font-black text-amber-700">{brl(counts.estimatedCostBRL)}</p><p className="text-sm text-slate-500">Aguardando tabela de preços</p></div></div>`,
    `<div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo estimado</p><p className="mt-2 text-3xl font-black text-amber-700">{brl(counts.estimatedCostBRL)}</p><p className="text-sm text-slate-500">Aguardando tabela de preços</p></div></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Avaliações recebidas</p><p className="mt-2 text-3xl font-black text-emerald-700">{counts.ratingCount}</p><p className="text-sm text-slate-500">Respostas 1 a 5 registradas</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Avaliação média</p><p className="mt-2 text-3xl font-black text-emerald-700">{counts.avgRating}</p><p className="text-sm text-slate-500">Média das avaliações</p></div></div>`
  );

  src = src.replace(
    `<p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>`,
    `<p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{out && <span className={m.raw_payload?.meta_status === "read" ? "ml-1 font-black text-sky-500" : "ml-1 font-black text-slate-400"}>{m.raw_payload?.meta_status === "read" || m.raw_payload?.meta_status === "delivered" ? "✓✓" : "✓"}</span>}</p>`
  );

  src = src.replace(`return <div className="flex h-full max-h-[72vh] min-h-[72vh] flex-col bg-[#efe7dd]">`, `return <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }} className="flex h-full max-h-[72vh] min-h-[72vh] flex-col bg-[#efe7dd]">`);
  src = src.replace(`: <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">`, `: <div className="grid min-h-[72vh] gap-4 lg:grid-cols-[minmax(0,1fr)_520px]"><div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">`);
  src = src.replace(`}</div>}{startOpen &&`, `}</div>{active && <div className="min-h-[72vh] overflow-hidden rounded-3xl border bg-white shadow-sm">{Chat()}</div>}</div>}{startOpen &&`);

  return src
    .replace(/<Chat \/>/g, "{Chat()}")
    .replace(/<Reports \/>/g, "Reports()")
    .replace(/\? \{Reports\(\)\} :/g, "? Reports() :")
    .replace(/\? \{Chat\(\)\} :/g, "? Chat() :");
});

await import("./patch-whatsapp-consent-gate-v37a.mjs");
await import("./patch-whatsapp-module-fixes-v38b.mjs");
await import("./patch-whatsapp-atendimento-web-layout-v39.mjs");

console.log(`${marker}: concluído`);
