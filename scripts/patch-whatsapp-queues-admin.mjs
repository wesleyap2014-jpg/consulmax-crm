import fs from 'node:fs';

const p = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(p, 'utf8');

function lines(arr) {
  return arr.join('\n');
}

// Tipos para filas configuráveis
if (!s.includes('type QueueUserLink =')) {
  s = s.replace(
    lines([
      'type QueueDef = {',
      '  key: string;',
      '  label: string;',
      '  area: "comercial" | "operacional" | "geral";',
      '  color: string;',
      '};',
    ]),
    lines([
      'type QueueDef = {',
      '  key: string;',
      '  label: string;',
      '  area: "comercial" | "operacional" | "geral";',
      '  color: string;',
      '  sort_order?: number;',
      '  is_active?: boolean;',
      '};',
      '',
      'type QueueUserLink = {',
      '  id?: string;',
      '  queue_key: string;',
      '  user_auth_id: string;',
      '};',
    ])
  );
}

// Helper para criar slug da fila
if (!s.includes('function slugQueueName')) {
  s = s.replace(
    lines([
      'function onlyDigits(value?: string | null) {',
      '  return String(value || "").replace(/\\D/g, "");',
      '}',
    ]),
    lines([
      'function onlyDigits(value?: string | null) {',
      '  return String(value || "").replace(/\\D/g, "");',
      '}',
      '',
      'function slugQueueName(value: string) {',
      '  return String(value || "")',
      '    .normalize("NFD")',
      '    .replace(/[\\u0300-\\u036f]/g, "")',
      '    .toLowerCase()',
      '    .trim()',
      '    .replace(/[^a-z0-9]+/g, "_")',
      '    .replace(/^_+|_+$/g, "")',
      '    .slice(0, 40);',
      '}',
    ])
  );
}

// Estados da gestão de filas
if (!s.includes('const [queuesConfig, setQueuesConfig]')) {
  s = s.replace(
    lines([
      '  const [emojiOpen, setEmojiOpen] = useState(false);',
      '  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});',
    ]),
    lines([
      '  const [emojiOpen, setEmojiOpen] = useState(false);',
      '  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});',
      '  const [queuesConfig, setQueuesConfig] = useState<QueueDef[]>(QUEUES);',
      '  const [queueUsers, setQueueUsers] = useState<QueueUserLink[]>([]);',
      '  const [queueSettingsOpen, setQueueSettingsOpen] = useState(false);',
      '  const [newQueueName, setNewQueueName] = useState("");',
      '  const [selectedQueueKey, setSelectedQueueKey] = useState("novos_contatos");',
      '  const [savingQueue, setSavingQueue] = useState(false);',
    ])
  );
}

// Substitui allowedQueues por versão baseada na tabela whatsapp_queue_users
s = s.replace(
  lines([
    '  const manager = isManager(profile, authUserId);',
    '  const allowedQueues = useMemo(() => allowedQueuesFor(profile, authUserId), [profile, authUserId]);',
  ]),
  lines([
    '  const manager = isManager(profile, authUserId);',
    '  const effectiveQueues = useMemo(() => {',
    '    const source = queuesConfig.length > 0 ? queuesConfig : QUEUES;',
    '    return [...source].filter((q) => q.is_active !== false).sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100));',
    '  }, [queuesConfig]);',
    '  const allowedQueues = useMemo(() => {',
    '    if (manager) return effectiveQueues.map((q) => q.key);',
    '    const linked = queueUsers.filter((link) => link.user_auth_id === authUserId).map((link) => link.queue_key);',
    '    return linked.length > 0 ? linked : allowedQueuesFor(profile, authUserId);',
    '  }, [authUserId, effectiveQueues, manager, profile, queueUsers]);',
    '',
    '  function canViewLocal(conv: Conversation) {',
    '    if (manager) return true;',
    '    if (conv.assigned_to === authUserId) return true;',
    '    return allowedQueues.includes(queueFromConversation(conv));',
    '  }',
    '',
    '  function queueLabelLocal(value?: string | null) {',
    '    const normalized = String(value || "novos_contatos").toLowerCase();',
    '    return effectiveQueues.find((q) => q.key === normalized)?.label || queueLabel(value);',
    '  }',
    '',
    '  function queueColorLocal(value?: string | null) {',
    '    const normalized = String(value || "").toLowerCase();',
    '    return effectiveQueues.find((q) => q.key === normalized)?.color || queueColor(value);',
    '  }',
  ])
);

// loadQueues
if (!s.includes('async function loadQueuesConfig')) {
  s = s.replace(
    lines([
      '  async function loadUsers() {',
      '    const { data, error } = await supabase',
      '      .from("users")',
      '      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")',
      '      .eq("is_active", true)',
      '      .limit(500);',
      '',
      '    if (error) {',
      '      console.error("Erro ao carregar usuários:", error);',
      '      setUsers([]);',
      '      return;',
      '    }',
      '',
      '    setUsers((data || []) as UserProfile[]);',
      '  }',
    ]),
    lines([
      '  async function loadUsers() {',
      '    const { data, error } = await supabase',
      '      .from("users")',
      '      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")',
      '      .eq("is_active", true)',
      '      .limit(500);',
      '',
      '    if (error) {',
      '      console.error("Erro ao carregar usuários:", error);',
      '      setUsers([]);',
      '      return;',
      '    }',
      '',
      '    setUsers((data || []) as UserProfile[]);',
      '  }',
      '',
      '  async function loadQueuesConfig() {',
      '    const { data: queuesData, error: queuesError } = await supabase',
      '      .from("whatsapp_queues")',
      '      .select("key, label, color, sort_order, is_active")',
      '      .eq("is_active", true)',
      '      .order("sort_order", { ascending: true });',
      '',
      '    if (queuesError) {',
      '      console.warn("Filas configuráveis ainda não disponíveis. Rode sql/whatsapp_queues.sql no Supabase.", queuesError);',
      '      setQueuesConfig(QUEUES);',
      '      setQueueUsers([]);',
      '      return;',
      '    }',
      '',
      '    const nextQueues = ((queuesData || []) as QueueDef[]).length > 0 ? ((queuesData || []) as QueueDef[]) : QUEUES;',
      '    setQueuesConfig(nextQueues);',
      '    if (!nextQueues.some((q) => q.key === selectedQueueKey)) setSelectedQueueKey(nextQueues[0]?.key || "novos_contatos");',
      '',
      '    const { data: linksData, error: linksError } = await supabase',
      '      .from("whatsapp_queue_users")',
      '      .select("id, queue_key, user_auth_id");',
      '',
      '    if (linksError) {',
      '      console.warn("Vínculos de usuários às filas ainda não disponíveis.", linksError);',
      '      setQueueUsers([]);',
      '      return;',
      '    }',
      '',
      '    setQueueUsers((linksData || []) as QueueUserLink[]);',
      '  }',
    ])
  );
}

// Chama loadQueuesConfig no init
s = s.replace(
  lines([
    '      await loadAuth();',
    '      await loadUsers();',
    '      await loadConversations({ showLoading: true });',
  ]),
  lines([
    '      await loadAuth();',
    '      await loadUsers();',
    '      await loadQueuesConfig();',
    '      await loadConversations({ showLoading: true });',
  ])
);

// Funções de administração de filas
if (!s.includes('async function createQueue')) {
  const addEmojiBlock = lines([
    '  function addEmoji(emoji: string) {',
    '    setText((prev) => `${prev}${emoji}`);',
    '    setEmojiOpen(false);',
    '  }',
  ]);

  const queueFunctions = lines([
    '  function addEmoji(emoji: string) {',
    '    setText((prev) => `${prev}${emoji}`);',
    '    setEmojiOpen(false);',
    '  }',
    '',
    '  async function createQueue() {',
    '    if (!manager) return;',
    '    const label = newQueueName.trim();',
    '    const key = slugQueueName(label);',
    '    if (!label || !key) {',
    '      alert("Informe o nome da fila.");',
    '      return;',
    '    }',
    '',
    '    setSavingQueue(true);',
    '    const nextOrder = Math.max(0, ...effectiveQueues.map((q) => q.sort_order || 0)) + 10;',
    '    const { error } = await supabase.from("whatsapp_queues").upsert(',
    '      { key, label, color: C.navy, sort_order: nextOrder, is_active: true, updated_at: new Date().toISOString() },',
    '      { onConflict: "key" }',
    '    );',
    '    setSavingQueue(false);',
    '',
    '    if (error) {',
    '      console.error("Erro ao salvar fila:", error);',
    '      alert("Não foi possível salvar a fila. Confirme se o SQL das filas foi executado no Supabase.");',
    '      return;',
    '    }',
    '',
    '    setNewQueueName("");',
    '    setSelectedQueueKey(key);',
    '    await loadQueuesConfig();',
    '  }',
    '',
    '  function isUserLinkedToSelectedQueue(user: UserProfile) {',
    '    if (!user.auth_user_id) return false;',
    '    return queueUsers.some((link) => link.queue_key === selectedQueueKey && link.user_auth_id === user.auth_user_id);',
    '  }',
    '',
    '  async function toggleQueueUser(user: UserProfile) {',
    '    if (!manager || !user.auth_user_id || !selectedQueueKey) return;',
    '    const linked = isUserLinkedToSelectedQueue(user);',
    '    setSavingQueue(true);',
    '',
    '    if (linked) {',
    '      const { error } = await supabase',
    '        .from("whatsapp_queue_users")',
    '        .delete()',
    '        .eq("queue_key", selectedQueueKey)',
    '        .eq("user_auth_id", user.auth_user_id);',
    '      if (error) {',
    '        console.error("Erro ao remover usuário da fila:", error);',
    '        alert("Não foi possível remover o usuário da fila.");',
    '      }',
    '    } else {',
    '      const { error } = await supabase',
    '        .from("whatsapp_queue_users")',
    '        .insert({ queue_key: selectedQueueKey, user_auth_id: user.auth_user_id });',
    '      if (error) {',
    '        console.error("Erro ao vincular usuário à fila:", error);',
    '        alert("Não foi possível vincular o usuário à fila.");',
    '      }',
    '    }',
    '',
    '    setSavingQueue(false);',
    '    await loadQueuesConfig();',
    '  }',
  ]);

  s = s.replace(addEmojiBlock, queueFunctions);
}

// Substitui acessos para usar canViewLocal
s = s.replace(/canViewConversation\(c, profile, authUserId\)/g, 'canViewLocal(c)');
s = s.replace(/canViewConversation\(active, profile, authUserId\)/g, 'canViewLocal(active)');
s = s.replace(/canViewConversation\(conv, profile, authUserId\)/g, 'canViewLocal(conv)');

// Substitui labels/colors principais por versões dinâmicas em trechos mais usados
s = s.replace(/queueColor\(queue\)/g, 'queueColorLocal(queue)');
s = s.replace(/queueColor\(activeQueue\)/g, 'queueColorLocal(activeQueue)');
s = s.replace(/queueLabel\(queue\)/g, 'queueLabelLocal(queue)');
s = s.replace(/queueLabel\(activeQueue\)/g, 'queueLabelLocal(activeQueue)');

// transferQueues usa filas configuráveis
s = s.replace(
  lines([
    '  const transferQueues = useMemo(() => {',
    '    const list = manager ? QUEUES : QUEUES.filter((q) => allowedQueues.includes(q.key));',
    '    return list.filter((q) => q.key !== "finalizado" && q.key !== "novos_contatos");',
    '  }, [allowedQueues, manager]);',
  ]),
  lines([
    '  const transferQueues = useMemo(() => {',
    '    const list = manager ? effectiveQueues : effectiveQueues.filter((q) => allowedQueues.includes(q.key));',
    '    return list.filter((q) => q.key !== "finalizado" && q.key !== "novos_contatos");',
    '  }, [allowedQueues, effectiveQueues, manager]);',
  ])
);

// Insere painel de configuração das filas antes do grid principal
const gridAnchor = '      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">';
if (!s.includes('Configurar Filas do WhatsApp') && s.includes(gridAnchor)) {
  const panel = lines([
    '      {manager && (',
    '        <div className="mb-4 rounded-3xl border border-white/70 bg-white p-4 shadow-sm">',
    '          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">',
    '            <div>',
    '              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Permissões da Central</p>',
    '              <h2 className="text-xl font-bold" style={{ color: C.navy }}>Configurar Filas do WhatsApp</h2>',
    '              <p className="text-sm text-slate-500">Crie filas e vincule usuários. Quem não estiver vinculado não verá mensagens daquela fila, mesmo quando o atendimento estiver em “Novo”.</p>',
    '            </div>',
    '            <Button type="button" variant="outline" onClick={() => setQueueSettingsOpen((v) => !v)}>',
    '              {queueSettingsOpen ? "Ocultar configuração" : "Configurar filas"}',
    '            </Button>',
    '          </div>',
    '',
    '          {queueSettingsOpen && (',
    '            <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">',
    '              <div className="rounded-2xl bg-slate-50 p-3">',
    '                <label className="text-sm font-bold text-slate-700">Nome da Fila</label>',
    '                <div className="mt-2 flex gap-2">',
    '                  <input value={newQueueName} onChange={(e) => setNewQueueName(e.target.value)} placeholder="Ex.: Administrativo" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" />',
    '                  <Button type="button" onClick={createQueue} disabled={savingQueue}>Adicionar</Button>',
    '                </div>',
    '',
    '                <label className="mt-4 block text-sm font-bold text-slate-700">Fila para configurar</label>',
    '                <select value={selectedQueueKey} onChange={(e) => setSelectedQueueKey(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200">',
    '                  {effectiveQueues.filter((q) => q.key !== "finalizado").map((queue) => (',
    '                    <option key={queue.key} value={queue.key}>{queue.label}</option>',
    '                  ))}',
    '                </select>',
    '              </div>',
    '',
    '              <div className="rounded-2xl border p-3">',
    '                <div className="mb-3 flex items-center justify-between gap-2">',
    '                  <div>',
    '                    <p className="text-sm font-bold text-slate-800">Usuários Vinculados</p>',
    '                    <p className="text-xs text-slate-500">Marque quem pode visualizar e assumir atendimentos desta fila.</p>',
    '                  </div>',
    '                  {savingQueue && <Loader2 className="h-4 w-4 animate-spin" />}',
    '                </div>',
    '',
    '                <div className="grid max-h-72 gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">',
    '                  {users.map((user) => (',
    '                    <label key={user.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3 hover:bg-slate-50">',
    '                      <input type="checkbox" checked={isUserLinkedToSelectedQueue(user)} disabled={!user.auth_user_id || savingQueue} onChange={() => toggleQueueUser(user)} className="mt-1" />',
    '                      <span className="min-w-0">',
    '                        <span className="block truncate text-sm font-bold text-slate-800">{user.nome || user.email || "Usuário"}</span>',
    '                        <span className="block truncate text-xs text-slate-400">{user.email || user.auth_user_id || "Sem auth_user_id"}</span>',
    '                      </span>',
    '                    </label>',
    '                  ))}',
    '                </div>',
    '              </div>',
    '            </div>',
    '          )}',
    '        </div>',
    '      )}',
    '',
    gridAnchor,
  ]);

  s = s.replace(gridAnchor, panel);
}

fs.writeFileSync(p, s);
console.log('[patch-whatsapp-queues-admin] ok');
