import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
let src = fs.readFileSync(file, "utf8");

if (src.includes('data-seguros-layout="novo-negocio-carteira"')) {
  console.log("[seguros-layout-v7] layout já aplicado");
  process.exit(0);
}

const heading = '<h2 className="font-black text-[#1E293F]">Carteira de Seguros</h2>';
const headingIdx = src.indexOf(heading);
if (headingIdx < 0) throw new Error("[seguros-layout-v7] título da carteira atual não encontrado");

const sectionStart = src.lastIndexOf('<section className="rounded-3xl border border-white/70 bg-white/85 shadow-sm backdrop-blur">', headingIdx);
const modalIdx = src.indexOf("<ModalShell", headingIdx);
if (sectionStart < 0 || modalIdx < 0) throw new Error("[seguros-layout-v7] limites da seção atual não encontrados");

const sectionCloseStart = src.lastIndexOf("</section>", modalIdx);
if (sectionCloseStart < sectionStart) throw new Error("[seguros-layout-v7] fechamento da seção atual não encontrado");
const sectionEnd = sectionCloseStart + "</section>".length;
const oldSection = src.slice(sectionStart, sectionEnd);

const tableDivStart = oldSection.indexOf('<div className="overflow-x-auto">');
const tableClose = oldSection.indexOf("</table>", tableDivStart);
if (tableDivStart < 0 || tableClose < 0) throw new Error("[seguros-layout-v7] tabela atual não encontrada");
const tableDivClose = oldSection.indexOf("</div>", tableClose);
if (tableDivClose < 0) throw new Error("[seguros-layout-v7] fechamento da tabela atual não encontrado");
const originalTable = oldSection.slice(tableDivStart, tableDivClose + "</div>".length);
if (!originalTable.includes("filteredSales.map")) throw new Error("[seguros-layout-v7] fonte da tabela não é filteredSales");

const newBusinessTable = originalTable.replace("filteredSales.map", "newBusinessSales.map");
const portfolioTable = originalTable.replace("filteredSales.map", "portfolioSales.map");

const metricCard = (label, valueExpression) => `
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">${label}</p>
                  <p className="mt-1 text-xl font-black text-[#1E293F]">{${valueExpression}}</p>
                </div>`;

const newMetrics = [
  metricCard("Em análise", 'newBusinessSales.filter((sale) => ["registrada", "em_analise"].includes(sale.proposal_status)).length'),
  metricCard("Pendências", 'newBusinessSales.filter((sale) => ["documentos_pendentes", "pendencia_seguradora"].includes(sale.proposal_status)).length'),
  metricCard("Vistorias", 'newBusinessSales.filter(isPendingInspection).length'),
  metricCard("Emitidas aguardando vigência", 'newBusinessSales.filter((sale) => effectivePolicyStatus(sale) === "emitida").length'),
  metricCard("Recusadas", 'newBusinessSales.filter((sale) => sale.proposal_status === "recusada").length'),
].join("");

const portfolioMetrics = [
  metricCard("Ativas", 'portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "ativa").length'),
  metricCard("Prêmio em carteira", 'currency(portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "ativa").reduce((sum, sale) => sum + Number(sale.total_premium || 0), 0))'),
  metricCard("Inadimplentes", 'portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "inadimplente").length'),
  metricCard("Potencial cancelamento", 'portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "potencial_cancelamento").length'),
  metricCard("Vencendo em 30 dias", 'portfolioSales.filter(isExpiring30).length'),
  metricCard("Em renovação", 'portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "em_renovacao").length'),
  metricCard("Canceladas", 'portfolioSales.filter((sale) => effectivePolicyStatus(sale) === "cancelada").length'),
].join("");

const replacement = `<div data-seguros-layout="novo-negocio-carteira" className="space-y-8">
        <section className="rounded-3xl border border-white/70 bg-white/85 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-black text-[#1E293F]">Gestão de Seguros</h2>
              <p className="text-xs text-slate-500">Use os filtros abaixo para pesquisar simultaneamente em novos negócios e na carteira.</p>
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-3xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cliente, CPF/CNPJ, seguradora, proposta ou apólice..."
                  className={\`${inputClass} pl-9\`}
                />
              </div>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value as "todos" | Product)}
                className={\`${inputClass} sm:w-44\`}
              >
                <option value="todos">Todos os produtos</option>
                <option value="Automóvel">Automóvel</option>
                <option value="Patrimonial">Patrimonial</option>
                <option value="Vida">Vida</option>
              </select>
              {(search || productFilter !== "todos" || kpiFilter !== "all") && (
                <button type="button" onClick={resetFilters} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                  Limpar
                </button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl border border-white/70 bg-white/85 shadow-sm">
            <div className="grid min-h-64 place-items-center text-sm text-slate-500">
              <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Carregando seguros...</div>
            </div>
          </section>
        ) : (() => {
          const newBusinessSales = filteredSales.filter((sale) => {
            const status = effectivePolicyStatus(sale);
            return status === "pre_emissao" || status === "emitida";
          });
          const portfolioSales = filteredSales.filter((sale) => {
            const status = effectivePolicyStatus(sale);
            return ["ativa", "inadimplente", "potencial_cancelamento", "cancelada", "vencida", "em_renovacao", "renovada"].includes(status);
          });

          return (
            <div className="space-y-10">
              <section className="overflow-hidden rounded-3xl border border-[#B5A573]/35 bg-white/90 shadow-sm backdrop-blur">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-11 w-1 rounded-full bg-[#B5A573]" />
                      <div>
                        <h2 className="text-xl font-black text-[#1E293F]">Novo Negócio</h2>
                        <p className="text-sm text-slate-500">Propostas e apólices que ainda não entraram em vigência ativa.</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-[#B5A573]/30 bg-[#E0CE8C]/15 px-3 py-1 text-sm font-black text-[#1E293F]">
                      {newBusinessSales.length} registro{newBusinessSales.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">${newMetrics}
                  </div>
                </div>
                {newBusinessSales.length === 0 ? (
                  <div className="grid min-h-40 place-items-center p-8 text-center">
                    <div><ShieldCheck className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-2 font-black text-slate-700">Nenhum novo negócio</h3><p className="mt-1 text-sm text-slate-500">Não há propostas pendentes com os filtros atuais.</p></div>
                  </div>
                ) : (${newBusinessTable})}
              </section>

              <section className="overflow-hidden rounded-3xl border border-[#A11C27]/20 bg-white/90 shadow-sm backdrop-blur">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-11 w-1 rounded-full bg-[#A11C27]" />
                      <div>
                        <h2 className="text-xl font-black text-[#1E293F]">Carteira de Seguros</h2>
                        <p className="text-sm text-slate-500">Apólices que já entraram no ciclo de vigência e agora exigem gestão, retenção e renovação.</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-[#A11C27]/20 bg-[#A11C27]/5 px-3 py-1 text-sm font-black text-[#1E293F]">
                      {portfolioSales.length} registro{portfolioSales.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">${portfolioMetrics}
                  </div>
                </div>
                {portfolioSales.length === 0 ? (
                  <div className="grid min-h-40 place-items-center p-8 text-center">
                    <div><ShieldCheck className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-2 font-black text-slate-700">Nenhuma apólice na carteira</h3><p className="mt-1 text-sm text-slate-500">As apólices entram aqui quando iniciarem seu ciclo de vigência.</p></div>
                  </div>
                ) : (${portfolioTable})}
              </section>
            </div>
          );
        })()}
      </div>`;

src = src.slice(0, sectionStart) + replacement + src.slice(sectionEnd);

if (!src.includes('data-seguros-layout="novo-negocio-carteira"') || !src.includes("newBusinessSales.map") || !src.includes("portfolioSales.map")) {
  throw new Error("[seguros-layout-v7] validação final do layout falhou");
}

fs.writeFileSync(file, src);
console.log("[seguros-layout-v7] Novo Negócio e Carteira de Seguros aplicados");
