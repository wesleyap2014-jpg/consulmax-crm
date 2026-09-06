import fs from "node:fs";

const centerFile = "src/pages/MarketingContentCenter.tsx";
let center = fs.readFileSync(centerFile, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (center.includes(to)) return;
  if (!center.includes(from)) {
    console.log(`[editorial-pipeline] ${label}: âncora não encontrada`);
    return;
  }
  center = center.replace(from, to);
  changed = true;
  console.log(`[editorial-pipeline] ${label}: aplicado`);
}

const importAnchor = 'import MarketingIdeaInbox from "@/components/marketing/MarketingIdeaInbox";';
const importLine = 'import MarketingEditorialPipelineNav from "@/components/marketing/MarketingEditorialPipelineNav";';
if (!center.includes(importLine)) {
  if (!center.includes(importAnchor)) throw new Error("[editorial-pipeline] import MarketingIdeaInbox não encontrado");
  center = center.replace(importAnchor, `${importAnchor}\n${importLine}`);
  changed = true;
}

replaceOnce(
  '<div className="min-h-full bg-gradient-to-b from-[#F5F5F5] via-white to-[#E0CE8C]/10 p-4 md:p-6">',
  '<div className="min-h-full bg-[#F6F7F9] p-4 md:p-6">',
  "fundo da Central",
);
replaceOnce(
  '<div className="flex flex-col gap-4 rounded-3xl border border-[#B5A573]/25 bg-white/90 p-5 shadow-sm md:flex-row md:items-center md:justify-between">',
  '<div className="flex flex-col gap-4 rounded-[24px] border border-[#1E293F]/10 bg-white p-5 shadow-[0_10px_30px_rgba(30,41,63,0.05)] md:flex-row md:items-center md:justify-between">',
  "cabeçalho premium",
);
replaceOnce(
  '<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A11C27]">Max Content</p>',
  '<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A11C27]">Marketing · Content OS</p>',
  "eyebrow do cabeçalho",
);
replaceOnce(
  '<p className="mt-1 max-w-3xl text-sm text-slate-600">Planejamento, produção, desdobramento multicanal, vídeo, aprovação, distribuição e inteligência editorial em um único fluxo.</p>',
  '<p className="mt-1 max-w-3xl text-sm text-slate-600">Da ideia à publicação: estratégia, produção, aprovação, calendário e inteligência editorial em uma única esteira.</p>',
  "subtítulo da Central",
);
replaceOnce(
  '<Button onClick={() => setActiveTab("ideias")} className="bg-[#A11C27] hover:bg-[#8b1822]"><Lightbulb className="mr-2 h-4 w-4" />Caixa de ideias</Button>',
  '<Button onClick={() => setActiveTab("ideias")} className="bg-[#1E293F] hover:bg-[#26344f]"><Lightbulb className="mr-2 h-4 w-4" />Capturar ideia</Button>',
  "ação principal",
);

const countAnchor = '  if (loading) {';
if (!center.includes('const pipelineCounts = useMemo(() =>')) {
  if (!center.includes(countAnchor)) throw new Error("[editorial-pipeline] âncora de contadores não encontrada");
  const counters = `  const publishedPublications = useMemo(() => publications.filter((item) => item.status === "published" || Boolean(item.published_at)), [publications]);\n  const pipelineCounts = useMemo(() => {\n    const ideias = ideas.filter((item) => item.status !== "converted").length;\n    const conteudos = contents.filter((item) => !["producao", "aprovado", "agendado", "publicado", "published"].includes(String(item.status || ""))).length;\n    const producaoVariantes = variants.filter((item) => item.status === "producao").length;\n    const producaoProjetos = videoProjects.filter((item) => ["upload", "analyzing", "edit_plan", "editing", "rendering", "review"].includes(String(item.status || ""))).length;\n    const producao = Math.max(producaoVariantes, producaoProjetos, contents.filter((item) => item.status === "producao").length);\n    const aprovacoes = variants.filter((item) => item.status === "aprovacao").length;\n    const calendario = variants.filter((item) => item.status === "aprovado" || (Boolean(item.planned_at) && !item.published_at)).length;\n    const publicacoes = publishedPublications.length;\n    return { ideias, conteudos, producao, aprovacoes, calendario, publicacoes };\n  }, [contents, ideas, publishedPublications, variants, videoProjects]);\n\n`;
  center = center.replace(countAnchor, counters + countAnchor);
  changed = true;
}

const navStart = '          <div className="overflow-x-auto pb-1">';
const navEndMarker = '          <TabsContent value="visao" className="space-y-5">';
const navStartIndex = center.indexOf(navStart);
const navEndIndex = center.indexOf(navEndMarker, navStartIndex >= 0 ? navStartIndex : 0);
if (navStartIndex >= 0 && navEndIndex > navStartIndex && !center.slice(navStartIndex, navEndIndex).includes("MarketingEditorialPipelineNav")) {
  const replacement = `          <MarketingEditorialPipelineNav activeTab={activeTab} onChange={setActiveTab} counts={pipelineCounts} />\n\n`;
  center = center.slice(0, navStartIndex) + replacement + center.slice(navEndIndex);
  changed = true;
  console.log("[editorial-pipeline] navegação da esteira aplicada");
}

replaceOnce(
  '<Kpi label="Aguardando aprovação" value={dashboard.approvals} detail="Conteúdos e versões" />\n              <Kpi label="Em produção" value={dashboard.production} detail="Peças e projetos de vídeo" />\n              <Kpi label="Agendados" value={dashboard.scheduled} detail="Fila de distribuição" />\n              <Kpi label="Contas conectadas" value={dashboard.connected} detail={`${accounts.length} cadastrada(s)`} />',
  '<Kpi label="Ideias aguardando" value={pipelineCounts.ideias} detail="Ainda não desenvolveram para Conteúdo" />\n              <Kpi label="Conteúdo" value={pipelineCounts.conteudos} detail="Pautas em estratégia e aprovação editorial" />\n              <Kpi label="Produção" value={pipelineCounts.producao} detail="Peças que estão sendo criadas" />\n              <Kpi label="Aprovação final" value={pipelineCounts.aprovacoes} detail="Peças prontas aguardando decisão" />',
  "KPIs da Visão Geral",
);

replaceOnce(
  '<div><h2 className="text-xl font-semibold text-[#1E293F]">Calendário Editorial</h2><p className="text-sm text-slate-500">Agenda unificada de versões planejadas em todas as contas e canais.</p></div>',
  '<div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B5A573]">Etapa 05 · Distribuição</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293F]">Calendário Editorial</h2><p className="mt-1 text-sm text-slate-500">Peças aprovadas entram aqui aguardando agendamento; depois passam a mostrar data e hora de publicação.</p></div>',
  "cabeçalho do Calendário",
);

replaceOnce(
  '<div><h2 className="text-xl font-semibold text-[#1E293F]">Publicações</h2><p className="text-sm text-slate-500">Fila operacional separada da criação. A publicação real será executada pelas autorizações OAuth de cada conta.</p></div>',
  '<div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B5A573]">Etapa 06 · Resultado</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293F]">Publicado</h2><p className="mt-1 text-sm text-slate-500">Arquivo vivo do que efetivamente foi ao ar. A partir daqui o conteúdo alimenta Analytics e aprendizado editorial.</p></div>',
  "cabeçalho de Publicado",
);

center = center.replaceAll('{publications.map((publication) => { const variant = variants.find((item) => item.id === publication.variant_id);', '{publishedPublications.map((publication) => { const variant = variants.find((item) => item.id === publication.variant_id);');
center = center.replaceAll('{!publications.length ? <Empty title="Nenhuma publicação na fila" description="A fila ficará ativa à medida que as contas forem conectadas por OAuth e conteúdos aprovados forem agendados." /> : null}', '{!publishedPublications.length ? <Empty title="Nenhum conteúdo publicado ainda" description="Assim que uma peça for publicada, ela sai do Calendário e passa a fazer parte deste histórico." /> : null}');

if (changed) fs.writeFileSync(centerFile, center, "utf8");

const strategyFile = "src/components/marketing/ContentStrategyWorkspace.tsx";
if (fs.existsSync(strategyFile)) {
  let strategy = fs.readFileSync(strategyFile, "utf8");
  let strategyChanged = false;
  const queryFrom = '          .select("id,title,theme,thesis,objective,audience,segment,content_pillar,cta,status,head_recommendation,ai_context,created_at")\n          .order("created_at", { ascending: false })';
  const queryTo = '          .select("id,title,theme,thesis,objective,audience,segment,content_pillar,cta,status,head_recommendation,ai_context,created_at")\n          .neq("status", "producao")\n          .order("created_at", { ascending: false })';
  if (!strategy.includes(queryTo) && strategy.includes(queryFrom)) {
    strategy = strategy.replace(queryFrom, queryTo);
    strategyChanged = true;
    console.log("[editorial-pipeline] Conteúdo mostra apenas itens antes da Produção");
  }
  strategy = strategy.replace('Nenhum conteúdo para analisar', 'Nenhum conteúdo aguardando estratégia');
  strategy = strategy.replace('Transforme uma ideia em Conteúdo-Mãe ou crie um conteúdo manualmente.', 'Quando uma ideia for desenvolvida, ela entra aqui para ganhar estratégia, roteiro e aprovação editorial antes da Produção.');
  if (strategyChanged) fs.writeFileSync(strategyFile, strategy, "utf8");
}

const navFile = "src/components/marketing/MarketingEditorialPipelineNav.tsx";
if (fs.existsSync(navFile)) {
  let nav = fs.readFileSync(navFile, "utf8");
  const from = '<div className="grid min-w-[980px] grid-cols-7 gap-2 overflow-hidden">';
  const to = '<div className="overflow-x-auto pb-1"><div className="grid min-w-[980px] grid-cols-7 gap-2">';
  if (!nav.includes(to) && nav.includes(from)) {
    nav = nav.replace(from, to);
    nav = nav.replace('          })}\n        </div>\n      </div>\n\n      <div className="flex flex-wrap items-center gap-2 px-1">', '          })}\n        </div></div>\n      </div>\n\n      <div className="flex flex-wrap items-center gap-2 px-1">');
    fs.writeFileSync(navFile, nav, "utf8");
    console.log("[editorial-pipeline] rolagem responsiva da esteira aplicada");
  }
}

console.log(`[editorial-pipeline] ${changed ? "Central redesenhada" : "já aplicada"}`);
