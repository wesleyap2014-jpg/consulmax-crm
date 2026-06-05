import fs from "node:fs";

const marker = "patch-whatsapp-module-fixes-v38b";

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

function safeReplace(src, search, replace, label) {
  if (!src.includes(search)) {
    console.log(`${marker}: ${label}: trecho não encontrado`);
    return src;
  }
  return src.replace(search, replace);
}

function safeReplaceRegex(src, regex, replace, label) {
  if (!regex.test(src)) {
    console.log(`${marker}: ${label}: ponto não encontrado`);
    return src;
  }
  return src.replace(regex, replace);
}

patchFile("src/pages/AtendimentoWhatsApp.tsx", (src) => {
  src = safeReplace(
    src,
    '  return (\n    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">\n      <div className={`max-h-[92vh] w-full ${max} overflow-auto rounded-3xl bg-white p-5 shadow-2xl`}>',
    '  return (\n    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm">\n      <div className={`w-full ${max} overflow-visible rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200`}>',
    "OverlayShell visível"
  );

  src = safeReplace(
    src,
    '  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");',
    '  // patch-whatsapp-module-fixes-v38b\n  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "relatorios">("todos");',
    "tipo boardArea"
  );

  src = safeReplace(
    src,
    '    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;',
    '    if (boardArea === "relatorios") return [];\n    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);\n    return byArea;',
    "boardQueues relatorios"
  );

  src = safeReplace(
    src,
    '              <Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">\n                <Megaphone className="mr-2 h-4 w-4" />\n                Campanhas\n              </Button>\n',
    '',
    "remover botão Campanhas do atendimento"
  );

  src = safeReplace(
    src,
    '              {(["todos", "geral", "comercial", "operacional"] as const).map((area) => (',
    '              {(["todos", "comercial", "operacional", "relatorios"] as const).map((area) => (',
    "abas atendimento"
  );

  src = safeReplace(
    src,
    '                  {area === "todos" ? "Todas" : area.charAt(0).toUpperCase() + area.slice(1)}',
    '                  {area === "todos" ? "Todos" : area === "relatorios" ? "Relatórios" : area.charAt(0).toUpperCase() + area.slice(1)}',
    "label relatorios"
  );

  src = safeReplace(
    src,
    '      {campaignOpen && <CampaignOverlay />}\n',
    '      {false && campaignOpen && <CampaignOverlay />}\n',
    "desativar overlay campanhas antigo"
  );

  return src;
});

patchFile("src/pages/whatsapp/WhatsAppCampanhas.tsx", (src) => {
  src = safeReplace(
    src,
    'import { CalendarClock, CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";',
    'import { CalendarClock, CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users, X } from "lucide-react";',
    "import X"
  );

  src = safeReplace(
    src,
    '  const [loading, setLoading] = useState(false);',
    '  const [loading, setLoading] = useState(false);\n  const [createOpen, setCreateOpen] = useState(false); // patch-whatsapp-module-fixes-v38b',
    "state createOpen"
  );

  src = safeReplace(
    src,
    '          <button className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">\n            <Megaphone className="h-4 w-4" /> Criar campanha\n          </button>',
    '          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">\n            <Megaphone className="h-4 w-4" /> Criar campanha\n          </button>',
    "botao criar campanha"
  );

  src = safeReplace(
    src,
    '      <div className="grid gap-4 md:grid-cols-4">',
    '      {createOpen && (\n        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm">\n          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">Nova campanha</p>\n                <h2 className="text-2xl font-black text-slate-900">Criar campanha WhatsApp</h2>\n                <p className="text-sm text-slate-500">A criação completa será conectada ao fluxo atual. Esta etapa prepara público, template e automação de aceite.</p>\n              </div>\n              <button onClick={() => setCreateOpen(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>\n            </div>\n            <div className="mt-5 grid gap-3 md:grid-cols-2">\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">1. Público</p><p className="mt-1 text-sm text-slate-500">Leads, Clientes ou Agenda WhatsApp.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">2. Template</p><p className="mt-1 text-sm text-slate-500">Autorização, campanha ou utilidade.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">3. Agendamento</p><p className="mt-1 text-sm text-slate-500">Enviar agora ou programar horário.</p></div>\n              <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">4. Automação</p><p className="mt-1 text-sm text-slate-500">Sem aceite, pedir autorização primeiro.</p></div>\n            </div>\n            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Próximo passo: ligar este modal ao salvamento real de campanhas com seleção de público e template.</div>\n          </div>\n        </div>\n      )}\n\n      <div className="grid gap-4 md:grid-cols-4">',
    "modal criar campanha"
  );

  return src;
});

patchFile("src/pages/whatsapp/WhatsAppModelos.tsx", (src) => {
  src = safeReplace(
    src,
    'type TemplateRow = {',
    '// patch-whatsapp-module-fixes-v38b\ntype TemplateRow = {',
    "marker modelos"
  );

  const fallback = '[\n        { name: "boas_vindas_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Boas-vindas quando a cota do cliente é alocada." },\n        { name: "solicitacao_contato_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Solicita permissão para continuar atendimento pelo WhatsApp." },\n        { name: "autorizacao_marketing_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Autorização para envio de conteúdos, novidades e oportunidades." },\n        { name: "documentacao_pendente_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Solicitação de documentação pendente para andamento do processo." },\n        { name: "call_permission_optin", category: "Marketing", language: "pt_BR", status: "Ativo", body: "Solicitação de permissão para ligação pelo WhatsApp." },\n      ]';

  src = safeReplace(
    src,
    '      setRows((data || []) as TemplateRow[]);',
    `      const fallbackTemplates: TemplateRow[] = ${fallback};\n      setRows(((data && data.length > 0) ? data : fallbackTemplates) as TemplateRow[]);`,
    "fallback modelos"
  );

  src = safeReplace(
    src,
    '      setRows([]);',
    `      setRows(${fallback});`,
    "fallback catch modelos"
  );

  return src;
});
