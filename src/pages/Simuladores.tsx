// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;
type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name?: string; nome?: string; id?: UUID };
type UserRow = { id: UUID; name?: string; phone?: string | null };

type SimTable = {
  id: UUID;
  admin_id?: UUID;
  segmento: string;
  nome_tabela: string;
  faixa_min: number;
  faixa_max: number;
  prazo_limite: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  antecip_pct: number;
  antecip_parcelas: number;
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  contrata_parcela_cheia?: boolean;
  contrata_reduzida_25?: boolean;
  contrata_reduzida_50?: boolean;
  permite_lance_embutido?: boolean;
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

type IndexManual = { code: string; pct12m: number };

/* ========================= Helpers ========================= */
const brMoney = (v?: number) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const pctHuman = (v = 0) => (v * 100).toFixed(4) + "%";

function parsePctInputToDecimal(s: string) {
  const clean = (s || "").replace(/\s|%/g, "").replace(",", ".").replace("--", "");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val / 100;
}
function formatPctInputFromDecimal(d: number) {
  return (d * 100).toFixed(4).replace(".", ",");
}

function formatBRLInputFromNumber(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string) {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number) {
  if ((segmento || "").toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/* ========================= Cálculo ========================= */
type ExtratoItem = {
  parcelaN: number;
  creditoNaqueleMes: number; // crédito líquido vigente (após embutido, quando aplicável)
  valorPago: number;
  reajusteAplicado: number;
  saldoDevedor: number;
  investimentoAcumulado: number;
  evento?: string;
};

type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  tabela: SimTable;
  seguroPrest: boolean;
  parcContemplacao: number;
  lanceOfertPct: number; // oferta total sobre CRÉDITO ORIGINAL
  lanceEmbutPct: number; // embutido sobre CRÉDITO CORRIGIDO no mês da contemplação (<=0.25)
  indexManual: IndexManual; // usa percentuais que usuário digitou
};

type CalcResult = {
  parcelaAte: number;
  parcelaDemais: number;
  lanceOfertadoValor: number;
  lanceEmbutidoValor: number;
  lanceProprioValor: number;
  novoCredito: number;
  novaParcelaSemLimite: number;
  parcelaLimitante: number;
  parcelaEscolhida: number;
  extrato: ExtratoItem[];
  aplicadoLimitador: boolean;
};

function calcularSimulacao(i: CalcInput): CalcResult {
  const {
    credito: C0,
    prazoVenda,
    forma,
    tabela,
    parcContemplacao,
    lanceOfertPct,
    lanceEmbutPct,
    indexManual,
  } = i;

  const taxaAdmFull = tabela.taxa_adm_pct;
  const frPct = tabela.fundo_reserva_pct;
  const antecipPct = tabela.antecip_pct;
  const antecipParcelas = tabela.antecip_parcelas || 0;
  const indexPct = indexManual?.pct12m ?? 0;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const mCont = Math.max(1, Math.min(parcContemplacao, prazo));

  // cálculo das partes fixas (com base no crédito contratado)
  const admValor = C0 * taxaAdmFull;
  const frValor = C0 * frPct;
  const valorCategoriaBase = C0 * (1 + taxaAdmFull + frPct);

  // fatores forma
  const fundoComumFactor = forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  // parcela pré-contemplação (sem seguro)
  const baseMensalSemSeguro = (C0 * fundoComumFactor + C0 * TA_efetiva + C0 * frPct) / prazo;
  const antecipAdicionalCada = antecipParcelas > 0 ? (C0 * antecipPct) / antecipParcelas : 0;
  const parcelaAte = baseMensalSemSeguro + (anticipParcelas > 0 ? antecipAdicionalCada : 0);
  const parcelaDemais = baseMensalSemSeguro;

  // extrato
  const extrato: ExtratoItem[] = [];
  let C_corr = C0; // crédito corrigido (para reajustes pré)
  let saldo = C0 + admValor + frValor;
  let investimento = 0;

  // função para recomputar parcela pré-contemplação quando ocorre reajuste
  const recomputePre = (mesAtual: number) => {
    const pagos = extrato.filter(e => e.parcelaN <= mesAtual - 1).reduce((s, e) => s + e.valorPago, 0);
    const totalBase = C_corr + admValor + frValor;
    const rem = Math.max(1, prazo - (mesAtual - 1));
    return Math.max(0, (totalBase - pagos) / rem) * fundoComumFactor + (mesAtual <= antecipParcelas ? antecipAdicionalCada : 0);
  };

  // --- meses 1 .. mCont (pré-contemplação) ---
  for (let mes = 1; mes <= mCont; mes++) {
    const isAniver = mes > 1 && ((mes - 1) % 12 === 0);
    let reajusteAplicado = 0;
    if (isAniver) {
      // reajusta C_corr e soma ao saldo (planilha)
      reajusteAplicado = C_corr * indexPct;
      C_corr = C_corr * (1 + indexPct);
      saldo += reajusteAplicado;
    }

    // se houver reajuste, recomputar parcela pré
    let parcelaSemSeguro = recomputePre(mes);
    const valorPago = parcelaSemSeguro;
    saldo = Math.max(0, saldo - valorPago);
    investimento += valorPago;

    extrato.push({
      parcelaN: mes,
      creditoNaqueleMes: C_corr,
      valorPago,
      reajusteAplicado,
      saldoDevedor: saldo,
      investimentoAcumulado: investimento,
      evento: isAniver ? "Reajuste pré-contemplação" : undefined,
    });
  }

  // no mês da contemplação aplicam-se lances
  // lanceEmbuto sobre C_corr
  const lanceEmbutidoValor = C_corr * lanceEmbutPct;
  const novoCredito = Math.max(0, C_corr - lanceEmbutidoValor);
  const lanceOfertadoValor = C0 * lanceOfertPct; // sua regra: ofertado é sobre CRÉDITO ORIGINAL
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);

  // abatimento do saldo pelo lance ofertado (após pagamento do mês)
  saldo = Math.max(0, saldo - lanceOfertadoValor);

  // pós-contemplação: recalcula parcela sem limite com saldo atual e prazo restante
  const prazoRestanteInicial = Math.max(1, prazo - mCont);
  let novaParcelaSemLimite = saldo / prazoRestanteInicial;
  const limitadorBase = resolveLimitadorPct(tabela.limitador_parcela_pct, tabela.segmento, C0);
  const parcelaLimitante = (novoCredito + admValor + frValor) * limitadorBase;
  let parcelaEscolhidaSemSeguro = Math.max(novaParcelaSemLimite, parcelaLimitante);

  // aplica regra: quando forma reduzida, depois da contemplação volta a considerar CRÉDITO ORIGINAL (C0) corrigido já feito
  // Observação: já consideramos novoCredito correto (C_corr - embutido) e saldo ajustado acima.

  // --- meses pós contemplação ---
  let mesAtual = mCont + 1;
  let prazoRestante = prazo - mCont;
  let aplicouLimitador = parcelaEscolhidaSemSeguro === parcelaLimitante && parcelaLimitante > novaParcelaSemLimite;

  while (mesAtual <= prazo && saldo > 0.01) {
    const isAniver = mesAtual > 1 && ((mesAtual - 1) % 12 === 0);
    let reajusteAplicado = 0;
    if (isAniver) {
      reajusteAplicado = saldo * indexPct;
      saldo += reajusteAplicado;
      // recompute parcela
      prazoRestante = Math.max(1, prazo - (mesAtual - 1));
      novaParcelaSemLimite = saldo / prazoRestante;
      // recompute limitante (limitante é função do crédito líquido vigente)
      const parcelaLim = (novoCredito + admValor + frValor) * limitadorBase;
      parcelaEscolhidaSemSeguro = Math.max(novaParcelaSemLimite, parcelaLim);
      aplicouLimitador = aplicouLimitador || parcelaEscolhidaSemSeguro > novaParcelaSemLimite;
      extrato.push({
        parcelaN: mesAtual - 1,
        creditoNaqueleMes: novoCredito,
        valorPago: 0,
        reajusteAplicado,
        saldoDevedor: saldo,
        investimentoAcumulado: investimento,
        evento: "Reajuste pós-contemplação",
      });
    }

    const valorPago = parcelaEscolhidaSemSeguro;
    saldo = Math.max(0, saldo - valorPago);
    investimento += valorPago;

    extrato.push({
      parcelaN: mesAtual,
      creditoNaqueleMes: novoCredito,
      valorPago,
      reajusteAplicado: 0,
      saldoDevedor: saldo,
      investimentoAcumulado: investimento,
      evento: undefined,
    });

    mesAtual++;
  }

  return {
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    novoCredito,
    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida: parcelaEscolhidaSemSeguro,
    extrato,
    aplicadoLimitador: aplicouLimitador,
  };
}
/* ========== Inputs com máscara (Money / Percent) ========== */
function MoneyInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      value={formatBRLInputFromNumber(value || 0)}
      onChange={(e) => onChange(parseBRLInputToNumber(e.target.value))}
      className={`text-right ${rest.className || ""}`}
    />
  );
}
function PercentInput({ valueDecimal, onChangeDecimal, maxDecimal, ...rest }: { valueDecimal: number; onChangeDecimal: (d: number) => void; maxDecimal?: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  const display = formatPctInputFromDecimal(valueDecimal || 0);
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          let d = parsePctInputToDecimal(e.target.value);
          if (typeof maxDecimal === "number") d = Math.max(0, Math.min(maxDecimal, d));
          onChangeDecimal(d);
        }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ========================= Página ======================== */
export default function SimuladoresPage() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  // formulário
  const [leadId, setLeadId] = useState<string>("");
  const [grupo, setGrupo] = useState<string>("");
  const [segmento, setSegmento] = useState<string>("");
  const [nomeTabela, setNomeTabela] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");
  const [credito, setCredito] = useState<number>(100000);
  const [prazoVenda, setPrazoVenda] = useState<number>(240);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);
  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0.25);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0.25);
  const [parcContemplacao, setParcContemplacao] = useState<number>(27);

  const [indexManualList, setIndexManualList] = useState<IndexManual[]>([
    { code: "IPCA", pct12m: 0.039 },
    { code: "INCC", pct12m: 0 },
    { code: "IGP-M", pct12m: 0 },
  ]);
  const [indexSelected, setIndexSelected] = useState<string>("IPCA");

  // resultado
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [simSaving, setSimSaving] = useState(false);
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [mgrOpen, setMgrOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [tRes, lRes, aRes, uRes] = await Promise.all([
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id,nome,telefone"),
        supabase.from("sim_admins").select("id,name"),
        supabase.from("public.users").select("id,name,phone"),
      ]);
      setTables(tRes.data ?? []);
      setLeads((lRes.data ?? []) as Lead[]);
      setAdmins((aRes.data ?? []) as any);
      setUsers((uRes.data ?? []) as any);
      setActiveAdminId((aRes.data ?? [])[0]?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const tabelaSelecionada = useMemo(() => tables.find(t => t.id === tabelaId) || null, [tables, tabelaId]);

  // índice corrente (manual)
  const indexManual = useMemo(() => indexManualList.find(i => i.code === indexSelected) || indexManualList[0], [indexManualList, indexSelected]);

  // recalcula quando inputs mudam
  useEffect(() => {
    if (!tabelaSelecionada) { setCalc(null); return; }
    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      tabela: tabelaSelecionada,
      seguroPrest,
      parcContemplacao,
      lanceOfertPct,
      lanceEmbutPct: Math.min(0.25, Math.max(0, lanceEmbutPct)),
      indexManual,
    };
    setCalc(calcularSimulacao(inp));
  }, [credito, prazoVenda, forma, tabelaId, tabelaSelecionada, seguroPrest, parcContemplacao, lanceOfertPct, lanceEmbutPct, indexManual]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }
  /* ============== UI ============== */
  const leadInfo = leads.find(l => l.id === leadId) || null;
  const loggedUser = users[0] || null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2 items-center">
        {admins.map(a => (
          <Button key={a.id} variant={activeAdminId === a.id ? "default" : "secondary"} onClick={() => setActiveAdminId(a.id)}>
            {a.name || a.nome}
          </Button>
        ))}
        <div className="ml-auto">
          <Button onClick={() => setMgrOpen(true)} variant="secondary" size="sm">Gerenciar Tabelas</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Selecionar Lead</Label>
                <select className="w-full h-10 border rounded-md px-3" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">-- escolher --</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                {leadInfo && <div className="text-xs text-muted-foreground mt-1">{leadInfo.nome} • {leadInfo.telefone}</div>}
              </div>

              <div>
                <Label>Valor do Crédito</Label>
                <MoneyInput value={credito} onChange={setCredito} />
              </div>

              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input type="number" value={prazoVenda} onChange={(e) => setPrazoVenda(Number(e.target.value))} />
              </div>

              <div>
                <Label>Forma de Contratação</Label>
                <select className="w-full h-10 border rounded-md px-3" value={forma} onChange={(e) => setForma(e.target.value as any)}>
                  <option value="Parcela Cheia">Parcela Cheia</option>
                  <option value="Reduzida 25%">Reduzida 25%</option>
                  <option value="Reduzida 50%">Reduzida 50%</option>
                </select>
              </div>

              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={parcContemplacao} onChange={(e) => setParcContemplacao(Math.max(1, Number(e.target.value)))} />
              </div>

              <div>
                <Label>Lance Ofertado (%)</Label>
                <PercentInput valueDecimal={lanceOfertPct} onChangeDecimal={setLanceOfertPct} />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <PercentInput valueDecimal={lanceEmbutPct} maxDecimal={0.25} onChangeDecimal={(d) => setLanceEmbutPct(Math.min(0.25, d))} />
              </div>

              <div className="col-span-2">
                <Label>Índice de Correção (manual)</Label>
                <div className="flex gap-2 items-center">
                  {indexManualList.map(idx => (
                    <button key={idx.code} onClick={() => setIndexSelected(idx.code)} className={`px-2 py-1 rounded ${indexSelected === idx.code ? "bg-slate-800 text-white" : "bg-slate-100"}`}>
                      {idx.code} {(idx.pct12m*100).toFixed(2)}%
                    </button>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => {
                    // abrir modal simples para editar índices
                    const code = window.prompt("Código do índice (ex: IPCA)") || "";
                    const pct = parseFloat(window.prompt("Valor 12m em % (ex: 3.9)") || "0");
                    if (code) {
                      setIndexManualList(prev => {
                        const existing = prev.find(p => p.code === code);
                        if (existing) {
                          return prev.map(p => p.code === code ? { ...p, pct12m: pct / 100 } : p);
                        }
                        return [...prev, { code, pct12m: pct / 100 }];
                      });
                    }
                  }}>Editar índices</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Parcela 1 / Parcelas antecipadas</Label>
                <Input value={calc ? brMoney(calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais parcelas (pré)</Label>
                <Input value={calc ? brMoney(calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><Label>Lance Ofertado</Label><Input value={calc ? brMoney(calc.lanceOfertadoValor) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={calc ? brMoney(calc.lanceEmbutidoValor) : ""} readOnly /></div>
              <div><Label>Lance Próprio</Label><Input value={calc ? brMoney(calc.lanceProprioValor) : ""} readOnly /></div>

              <div><Label>Novo Crédito</Label><Input value={calc ? brMoney(calc.novoCredito) : ""} readOnly /></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input value={calc ? brMoney(calc.novaParcelaSemLimite) : ""} readOnly /></div>
              <div><Label>Parcela Limitante</Label><Input value={calc ? brMoney(calc.parcelaLimitante) : ""} readOnly /></div>

              <div><Label>Parcela Escolhida</Label><Input value={calc ? brMoney(calc.parcelaEscolhida) : ""} readOnly /></div>
              <div><Label>Aplicou Limitador?</Label><Input value={calc ? (calc.aplicadoLimitador ? "Sim" : "Não") : ""} readOnly /></div>
              <div><Label>Novo Prazo (estimado)</Label><Input value={calc ? String(Math.max(1, Math.ceil((calc.extrato?.length ?? 0) - parcContemplacao))) : ""} readOnly /></div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={async () => {
              // salvar simulação - payload simplificado
              if (!tabelaSelecionada) { alert("Selecione tabela"); return; }
              setSimSaving(true);
              const payload = {
                admin_id: activeAdminId,
                table_id: tabelaSelecionada.id,
                lead_id: leadId || null,
                credito,
                prazo_venda: prazoVenda,
                forma_contratacao: forma,
                parcela_contemplacao: parcContemplacao,
                lance_ofertado_pct: lanceOfertPct,
                lance_embutido_pct: lanceEmbutPct,
                index_manual: JSON.stringify(indexManualList),
              };
              const { error } = await supabase.from("sim_simulations").insert(payload);
              setSimSaving(false);
              if (error) alert("Erro: " + error.message);
              else alert("Simulação salva.");
            }} disabled={!calc || simSaving}>{simSaving ? "Salvando..." : "Salvar Simulação"}</Button>

            <Button variant="secondary" onClick={() => setExtratoOpen(true)} disabled={!calc}>Gerar Extrato</Button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent>
              <textarea readOnly className="w-full h-56 p-2" value={(() => {
                if (!calc) return "";
                return `Crédito: ${brMoney(credito)}\nParcela até contemplação: ${brMoney(calc.parcelaAte)}\nParcela pós: ${brMoney(calc.parcelaEscolhida)}\nNovo crédito: ${brMoney(calc.novoCredito)}\nLance próprio: ${brMoney(calc.lanceProprioValor)}\nAplicou limitador: ${calc.aplicadoLimitador ? "Sim" : "Não"}`;
              })()} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Índices Manuais</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {indexManualList.map(idx => (
                  <div key={idx.code} className="flex items-center gap-2">
                    <div className="w-20 font-medium">{idx.code}</div>
                    <Input value={(idx.pct12m * 100).toFixed(2)} onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setIndexManualList(prev => prev.map(p => p.code === idx.code ? { ...p, pct12m: v/100 } : p));
                    }} />
                    <Button variant="secondary" onClick={() => setIndexSelected(idx.code)}>Usar</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Extrato Modal */}
      {extratoOpen && calc && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <div className="text-lg font-bold">Extrato detalhado da simulação</div>
                <div className="text-sm text-muted-foreground">Dados da Simulação e detalhe mês a mês</div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setExtratoOpen(false)}>Fechar</Button>
                <Button onClick={() => {
                  // gerar PDF
                  const doc = new jsPDF("p", "mm", "a4");
                  // logo
                  try { doc.addImage("/logo-consulmax.png", "PNG", 12, 8, 40, 18); } catch {}
                  doc.setFontSize(14); doc.setFont("helvetica", "bold");
                  doc.text("EXTRATO DE SIMULAÇÃO", 105, 16, { align: "center" });
                  doc.setFontSize(10); doc.setFont("helvetica", "normal");
                  const headerLines = [
                    `Corretora: Consulmax | CNPJ: 00.000.000/0000-00 | Administradora: ${admins.find(a=>a.id===activeAdminId)?.name||"—"}`,
                    `Usuário: ${loggedUser?.name||"Usuário Logado"} | Telefone: ${loggedUser?.phone||"—"}`,
                    `Lead: ${leadInfo?.nome||"—"} | Telefone: ${leadInfo?.telefone||"—"}`,
                    `Segmento: ${tabelaSelecionada?.segmento||"—"} | Índice: ${indexSelected} (${(indexManualList.find(x=>x.code===indexSelected)?.pct12m||0)*100}%)`
                  ];
                  doc.text(headerLines, 12, 32);
                  // tabela do extrato
                  const body = calc.extrato.map(r => ([
                    r.parcelaN, brMoney(r.creditoNaqueleMes), brMoney(r.valorPago), r.reajusteAplicado ? brMoney(r.reajusteAplicado) : "—", brMoney(r.saldoDevedor), brMoney(r.investimentoAcumulado), r.evento || "—"
                  ]));
                  autoTable(doc, {
                    startY: 48,
                    head: [["Parc", "Crédito", "Valor Pago", "Reajuste", "Saldo", "Investimento", "Evento"]],
                    body,
                    styles: { fontSize: 9 },
                    margin: { left: 8, right: 8 },
                    headStyles: { fillColor: [230, 230, 230] },
                  });
                  doc.save("extrato-simulacao.pdf");
                }}>Baixar em PDF</Button>
              </div>
            </div>

            <div style={{ maxHeight: "60vh", overflow: "auto" }}>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Parcela</th>
                    <th className="text-left p-2">Crédito</th>
                    <th className="text-right p-2">Valor Pago</th>
                    <th className="text-right p-2">Reajuste</th>
                    <th className="text-right p-2">Saldo Devedor</th>
                    <th className="text-right p-2">Investimento</th>
                    <th className="text-left p-2">Evento</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.extrato.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{r.parcelaN}</td>
                      <td className="p-2">{brMoney(r.creditoNaqueleMes)}</td>
                      <td className="p-2 text-right">{brMoney(r.valorPago)}</td>
                      <td className="p-2 text-right">{r.reajusteAplicado ? brMoney(r.reajusteAplicado) : "—"}</td>
                      <td className="p-2 text-right">{brMoney(r.saldoDevedor)}</td>
                      <td className="p-2 text-right">{brMoney(r.investimentoAcumulado)}</td>
                      <td className="p-2">{r.evento || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Gerenciador de Tabelas : link para modal simplificado */}
      {mgrOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl rounded p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Gerenciador de Tabelas</h3>
              <button onClick={() => setMgrOpen(false)}><X /></button>
            </div>
            <div className="mt-4">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-left">Prazo</th>
                    <th className="p-2 text-left">% Adm</th>
                    <th className="p-2 text-left">% FR</th>
                    <th className="p-2 text-left">% Lim</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2">{t.segmento}</td>
                      <td className="p-2">{t.nome_tabela}</td>
                      <td className="p-2">{t.prazo_limite}</td>
                      <td className="p-2">{pctHuman(t.taxa_adm_pct)}</td>
                      <td className="p-2">{pctHuman(t.fundo_reserva_pct)}</td>
                      <td className="p-2">{pctHuman(t.limitador_parcela_pct)}</td>
                      <td className="p-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="secondary" size="sm" onClick={() => {
                            // editar - simplificado: prompt
                            const taxa = parseFloat(window.prompt("% Adm (ex 22)") || String(t.taxa_adm_pct*100))/100;
                            const fr = parseFloat(window.prompt("% FR (ex 2)") || String(t.fundo_reserva_pct*100))/100;
                            supabase.from("sim_tables").update({ taxa_adm_pct: taxa, fundo_reserva_pct: fr }).eq("id", t.id).then(r => {
                              if (r.error) alert("Erro: " + r.error.message);
                              else window.location.reload();
                            });
                          }}><Pencil /></Button>
                          <Button variant="destructive" size="sm" onClick={() => {
                            if (!confirm("Confirmar exclusão?")) return;
                            supabase.from("sim_tables").delete().eq("id", t.id).then(r => {
                              if (r.error) alert("Erro: " + r.error.message); else window.location.reload();
                            });
                          }}><Trash2 /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={() => setMgrOpen(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
