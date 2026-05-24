import fs from 'node:fs';

const p = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(p, 'utf8');

function rep(a,b){ if(s.includes(a)) s=s.replace(a,b); }
function between(start,end,repl){ const a=s.indexOf(start); const b=s.indexOf(end,a+start.length); if(a>=0&&b>=0) s=s.slice(0,a)+repl+s.slice(b); }

rep('  priority: string;\n  last_message: string | null;', '  priority: string;\n  ticket_stage_key?: string | null;\n  ticket_priority?: string | null;\n  ticket_due_at?: string | null;\n  ticket_notes?: string | null;\n  last_message: string | null;');

if(!s.includes('const [boardQueue, setBoardQueue]')){
  rep('  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});', '  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});\n  const [boardQueue, setBoardQueue] = useState("novos_contatos");\n  const [startOpen, setStartOpen] = useState(false);\n  const [startName, setStartName] = useState("");\n  const [startPhone, setStartPhone] = useState("");\n  const [startMessage, setStartMessage] = useState("");');
}

if(!s.includes('const TICKET_FALLBACK_COLUMNS')){
  rep('const EVALUATION_MESSAGE =\n  "Atendimento finalizado ✅', 'const TICKET_FALLBACK_COLUMNS = [\n  { key: "novo", label: "Novo", color: C.red },\n  { key: "em_atendimento", label: "Em atendimento", color: C.navy },\n  { key: "aguardando_cliente", label: "Aguardando cliente", color: C.gold },\n  { key: "concluido", label: "Concluído", color: C.green },\n];\n\nconst EVALUATION_MESSAGE =\n  "Atendimento finalizado ✅');
}

if(!s.includes('async function updateTicketStage')){
  rep('  function addEmoji(emoji: string) {\n    setText((prev) => `${prev}${emoji}`);\n    setEmojiOpen(false);\n  }', '  function addEmoji(emoji: string) {\n    setText((prev) => `${prev}${emoji}`);\n    setEmojiOpen(false);\n  }\n\n  async function updateTicketStage(conversationId: string, stageKey: string) {\n    const { error } = await supabase.from("whatsapp_conversations").update({ ticket_stage_key: stageKey, updated_at: new Date().toISOString() }).eq("id", conversationId);\n    if (error) return alert("Não foi possível mover o ticket. Rode o SQL de Kanban no Supabase.");\n    await loadConversations({ silent: true });\n  }\n\n  async function startConversationFromCrm() {\n    const phone = onlyDigits(startPhone);\n    if (!phone) return alert("Informe o telefone do cliente.");\n    const queue = boardQueue || effectiveQueues[0]?.key || "novos_contatos";\n    const now = new Date().toISOString();\n    const name = startName.trim() || "Cliente WhatsApp";\n    const { data: contact, error: contactError } = await supabase.from("whatsapp_contacts").upsert({ wa_id: phone, telefone: phone, nome: name, updated_at: now }, { onConflict: "wa_id" }).select("id").single();\n    if (contactError || !contact?.id) return alert("Não foi possível criar/localizar o contato.");\n    const { data: conv, error: convError } = await supabase.from("whatsapp_conversations").insert({ contact_id: contact.id, status: "humano", stage: queue, queue, ticket_stage_key: "novo", assigned_to: authUserId, assigned_at: now, last_message: startMessage.trim() || "Ticket criado no CRM", last_message_at: now, unread_count: 0 }).select("*").single();\n    if (convError || !conv?.id) return alert("Não foi possível criar o ticket/conversa.");\n    if (startMessage.trim()) {\n      const response = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, to: phone, body: startMessage.trim(), user_id: authUserId }) });\n      const result = await response.json();\n      if (!response.ok || !result?.ok) alert("Ticket criado, mas a Meta recusou o envio. Talvez precise de template aprovado se o cliente não falou nas últimas 24h.");\n    }\n    setStartName(""); setStartPhone(""); setStartMessage(""); setStartOpen(false);\n    await loadConversations({ silent: true });\n  }');
}

if(!s.includes('const ticketBoardItems = useMemo')){
  rep('  const filteredConversations = useMemo(() => {', '  const ticketBoardItems = useMemo(() => visibleConversations.filter((conv) => !isClosed(conv) && queueFromConversation(conv) === boardQueue), [boardQueue, visibleConversations]);\n\n  const filteredConversations = useMemo(() => {');
}

const start = '        <Card className="overflow-hidden border-0 shadow-sm">';
const end = '        <Card className="overflow-hidden border-0 shadow-sm">\n          {!active ? (';
if(!s.includes('Tickets por Kanban')){
const card = `        <Card className="overflow-hidden border-0 shadow-sm">
          <CardHeader className="border-b p-4" style={{ background: 'linear-gradient(135deg, '+C.navy+', '+C.red+')', color: "white" }}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg"><KanbanSquare className="h-5 w-5" />Tickets por Kanban</CardTitle>
                <p className="mt-1 text-sm text-white/80">Cada card é um atendimento/ticket. Clique para abrir a conversa.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStartOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>
                {manager && <Button variant="outline" onClick={() => setQueueSettingsOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">Configurar filas</Button>}
                <Button variant="outline" onClick={() => loadConversations()} disabled={refreshing} className="h-9 gap-2 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {startOpen && (
              <div className="rounded-2xl border bg-slate-50 p-3">
                <p className="mb-3 text-sm font-bold text-slate-800">Iniciar conversa / criar ticket</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={startName} onChange={(e) => setStartName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-2 text-sm" />
                  <input value={startPhone} onChange={(e) => setStartPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-2 text-sm" />
                </div>
                <textarea value={startMessage} onChange={(e) => setStartMessage(e.target.value)} placeholder="Mensagem inicial. Fora da janela de 24h, a Meta pode exigir template aprovado." className="mt-2 min-h-[72px] w-full rounded-xl border px-3 py-2 text-sm" />
                <div className="mt-2 flex justify-end"><Button type="button" onClick={startConversationFromCrm}>Criar e enviar</Button></div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {effectiveQueues.length === 0 ? <Badge variant="outline">Crie uma fila em Configurar</Badge> : effectiveQueues.map((q) => <Button key={q.key} size="sm" variant={boardQueue === q.key ? "default" : "outline"} onClick={() => setBoardQueue(q.key)} style={boardQueue === q.key ? { background: q.color } : undefined}>{q.label}</Button>)}
            </div>
            <div className="flex min-h-[520px] gap-3 overflow-x-auto pb-2">
              {TICKET_FALLBACK_COLUMNS.map((column) => {
                const colItems = ticketBoardItems.filter((conv) => (conv.ticket_stage_key || "novo") === column.key || (!conv.ticket_stage_key && column.key === "novo"));
                return (
                  <div key={column.key} className="min-w-[300px] max-w-[340px] flex-1 rounded-3xl border bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: column.color }} /><p className="font-bold text-slate-800">{column.label}</p></div><span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500">{colItems.length}</span></div>
                    <div className="space-y-3">
                      {colItems.length === 0 ? <div className="rounded-2xl border border-dashed bg-white/70 p-4 text-center text-xs text-slate-400">Sem tickets</div> : colItems.map((conv) => {
                        const contact = conv.whatsapp_contacts;
                        return <div key={conv.id} className="rounded-2xl border bg-white p-3 shadow-sm"><button type="button" onClick={() => setActive(conv)} className="w-full text-left"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{contact?.nome || "Cliente WhatsApp"}</p><p className="truncate text-xs text-slate-500">{formatPhoneBR(contact?.telefone || contact?.wa_id)}</p></div><span className="text-[11px] font-semibold text-slate-400">{fmtRelative(conv.last_message_at)}</span></div><p className="mt-2 line-clamp-2 text-xs text-slate-600">{conv.last_message || "Sem prévia"}</p></button><div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline" className="text-[10px]">{makeTicketNumber(conv)}</Badge><select value={conv.ticket_stage_key || "novo"} onChange={(e) => updateTicketStage(conv.id, e.target.value)} className="max-w-[150px] rounded-lg border px-2 py-1 text-xs">{TICKET_FALLBACK_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div></div>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

`+end;
between(start,end,card);
}

rep('      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">','      <div className="grid gap-4 xl:grid-cols-[minmax(720px,1.35fr)_minmax(420px,0.8fr)]">');

fs.writeFileSync(p,s);
console.log('[patch-whatsapp-ticket-kanban] ok');
