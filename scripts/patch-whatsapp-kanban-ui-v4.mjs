import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

function replaceAll(a, b) {
  s = s.split(a).join(b);
}

function replaceOnce(a, b) {
  if (s.includes(a)) s = s.replace(a, b);
}

function insertBefore(needle, block, flag) {
  if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle);
}

// 1) Conversa vira gaveta lateral. A lista antiga de conversas fica escondida,
// porque agora a operação acontece pelo Kanban.
const gridOld = '      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">';
const gridNew = '      <div className={active ? "fixed inset-y-0 right-0 z-40 flex w-[min(780px,96vw)] flex-col bg-white shadow-2xl ring-1 ring-slate-200" : "hidden"}>';
replaceOnce(gridOld, gridNew);

const gridIndex = s.indexOf(gridNew);
if (gridIndex >= 0) {
  const firstCard = s.indexOf('<Card className="overflow-hidden border-0 shadow-sm">', gridIndex);
  if (firstCard >= 0) {
    s = s.slice(0, firstCard) + '<Card className="hidden">' + s.slice(firstCard + '<Card className="overflow-hidden border-0 shadow-sm">'.length);
    const secondCard = s.indexOf('<Card className="overflow-hidden border-0 shadow-sm">', firstCard + 1);
    if (secondCard >= 0) {
      s = s.slice(0, secondCard) + '<Card className="flex h-full min-h-screen flex-col overflow-hidden rounded-none border-0 shadow-none">' + s.slice(secondCard + '<Card className="overflow-hidden border-0 shadow-sm">'.length);
    }
  }
}

replaceOnce(
  '<CardContent className="flex h-[calc(100vh-335px)] min-h-[520px] flex-col p-0">',
  '<CardContent className="flex h-[calc(100vh-250px)] min-h-0 flex-1 flex-col p-0">'
);

// Botão de fechar gaveta lateral.
replaceOnce(
  '{!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}',
  '<Button variant="ghost" onClick={() => setActive(null)} className="text-xl leading-none">×</Button>\n                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}'
);

// 2) Remove visualmente a área de mover por botões antigos dentro da conversa.
replaceOnce(
  '<div className="mt-4 flex flex-wrap gap-2 border-t pt-4">',
  '<div className="hidden">'
);

// 3) Cards do Kanban mais bonitos + notificação de mensagens não lidas.
replaceAll(
  '<div key={conv.id} className="rounded-2xl border bg-white p-3 shadow-sm">',
  '<div key={conv.id} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{conv.unread_count > 0 && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-black text-white" style={{ background: C.red }}>{conv.unread_count}</span>}'
);
replaceAll(
  '<p className="mt-2 line-clamp-2 text-xs text-slate-600">{conv.last_message || "Sem prévia"}</p>',
  '<p className="mt-3 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{conv.last_message || "Sem prévia"}</p>'
);

// 4) Comercial: indicadores visuais para ganho/perdido acima do Kanban.
insertBefore(
  '          <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">',
  `          {String(selectedBoardQueue?.label || "").toLowerCase().includes("comercial") && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fechado ganho</p>
                <p className="mt-1 text-3xl font-black" style={{ color: C.green }}>{ticketBoardItems.filter((conv) => conv.ticket_stage_key === "fechado_ganho").length}</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ background: C.green, width: Math.min(100, ticketBoardItems.length ? (ticketBoardItems.filter((conv) => conv.ticket_stage_key === "fechado_ganho").length / ticketBoardItems.length) * 100 : 0) + "%" }} /></div>
              </div>
              <div className="rounded-3xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fechado perdido</p>
                <p className="mt-1 text-3xl font-black" style={{ color: C.red }}>{ticketBoardItems.filter((conv) => conv.ticket_stage_key === "fechado_perdido").length}</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ background: C.red, width: Math.min(100, ticketBoardItems.length ? (ticketBoardItems.filter((conv) => conv.ticket_stage_key === "fechado_perdido").length / ticketBoardItems.length) * 100 : 0) + "%" }} /></div>
              </div>
              <div className="rounded-3xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tickets ativos</p>
                <p className="mt-1 text-3xl font-black" style={{ color: C.navy }}>{ticketBoardItems.filter((conv) => !["fechado_ganho", "fechado_perdido"].includes(String(conv.ticket_stage_key || ""))).length}</p>
                <p className="mt-2 text-xs text-slate-500">Em andamento no funil comercial.</p>
              </div>
              <div className="rounded-3xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total no quadro</p>
                <p className="mt-1 text-3xl font-black" style={{ color: C.gold }}>{ticketBoardItems.length}</p>
                <p className="mt-2 text-xs text-slate-500">Base para leitura do Kanban.</p>
              </div>
            </div>
          )}`,
  'Fechado ganho</p>'
);

// 5) Botões mais claros na faixa superior.
replaceAll('Central de Tickets em Kanban', 'Central de Atendimento por Kanban');
replaceAll('Cada conversa vira um ticket. Clique no card para abrir o histórico ao lado.', 'Cada conversa vira um ticket. Clique no card para abrir a conversa na lateral.');

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-kanban-ui-v4] ok');
