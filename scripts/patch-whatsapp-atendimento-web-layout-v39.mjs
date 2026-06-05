import fs from "node:fs";

const marker = "patch-whatsapp-atendimento-web-layout-v39";
const file = "src/pages/AtendimentoWhatsApp.tsx";

let src = fs.readFileSync(file, "utf8");

if (src.includes(marker)) {
  console.log(`${marker}: already applied`);
  process.exit(0);
}

function replaceOrLog(search, replace, label) {
  if (!src.includes(search)) {
    console.log(`${marker}: ${label}: trecho não encontrado`);
    return;
  }
  src = src.replace(search, replace);
  console.log(`${marker}: ${label}: aplicado`);
}

replaceOrLog(
  '  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");',
  '  // patch-whatsapp-atendimento-web-layout-v39\n  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "relatorios">("todos");',
  "tipo boardArea"
);

replaceOrLog(
  '    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;',
  '    if (boardArea === "relatorios") return [];\n    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;',
  "boardQueues relatorios"
);

replaceOrLog(
  '              <Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">\n                <Megaphone className="mr-2 h-4 w-4" />\n                Campanhas\n              </Button>\n',
  '',
  "remover botão campanhas"
);

replaceOrLog(
  '              {(["todos", "geral", "comercial", "operacional"] as const).map((area) => (',
  '              {(["todos", "comercial", "operacional", "relatorios"] as const).map((area) => (',
  "abas"
);

replaceOrLog(
  '                  {area === "todos" ? "Todas" : area.charAt(0).toUpperCase() + area.slice(1)}',
  '                  {area === "todos" ? "Todos" : area === "relatorios" ? "Relatórios" : area.charAt(0).toUpperCase() + area.slice(1)}',
  "labels"
);

replaceOrLog(
  '      <div className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl">',
  '      <div className={boardArea === "todos" ? "flex min-h-[68vh] flex-col overflow-hidden rounded-3xl border bg-white shadow-sm" : "fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl"}>',
  "drawer inline quando todos"
);

replaceOrLog(
  '      <ConversationDrawer />',
  '      {boardArea !== "todos" && <ConversationDrawer />}',
  "drawer global condicional"
);

const newBody = `      {loading ? (
        <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : boardArea === "relatorios" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Conversas abertas</p>
              <p className="mt-2 text-3xl font-black" style={{ color: C.red }}>{counts.abertos}</p>
              <p className="mt-1 text-sm text-slate-500">Atendimentos em andamento</p>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Novos contatos</p>
              <p className="mt-2 text-3xl font-black" style={{ color: C.gold }}>{counts.novos}</p>
              <p className="mt-1 text-sm text-slate-500">Aguardando assumir</p>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Meus atendimentos</p>
              <p className="mt-2 text-3xl font-black" style={{ color: C.navy }}>{counts.meus}</p>
              <p className="mt-1 text-sm text-slate-500">Responsáveis por você</p>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Finalizados</p>
              <p className="mt-2 text-3xl font-black text-emerald-700">{counts.finalizados}</p>
              <p className="mt-1 text-sm text-slate-500">Tickets encerrados</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Conversão comercial</p>
              <p className="mt-2 text-3xl font-black text-amber-700">{commercialSummary.winRate}%</p>
              <p className="mt-1 text-sm text-slate-500">Ganho / total fechado</p>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Fechados ganho</p>
              <p className="mt-2 text-3xl font-black text-emerald-700">{commercialSummary.won}</p>
              <p className="mt-1 text-sm text-slate-500">Comercial convertido</p>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Fechados perdido</p>
              <p className="mt-2 text-3xl font-black text-slate-600">{commercialSummary.lost}</p>
              <p className="mt-1 text-sm text-slate-500">Comercial perdido</p>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">Indicadores de qualidade em implantação</h3>
            <p className="mt-1 text-sm text-slate-500">Estes indicadores exigem campos de SLA/eventos no banco. A estrutura visual já fica pronta para receber os dados.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                "Custo com abertura de conversas",
                "Tempo até primeira resposta",
                "Tempo médio de ticket aberto",
                "Volume por fila",
                "Tickets por usuário",
                "Avaliação do cliente",
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : boardArea === "todos" ? (
        <div className="grid min-h-[72vh] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[390px_1fr]">
          <div className="flex min-h-[72vh] flex-col border-r bg-white">
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">WhatsApp</h3>
                  <p className="text-xs text-slate-500">Todas as conversas em formato lista</p>
                </div>
                <Badge variant="secondary">{boardConversations.length}</Badge>
              </div>
              <div className="mt-3 flex gap-2">
                {["Tudo", "Não lidas", "Novos", "Meus"].map((chip) => (
                  <span key={chip} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{chip}</span>
                ))}
              </div>
            </div>
            <div className="max-h-[72vh] flex-1 overflow-auto">
              {boardConversations.length === 0 ? (
                <div className="m-3 rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhuma conversa encontrada.</div>
              ) : (
                boardConversations.map((conv) => {
                  const contact = conv.whatsapp_contacts;
                  const selected = active?.id === conv.id;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => openConversation(conv)}
                      className={\`flex w-full gap-3 border-b px-4 py-3 text-left transition hover:bg-slate-50 ${selected ? "bg-slate-100" : "bg-white"}\`}
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: queueColor(queueFromConversation(conv)) }}>
                        {initials(contact?.nome)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-black text-slate-900">{conversationName(conv)}</p>
                          <span className="shrink-0 text-[11px] font-bold text-slate-400">{fmtRelative(conv.last_message_at)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{conv.last_message || formatPhoneBR(contact?.telefone || contact?.wa_id)}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{queueLabel(queueFromConversation(conv))}</Badge>
                          {conv.unread_count > 0 && <Badge style={{ background: C.red, color: "white" }} className="text-[10px]">{conv.unread_count}</Badge>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="min-h-[72vh] bg-slate-50">
            {active ? (
              <ConversationDrawer />
            ) : (
              <div className="flex h-full min-h-[72vh] items-center justify-center p-8 text-center text-slate-500">
                <div>
                  <MessageCircle className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="text-lg font-black text-slate-800">Selecione uma conversa</p>
                  <p className="mt-1 text-sm">A conversa abrirá aqui, no padrão WhatsApp Web.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">
          {boardQueues.map((queue) => {
            const items = conversationsByQueue.get(queue.key) || [];

            return (
              <div key={queue.key} className="w-[320px] shrink-0">
                <div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: queue.color }} />
                        <p className="truncate font-black text-slate-800">{queue.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{queue.description || queue.area}</p>
                    </div>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhum ticket nesta etapa.</div>
                  ) : (
                    items.map((conv) => <ConversationCard key={conv.id} conv={conv} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}`;

const renderRegex = /      \{loading \? \([\s\S]*?\n      \)\}\n\n      \{drawerMinimized && active && \(/;
if (renderRegex.test(src)) {
  src = src.replace(renderRegex, `${newBody}\n\n      {drawerMinimized && active && (`);
  console.log(`${marker}: render atendimento substituído`);
} else {
  console.log(`${marker}: render atendimento não encontrado`);
}

fs.writeFileSync(file, src);
console.log(`${marker}: applied`);
