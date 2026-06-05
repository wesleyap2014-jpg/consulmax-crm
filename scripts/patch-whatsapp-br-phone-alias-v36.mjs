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

// Este patch antigo estava substituindo onlyDigits(to) por resolveWhatsAppSendPhone(...)
// em alguns builds sem garantir que o helper existia no arquivo final.
patchIfExists("api/whatsapp/send.ts", (src) => {
  return src
    .replace(/await resolveWhatsAppSendPhone\(to, conversation_id\)/g, "onlyDigits(to)")
    .replace(/await resolveWhatsAppSendPhone\(phoneValue, null\)/g, "onlyDigits(phoneValue)");
});

patchIfExists("api/whatsapp/webhook.ts", (src) => {
  src = src.replace(
    `? await supabaseAdmin.from("whatsapp_contacts").update({ wa_id: waId, telefone: waId, nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`,
    `? await supabaseAdmin.from("whatsapp_contacts").update({ nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`
  );

  // Status da Meta: delivered/read/sent. Grava em raw_payload para o front exibir ✓✓.
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

  // Quando cliente responde logo após encerramento/pesquisa, mantém no ticket fechado e registra avaliação/resposta ali.
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

  src = src.replace(
    `const updatePayload = handledAsClosedRating ? { last_message: \`Avaliação recebida: \${ratingValue(body) || body}\`, last_message_at: inboundAt, unread_count: 0, status: "fechada", stage: "finalizado", queue: "finalizado", updated_at: inboundAt } : { last_message: body || (mediaId ? \`${messageType} recebido\` : body), last_message_at: inboundAt, unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1, updated_at: inboundAt };`,
    `const updatePayload = (handledAsClosedRating || handledAsClosedReply) ? { last_message: handledAsClosedRating ? \`Avaliação recebida: \${ratingValue(body) || body}\` : \`Resposta após encerramento: \${body || messageType}\`, last_message_at: inboundAt, unread_count: 0, status: "fechada", stage: "finalizado", queue: "finalizado", updated_at: inboundAt } : { last_message: body || (mediaId ? \`${messageType} recebido\` : body), last_message_at: inboundAt, unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1, updated_at: inboundAt };`
  );

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
  // União do tipo Board + novo Kanban Pós-Vendas.
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
];
const OPERATIONAL: Queue[] = [
  { key: "op_suporte", label: "Suporte ao Cliente", board: "operacional", color: C.green, desc: "Suporte geral" },`
  );
  src = src.replace(`const ALL_QUEUES = [...COMMERCIAL, ...OPERATIONAL];`, `const ALL_QUEUES = [...COMMERCIAL, ...POST_SALES, ...OPERATIONAL];`);
  src = src.replace(`cliente_ativo: "op_novo_cliente",`, `cliente_ativo: "pos_novo_cliente",`);
  src = src.replace(`pos_venda: "op_sucesso",`, `pos_venda: "pos_sucesso",`);

  // Estado de avaliações para Relatórios.
  src = src.replace(`const [msgs, setMsgs] = useState<Msg[]>([]);`, `const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ratings, setRatings] = useState<Msg[]>([]);`);
  src = src.replace(
    `if (!error) setConvs((data || []) as Conv[]); else console.error(error);
    setLoading(false); setRefreshing(false);`,
    `if (!error) setConvs((data || []) as Conv[]); else console.error(error);
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

  // Queues e etapas por board.
  src = src.replace(
    `const kanbanQueues = (tab === "comercial" ? COMMERCIAL : OPERATIONAL).filter((q) => !q.terminal);`,
    `const kanbanQueues = (tab === "comercial" ? COMMERCIAL : tab === "pos_vendas" ? POST_SALES : OPERATIONAL).filter((q) => !q.terminal);`
  );
  src = src.replace(
    `useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : "op_novo_cliente"); }, [startBoard]);`,
    `useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : startBoard === "pos_vendas" ? "pos_novo_cliente" : "op_suporte"); }, [startBoard]);`
  );
  src = src.replace(/\(startBoard === "comercial" \? COMMERCIAL : OPERATIONAL\)/g, `(startBoard === "comercial" ? COMMERCIAL : startBoard === "pos_vendas" ? POST_SALES : OPERATIONAL)`);

  // Labels de board.
  src = src.replace(/q\.board === "comercial" \? "Comercial" : "Operacional"/g, `q.board === "comercial" ? "Comercial" : q.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(/item\.board === "comercial" \? "Comercial" : "Operacional"/g, `item.board === "comercial" ? "Comercial" : item.board === "pos_vendas" ? "Pós-Vendas" : "Operacional"`);
  src = src.replace(`{(["todos", "comercial", "operacional", "relatorios"] as const).map((item)`, `{(["todos", "comercial", "pos_vendas", "operacional", "relatorios"] as const).map((item)`);
  src = src.replace(/item === "relatorios" \? "Relatórios" : item\.charAt\(0\)\.toUpperCase\(\) \+ item\.slice\(1\)/g, `item === "relatorios" ? "Relatórios" : item === "pos_vendas" ? "Pós-Vendas" : item.charAt(0).toUpperCase() + item.slice(1)`);
  src = src.replace(`<option value="operacional">Operacional</option>`, `<option value="pos_vendas">Pós-Vendas</option><option value="operacional">Operacional</option>`);

  // Relatórios: avaliação média e quantidade.
  src = src.replace(
    `<div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo estimado</p><p className="mt-2 text-3xl font-black text-amber-700">{brl(counts.estimatedCostBRL)}</p><p className="text-sm text-slate-500">Aguardando tabela de preços</p></div></div>`,
    `<div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo estimado</p><p className="mt-2 text-3xl font-black text-amber-700">{brl(counts.estimatedCostBRL)}</p><p className="text-sm text-slate-500">Aguardando tabela de preços</p></div></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Avaliações recebidas</p><p className="mt-2 text-3xl font-black text-emerald-700">{counts.ratingCount}</p><p className="text-sm text-slate-500">Respostas 1 a 5 registradas</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Avaliação média</p><p className="mt-2 text-3xl font-black text-emerald-700">{counts.avgRating}</p><p className="text-sm text-slate-500">Média das avaliações</p></div></div>`
  );

  // Status visual ✓ / ✓✓ / ✓✓ azul em mensagens outbound.
  src = src.replace(
    `<p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>`,
    `<p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{out && <span className={m.raw_payload?.meta_status === "read" ? "ml-1 font-black text-sky-500" : "ml-1 font-black text-slate-400"}>{m.raw_payload?.meta_status === "read" || m.raw_payload?.meta_status === "delivered" ? "✓✓" : "✓"}</span>}</p>`
  );

  // Arrastar arquivo em toda a conversa, não só no rodapé.
  src = src.replace(
    `return <div className="flex h-full max-h-[72vh] min-h-[72vh] flex-col bg-[#efe7dd]">`,
    `return <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }} className="flex h-full max-h-[72vh] min-h-[72vh] flex-col bg-[#efe7dd]">`
  );

  // Painel de conversa também ao lado dos Kanbans.
  src = src.replace(
    `: <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">`,
    `: <div className="grid min-h-[72vh] gap-4 lg:grid-cols-[minmax(0,1fr)_520px]"><div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">`
  );
  src = src.replace(
    `}</div>}{startOpen &&`,
    `}</div><div className="min-h-[72vh] overflow-hidden rounded-3xl border bg-white shadow-sm">{Chat()}</div></div>}{startOpen &&`
  );

  // Correções de render geradas pelo patch de foco.
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
