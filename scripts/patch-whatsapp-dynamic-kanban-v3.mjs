import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');
const r = (a, b) => { if (s.includes(a)) s = s.replace(a, b); };
const before = (needle, block, flag) => { if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle); };

before('function hasScope(profile: UserProfile | null, scope: string) {', `function slugQueueName(value: string) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}`, 'function slugQueueName');

r('  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});\n  const [boardQueue, setBoardQueue] = useState("novos_contatos");', `  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [queuesConfig, setQueuesConfig] = useState<any[]>([]);
  const [queueUsers, setQueueUsers] = useState<any[]>([]);
  const [kanbanModels, setKanbanModels] = useState<any[]>([]);
  const [kanbanColumns, setKanbanColumns] = useState<any[]>([]);
  const [queueSettingsOpen, setQueueSettingsOpen] = useState(false);
  const [selectedQueueKey, setSelectedQueueKey] = useState('');
  const [newQueueName, setNewQueueName] = useState('');
  const [selectedModelForQueue, setSelectedModelForQueue] = useState('');
  const [savingQueueConfig, setSavingQueueConfig] = useState(false);
  const [boardQueue, setBoardQueue] = useState('');`);

r(`  const allowedQueues = useMemo(() => allowedQueuesFor(profile, authUserId), [profile, authUserId]);
  const effectiveQueues = useMemo(() => {
    return QUEUES.filter((q) => manager || allowedQueues.includes(q.key));
  }, [allowedQueues, manager]);`, `  const effectiveQueues = useMemo(() => {
    const rows = [...queuesConfig].filter((q) => q.is_active !== false).sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100));
    if (manager) return rows;
    const linked = new Set(queueUsers.filter((l) => l.user_auth_id === authUserId).map((l) => l.queue_key));
    return rows.filter((q) => linked.has(q.key));
  }, [authUserId, manager, queueUsers, queuesConfig]);
  const allowedQueues = useMemo(() => effectiveQueues.map((q) => q.key), [effectiveQueues]);
  function canViewLocal(conv: Conversation) {
    return manager || conv.assigned_to === authUserId || allowedQueues.includes(queueFromConversation(conv));
  }`);

r('  const visibleConversations = useMemo(() => conversations.filter((conv) => canViewConversation(conv, profile, authUserId)), [authUserId, conversations, profile]);', '  const visibleConversations = useMemo(() => conversations.filter((conv) => canViewLocal(conv)), [allowedQueues, authUserId, conversations, manager]);');

before('  async function loadConversations(options?: { showLoading?: boolean; silent?: boolean }) {', `  async function loadQueuesConfig() {
    const { data: rows, error } = await supabase.from('whatsapp_queues').select('key,label,color,sort_order,is_active,kanban_model_id').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { console.warn('Erro ao carregar filas WhatsApp:', error); setQueuesConfig([]); setQueueUsers([]); return; }
    const queues = ((rows || []) as any[]).map((q) => ({ ...q, area: 'geral', color: q.color || C.navy }));
    setQueuesConfig(queues);
    if (queues.length > 0) {
      setBoardQueue((prev) => (prev && queues.some((q) => q.key === prev) ? prev : queues[0].key));
      setSelectedQueueKey((prev) => (prev && queues.some((q) => q.key === prev) ? prev : queues[0].key));
      setSelectedModelForQueue((prev) => prev || queues[0]?.kanban_model_id || '');
    }
    const { data: links } = await supabase.from('whatsapp_queue_users').select('id,queue_key,user_auth_id');
    setQueueUsers(links || []);
  }

  async function loadKanbanConfig() {
    const { data: models } = await supabase.from('whatsapp_kanban_models').select('id,name,description,is_active').eq('is_active', true).order('created_at', { ascending: true });
    setKanbanModels(models || []);
    const { data: cols } = await supabase.from('whatsapp_kanban_columns').select('id,model_id,key,label,color,sort_order,is_final,is_active').eq('is_active', true).order('sort_order', { ascending: true });
    setKanbanColumns(cols || []);
  }
`, 'async function loadQueuesConfig');

r('      await loadUsers();\n      await loadConversations({ showLoading: true });', '      await loadUsers();\n      await loadQueuesConfig();\n      await loadKanbanConfig();\n      await loadConversations({ showLoading: true });');

r(`  const ticketBoardItems = useMemo(() => {
    const queue = boardQueue || effectiveQueues[0]?.key || "";
    return visibleConversations.filter((conv) => !isClosed(conv) && queueFromConversation(conv) === queue);
  }, [boardQueue, effectiveQueues, visibleConversations]);`, `  const selectedBoardQueue = useMemo(() => effectiveQueues.find((q) => q.key === boardQueue) || effectiveQueues[0] || null, [boardQueue, effectiveQueues]);
  const boardColumns = useMemo(() => {
    const modelId = selectedBoardQueue?.kanban_model_id;
    const cols = modelId ? kanbanColumns.filter((c) => c.model_id === modelId) : [];
    return cols.length > 0 ? cols : TICKET_FALLBACK_COLUMNS;
  }, [kanbanColumns, selectedBoardQueue]);
  const ticketBoardItems = useMemo(() => {
    const queue = selectedBoardQueue?.key || '';
    return queue ? visibleConversations.filter((conv) => !isClosed(conv) && queueFromConversation(conv) === queue) : [];
  }, [selectedBoardQueue, visibleConversations]);`);

before('  async function startConversationFromCrm() {', `  function firstStageForQueue(queueKey: string) {
    const q = queuesConfig.find((item) => item.key === queueKey);
    const cols = q?.kanban_model_id ? kanbanColumns.filter((c) => c.model_id === q.kanban_model_id) : [];
    return cols[0]?.key || TICKET_FALLBACK_COLUMNS[0].key;
  }

  async function createQueueConfigured() {
    if (!manager) return;
    const label = newQueueName.trim();
    const key = slugQueueName(label);
    if (!label || !key) return alert('Informe o nome da fila.');
    setSavingQueueConfig(true);
    const nextOrder = Math.max(0, ...queuesConfig.map((q) => q.sort_order || 0)) + 10;
    const { error } = await supabase.from('whatsapp_queues').upsert({ key, label, color: C.navy, sort_order: nextOrder, is_active: true, kanban_model_id: selectedModelForQueue || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSavingQueueConfig(false);
    if (error) return alert('Não foi possível salvar a fila.');
    setNewQueueName(''); setSelectedQueueKey(key); setBoardQueue(key);
    await loadQueuesConfig();
  }

  function isUserLinkedToSelectedQueue(user: UserProfile) {
    return !!user.auth_user_id && queueUsers.some((link) => link.queue_key === selectedQueueKey && link.user_auth_id === user.auth_user_id);
  }

  async function toggleQueueUser(user: UserProfile) {
    if (!manager || !user.auth_user_id || !selectedQueueKey) return;
    setSavingQueueConfig(true);
    if (isUserLinkedToSelectedQueue(user)) await supabase.from('whatsapp_queue_users').delete().eq('queue_key', selectedQueueKey).eq('user_auth_id', user.auth_user_id);
    else await supabase.from('whatsapp_queue_users').insert({ queue_key: selectedQueueKey, user_auth_id: user.auth_user_id });
    setSavingQueueConfig(false);
    await loadQueuesConfig();
  }

  async function attachModelToSelectedQueue(modelId: string) {
    if (!manager || !selectedQueueKey) return;
    setSelectedModelForQueue(modelId);
    const { error } = await supabase.from('whatsapp_queues').update({ kanban_model_id: modelId || null, updated_at: new Date().toISOString() }).eq('key', selectedQueueKey);
    if (error) return alert('Não foi possível vincular o modelo à fila.');
    await loadQueuesConfig();
  }
`, 'function firstStageForQueue');

r('    const queue = boardQueue || effectiveQueues[0]?.key || "novos_contatos";', '    const queue = boardQueue || effectiveQueues[0]?.key || "";\n    if (!queue) return alert("Crie ou selecione uma fila antes de iniciar a conversa.");');
r('        ticket_stage_key: "novo",', '        ticket_stage_key: firstStageForQueue(queue),');

s = s.replace(/TICKET_FALLBACK_COLUMNS\.map/g, 'boardColumns.map');
s = s.replace(/conv\.ticket_stage_key \|\| "novo"/g, 'conv.ticket_stage_key || boardColumns[0]?.key || "novo"');
s = s.replace(/\(!conv\.ticket_stage_key && column\.key === "novo"\)/g, '(!conv.ticket_stage_key && column.key === boardColumns[0]?.key)');

r('<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>', '<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>{manager && <Button variant="outline" onClick={() => setQueueSettingsOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">Configurar filas</Button>}');

r('<div className="grid gap-2 md:grid-cols-2">', '<div className="grid gap-2 md:grid-cols-3"><select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">{effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>');

before('          {startTicketOpen && (', `          {manager && queueSettingsOpen && (
            <div className="rounded-2xl border bg-slate-50 p-3">
              <p className="mb-3 text-sm font-bold text-slate-800">Configurar filas</p>
              <div className="grid gap-2 md:grid-cols-3">
                <input value={newQueueName} onChange={(e) => setNewQueueName(e.target.value)} placeholder="Nome da fila" className="rounded-xl border px-3 py-2 text-sm" />
                <select value={selectedModelForQueue} onChange={(e) => setSelectedModelForQueue(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="">Modelo Kanban</option>{kanbanModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                <Button onClick={createQueueConfigured} disabled={savingQueueConfig}>Criar fila</Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[260px_1fr]">
                <select value={selectedQueueKey} onChange={(e) => { const key = e.target.value; const q = queuesConfig.find((item) => item.key === key); setSelectedQueueKey(key); setSelectedModelForQueue(q?.kanban_model_id || ""); }} className="rounded-xl border px-3 py-2 text-sm">{queuesConfig.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>
                <div className="flex flex-wrap gap-2">{users.map((user) => <label key={user.id} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs"><input type="checkbox" checked={isUserLinkedToSelectedQueue(user)} disabled={!user.auth_user_id || savingQueueConfig} onChange={() => toggleQueueUser(user)} />{user.nome || user.email || "Usuário"}</label>)}</div>
              </div>
              <div className="mt-2 flex justify-end"><Button variant="outline" onClick={() => attachModelToSelectedQueue(selectedModelForQueue)} disabled={!selectedQueueKey}>Vincular modelo à fila selecionada</Button></div>
            </div>
          )}
`, 'Configurar filas</p>');

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-dynamic-kanban-v3] ok');
