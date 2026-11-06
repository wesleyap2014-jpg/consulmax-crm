import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { EmbraconTableRow } from "./EmbraconTableManager";

type Forma = "cheia" | "reduzida25" | "reduzida50";
type Coluna = { tabela: EmbraconTableRow; forma: Forma };
type Rules = { redutor_pre_contemplacao_enabled: boolean; redutor_base: string };

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const pct = (n: number) => (Number(n || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) + "%";

function formas(t: EmbraconTableRow): Forma[] {
  return [
    ...(t.contrata_parcela_cheia ? ["cheia" as const] : []),
    ...(t.contrata_reduzida_25 ? ["reduzida25" as const] : []),
    ...(t.contrata_reduzida_50 ? ["reduzida50" as const] : []),
  ];
}
function calcularParcelas(t: EmbraconTableRow, credito: number, forma: Forma, comSeguro: boolean, rules: Rules) {
  const fator = forma === "reduzida50" ? 0.5 : forma === "reduzida25" ? 0.75 : 1;
  const adm = Number(t.taxa_adm_pct), fr = Number(t.fundo_reserva_pct), antecip = Number(t.antecip_pct);
  const categoria = credito * (1 + adm + fr);
  const prazo = Math.max(1, Number(t.prazo_limite));
  // Espelha a fórmula de parcelas antes da contemplação do simulador da Embracon.
  const base = rules.redutor_pre_contemplacao_enabled && rules.redutor_base === "valor_categoria"
    ? categoria / prazo * fator
    : (credito * fator + credito * Math.max(0, adm - antecip) + credito * fr * fator) / prazo;
  const antecipParcelas = Math.max(0, Number(t.antecip_parcelas || 0));
  const antecipMensal = antecipParcelas ? credito * antecip / antecipParcelas : 0;
  const seguro = comSeguro ? categoria * Number(t.seguro_prest_pct) : 0;
  return { primeira: base + antecipMensal + seguro, demais: base + seguro };
}
const rotulo = (f: Forma) => f === "cheia" ? "Parcela Cheia" : f === "reduzida25" ? "Reduzida 25%" : "Reduzida 50%";

export default function EmbraconCommercialTable({
  segmento, nomeTabela, variantes, rules, onClose,
}: {
  segmento: string;
  nomeTabela: string;
  variantes: EmbraconTableRow[];
  rules: Rules;
  onClose: () => void;
}) {
  const [comSeguro, setComSeguro] = useState(false);
  const prazos = useMemo(() => [...variantes].sort((a, b) => b.prazo_limite - a.prazo_limite), [variantes]);
  const creditos = useMemo(
    () => Array.from(new Set(prazos.flatMap((t) => (t.faixas_credito || []).map(Number))))
      .filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => a - b),
    [prazos]
  );
  const colunas = useMemo<Coluna[]>(
    () => prazos.flatMap((t) => formas(t).map((forma) => ({ tabela: t, forma }))),
    [prazos]
  );
  const linhas = useMemo(() => creditos.map((credito) => ({
    credito,
    parcelas: colunas.map(({ tabela, forma }) => {
      const disponiveis = (tabela.faixas_credito || []).map(Number);
      const permitido = disponiveis.length
        ? disponiveis.some((c) => Math.abs(c - credito) < 0.005)
        : credito >= Number(tabela.faixa_min) && credito <= Number(tabela.faixa_max);
      return permitido ? calcularParcelas(tabela, credito, forma, comSeguro, rules) : null;
    }),
  })), [creditos, colunas, comSeguro, rules]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-2 md:p-5" role="dialog" aria-modal="true" aria-label="Tabela comercial da Embracon">
      <div className="flex max-h-[95vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#A11C27]">Tabela comercial · Embracon</p>
            <h2 className="text-xl font-black text-[#1E293F]">{nomeTabela}</h2>
            <p className="text-sm text-slate-500">{segmento} · {prazos.length} prazos · {creditos.length} créditos de referência</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#A11C27]" checked={comSeguro} onChange={(e) => setComSeguro(e.target.checked)} />
              Seguro incluso
            </label>
            <Button variant="secondary" className="rounded-xl" onClick={onClose}><X className="mr-1 h-4 w-4" /> Fechar</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
          {!creditos.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
              Esta tabela ainda não possui créditos individuais cadastrados. Configure os valores em <strong>Faixas de Crédito</strong> para gerar a tabela comercial. Os limites antigos permanecem disponíveis no simulador.
            </div>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-0 text-center text-sm">
              <thead>
                <tr>
                  <th rowSpan={3} className="sticky left-0 z-30 min-w-[170px] border border-white/30 bg-[#1E293F] px-4 py-3 text-left text-white">Crédito referência</th>
                  {prazos.map((t) => {
                    const n = formas(t).length;
                    return n ? (
                      <th key={t.id} colSpan={n * 2} className="border border-white/30 bg-[#1E293F] px-4 py-3 text-white">
                        <span className="block text-base font-black">{t.prazo_limite} meses</span>
                        <span className="mt-1 block text-xs font-normal text-white/80">Adm {pct(t.taxa_adm_pct)} · FR {pct(t.fundo_reserva_pct)} · Antecip. {pct(t.antecip_pct)}</span>
                      </th>
                    ) : null;
                  })}
                </tr>
                <tr>
                  {colunas.map(({ tabela, forma }) => (
                    <th key={tabela.id + forma} colSpan={2} className={`border border-white/30 px-3 py-2 text-xs text-white ${forma === "cheia" ? "bg-[#35435A]" : "bg-[#7C5C99]"}`}>{rotulo(forma)}</th>
                  ))}
                </tr>
                <tr>
                  {colunas.map(({ tabela, forma }) => (
                    <React.Fragment key={tabela.id + forma}>
                      <th className="min-w-[130px] border border-white/40 bg-[#E0CE8C] px-3 py-2 text-xs text-[#1E293F]">
                        {Number(tabela.antecip_parcelas) > 1 ? `1ª a ${tabela.antecip_parcelas}ª parcelas` : "1ª parcela"}
                      </th>
                      <th className="min-w-[130px] border border-white/40 bg-[#E0CE8C] px-3 py-2 text-xs text-[#1E293F]">Demais parcelas</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, idx) => (
                  <tr key={linha.credito}>
                    <th className={`sticky left-0 z-10 border border-slate-200 px-4 py-3 text-left font-bold text-[#1E293F] ${idx % 2 ? "bg-slate-100" : "bg-white"}`}>{brl(linha.credito)}</th>
                    {linha.parcelas.map((parcela, i) => (
                      <React.Fragment key={colunas[i].tabela.id + colunas[i].forma}>
                        <td className="border border-slate-200 px-3 py-3 font-semibold tabular-nums text-slate-800">{parcela ? brl(parcela.primeira) : "—"}</td>
                        <td className="border border-slate-200 px-3 py-3 tabular-nums text-slate-800">{parcela ? brl(parcela.demais) : "—"}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!!creditos.length && <p className="mt-4 text-xs text-slate-500">
            Parcelas pré-contemplação para o prazo integral, calculadas conforme as taxas e formas de contratação de cada prazo, sem lance. A parcela inicial inclui a antecipação configurada. O seguro pode ser incluído ou retirado acima. Não estão projetados reajustes futuros. “—” indica indisponibilidade daquele crédito no prazo.
          </p>}
        </div>
      </div>
    </div>
  );
}
