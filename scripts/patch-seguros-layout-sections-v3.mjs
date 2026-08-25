import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

// Cria helpers de segmentação da carteira sem alterar o modelo de dados.
if (!src.includes("const isNewBusinessInsurance")) {
  const anchor = "const formatCurrency";
  const idx = src.indexOf(anchor);
  if (idx < 0) throw new Error("[seguros-layout-v3] âncora formatCurrency não encontrada");
  const helper = `const isNewBusinessInsurance = (item: InsuranceRow) => item.policy_status !== \"ativa\" && ![\"inadimplente\", \"potencial_cancelamento\", \"cancelada\", \"vencida\", \"em_renovacao\", \"renovada\"].includes(item.policy_status);\n\nconst isPortfolioInsurance = (item: InsuranceRow) => !isNewBusinessInsurance(item) && item.policy_status !== \"pre_emissao\" && item.policy_status !== \"emitida\";\n\n`;
  src = src.slice(0, idx) + helper + src.slice(idx);
  changed = true;
}

// Localiza o bloco da tabela principal e o substitui por duas seções empilhadas.
const tableStart = src.indexOf("{/* Carteira */}");
if (tableStart >= 0 && !src.includes("Novo Negócio")) {
  const modalStart = src.indexOf("{/* Modal", tableStart);
  if (modalStart < 0) throw new Error("[seguros-layout-v3] final do bloco Carteira não encontrado");

  const oldBlock = src.slice(tableStart, modalStart);

  // Extrai o conteúdo reutilizável do card/tabela atual, preservando handlers, filtros e ações.
  const cardStart = oldBlock.indexOf("<Card");
  const cardEnd = oldBlock.lastIndexOf("</Card>");
  if (cardStart < 0 || cardEnd < 0) throw new Error("[seguros-layout-v3] Card da carteira não encontrado");
  const cardBlock = oldBlock.slice(cardStart, cardEnd + "</Card>".length);

  // Troca a fonte visível 'filteredInsurances' por uma variável de seção para reutilizar a mesma tabela.
  const sectionCard = cardBlock
    .replaceAll("filteredInsurances", "sectionInsurances")
    .replace(/<CardHeader>[\s\S]*?<\/CardHeader>/, "");

  const newBlock = `{/* Operação de Seguros: Novo Negócio + Carteira */}\n      {(() => {\n        const newBusinessInsurances = filteredInsurances.filter(isNewBusinessInsurance);\n        const portfolioInsurances = filteredInsurances.filter(isPortfolioInsurance);\n\n        const renderInsuranceSection = (title: string, subtitle: string, sectionInsurances: InsuranceRow[], accent: \"new\" | \"portfolio\") => (\n          <section className=\"space-y-4\">\n            <div className=\"flex flex-col gap-2 md:flex-row md:items-end md:justify-between\">\n              <div>\n                <div className=\"flex items-center gap-2\">\n                  <div className={\`h-8 w-1 rounded-full \${accent === \"new\" ? \"bg-[#B5A573]\" : \"bg-[#A11C27]\"}\`} />\n                  <div>\n                    <h2 className=\"text-xl font-bold text-[#1E293F]\">{title}</h2>\n                    <p className=\"text-sm text-slate-500\">{subtitle}</p>\n                  </div>\n                </div>\n              </div>\n              <div className=\"rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-[#1E293F]\">\n                {sectionInsurances.length} registro{sectionInsurances.length === 1 ? \"\" : \"s\"}\n              </div>\n            </div>\n\n            <div className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-5\">\n              {accent === \"new\" ? (\n                <>\n                  <MiniKpi label=\"Em análise\" value={sectionInsurances.filter((i) => [\"registrada\", \"em_analise\"].includes(i.proposal_status)).length} />\n                  <MiniKpi label=\"Pendências\" value={sectionInsurances.filter((i) => i.proposal_status === \"pendencia\").length} />\n                  <MiniKpi label=\"Vistorias\" value={sectionInsurances.filter((i) => [\"pendente\", \"agendada\"].includes(i.inspection_status)).length} />\n                  <MiniKpi label=\"Emitidas aguardando vigência\" value={sectionInsurances.filter((i) => i.policy_status === \"emitida\").length} />\n                  <MiniKpi label=\"Recusadas\" value={sectionInsurances.filter((i) => i.proposal_status === \"recusada\").length} />\n                </>\n              ) : (\n                <>\n                  <MiniKpi label=\"Ativas\" value={sectionInsurances.filter((i) => i.policy_status === \"ativa\").length} />\n                  <MiniKpi label=\"Prêmio em carteira\" value={formatCurrency(sectionInsurances.filter((i) => i.policy_status === \"ativa\").reduce((sum, i) => sum + Number(i.total_premium || 0), 0))} />\n                  <MiniKpi label=\"Inadimplentes\" value={sectionInsurances.filter((i) => i.policy_status === \"inadimplente\").length} />\n                  <MiniKpi label=\"Potencial cancelamento\" value={sectionInsurances.filter((i) => i.policy_status === \"potencial_cancelamento\").length} />\n                  <MiniKpi label=\"Em renovação\" value={sectionInsurances.filter((i) => i.policy_status === \"em_renovacao\").length} />\n                </>\n              )}\n            </div>\n\n            ${sectionCard.replace(/`/g, "\\`")}\n          </section>\n        );\n\n        return (\n          <div className=\"space-y-10\">\n            {renderInsuranceSection(\"Novo Negócio\", \"Propostas e apólices que ainda não entraram em vigência ativa.\", newBusinessInsurances, \"new\")}\n            {renderInsuranceSection(\"Carteira de Seguros\", \"Apólices que já entraram no ciclo de vigência e agora exigem gestão, retenção e renovação.\", portfolioInsurances, \"portfolio\")}\n          </div>\n        );\n      })()}\n\n      `;

  src = src.slice(0, tableStart) + newBlock + src.slice(modalStart);
  changed = true;
}

// Mini KPI local para as duas seções.
if (!src.includes("function MiniKpi")) {
  const componentAnchor = "export default function Seguros";
  const idx = src.indexOf(componentAnchor);
  if (idx < 0) throw new Error("[seguros-layout-v3] componente Seguros não encontrado");
  const mini = `function MiniKpi({ label, value }: { label: string; value: string | number }) {\n  return (\n    <div className=\"rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm\">\n      <p className=\"text-xs font-medium uppercase tracking-wide text-slate-500\">{label}</p>\n      <p className=\"mt-1 text-lg font-bold text-[#1E293F]\">{value}</p>\n    </div>\n  );\n}\n\n`;
  src = src.slice(0, idx) + mini + src.slice(idx);
  changed = true;
}

if (!src.includes("Novo Negócio") || !src.includes("Carteira de Seguros")) {
  throw new Error("[seguros-layout-v3] não foi possível aplicar as duas seções");
}

if (changed) fs.writeFileSync(file, src);
console.log(`[seguros-layout-v3] ${changed ? "layout aplicado" : "já aplicado"}`);
