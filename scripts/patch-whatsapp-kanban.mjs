import fs from 'node:fs';

const p = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('const [showKanban, setShowKanban]')) {
  s = s.replace(
    '  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});',
    '  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});\n  const [showKanban, setShowKanban] = useState(true);'
  );
}

if (!s.includes('const kanbanBoard = useMemo')) {
  s = s.replace(
    '  const filteredConversations = useMemo(() => {',
    '  const kanbanBoard = useMemo(() => {\n' +
      '    const openItems = visibleConversations.filter((conv) => !isClosed(conv));\n' +
      '    return QUEUES.filter((queue) => queue.key !== "finalizado").map((queue) => ({\n' +
      '      ...queue,\n' +
      '      items: openItems.filter((conv) => queueFromConversation(conv) === queue.key || (queue.key === "novos_contatos" && queueFromConversation(conv) === "entrada")),\n' +
      '    }));\n' +
      '  }, [visibleConversations]);\n\n' +
      '  const filteredConversations = useMemo(() => {'
  );
}

const anchor = '      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">';

if (!s.includes('Kanban de Atendimentos') && s.includes(anchor)) {
  const kanban = [
    '      <div className="mb-4 overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-sm backdrop-blur">',
    '        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">',
    '          <div>',
    '            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Fluxo operacional</p>',
    '            <h2 className="text-xl font-bold" style={{ color: C.navy }}>Kanban de Atendimentos</h2>',
    '            <p className="text-sm text-slate-500">Visão por etapa: novos, triagem, comercial, proposta, boleto, contemplação e pós-venda.</p>',
    '          </div>',
    '          <Button type="button" variant="outline" onClick={() => setShowKanban((v) => !v)} className="gap-2">',
    '            <KanbanSquare className="h-4 w-4" />',
    '            {showKanban ? "Ocultar Kanban" : "Mostrar Kanban"}',
    '          </Button>',
    '        </div>',
    '',
    '        {showKanban && (',
    '          <div className="flex gap-3 overflow-x-auto p-4">',
    '            {kanbanBoard.map((column) => (',
    '              <div key={column.key} className="min-w-[280px] max-w-[320px] flex-1 rounded-2xl border bg-slate-50/80 p-3">',
    '                <div className="mb-3 flex items-center justify-between gap-2">',
    '                  <div className="flex items-center gap-2">',
    '                    <span className="h-3 w-3 rounded-full" style={{ background: column.color }} />',
    '                    <p className="font-bold text-slate-800">{column.label}</p>',
    '                  </div>',
    '                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">{column.items.length}</span>',
    '                </div>',
    '',
    '                <div className="space-y-3">',
    '                  {column.items.length === 0 ? (',
    '                    <div className="rounded-2xl border border-dashed bg-white/70 p-4 text-center text-xs text-slate-400">Sem atendimentos</div>',
    '                  ) : (',
    '                    column.items.map((conv) => {',
    '                      const contact = conv.whatsapp_contacts;',
    '                      const selected = active?.id === conv.id;',
    '                      return (',
    '                        <button key={conv.id} type="button" onClick={() => setActive(conv)} className={"w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md " + (selected ? "ring-2 ring-red-900/30" : "")}>',
    '                          <div className="flex items-start justify-between gap-2">',
    '                            <div className="min-w-0">',
    '                              <p className="truncate text-sm font-bold text-slate-900">{contact?.nome || "Cliente WhatsApp"}</p>',
    '                              <p className="truncate text-xs text-slate-500">{formatPhoneBR(contact?.telefone || contact?.wa_id)}</p>',
    '                            </div>',
    '                            <span className="shrink-0 text-[11px] font-semibold text-slate-400">{fmtRelative(conv.last_message_at)}</span>',
    '                          </div>',
    '                          <p className="mt-2 line-clamp-2 text-xs text-slate-600">{conv.last_message || "Sem prévia"}</p>',
    '                          <div className="mt-3 flex flex-wrap items-center gap-1.5">',
    '                            <Badge variant="outline" className="text-[10px]">{makeTicketNumber(conv)}</Badge>',
    '                            {conv.unread_count > 0 && <Badge style={{ background: C.red, color: "white" }}>{conv.unread_count}</Badge>}',
    '                          </div>',
    '                        </button>',
    '                      );',
    '                    })',
    '                  )}',
    '                </div>',
    '              </div>',
    '            ))}',
    '          </div>',
    '        )}',
    '      </div>',
    '',
    anchor,
  ].join('\n');

  s = s.replace(anchor, kanban);
}

fs.writeFileSync(p, s);
console.log('[patch-whatsapp-kanban] ok');
