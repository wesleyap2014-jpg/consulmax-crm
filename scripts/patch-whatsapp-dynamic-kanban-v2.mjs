import fs from 'node:fs';
const p='src/pages/AtendimentoWhatsApp.tsx';
let s=fs.readFileSync(p,'utf8');
const r=(a,b)=>{if(s.includes(a))s=s.replace(a,b)};

// Tipos e estados dinâmicos
r('  const [boardQueue, setBoardQueue] = useState("novos_contatos");\n  const [startTicketOpen, setStartTicketOpen] = useState(false);',
`  const [queuesConfig, setQueuesConfig] = useState<any[]>([]);
  const [queueUsers, setQueueUsers] = useState<any[]>([]);
  const [kanbanModels, setKanbanModels] = useState<any[]>([]);
  const [kanbanColumns, setKanbanColumns] = useState<any[]>([]);
  const [boardQueue, setBoardQueue] = useState("");
  const [queueSettingsOpen, setQueueSettingsOpen] = useState(false);
  const [selectedQueueKey, setSelectedQueueKey] = useState("");
  const [newQueueName, setNewQueueName] = useState("");
  const [selectedModelForQueue, setSelectedModelForQueue] = useState("");
  const [savingQueueConfig, setSavingQueueConfig] = useState(false);
  const [startTicketOpen, setStartTicketOpen] = useState(false);`);

if(!s.includes('function slugQueueName')) r('function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}',`function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\\D/g, "");
}
function slugQueueName(value: string) {
  return String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);
}`);

// Filas visíveis = apenas filas do Supabase que o usuário tem acesso
r(`  const allowedQueues = useMemo(() => allowedQueuesFor(profile, authUserId), [profile, authUserId]);
  const effectiveQueues = useMemo(() => {
    return QUEUES.filter((q) => manager || allowedQueues.includes(q.key));
  }, [allowedQueues, manager]);`,
`  const effectiveQueues = useMemo(() => {
    const sorted=[...queuesConfig].filter(q=>q.is_active!==false).sort((a,b)=>(a.sort_order||100)-(b.sort_order||100));
    if(manager) return sorted;
    const linked=new Set(queueUsers.filter(l=>l.user_auth_id===authUserId).map(l=>l.queue_key));
    return sorted.filter(q=>linked.has(q.key));
  }, [authUserId, manager, queueUsers, queuesConfig]);
  const allowedQueues = useMemo(() => effectiveQueues.map(q=>q.key), [effectiveQueues]);
  function canViewLocal(conv: Conversation) {
    if(manager) return true;
    if(conv.assigned_to===authUserId) return true;
    return allowedQueues.includes(queueFromConversation(conv));
  }`);

// Loaders
if(!s.includes('async function loadQueuesConfig')) r(`  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")
      .eq("is_active", true)
      .limit(500);

    if (error) {
      console.error("Erro ao carregar usuários:", error);
      setUsers([]);
      return;
    }

    setUsers((data || []) as UserProfile[]);
  }`, `  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")
      .eq("is_active", true)
      .limit(500);
    if (error) { console.error("Erro ao carregar usuários:", error); setUsers([]); return; }
    setUsers((data || []) as UserProfile[]);
  }
  async function loadQueuesConfig() {
    const { data:qData, error:qError } = await supabase.from("whatsapp_queues").select("key,label,color,sort_order,is_active,kanban_model_id").eq("is_active", true).order("sort_order", { ascending:true });
    if(qError){ console.warn("Erro ao carregar filas WhatsApp:", qError); setQueuesConfig([]); setQueueUsers([]); return; }
    const rows=(qData||[]).map((q:any)=>({...q, area:'geral', color:q.color||C.navy}));
    setQueuesConfig(rows);
    if(rows.length){ setBoardQueue(prev=>prev&&rows.some((q:any)=>q.key===prev)?prev:rows[0].key); setSelectedQueueKey(prev=>prev&&rows.some((q:any)=>q.key===prev)?prev:rows[0].key); setSelectedModelForQueue(prev=>prev||rows[0]?.kanban_model_id||""); }
    const { data:linksData } = await supabase.from("whatsapp_queue_users").select("id,queue_key,user_auth_id");
    setQueueUsers(linksData||[]);
  }
  async function loadKanbanConfig() {
    const { data:modelsData } = await supabase.from("whatsapp_kanban_models").select("id,name,description,is_active").eq("is_active", true).order("created_at", { ascending:true });
    setKanbanModels(modelsData||[]);
    const { data:columnsData } = await supabase.from("whatsapp_kanban_columns").select("id,model_id,key,label,color,sort_order,is_final,is_active").eq("is_active", true).order("sort_order", { ascending:true });
    setKanbanColumns(columnsData||[]);
  }`);

r('      await loadAuth();\n      await loadUsers();\n      await loadConversations({ showLoading: true });','      await loadAuth();\n      await loadUsers();\n      await loadQueuesConfig();\n      await loadKanbanConfig();\n      await loadConversations({ showLoading: true });');
r('  const visibleConversations = useMemo(() => conversations.filter((conv) => canViewConversation(conv, profile, authUserId)), [authUserId, conversations, profile]);','  const visibleConversations = useMemo(() => conversations.filter((conv) => canViewLocal(conv)), [allowedQueues, authUserId, conversations, manager]);');

// Colunas do modelo vinculado à fila selecionada
r(`  const ticketBoardItems = useMemo(() => {
    const queue = boardQueue || effectiveQueues[0]?.key || "";
    return visibleConversations.filter((conv) => !isClosed(conv) && queueFromConversation(conv) === queue);
  }, [boardQueue, effectiveQueues, visibleConversations]);`, `  const selectedBoardQueue = useMemo(() => effectiveQueues.find(q=>q.key===boardQueue)||effectiveQueues[0]||null, [boardQueue,effectiveQueues]);
  const selectedBoardModelId = selectedBoardQueue?.kanban_model_id || null;
  const boardColumns = useMemo(() => {
    const cols = selectedBoardModelId ? kanbanColumns.filter(c=>c.model_id===selectedBoardModelId) : [];
    return cols.length ? cols : TICKET_FALLBACK_COLUMNS;
  }, [kanbanColumns, selectedBoardModelId]);
  const ticketBoardItems = useMemo(() => {
    const queue=selectedBoardQueue?.key||"";
    if(!queue) return [] as Conversation[];
    return visibleConversations.filter((conv)=>!isClosed(conv)&&queueFromConversation(conv)===queue);
  }, [selectedBoardQueue, visibleConversations]);`);

// Funções de configuração e troca de fila
if(!s.includes('async function updateTicketQueue')) r(`  async function updateTicketStage(conversationId: string, stageKey: string) {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ ticket_stage_key: stageKey, updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (error) {
      console.error("Erro ao mover ticket:", error);
      alert("Não foi possível mover o ticket. Confirme se o SQL de ticket_stage_key foi executado.");
      return;
    }
    await loadConversations({ silent: true });
  }`, `  function firstStageForQueue(queueKey:string){ const q=queuesConfig.find(x=>x.key===queueKey); const cols=q?.kanban_model_id?kanbanColumns.filter(c=>c.model_id===q.kanban_model_id):[]; return cols[0]?.key || TICKET_FALLBACK_COLUMNS[0].key; }
  async function updateTicketStage(conversationId: string, stageKey: string) {
    const { error } = await supabase.from("whatsapp_conversations").update({ ticket_stage_key: stageKey, updated_at: new Date().toISOString() }).eq("id", conversationId);
    if (error) { console.error("Erro ao mover ticket:", error); alert("Não foi possível mover o ticket."); return; }
    await loadConversations({ silent: true });
  }
  async function updateTicketQueue(conversationId:string, queueKey:string){ const {error}=await supabase.from("whatsapp_conversations").update({queue:queueKey,stage:queueKey,ticket_stage_key:firstStageForQueue(queueKey),updated_at:new Date().toISOString()}).eq("id",conversationId); if(error) return alert("Não foi possível alterar a fila do ticket."); await loadConversations({silent:true}); }
  async function createQueueConfigured(){ if(!manager) return; const label=newQueueName.trim(); const key=slugQueueName(label); if(!label||!key) return alert("Informe o nome da fila."); setSavingQueueConfig(true); const nextOrder=Math.max(0,...queuesConfig.map(q=>q.sort_order||0))+10; const {error}=await supabase.from("whatsapp_queues").upsert({key,label,color:C.navy,sort_order:nextOrder,is_active:true,kanban_model_id:selectedModelForQueue||null,updated_at:new Date().toISOString()},{onConflict:"key"}); setSavingQueueConfig(false); if(error) return alert("Não foi possível salvar a fila."); setNewQueueName(""); setSelectedQueueKey(key); await loadQueuesConfig(); }
  function isUserLinkedToSelectedQueue(user:UserProfile){ return !!user.auth_user_id && queueUsers.some(l=>l.queue_key===selectedQueueKey && l.user_auth_id===user.auth_user_id); }
  async function toggleQueueUser(user:UserProfile){ if(!manager||!user.auth_user_id||!selectedQueueKey) return; setSavingQueueConfig(true); if(isUserLinkedToSelectedQueue(user)) await supabase.from("whatsapp_queue_users").delete().eq("queue_key",selectedQueueKey).eq("user_auth_id",user.auth_user_id); else await supabase.from("whatsapp_queue_users").insert({queue_key:selectedQueueKey,user_auth_id:user.auth_user_id}); setSavingQueueConfig(false); await loadQueuesConfig(); }
  async function attachModelToSelectedQueue(modelId:string){ if(!manager||!selectedQueueKey) return; setSelectedModelForQueue(modelId); const {error}=await supabase.from("whatsapp_queues").update({kanban_model_id:modelId||null,updated_at:new Date().toISOString()}).eq("key",selectedQueueKey); if(error) return alert("Não foi possível vincular o modelo à fila."); await loadQueuesConfig(); }`);

// Ajustes da UI
r('ticket_stage_key: "novo",','ticket_stage_key: firstStageForQueue(queue),');
r('const queue = boardQueue || effectiveQueues[0]?.key || "novos_contatos";','const queue = boardQueue || effectiveQueues[0]?.key || "";\n    if (!queue) return alert("Crie ou selecione uma fila antes de iniciar a conversa.");');
r('<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>','<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>{manager && <Button variant="outline" onClick={() => setQueueSettingsOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">Configurar filas</Button>}');
r('<div className="grid gap-2 md:grid-cols-2">','<div className="grid gap-2 md:grid-cols-3"><select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">{effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>');
s=s.replace(/TICKET_FALLBACK_COLUMNS\.map/g,'boardColumns.map');
s=s.replace(/column\.color/g,'(column.color || C.navy)');
s=s.replace(/conv\.ticket_stage_key \|\| "novo"/g,'conv.ticket_stage_key || boardColumns[0]?.key || "novo"');
s=s.replace(/\(!conv\.ticket_stage_key && column\.key === "novo"\)/g,'(!conv.ticket_stage_key && column.key === boardColumns[0]?.key)');
r('</select></div>','</select></div><select value={queueFromConversation(conv)} onChange={(e) => updateTicketQueue(conv.id, e.target.value)} className="mt-2 w-full rounded-lg border px-2 py-1 text-xs">{effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>');

// Overlay de configuração
if(!s.includes('Configurar filas</h2>')) r('<Card className="mb-4 overflow-hidden border-0 shadow-sm">', `<>{manager && queueSettingsOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Central WhatsApp</p><h2 className="text-2xl font-black" style={{color:C.navy}}>Configurar filas</h2><p className="text-sm text-slate-500">Crie a fila, escolha o modelo Kanban e vincule os usuários que terão acesso.</p></div><Button variant="outline" onClick={()=>setQueueSettingsOpen(false)}>Fechar</Button></div><div className="grid gap-4 lg:grid-cols-[360px_1fr]"><div className="space-y-3 rounded-2xl bg-slate-50 p-4"><label className="text-sm font-bold text-slate-700">Nome da fila</label><input value={newQueueName} onChange={(e)=>setNewQueueName(e.target.value)} placeholder="Ex.: Contemplação" className="w-full rounded-xl border px-3 py-2 text-sm"/><label className="text-sm font-bold text-slate-700">Modelo do Kanban</label><select value={selectedModelForQueue} onChange={(e)=>setSelectedModelForQueue(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="">Selecione o modelo</option>{kanbanModels.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</select><Button onClick={createQueueConfigured} disabled={savingQueueConfig} className="w-full">Criar/atualizar fila</Button><label className="text-sm font-bold text-slate-700">Fila para configurar</label><select value={selectedQueueKey} onChange={(e)=>{const key=e.target.value;const q=queuesConfig.find(x=>x.key===key);setSelectedQueueKey(key);setSelectedModelForQueue(q?.kanban_model_id||"");}} className="w-full rounded-xl border px-3 py-2 text-sm">{queuesConfig.map((q)=><option key={q.key} value={q.key}>{q.label}</option>)}</select><Button variant="outline" onClick={()=>attachModelToSelectedQueue(selectedModelForQueue)} disabled={!selectedQueueKey} className="w-full">Vincular modelo à fila selecionada</Button></div><div className="rounded-2xl border p-4"><p className="text-sm font-bold text-slate-800">Usuários vinculados</p><p className="mb-3 text-xs text-slate-500">Somente usuários marcados verão os tickets dessa fila.</p><div className="grid max-h-[420px] gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">{users.map((user)=><label key={user.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3 hover:bg-slate-50"><input type="checkbox" checked={isUserLinkedToSelectedQueue(user)} disabled={!user.auth_user_id||savingQueueConfig} onChange={()=>toggleQueueUser(user)} className="mt-1"/><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{user.nome||user.email||"Usuário"}</span><span className="block truncate text-xs text-slate-400">{user.email||user.auth_user_id||"Sem auth_user_id"}</span></span></label>)}</div></div></div></div></div>}<Card className="mb-4 overflow-hidden border-0 shadow-sm">`);

fs.writeFileSync(p,s);
console.log('[patch-whatsapp-dynamic-kanban-v2] ok');
