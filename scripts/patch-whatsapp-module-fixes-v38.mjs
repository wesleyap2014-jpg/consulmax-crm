import fs from "node:fs";

const marker = "patch-whatsapp-module-fixes-v38";

function patchFile(file, patcher) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(marker)) {
    console.log(`${marker}: ${file} already applied`);
    return;
  }
  src = patcher(src);
  fs.writeFileSync(file, src);
  console.log(`${marker}: ${file} applied`);
}

function mustReplace(src, search, replace, label) {
  if (!src.includes(search)) throw new Error(`${marker}: trecho não encontrado para ${label}`);
  return src.replace(search, replace);
}

patchFile("src/pages/AtendimentoWhatsApp.tsx", (src) => {
  src = mustReplace(
    src,
    `  return (\n    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">\n      <div className={\`max-h-[92vh] w-full ${max} overflow-auto rounded-3xl bg-white p-5 shadow-2xl\`}>`,
    `  return (\n    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm">\n      <div className={\`w-full ${max} overflow-visible rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200\`}>`,
    "OverlayShell visível"
  );

  src = mustReplace(
    src,
    `  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");`,
    `  // ${marker}\n  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "relatorios">("todos");`,
    "tipo boardArea"
  );

  src = mustReplace(
    src,
    `    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;`,
    `    if (boardArea === "relatorios") return [];\n    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;`,
    "boardQueues relatorios"
  );

  src = mustReplace(
    src,
    `              <Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">\n                <Megaphone className="mr-2 h-4 w-4" />\n                Campanhas\n              </Button>\n`,
    ``,
    "remover botão Campanhas do atendimento"
  );

  src = mustReplace(
    src,
    `              {(["todos", "geral", "comercial", "operacional"] as const).map((area) => (`,
    `              {(["todos", "comercial", "operacional", "relatorios"] as const).map((area) => (`,
    "abas atendimento"
  );

  src = mustReplace(
    src,
    `                  {area === "todos" ? "Todas" : area.charAt(0).toUpperCase() + area.slice(1)}`,
    `                  {area === "todos" ? "Todos" : area === "relatorios" ? "Relatórios" : area.charAt(0).toUpperCase() + area.slice(1)}`,
    "label relatorios"
  );

  const oldBody = `      {loading ? (\n        <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white shadow-sm">\n          <Loader2 className="h-7 w-7 animate-spin" />\n        </div>\n      ) : (\n        <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">\n          {boardQueues.map((queue) => {\n            const items = conversationsByQueue.get(queue.key) || [];\n\n            return (\n              <div key={queue.key} className="w-[320px] shrink-0">\n                <div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm">\n                  <div className="flex items-center justify-between gap-3">\n                    <div className="min-w-0">\n                      <div className="flex items-center gap-2">\n                        <span className="h-3 w-3 rounded-full" style={{ background: queue.color }} />\n                        <p className="truncate font-black text-slate-800">{queue.label}</p>\n                      </div>\n                      <p className="mt-1 text-xs text-slate-400">{queue.description || queue.area}</p>\n                    </div>\n                    <Badge variant="secondary">{items.length}</Badge>\n                  </div>\n                </div>\n\n                <div className="space-y-3">\n                  {items.length === 0 ? (\n                    <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">\n                      Nenhum ticket nesta etapa.\n                    </div>\n                  ) : (\n                    items.map((conv) => <ConversationCard key={conv.id} conv={conv} />)\n                  )}\n                </div>\n              </div>\n            );\n          })}\n        </div>\n      )}`;

  const newBody = `      {loading ? (\n        <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white shadow-sm">\n          <Loader2 className="h-7 w-7 animate-spin" />\n        </div>\n      ) : boardArea === "relatorios" ? (\n        <div className="grid gap-4 lg:grid-cols-3">\n          <div className="rounded-3xl border bg-white p-5 shadow-sm">\n            <p className="text-xs font-bold uppercase text-slate-400">Mensagens enviadas</p>\n            <p className="mt-2 text-3xl font-black" style={{ color: C.navy }}>{messages.filter((m) => m.direction === "outbound").length}</p>\n            <p className="mt-1 text-sm text-slate-500">Na conversa atualmente aberta</p>\n          </div>\n          <div className="rounded-3xl border bg-white p-5 shadow-sm">\n            <p className="text-xs font-bold uppercase text-slate-400">Tempo médio de atendimento</p>\n            <p className="mt-2 text-3xl font-black" style={{ color: C.red }}>Em breve</p>\n            <p className="mt-1 text-sm text-slate-500">Aguardando campos de SLA no banco</p>\n          </div>\n          <div className="rounded-3xl border bg-white p-5 shadow-sm">\n            <p className="text-xs font-bold uppercase text-slate-400">Avaliação média</p>\n            <p className="mt-2 text-3xl font-black text-emerald-700">Em breve</p>\n            <p className="mt-1 text-sm text-slate-500">Notas 1 a 5 após finalização</p>\n          </div>\n          <div className="rounded-3xl border bg-white p-5 shadow-sm lg:col-span-3">\n            <h3 className="text-lg font-black text-slate-900">Indicadores planejados</h3>\n            <div className="mt-4 grid gap-3 md:grid-cols-3">\n              {["Custo com abertura de conversas", "Tempo até primeira resposta", "Tempo médio de ticket aberto", "Volume por fila", "Tickets por usuário", "Satisfação do cliente"].map((item) => (\n                <div key={item} className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{item}</div>\n              ))}\n            </div>\n          </div>\n        </div>\n      ) : boardArea === "todos" ? (\n        <div className="grid min-h-[62vh] gap-4 lg:grid-cols-[380px_1fr]">\n          <div className="rounded-3xl border bg-white shadow-sm">\n            <div className="border-b p-4">\n              <h3 className="text-lg font-black text-slate-900">Conversas</h3>\n              <p className="text-sm text-slate-500">Modelo lista, inspirado no WhatsApp Web.</p>\n            </div>\n            <div className="max-h-[68vh] space-y-2 overflow-auto p-3">\n              {boardConversations.length === 0 ? (\n                <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhuma conversa encontrada.</div>\n              ) : (\n                boardConversations.map((conv) => <ConversationCard key={conv.id} conv={conv} />)\n              )}\n            </div>\n          </div>\n          <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed bg-white/70 p-6 text-center text-slate-500">\n            <div>\n              <MessageCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />\n              <p className="font-bold text-slate-700">Selecione uma conversa na lista</p>\n              <p className="mt-1 text-sm">O atendimento abrirá na lateral com histórico, ações e campo de mensagem.</p>\n            </div>\n          </div>\n        </div>\n      ) : (\n        <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">\n          {boardQueues.map((queue) => {\n            const items = conversationsByQueue.get(queue.key) || [];\n\n            return (\n              <div key={queue.key} className="w-[320px] shrink-0">\n                <div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm">\n                  <div className="flex items-center justify-between gap-3">\n                    <div className="min-w-0">\n                      <div className="flex items-center gap-2">\n                        <span className="h-3 w-3 rounded-full" style={{ background: queue.color }} />\n                        <p className="truncate font-black text-slate-800">{queue.label}</p>\n                      </div>\n                      <p className="mt-1 text-xs text-slate-400">{queue.description || queue.area}</p>\n                    </div>\n                    <Badge variant="secondary">{items.length}</Badge>\n                  </div>\n                </div>\n\n                <div className="space-y-3">\n                  {items.length === 0 ? (\n                    <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhum ticket nesta etapa.</div>\n                  ) : (\n                    items.map((conv) => <ConversationCard key={conv.id} conv={conv} />)\n                  )}\n                </div>\n              </div>\n            );\n          })}\n        </div>\n      )}`;

  src = mustReplace(src, oldBody, newBody, "render todos/lista e relatorios");

  src = mustReplace(src, `      {campaignOpen && <CampaignOverlay />}\n`, `      {false && campaignOpen && <CampaignOverlay />}\n`, "desativar overlay campanhas antigo");

  return src;
});

patchFile("src/pages/whatsapp/WhatsAppCampanhas.tsx", (src) => {
  src = mustReplace(
    src,
    `import { CalendarClock, CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";`,
    `import { CalendarClock, CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users, X } from "lucide-react";`,
    "import X"
  );

  src = mustReplace(
    src,
    `  const [loading, setLoading] = useState(false);`,
    `  const [loading, setLoading] = useState(false);\n  const [createOpen, setCreateOpen] = useState(false); // ${marker}`,
    "state createOpen"
  );

  src = mustReplace(
    src,
    `          <button className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">\n            <Megaphone className="h-4 w-4" /> Criar campanha\n          </button>`,
    `          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">\n            <Megaphone className="h-4 w-4" /> Criar campanha\n          </button>`,
    "botao criar campanha"
  );

  src = mustReplace(
    src,
    `      <div className="grid gap-4 md:grid-cols-4">`,
    `      {createOpen && (\n        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm">\n          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">Nova campanha</p>\n                <h2 className="text-2xl font-black text-slate-900">Criar campanha WhatsApp</h2>\n                <p className="text-sm text-slate-500">A criação completa será conectada ao fluxo atual. Por enquanto, use o atendimento antigo para salvar campanhas e esta tela para acompanhar.</p>\n              </div>\n              <button onClick={() => setCreateOpen(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>\n            </div>\n            <div className="mt-5 grid gap-3 md:grid-cols-2">\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">1. Público</p><p className="mt-1 text-sm text-slate-500">Leads, Clientes ou Agenda WhatsApp.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">2. Template</p><p className="mt-1 text-sm text-slate-500">Autorização, campanha ou utilidade.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">3. Agendamento</p><p className="mt-1 text-sm text-slate-500">Enviar agora ou programar horário.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">4. Automação</p><p className="mt-1 text-sm text-slate-500">Sem aceite, pedir autorização primeiro.</p></div>\n            </div>\n            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Próximo passo: ligar este modal ao salvamento real de campanhas com seleção de público e template.</div>\n          </div>\n        </div>\n      )}\n\n      <div className="grid gap-4 md:grid-cols-4">`,
    "modal criar campanha"
  );

  return src;
});

patchFile("src/pages/whatsapp/WhatsAppModelos.tsx", (src) => {
  src = mustReplace(
    src,
    `type TemplateRow = {`,
    `// ${marker}\ntype TemplateRow = {`,
    "marker modelos"
  );

  src = mustReplace(
    src,
    `      setRows((data || []) as TemplateRow[]);`,
    `      const fallbackTemplates: TemplateRow[] = [\n        { name: "boas_vindas_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Boas-vindas quando a cota do cliente é alocada." },\n        { name: "solicitacao_contato_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Solicita permissão para continuar atendimento pelo WhatsApp." },\n        { name: "autorizacao_marketing_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Autorização para envio de conteúdos, novidades e oportunidades." },\n        { name: "documentacao_pendente_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Solicitação de documentação pendente para andamento do processo." },\n        { name: "call_permission_optin", category: "Marketing", language: "pt_BR", status: "Ativo", body: "Solicitação de permissão para ligação pelo WhatsApp." },\n      ];\n      setRows(((data && data.length > 0) ? data : fallbackTemplates) as TemplateRow[]);`,
    "fallback modelos"
  );

  src = mustReplace(
    src,
    `      setRows([]);`,
    `      setRows([\n        { name: "boas_vindas_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Boas-vindas quando a cota do cliente é alocada." },\n        { name: "solicitacao_contato_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Solicita permissão para continuar atendimento pelo WhatsApp." },\n        { name: "autorizacao_marketing_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Autorização para envio de conteúdos, novidades e oportunidades." },\n        { name: "documentacao_pendente_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Solicitação de documentação pendente para andamento do processo." },\n        { name: "call_permission_optin", category: "Marketing", language: "pt_BR", status: "Ativo", body: "Solicitação de permissão para ligação pelo WhatsApp." },\n      ]);`,
    "fallback catch modelos"
  );

  return src;
});
