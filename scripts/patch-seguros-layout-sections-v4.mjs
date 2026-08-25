import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

if (!src.includes("const isNewBusinessInsurance")) {
  const componentAnchor = "export default function Seguros";
  const idx = src.indexOf(componentAnchor);
  if (idx < 0) throw new Error("[seguros-layout-v4] componente Seguros não encontrado");
  const helper = `const isNewBusinessInsurance = (item: InsuranceRow) => item.policy_status === \"pre_emissao\" || item.policy_status === \"emitida\";\n\nconst isPortfolioInsurance = (item: InsuranceRow) => [\"ativa\", \"inadimplente\", \"potencial_cancelamento\", \"cancelada\", \"vencida\", \"em_renovacao\", \"renovada\"].includes(item.policy_status);\n\nfunction MiniKpi({ label, value }: { label: string; value: string | number }) {\n  return (\n    <div className=\"rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm\">\n      <p className=\"text-xs font-medium uppercase tracking-wide text-slate-500\">{label}</p>\n      <p className=\"mt-1 text-lg font-bold text-[#1E293F]\">{value}</p>\n    </div>\n  );\n}\n\n`;
  src = src.slice(0, idx) + helper + src.slice(idx);
  changed = true;
}

if (!src.includes('title="Novo Negócio"')) {
  const candidates = ["filteredInsurances.map", "filteredPolicies.map", "filteredRows.map"];
  const mapToken = candidates.find((token) => src.includes(token));
  if (!mapToken) {
    const idx = src.indexOf("filteredInsurances");
    const context = idx >= 0 ? src.slice(Math.max(0, idx - 500), idx + 1600) : src.slice(0, 2200);
    throw new Error(`[seguros-layout-v4] coleção filtrada não localizada. Contexto: ${context}`);
  }

  const mapIdx = src.indexOf(mapToken);
  const cardStart = src.lastIndexOf("<Card", mapIdx);
  const cardEnd = src.indexOf("</Card>", mapIdx);
  if (cardStart < 0 || cardEnd < 0) {
    const context = src.slice(Math.max(0, mapIdx - 900), mapIdx + 1800);
    throw new Error(`[seguros-layout-v4] Card da lista não localizado. Contexto: ${context}`);
  }

  const originalCard = src.slice(cardStart, cardEnd + 7);
  const collectionName = mapToken.split(".map")[0];
  const sectionCard = originalCard.replaceAll(collectionName, "sectionInsurances").replace(/<CardHeader>[\s\S]*?<\/CardHeader>/, "");

  const replacement = `{(() => {\n        const newBusinessInsurances = ${collectionName}.filter(isNewBusinessInsurance);\n        const portfolioInsurances = ${collectionName}.filter(isPortfolioInsurance);\n\n        const renderSection = (title: string, subtitle: string, sectionInsurances: InsuranceRow[], kind: \"new\" | \"portfolio\") => (\n          <section className=\"space-y-4\">\n            <div className=\"flex flex-col gap-2 md:flex-row md:items-end md:justify-between\">\n              <div className=\"flex items-start gap-3\">\n                <div className={\`mt-1 h-10 w-1 rounded-full \${kind === \"new\" ? \"bg-[#B5A573]\" : \"bg-[#A11C27]\"}\`} />\n                <div>\n                  <h2 className=\"text-xl font-bold text-[#1E293F]\">{title}</h2>\n                  <p className=\"text-sm text-slate-500\">{subtitle}</p>\n                </div>\n              </div>\n              <span className=\"rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-[#1E293F]\">{sectionInsurances.length} registro{sectionInsurances.length === 1 ? \"\" : \"s\"}</span>\n            </div>\n\n            <div className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-5\">\n              {kind === \"new\" ? (\n                <>\n                  <MiniKpi label=\"Em análise\" value={sectionInsurances.filter((i) => [\"registrada\", \"em_analise\"].includes(i.proposal_status)).length} />\n                  <MiniKpi label=\"Pendências\" value={sectionInsurances.filter((i) => i.proposal_status === \"pendencia\").length} />\n                  <MiniKpi label=\"Vistorias\" value={sectionInsurances.filter((i) => [\"pendente\", \"agendada\"].includes(i.inspection_status)).length} />\n                  <MiniKpi label=\"Emitidas aguardando vigência\" value={sectionInsurances.filter((i) => i.policy_status === \"emitida\").length} />\n                  <MiniKpi label=\"Recusadas\" value={sectionInsurances.filter((i) => i.proposal_status === \"recusada\").length} />\n                </>\n              ) : (\n                <>\n                  <MiniKpi label=\"Ativas\" value={sectionInsurances.filter((i) => i.policy_status === \"ativa\").length} />\n                  <MiniKpi label=\"Inadimplentes\" value={sectionInsurances.filter((i) => i.policy_status === \"inadimplente\").length} />\n                  <MiniKpi label=\"Potencial cancelamento\" value={sectionInsurances.filter((i) => i.policy_status === \"potencial_cancelamento\").length} />\n                  <MiniKpi label=\"Em renovação\" value={sectionInsurances.filter((i) => i.policy_status === \"em_renovacao\").length} />\n                  <MiniKpi label=\"Canceladas/Vencidas\" value={sectionInsurances.filter((i) => [\"cancelada\", \"vencida\"].includes(i.policy_status)).length} />\n                </>\n              )}\n            </div>\n\n            ${sectionCard.replace(/`/g, "\\`")}\n          </section>\n        );\n\n        return (\n          <div className=\"space-y-10\">\n            {renderSection(\"Novo Negócio\", \"Propostas e apólices que ainda não entraram em vigência ativa.\", newBusinessInsurances, \"new\")}\n            {renderSection(\"Carteira de Seguros\", \"Apólices que já entraram no ciclo de vigência e agora exigem gestão, retenção e renovação.\", portfolioInsurances, \"portfolio\")}\n          </div>\n        );\n      })()}`;

  src = src.slice(0, cardStart) + replacement + src.slice(cardEnd + 7);
  changed = true;
}

if (!src.includes("Novo Negócio") || !src.includes("Carteira de Seguros")) throw new Error("[seguros-layout-v4] não foi possível aplicar as duas seções");
if (changed) fs.writeFileSync(file, src);
console.log(`[seguros-layout-v4] ${changed ? "layout aplicado" : "já aplicado"}`);
