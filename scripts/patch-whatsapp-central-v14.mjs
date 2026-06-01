import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";
const callFile = "api/whatsapp/call.ts";

function replaceInFile(file, label, from, to) {
  let s = fs.readFileSync(file, "utf8");

  if (s.includes(to)) {
    console.log(`[patch-whatsapp-central-v14] ${label}: já aplicado`);
    return false;
  }

  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-central-v14] ${label}: trecho não encontrado`);
    return false;
  }

  s = s.replace(from, to);
  fs.writeFileSync(file, s);
  console.log(`[patch-whatsapp-central-v14] ${label}: aplicado`);
  return true;
}

function insertBefore(file, label, needle, block, flag) {
  let s = fs.readFileSync(file, "utf8");

  if (s.includes(flag)) {
    console.log(`[patch-whatsapp-central-v14] ${label}: já aplicado`);
    return false;
  }

  if (!s.includes(needle)) {
    console.warn(`[patch-whatsapp-central-v14] ${label}: ponto de inserção não encontrado`);
    return false;
  }

  s = s.replace(needle, `${block}\n${needle}`);
  fs.writeFileSync(file, s);
  console.log(`[patch-whatsapp-central-v14] ${label}: aplicado`);
  return true;
}

function patchPage() {
  insertBefore(
    pageFile,
    "queue helpers dinâmicos",
    "function statusLabel(status?: string | null) {",
    `function normalizeQueueKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function queueLabelFrom(list: QueueDef[], value?: string | null) {
  const normalized = normalizeQueueKey(value || "novos_contatos");
  const found = list.find((q) => q.key === normalized);
  if (found) return found.label;
  return value || "Novos Contatos";
}

function queueColorFrom(list: QueueDef[], value?: string | null) {
  const normalized = normalizeQueueKey(value || "novos_contatos");
  const found = list.find((q) => q.key === normalized);
  return found?.color || C.muted;
}`,
    "function queueLabelFrom"
  );

  replaceInFile(
    pageFile,
    "state filas configuradas",
    `  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");`,
    `  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [configuredQueues, setConfiguredQueues] = useState<QueueDef[]>([]);
  const [queueUsers, setQueueUsers] = useState<any[]>([]);

  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");`
  );

  replaceInFile(
    pageFile,
    "catálogo filas",
    `  const manager = isManager(profile, authUserId);
  const allowedQueues = useMemo(() => allowedQueuesFor(profile, authUserId), [profile, authUserId]);`,
    `  const manager = isManager(profile, authUserId);
  const queueCatalog = useMemo(() => (configuredQueues.length > 0 ? configuredQueues : QUEUES), [configuredQueues]);
  const allowedQueues = useMemo(() => {
    if (manager) return queueCatalog.map((q) => q.key);

    const linked = new Set(queueUsers.filter((item) => item.user_auth_id === authUserId).map((item) => item.queue_key));
    if (linked.size > 0) return queueCatalog.filter((q) => linked.has(q.key)).map((q) => q.key);

    return allowedQueuesFor(profile, authUserId).filter((key) => queueCatalog.some((q) => q.key === key));
  }, [authUserId, manager, profile, queueCatalog, queueUsers]);`
  );

  replaceInFile(
    pageFile,
    "canSend permite template",
    `  const canSend = !!active && !activeIsClosed && !!text.trim() && !sending;
  const canAssumeActive = !!active && !activeIsClosed && canViewConversation(active, profile, authUserId);`,
    `  const canSend = !!active && !activeIsClosed && !!text.trim() && !sending;
  const canAssumeActive = !!active && !activeIsClosed && (manager || active.assigned_to === authUserId || allowedQueues.includes(activeQueue));`
  );

  replaceInFile(
    pageFile,
    "visible conversations dinâmico",
    `  const visibleConversations = useMemo(
    () => conversations.filter((conv) => canViewConversation(conv, profile, authUserId)),
    [authUserId, conversations, profile]
  );`,
    `  const visibleConversations = useMemo(
    () => conversations.filter((conv) => manager || conv.assigned_to === authUserId || allowedQueues.includes(queueFromConversation(conv))),
    [allowedQueues, authUserId, conversations, manager]
  );`
  );

  replaceInFile(
    pageFile,
    "boardQueues usa filas reais",
    `  const boardQueues = useMemo(() => {
    const base = QUEUES.filter((q) => q.key !== "finalizado" || boardArea === "todos");
    const byPermission = manager ? base : base.filter((q) => allowedQueues.includes(q.key));
    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);
    return byArea;
  }, [allowedQueues, boardArea, manager]);`,
    `  const boardQueues = useMemo(() => {
    const base = queueCatalog.filter((q) => q.key !== "finalizado" || boardArea === "todos");
    const byPermission = manager ? base : base.filter((q) => allowedQueues.includes(q.key));
    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea || q.area === "geral");
    return byArea.length > 0 ? byArea : queueCatalog;
  }, [allowedQueues, boardArea, manager, queueCatalog]);`
  );

  replaceInFile(
    pageFile,
    "conversationsByQueue fallback dinâmico",
    `      const key = map.has(queue) ? queue : "novos_contatos";`,
    `      const key = map.has(queue) ? queue : boardQueues[0]?.key || "novos_contatos";`
  );

  replaceInFile(
    pageFile,
    "summary comercial dinâmico",
    `      const def = QUEUES.find((q) => q.key === queue);`,
    `      const def = queueCatalog.find((q) => q.key === queue);`
  );

  replaceInFile(
    pageFile,
    "transfer filas reais",
    `  const transferQueues = useMemo(() => {
    const list = manager ? QUEUES : QUEUES.filter((q) => allowedQueues.includes(q.key));
    return list.filter((q) => q.key !== "novos_contatos");
  }, [allowedQueues, manager]);`,
    `  const transferQueues = useMemo(() => {
    const list = manager ? queueCatalog : queueCatalog.filter((q) => allowedQueues.includes(q.key));
    return list.filter((q) => q.key !== "novos_contatos");
  }, [allowedQueues, manager, queueCatalog]);`
  );

  insertBefore(
    pageFile,
    "load filas configuradas",
    "  async function loadConversations(options?: { showLoading?: boolean; silent?: boolean }) {",
    `  async function loadConfiguredQueues() {
    try {
      const { data, error } = await supabase
        .from("whatsapp_queues")
        .select("key,label,color,sort_order,is_active,area,description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const rows = ((data || []) as any[])
        .map((row) => ({
          key: normalizeQueueKey(row.key || row.label),
          label: row.label || row.key,
          area: row.area || "geral",
          color: row.color || C.navy,
          description: row.description || "Fila configurada",
        }))
        .filter((row) => !!row.key && !!row.label);

      setConfiguredQueues(rows.length > 0 ? rows : []);
    } catch (error) {
      console.warn("Filas configuradas indisponíveis; usando fallback interno.", error);
      setConfiguredQueues([]);
    }

    try {
      const { data } = await supabase.from("whatsapp_queue_users").select("queue_key,user_auth_id");
      setQueueUsers(data || []);
    } catch {
      setQueueUsers([]);
    }
  }
`,
    "async function loadConfiguredQueues"
  );

  replaceInFile(
    pageFile,
    "carrega filas no init",
    `      await loadAuth();
      await loadUsers();
      await loadConversations({ showLoading: true });`,
    `      await loadAuth();
      await loadUsers();
      await loadConfiguredQueues();
      await loadConversations({ showLoading: true });`
  );

  replaceInFile(
    pageFile,
    "assumir permissão dinâmica",
    `    if (!canViewConversation(active, profile, authUserId)) {`,
    `    if (!(manager || active.assigned_to === authUserId || allowedQueues.includes(queueFromConversation(active)))) {`
  );

  replaceInFile(
    pageFile,
    "label fila header",
    `<Badge variant="secondary" className="gap-1"><Tag className="h-3.5 w-3.5" />{queueLabel(activeQueue)}</Badge>`,
    `<Badge variant="secondary" className="gap-1"><Tag className="h-3.5 w-3.5" />{queueLabelFrom(queueCatalog, activeQueue)}</Badge>`
  );

  replaceInFile(
    pageFile,
    "cor fila avatar active",
    `style={{ background: activeIsClosed ? C.green : queueColor(activeQueue) }}`,
    `style={{ background: activeIsClosed ? C.green : queueColorFrom(queueCatalog, activeQueue) }}`
  );

  replaceInFile(
    pageFile,
    "cor fila card",
    `style={{ background: unassigned ? C.red : queueColor(queue) }}`,
    `style={{ background: unassigned ? C.red : queueColorFrom(queueCatalog, queue) }}`
  );

  replaceInFile(
    pageFile,
    "textarea compacto",
    `                  className="min-h-[72px] resize-none text-base leading-relaxed"`,
    `                  className="min-h-[44px] max-h-[92px] resize-none text-sm leading-relaxed py-2"`
  );

  replaceInFile(
    pageFile,
    "composer compacto",
    `<div className="border-t bg-white p-4">`,
    `<div className="border-t bg-white p-3">`
  );

  insertBefore(
    pageFile,
    "esc minimiza drawer",
    "  async function sendMessage(customBody?: string) {",
    `  useEffect(() => {
    function onEsc(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (emojiOpen) {
        setEmojiOpen(false);
        return;
      }
      if (activeRef.current) {
        setDrawerMinimized((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [emojiOpen]);

  async function sendCallPermissionTemplate() {
    if (!active || !activePhone) return false;

    try {
      const response = await fetch("/api/whatsapp/call-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: active.id, to: activePhone, user_id: authUserId }),
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(JSON.stringify(result?.error || result).slice(0, 800));

      await loadMessages(active.id);
      await loadConversations({ silent: true });
      alert("Solicitação oficial de permissão de ligação enviada pelo WhatsApp. Assim que o cliente autorizar, tente ligar novamente.");
      return true;
    } catch (error: any) {
      console.warn("Template oficial de permissão indisponível:", error);
      const fallback = "Olá! Aqui é da Consulmax. Para sua segurança, o WhatsApp exige autorização antes de receber chamadas iniciadas pela nossa equipe. Você pode autorizar a ligação por aqui para continuarmos seu atendimento?";
      return sendMessage(fallback);
    }
  }
`,
    "async function sendCallPermissionTemplate"
  );

  replaceInFile(
    pageFile,
    "callSoon profissional",
    `  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }`,
    `  async function callSoon() {
    await sendCallPermissionTemplate();
  }`
  );

  replaceInFile(
    pageFile,
    "botão chamada visual",
    `<Button type="button" variant="outline" onClick={callSoon} className="h-auto min-w-[48px]" title="Fazer ligação">
                  <Phone className="h-5 w-5" />
                </Button>`,
    `<Button type="button" variant="outline" onClick={callSoon} disabled={sending || !activePhone} className="h-auto min-w-[48px] border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" title="Solicitar permissão de ligação pelo WhatsApp">
                  <Phone className="h-5 w-5" />
                </Button>`
  );

  replaceInFile(
    pageFile,
    "hint chamada",
    `<p className="text-xs text-slate-400">Assinatura automática: as mensagens enviadas pelo CRM exibem o nome do usuário responsável.</p>`,
    `<p className="text-xs text-slate-400">Assinatura automática: mensagens enviadas pelo CRM exibem o responsável. Para ligar pelo WhatsApp, solicite a permissão oficial do cliente pelo botão de telefone.</p>`
  );
}

function patchWebhook() {
  replaceInFile(
    webhookFile,
    "findActiveConversation mais tolerante",
    `async function findActiveConversation(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
    .eq("contact_id", contactId)
    .neq("status", "fechada")
    .neq("status", "finalizado")
    .neq("stage", "finalizado")
    .neq("queue", "finalizado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("WHATSAPP_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  return data;
}`,
    `async function findActiveConversation(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
    .eq("contact_id", contactId)
    .or("closed_at.is.null,status.neq.fechada,status.neq.finalizado,stage.neq.finalizado,queue.neq.finalizado")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("WHATSAPP_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  if (!data?.id) return null;

  const status = String(data.status || "").toLowerCase();
  const stage = String(data.stage || "").toLowerCase();
  const queue = String(data.queue || "").toLowerCase();
  const closed = status === "fechada" || status === "finalizado" || stage === "finalizado" || queue === "finalizado" || !!data.closed_at;

  if (!closed) return data;

  const ref = data.last_message_at || data.closed_at;
  const hours = ref ? (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60) : 999;

  // Se o CRM acabou de falar com o cliente e ele respondeu, reabre o mesmo ticket em vez de criar outro.
  if (hours <= 24) return data;

  return null;
}`
  );

  replaceInFile(
    webhookFile,
    "reabre conversa recente",
    `      const updatePayload = handledAsClosedRating
        ? {
            last_message: \`Avaliação recebida: \${ratingValue(body) || body}\`,
            last_message_at: inboundAt,
            unread_count: 0,
            status: "fechada",
            stage: "finalizado",
            queue: "finalizado",
            updated_at: inboundAt,
          }
        : {
            last_message: body || (mediaId ? \`${messageType} recebido\` : body),
            last_message_at: inboundAt,
            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
            updated_at: inboundAt,
          };`,
    `      const updatePayload = handledAsClosedRating
        ? {
            last_message: \`Avaliação recebida: \${ratingValue(body) || body}\`,
            last_message_at: inboundAt,
            unread_count: 0,
            status: "fechada",
            stage: "finalizado",
            queue: "finalizado",
            updated_at: inboundAt,
          }
        : {
            last_message: body || (mediaId ? \`${messageType} recebido\` : body),
            last_message_at: inboundAt,
            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
            status: conversation.status === "fechada" || conversation.status === "finalizado" ? "humano" : conversation.status,
            stage: conversation.stage === "finalizado" ? "triagem" : conversation.stage,
            queue: conversation.queue === "finalizado" ? "triagem" : conversation.queue,
            closed_at: null,
            updated_at: inboundAt,
          };`
  );

  replaceInFile(
    webhookFile,
    "call permission reply log",
    `      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }`,
    `      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }

      const callPermissionReplies = value?.call_permission_reply || value?.call_permission_replies || [];
      if (Array.isArray(callPermissionReplies) && callPermissionReplies.length > 0) {
        console.log("WHATSAPP_CALL_PERMISSION_REPLY", callPermissionReplies);
      }`
  );
}

function patchCallApi() {
  const s = fs.readFileSync(callFile, "utf8");
  if (!s.includes(`"connect" | "accept" | "reject" | "terminate"`) && s.includes(`valid_actions: ["accept", "reject", "terminate"]`)) {
    console.log("[patch-whatsapp-central-v14] call.ts ainda depende do patch v13 para outbound connect");
  }
}

patchPage();
patchWebhook();
patchCallApi();
console.log("[patch-whatsapp-central-v14] concluído");
