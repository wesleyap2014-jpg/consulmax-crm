import React, { useMemo, useState } from "react";
import { BrainCircuit, Calculator, Loader2, Search, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MaxCota = {
  id: string;
  codigo: string;
  segmento: string;
  status: string;
  credito_disponivel: number;
  prazo_restante: number;
  valor_parcela: number;
  partner?: { id: string; nome: string } | null;
  admin?: { id: string; nome: string } | null;
  _calc: { entrada: number };
};

type Criteria = {
  min: number;
  max: number;
  entradaMax: number | null;
  parcelaMax: number | null;
  saldoMax: number | null;
  maxCotas: number;
  prioridade: "saldo" | "entrada" | "credito";
};

type Combination = {
  ids: string[];
  codes: string[];
  admin: string;
  parceiro: string;
  segmento: string;
  credito: number;
  entrada: number;
  parcelaInicial: number;
  saldoNominal: number;
  parcelamento: string[];
  count: number;
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseBR(value: string): number | null {
  const raw = value.replace(/[^\d,.]/g, "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\./g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ranges(items: MaxCota[]): string[] {
  const sorted = [...new Set(items.map((c) => Math.max(0, Math.floor(c.prazo_restante))))].filter(Boolean).sort((a, b) => a - b);
  let start = 1;
  return sorted.map((end) => {
    const amount = items.filter((c) => c.prazo_restante >= start).reduce((sum, c) => sum + c.valor_parcela, 0);
    const label = String(start) + " a " + String(end) + ": " + money(amount);
    start = end + 1;
    return label;
  });
}

function calculateCombination(items: MaxCota[], criteria: Criteria): Combination | null {
  const credito = items.reduce((sum, c) => sum + c.credito_disponivel, 0);
  if (credito < criteria.min - 0.01 || credito > criteria.max + 0.01) return null;

  const entrada = items.reduce((sum, c) => sum + c._calc.entrada, 0);
  const parcelaInicial = items.reduce((sum, c) => sum + c.valor_parcela, 0);
  const saldoNominal = items.reduce((sum, c) => sum + c.valor_parcela * c.prazo_restante, 0);
  if (criteria.entradaMax != null && entrada > criteria.entradaMax) return null;
  if (criteria.parcelaMax != null && parcelaInicial > criteria.parcelaMax) return null;
  if (criteria.saldoMax != null && saldoNominal > criteria.saldoMax) return null;

  return {
    ids: items.map((c) => c.id),
    codes: items.map((c) => c.codigo),
    admin: items[0].admin?.nome || "Não informada",
    parceiro: items[0].partner?.nome || "Não informado",
    segmento: items[0].segmento,
    credito, entrada, parcelaInicial, saldoNominal,
    parcelamento: ranges(items),
    count: items.length,
  };
}

function compareOffers(a: Combination, b: Combination, c: Criteria): number {
  const midpoint = (c.min + c.max) / 2;
  if (c.prioridade === "entrada") {
    return (a.entrada - b.entrada) || (a.saldoNominal - b.saldoNominal) || (Math.abs(a.credito - midpoint) - Math.abs(b.credito - midpoint));
  }
  if (c.prioridade === "credito") {
    return (Math.abs(a.credito - midpoint) - Math.abs(b.credito - midpoint)) || (a.saldoNominal - b.saldoNominal) || (a.entrada - b.entrada);
  }
  return (a.saldoNominal - b.saldoNominal) || (a.entrada - b.entrada) || (Math.abs(a.credito - midpoint) - Math.abs(b.credito - midpoint));
}

function searchCombinations(cotas: MaxCota[], criteria: Criteria): { matches: Combination[]; truncated: boolean } {
  const available = cotas.filter((c) =>
    c.status === "disponivel" &&
    Number.isFinite(c.credito_disponivel) && c.credito_disponivel > 0 &&
    Number.isFinite(c._calc.entrada) && c._calc.entrada >= 0 &&
    Number.isFinite(c.valor_parcela) && c.valor_parcela > 0 &&
    Number.isInteger(c.prazo_restante) && c.prazo_restante > 0
  );
  const groups = new Map<string, MaxCota[]>();
  for (const c of available) {
    // Preserve the existing manual combination rule: same partner, admin and segment.
    const key = [c.partner?.id || "", c.admin?.id || "", c.segmento].join("|");
    groups.set(key, [...(groups.get(key) || []), c]);
  }

  const all: Combination[] = [];
  const midpoint = (criteria.min + criteria.max) / 2;
  let truncated = false;
  for (const group of groups.values()) {
    // Cap the combinatorial search. The complete catalogue remains available in the table.
    const ranked = [...group].sort((a, b) => {
      const fit = (c: MaxCota) => Math.min(
        ...Array.from({ length: criteria.maxCotas }, (_, i) => Math.abs(c.credito_disponivel * (i + 1) - midpoint))
      );
      return fit(a) - fit(b) || a._calc.entrada - b._calc.entrada;
    });
    if (ranked.length > 50) truncated = true;
    const candidates = ranked.slice(0, 50);
    for (let i = 0; i < candidates.length; i++) {
      const one = calculateCombination([candidates[i]], criteria);
      if (one) all.push(one);
      if (criteria.maxCotas < 2) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const two = calculateCombination([candidates[i], candidates[j]], criteria);
        if (two) all.push(two);
        if (criteria.maxCotas < 3) continue;
        for (let k = j + 1; k < candidates.length; k++) {
          const three = calculateCombination([candidates[i], candidates[j], candidates[k]], criteria);
          if (three) all.push(three);
        }
      }
    }
  }
  all.sort((a, b) => compareOffers(a, b, criteria));
  return { matches: all.slice(0, 8), truncated };
}

export default function MaxContempladas({ cotas, sourceMode, onOpenCombination }: {
  cotas: MaxCota[];
  sourceMode: "externo" | "crm";
  onOpenCombination: (ids: string[]) => void;
}) {
  const [creditoMin, setCreditoMin] = useState("");
  const [creditoMax, setCreditoMax] = useState("");
  const [entradaMax, setEntradaMax] = useState("");
  const [parcelaMax, setParcelaMax] = useState("");
  const [saldoMax, setSaldoMax] = useState("");
  const [maxCotas, setMaxCotas] = useState(2);
  const [prioridade, setPrioridade] = useState<Criteria["prioridade"]>("saldo");
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [error, setError] = useState("");
  const [thinkingId, setThinkingId] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  const searchResult = useMemo(
    () => criteria ? searchCombinations(cotas, criteria) : { matches: [], truncated: false },
    [cotas, criteria]
  );

  function apply() {
    const minimum = parseBR(creditoMin);
    const maximum = parseBR(creditoMax);
    if ((minimum == null || minimum <= 0) && (maximum == null || maximum <= 0)) {
      setError("Informe ao menos um valor de crédito desejado.");
      return;
    }
    const min = minimum && minimum > 0 ? minimum : Math.max(1, (maximum || 0) * 0.95);
    const max = maximum && maximum > 0 ? maximum : min * 1.05;
    if (min > max) {
      setError("O crédito mínimo não pode superar o máximo.");
      return;
    }
    setError("");
    setAnalysis(""); setAnalysisError(""); setAnalysisId("");
    setCriteria({
      min, max, entradaMax: parseBR(entradaMax),
      parcelaMax: parseBR(parcelaMax), saldoMax: parseBR(saldoMax),
      maxCotas, prioridade,
    });
  }

  async function askMax(offer: Combination) {
    const key = offer.ids.join("|");
    setThinkingId(key);
    setAnalysisId(key); setAnalysis(""); setAnalysisError("");
    try {
      const response = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "livre",
          prompt: "Atue como analista comercial de cartas contempladas. Interprete os dados calculados pelo CRM em até 110 palavras, em português. Destaque principal vantagem, um cuidado da operação e como apresentá-la ao cliente. Não refaça nem invente valores. Não prometa rentabilidade ou condições não confirmadas. O saldo informado é apenas a soma nominal das parcelas vincendas, NÃO saldo devedor oficial; podem existir reajustes, seguro e taxas. Não oriente reserva automática.",
          context: {
            origem: sourceMode, administradora: offer.admin, segmento: offer.segmento,
            codigo_cotas: offer.codes, credito: offer.credito, entrada: offer.entrada,
            soma_nominal_parcelas_vincendas: offer.saldoNominal,
            parcela_inicial_somada: offer.parcelaInicial,
            faixas_parcelas: offer.parcelamento,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data?.answer !== "string") throw new Error(data?.error || "Análise indisponível.");
      setAnalysis(data.answer);
    } catch (cause: any) {
      setAnalysisError(cause?.message || "O MAX não conseguiu analisar esta operação.");
    } finally {
      setThinkingId("");
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: "rgba(181,165,115,.50)" }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#A11C27" }}>
            <BrainCircuit className="h-5 w-5" /> MAX · Inteligência de Contempladas
          </div>
          <h3 className="mt-1 text-lg font-bold" style={{ color: "#1E293F" }}>Encontre a melhor composição para seu cliente</h3>
          <p className="mt-1 text-xs text-slate-500">Pesquisa nas cotas carregadas do estoque {sourceMode === "externo" ? "externo" : "interno"}, respeitando os filtros da tela.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{cotas.filter((c) => c.status === "disponivel").length} cotas disponíveis</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Crédito mínimo (R$)</Label><Input inputMode="decimal" placeholder="110.000" value={creditoMin} onChange={(e) => setCreditoMin(e.target.value)} /></div>
        <div className="space-y-1"><Label>Crédito máximo (R$)</Label><Input inputMode="decimal" placeholder="120.000" value={creditoMax} onChange={(e) => setCreditoMax(e.target.value)} /></div>
        <div className="space-y-1"><Label>Entrada máxima (R$)</Label><Input inputMode="decimal" placeholder="Opcional" value={entradaMax} onChange={(e) => setEntradaMax(e.target.value)} /></div>
        <div className="space-y-1"><Label>Parcela inicial máxima (R$)</Label><Input inputMode="decimal" placeholder="Opcional" value={parcelaMax} onChange={(e) => setParcelaMax(e.target.value)} /></div>
        <div className="space-y-1"><Label>Soma nominal máxima (R$)</Label><Input inputMode="decimal" placeholder="Opcional" value={saldoMax} onChange={(e) => setSaldoMax(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Máximo de cotas na junção</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={maxCotas} onChange={(e) => setMaxCotas(Number(e.target.value))}>
            <option value={1}>Somente cota individual</option><option value={2}>Até 2 cotas</option><option value={3}>Até 3 cotas</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Priorizar</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Criteria["prioridade"])}>
            <option value="saldo">Menor soma nominal restante</option><option value="entrada">Menor entrada</option><option value="credito">Crédito mais próximo do centro</option>
          </select>
        </div>
        <div className="flex items-end"><Button onClick={apply} className="w-full text-white" style={{ background: "#A11C27" }}><Search className="mr-2 h-4 w-4" /> Encontrar operações</Button></div>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {criteria ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm" style={{ color: "#1E293F" }}>Melhores opções · {money(criteria.min)} a {money(criteria.max)}</strong>
            <span className="text-xs text-slate-500">Até {searchResult.matches.length} sugestões ordenadas pelo critério escolhido</span>
          </div>
          {searchResult.matches.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">Nenhuma combinação disponível atende a todos os limites. Amplie o intervalo de crédito ou revise a entrada, a parcela e o limite nominal.</p> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {searchResult.matches.map((offer, index) => {
              const id = offer.ids.join("|");
              return (
                <article key={id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#A11C27" }}>Opção {index + 1} · {offer.count} {offer.count === 1 ? "cota" : "cotas"}</span>
                    <span className="text-xs text-slate-500">{offer.admin}</span>
                  </div>
                  <div className="mt-2 text-xl font-bold" style={{ color: "#1E293F" }}>{money(offer.credito)}</div>
                  <p className="mt-1 text-xs text-slate-500">{offer.segmento} · Código(s): {offer.codes.join(" + ")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">Entrada</p><strong>{money(offer.entrada)}</strong></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">Parcelas vincendas (nominal)</p><strong>{money(offer.saldoNominal)}</strong></div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">{offer.parcelamento.map((line) => <div key={line}>{line}</div>)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onOpenCombination(offer.ids)}><Calculator className="mr-2 h-4 w-4" /> Abrir resumo</Button>
                    <Button size="sm" variant="outline" disabled={!!thinkingId} onClick={() => void askMax(offer)}>
                      {thinkingId === id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Analisar com MAX
                    </Button>
                  </div>
                  {analysisId === id && analysis ? <p className="mt-3 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-slate-700">{analysis}</p> : null}
                  {analysisId === id && analysisError ? <p role="alert" className="mt-3 text-xs text-red-700">{analysisError}</p> : null}
                </article>
              );
            })}
          </div>
          {searchResult.truncated ? <p className="flex items-start gap-2 text-xs text-amber-800"><TriangleAlert className="h-4 w-4 shrink-0" /> Para manter a busca rápida, o MAX analisou até 50 cotas pré-selecionadas em cada conjunto compatível. O resultado não é exaustivo.</p> : null}
          <p className="text-xs text-slate-500">A soma nominal das parcelas vincendas é estimativa comparativa, não o saldo devedor oficial. Pode mudar com reajustes e encargos. Disponibilidade e valores precisam ser confirmados antes da reserva. Nenhuma reserva é realizada automaticamente.</p>
        </div>
      ) : null}
    </section>
  );
}
