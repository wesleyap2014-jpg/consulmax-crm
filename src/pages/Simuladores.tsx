// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

// ==== PDF
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ========================= Tipos =========================
type UUID = string;

type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string };

type SimTable = {
  id: UUID;
  admin_id: UUID;
  segmento: string;
  nome_tabela: string;
  faixa_min: number;
  faixa_max: number;
  prazo_limite: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  antecip_pct: number;
  antecip_parcelas: number; // 0|1|2
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  permite_lance_embutido: boolean;
  permite_lance_fixo_25: boolean;
  permite_lance_fixo_50: boolean;
  permite_lance_livre: boolean;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

// ======================= Helpers =========================
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pctHuman = (d: number) => `${(d * 100).toFixed(4)}%`;

function parseBRL(s: string) {
  const n = Number((s || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return isFinite(n) ? n : 0;
}
function maskBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function maskPct(d: number, digits = 4) {
  return (d * 100).toFixed(digits).replace(".", ",");
}
function unmaskPct(s: string) {
  const x = s.replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(x);
  return isFinite(n) ? n / 100 : 0;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function formatPhoneBR(s?: string | null) {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

// ======================= Cálculo =========================
type ExtratoItem = {
  parcelaN: number;
  creditoMes: number;        // crédito vigente do mês (pré: C_corr; pós: novoCredito)
  valorParcela: number;      // pago no mês (com seguro, se marcado)
  reajusteAplicado: number;  // valor do reajuste lançado no saldo (>=0)
  saldoAposPagamento: number;
  investimento: number;      // acumulado de pagamentos
  evento?: string;           // texto: reajuste pré/pós, lance, etc.
};

type CalcInput = {
  credito: number;           // C0
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;
  taxaAdmFull: number;       // % total
  frPct: number;
  antecipPct: number;        // % da adm antecipada
  antecipParcelas: 0 | 1 | 2;
  limitadorPct: number;
  seguroPrestPct: number;
  lanceOfertPct: number;     // % sobre C_corr (conforme pedido)
  lanceEmbutPct: number;     // % sobre C_corr (máx 25%)
  parcContemplacao: number;  // mês
  indexPct: number;          // acumulado 12m selecionado no overlay (decimal)
};

type CalcResult = {
  valorCategoria: number;
  parcelaAte: number;
  parcelaDemais: number;

  lanceOfertadoValor: number;
  lanceEmbutidoValor: number;
  lanceProprioValor: number;
  lancePercebidoPct: number;

  novoCredito: number;             // C_corr - embutido (no mês da contemplação)
  novaParcelaSemLimite: number;    // saldo pós-lance / prazoRestante
  parcelaLimitante: number;        // (novoCredito + adm + fr) * limitador
  parcelaEscolhida: number;        // max(novaParcelaSemLimite, parcelaLimitante)

  saldoDevedorFinal: number;
  novoPrazo: number;

  TA_efetiva: number;
  fundoComumFactor: number;
  antecipAdicionalCada: number;
  segundaParcelaComAntecipacao: number | null;
  has2aAntecipDepois: boolean;
  aplicouLimitador: boolean;

  extrato: ExtratoItem[];
};

function calcularSimulacao(i: CalcInput): CalcResult {
  const {
    credito: C0,
    prazoVenda,
    forma,
    seguro,
    segmento,
    taxaAdmFull,
    frPct,
    antecipPct,
    antecipParcelas,
    limitadorPct,
    seguroPrestPct,
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
    indexPct,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const mCont = Math.max(1, Math.min(parcContemplacao, prazo));

  // fator pré-contemplação
  const fc =
    forma === "Parcela Cheia" ? 1 :
    forma === "Reduzida 25%"  ? 0.75 :
    0.5;

  // Taxa adm efetiva = total - antecipada
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);
  const admValor = C0 * taxaAdmFull;
  const frValor = C0 * frPct;

  // Seguro por parcela
  const valorCategoria = C0 * (1 + taxaAdmFull + frPct);
  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;

  const antecipAdicionalCada = antecipParcelas > 0 ? (C0 * antecipPct) / antecipParcelas : 0;

  // parcela-base sem seguro (pré)
  const baseMensalSemSeguro = (C0 * fc + C0 * TA_efetiva + C0 * frPct) / prazo;
  const parcelaAte = baseMensalSemSeguro + (antecipParcelas ? antecipAdicionalCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // ====== extrato mês a mês
  const extrato: ExtratoItem[] = [];
  let investimento = 0;

  let C_corr = C0;                       // crédito vigente pré-contemplação
  let saldo = C0 + admValor + frValor;   // saldo devedor “macro”
  let parcelaSemSeguro = baseMensalSemSeguro;

  // recomputa a parcela “macro” pré (garantir distribuição correta)
  const recomputePre = (mesAtual: number) => {
    const pagosSemSeguro = extrato
      .filter(e => e.parcelaN < mesAtual)
      .reduce((acc, e) => acc + Math.max(0, e.valorParcela - seguroMensal), 0);
    const totalBase = C_corr + admValor + frValor;
    const rem = Math.max(1, prazo - (mesAtual - 1));
    const nova = Math.max(0, (totalBase - pagosSemSeguro) / rem);
    return nova * (fc === 1 ? 1 : 1); // aqui a base já contemplou fc na abertura
  };

  for (let mes = 1; mes <= mCont; mes++) {
    // aniversário (13, 25, 37...) — pré: reajuste sobre CRÉDITO TOTAL
    const isAniver = mes > 1 && ((mes - 1) % 12 === 0);
    if (isAniver) {
      const acresc = C_corr * indexPct;
      C_corr += acresc;           // crédito do mês muda (ex.: 103.900,00)
      saldo += acresc;            // reajuste somado ao saldo
      parcelaSemSeguro = recomputePre(mes);
      extrato.push({
        parcelaN: mes - 1,
        creditoMes: C_corr,
        valorParcela: 0,
        reajusteAplicado: acresc,
        saldoAposPagamento: saldo,
        investimento,
        evento: "Reajuste pré-contemplação",
      });
    }

    const comAnt = mes <= antecipParcelas ? antecipAdicionalCada : 0;
    const pagarSemSeguro = parcelaSemSeguro + comAnt;
    saldo = Math.max(0, saldo - pagarSemSeguro);

    const pagoComSeguro = pagarSemSeguro + seguroMensal;
    investimento += pagoComSeguro;

    extrato.push({
      parcelaN: mes,
      creditoMes: C_corr,
      valorParcela: pagoComSeguro,
      reajusteAplicado: 0,
      saldoAposPagamento: saldo,
      investimento,
    });
  }

  // ====== mês da contemplação
  // base do lance: C_corr (pedido)
  const lanceEmbutidoValor = clamp(C_corr * lanceEmbutPct, 0, C_corr * 0.25);
  const lanceOfertadoValor = Math.max(0, C_corr * lanceOfertPct);
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);

  const novoCredito = Math.max(0, C_corr - lanceEmbutidoValor); // crédito líquido
  saldo = Math.max(0, saldo - lanceOfertadoValor);              // abate lance ofertado do saldo

  // ====== pós-contemplação
  const prazoRestante = Math.max(1, prazo - mCont);
  const baseLimitante = (novoCredito + admValor + frValor) * limitadorPct;
  const novaParcelaSemLimite = saldo / prazoRestante;
  const parcelaEscolhidaSemSeguro = Math.max(novaParcelaSemLimite, baseLimitante);
  const aplicouLimitador = parcelaEscolhidaSemSeguro > novaParcelaSemLimite;

  // continua o extrato mês a mês (agora sem redutor; reajuste sobre SALDO)
  let mesAtual = mCont + 1;
  let saldoPos = saldo;

  while (mesAtual <= prazo && saldoPos > 0.01) {
    const isAniver = mesAtual > 1 && ((mesAtual - 1) % 12 === 0);
    if (isAniver) {
      const acresc = saldoPos * indexPct;
      saldoPos += acresc;
      extrato.push({
        parcelaN: mesAtual - 1,
        creditoMes: novoCredito,
        valorParcela: 0,
        reajusteAplicado: acresc,
        saldoAposPagamento: saldoPos,
        investimento,
        evento: "Reajuste pós-contemplação",
      });
    }

    saldoPos = Math.max(0, saldoPos - parcelaEscolhidaSemSeguro);
    const pagoComSeguro = parcelaEscolhidaSemSeguro + seguroMensal;
    investimento += pagoComSeguro;

    extrato.push({
      parcelaN: mesAtual,
      creditoMes: novoCredito,
      valorParcela: pagoComSeguro,
      reajusteAplicado: 0,
      saldoAposPagamento: saldoPos,
      investimento,
    });
    mesAtual++;
  }

  // anotação de lance (linha informativa)
  extrato.push({
    parcelaN: mCont,
    creditoMes: C_corr,
    valorParcela: 0,
    reajusteAplicado: 0,
    saldoAposPagamento: saldo,
    investimento,
    evento: `Lance ofertado: ${brMoney(lanceOfertadoValor)} • Embutido: ${brMoney(lanceEmbutidoValor)} • Próprio: ${brMoney(lanceProprioValor)}`,
  });

  const has2aAntecipDepois = antecipParcelas >= 2 && mCont === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois
    ? parcelaEscolhidaSemSeguro + antecipAdicionalCada
    : null;

  return {
    valorCategoria,
    parcelaAte,
    parcelaDemais,

    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,

    novoCredito,
    novaParcelaSemLimite,
    parcelaLimitante: baseLimitante,
    parcelaEscolhida: parcelaEscolhidaSemSeguro,

    saldoDevedorFinal: saldoPos,
    novoPrazo: prazoRestante,

    TA_efetiva,
    fundoComumFactor: fc,
    antecipAdicionalCada,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
    aplicouLimitador,

    extrato,
  };
}
/* ===== Inputs com máscara ===== */
function MoneyInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      value={maskBRL(value || 0)}
      onChange={(e) => onChange(parseBRL(e.target.value))}
      className={`text-right ${rest.className || ""}`}
    />
  );
}
function PercentInput({
  valueDecimal, onChangeDecimal, maxDecimal, ...rest
}: { valueDecimal: number; onChangeDecimal: (d: number) => void; maxDecimal?: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={maskPct(valueDecimal)}
        onChange={(e) => {
          let d = unmaskPct(e.target.value);
          if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
          onChangeDecimal(d);
        }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ===== Overlay de Índices (manual) ===== */
function IndicesOverlay({
  open, onClose, values, onSave
}: {
  open: boolean;
  onClose: () => void;
  values: { IPCA: number; INCC: number; IGPM: number; code: "IPCA"|"INCC"|"IGPM" };
  onSave: (v: { IPCA: number; INCC: number; IGPM: number; code: "IPCA"|"INCC"|"IGPM" }) => void;
}) {
  const [loc, setLoc] = useState(values);
  useEffect(() => setLoc(values), [values]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">Índices (12 meses)</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5"/></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>IPCA (12m)</Label>
              <PercentInput valueDecimal={loc.IPCA} onChangeDecimal={(d)=>setLoc({...loc, IPCA:d})}/>
            </div>
            <div>
              <Label>INCC (12m)</Label>
              <PercentInput valueDecimal={loc.INCC} onChangeDecimal={(d)=>setLoc({...loc, INCC:d})}/>
            </div>
            <div>
              <Label>IGP-M (12m)</Label>
              <PercentInput valueDecimal={loc.IGPM} onChangeDecimal={(d)=>setLoc({...loc, IGPM:d})}/>
            </div>
            <div>
              <Label>Índice selecionado</Label>
              <select className="w-full h-10 border rounded-md px-3" value={loc.code} onChange={e=>setLoc({...loc, code: e.target.value as any})}>
                <option value="IPCA">IPCA</option>
                <option value="INCC">INCC</option>
                <option value="IGPM">IGP-M</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={()=>{ onSave(loc); onClose(); }}>Salvar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================= Página ======================== */
export default function Simuladores() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  // seleção Embracon
  const [leadId, setLeadId] = useState("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState("");

  const [segmento, setSegmento] = useState("");
  const [nomeTabela, setNomeTabela] = useState("");
  const [tabelaId, setTabelaId] = useState("");
  const [prazoAte, setPrazoAte] = useState(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState(0);
  const [prazoVenda, setPrazoVenda] = useState(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState(false);

  const [lanceOfertPct, setLanceOfertPct] = useState(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState(0);
  const [parcContemplacao, setParcContemplacao] = useState(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // usuário logado
  const [userPhone, setUserPhone] = useState("");
  const [userName, setUserName] = useState("Usuário Logado");

  // Índices (manuais)
  const [indicesOpen, setIndicesOpen] = useState(false);
  const [indices, setIndices] = useState<{ IPCA: number; INCC: number; IGPM: number; code: "IPCA"|"INCC"|"IGPM" }>({
    IPCA: 0.039, INCC: 0.050, IGPM: 0.030, code: "IPCA"
  });

  const acc12m = indices[indices.code]; // valor efetivo usado

  const [extratoOpen, setExtratoOpen] = useState(false);

  // bootstrap
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins(a ?? []);
      setTables(t ?? []);
      setLeads((l ?? []) as any);
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      setActiveAdminId(embr?.id ?? (a?.[0]?.id ?? null));
      setLoading(false);
    })();
  }, []);

  // dados do usuário logado (public.users)
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users") // tabela pública "users" (nome + phone)
        .select("name, phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      if (data?.name) setUserName(String(data.name));
      if (data?.phone) setUserPhone(String(data.phone));
    })();
  }, []);

  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const adminTables = useMemo(
    () => tables.filter((t) => t.admin_id === activeAdminId),
    [tables, activeAdminId]
  );

  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  const variantesDaTabela = useMemo(() => {
    return adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela);
  }, [adminTables, segmento, nomeTabela]);

  const tabelaSelecionada = useMemo(
    () => tables.find((t) => t.id === tabelaId) || null,
    [tables, tabelaId]
  );

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // valida % embutido
  useEffect(() => {
    if (lanceEmbutPct > 0.25) setLanceEmbutPct(0.25);
  }, [lanceEmbutPct]);

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada &&
    credito > 0 &&
    prazoVenda > 0 &&
    parcContemplacao > 0 &&
    parcContemplacao < prazoVenda;

  // ===== cálculo principal
  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) { setCalc(null); return; }
    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: (tabelaSelecionada.antecip_parcelas as 0|1|2) ?? 0,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
      lanceOfertPct,
      lanceEmbutPct,
      parcContemplacao,
      indexPct: acc12m, // manual
    };
    setCalc(calcularSimulacao(inp));
  }, [tabelaSelecionada, credito, prazoVenda, forma, seguroPrest, lanceOfertPct, lanceEmbutPct, parcContemplacao, acc12m, podeCalcular]);
  async function salvarSimulacao() {
    if (!tabelaSelecionada || !calc) return;
    setSalvando(true);

    const payload: any = {
      admin_id: activeAdminId,
      table_id: tabelaSelecionada.id,
      lead_id: leadId || null,
      lead_nome: leadInfo?.nome || null,
      lead_telefone: leadInfo?.telefone || null,
      grupo: grupo || null,
      segmento: tabelaSelecionada.segmento,
      nome_tabela: tabelaSelecionada.nome_tabela,
      credito,
      prazo_venda: prazoVenda,
      forma_contratacao: forma,
      seguro_prestamista: seguroPrest,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: lanceEmbutPct,
      parcela_contemplacao: parcContemplacao,
      // resultados
      valor_categoria: calc.valorCategoria,
      parcela_ate_1_ou_2: calc.parcelaAte,
      parcela_demais: calc.parcelaDemais,
      lance_ofertado_valor: calc.lanceOfertadoValor,
      lance_embutido_valor: calc.lanceEmbutidoValor,
      lance_proprio_valor: calc.lanceProprioValor,
      lance_percebido_pct: calc.lancePercebidoPct,
      novo_credito: calc.novoCredito,
      nova_parcela_sem_limite: calc.novaParcelaSemLimite,
      parcela_limitante: calc.parcelaLimitante,
      parcela_escolhida: calc.parcelaEscolhida,
      saldo_devedor_final: calc.saldoDevedorFinal,
      novo_prazo: calc.novoPrazo,
      // índice manual
      index_code: indices.code,
      index_12m_value: acc12m ?? 0,
    };

    const { data, error } = await supabase
      .from("sim_simulations")
      .insert(payload)
      .select("code")
      .single();

    setSalvando(false);
    if (error) { alert("Erro ao salvar simulação: " + error.message); return; }
    setSimCode(data?.code ?? null);
  }

  function gerarPDFExtrato(extrato: ExtratoItem[]) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Cabeçalho com logo
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    const logo = new Image();
    logo.src = "/logo-consulmax.png";

    const drawHeader = () => {
      try {
        doc.addImage(logo, "PNG", margin, 28, 120, 28); // mantém proporção
      } catch {}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("EXTRATO DE SIMULAÇÃO", pageWidth / 2, 50, { align: "center" });
      doc.setLineWidth(0.6);
      doc.line(margin, 65, pageWidth - margin, 65);
    };

    drawHeader();

    const linha = (t: string) => doc.setFont("helvetica", "normal"), doc.text(t, margin, doc.lastAutoTable ? (doc.lastAutoTable.finalY + 18) : 92);

    // DADOS
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("--------------  DADOS DA CORRETORA  ----------------", margin, 92);
    doc.setFont("helvetica", "normal");
    linha(`Corretora: Consulmax | CNPJ: 00.000.000/0000-00 | Telefone: (11) 0000-0000 | Administradora: Embracon`);
    linha(`Usuário: ${userName} | Telefone/Whats: ${formatPhoneBR(userPhone)}`);

    doc.setFont("helvetica", "bold");
    doc.text("--------------  DADOS DO CLIENTE  ------------------", margin, doc.lastAutoTable ? (doc.lastAutoTable.finalY + 36) : 128);
    doc.setFont("helvetica", "normal");
    linha(`Nome: ${leadInfo?.nome || "-"} | Telefone: ${formatPhoneBR(leadInfo?.telefone)}`);

    doc.setFont("helvetica", "bold");
    doc.text("--------------  DADOS DA SIMULAÇÃO  ----------------", margin, doc.lastAutoTable ? (doc.lastAutoTable.finalY + 36) : 164);
    doc.setFont("helvetica", "normal");
    linha(`Segmento: ${tabelaSelecionada?.segmento || "-"}`);
    linha(`% Taxa de Adm: ${pctHuman(tabelaSelecionada?.taxa_adm_pct || 0)}  |  Valor: ${maskBRL((tabelaSelecionada?.taxa_adm_pct || 0) * credito)}`);
    linha(`% Fundo Reserva: ${pctHuman(tabelaSelecionada?.fundo_reserva_pct || 0)}  |  Valor: ${maskBRL((tabelaSelecionada?.fundo_reserva_pct || 0) * credito)}`);
    linha(`% Antecipação: ${pctHuman(tabelaSelecionada?.antecip_pct || 0)}  |  Valor da antecipação da adm: ${maskBRL((tabelaSelecionada?.antecip_pct || 0) * credito)}`);
    linha(`% Do limitador de Parcela: ${pctHuman(tabelaSelecionada?.limitador_parcela_pct || 0)}`);
    linha(`Índice: ${indices.code} (12m: ${(acc12m*100).toFixed(2)}%)`);

    // Tabela
    const head = [["Parcela","Crédito","Valor Pago","Reajuste","Saldo Devedor","Investimento","Evento"]];
    const body = extrato.map(r => [
      r.parcelaN,
      brMoney(r.creditoMes),
      brMoney(r.valorParcela),
      r.reajusteAplicado ? brMoney(r.reajusteAplicado) : "—",
      brMoney(r.saldoAposPagamento),
      brMoney(r.investimento),
      r.evento || "—",
    ]);

    autoTable(doc, {
      head, body,
      startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 24 : 260,
      styles: { fontSize: 9, cellPadding: 4, lineColor: [220,220,220] },
      headStyles: { fillColor: [245,245,245], textColor: 20, lineColor: [200,200,200] },
      alternateRowStyles: { fillColor: [252,252,252] },
      didDrawPage: drawHeader,
      margin: { left: margin, right: margin },
    });

    doc.save("extrato-simulacao.pdf");
  }

  if (loading) {
    return <div className="p-6 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/> Carregando simuladores...</div>;
  }

  const activeAdmin = admins.find((a) => a.id === activeAdminId);

  return (
    <div className="p-6 space-y-4">
      {/* topo: admins */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => (
            <Button key={a.id} variant={activeAdminId === a.id ? "default" : "secondary"} onClick={()=>setActiveAdminId(a.id)} className="h-10 rounded-2xl px-4">
              {a.name}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeAdmin && (
            <>
              <Button variant="secondary" size="sm" onClick={()=>alert("Gerenciar tabelas permanece igual ao seu projeto.")} className="h-10 rounded-2xl px-4">Gerenciar Tabelas</Button>
              <Button variant="secondary" size="sm" onClick={()=>alert("Em breve")} className="h-10 rounded-2xl px-4 whitespace-nowrap"><Plus className="h-4 w-4 mr-1" /> Add Administradora</Button>
            </>
          )}
        </div>
      </div>

      {/* grid principal */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
            <CardContent>
              {activeAdmin?.name === "Embracon" ? (
                <EmbraconSimulator
                  // seleção/estado
                  leads={leads}
                  adminTables={adminTables}
                  nomesTabelaSegmento={nomesTabelaSegmento}
                  variantesDaTabela={variantesDaTabela}
                  tabelaSelecionada={tabelaSelecionada}
                  prazoAte={prazoAte}
                  faixa={faixa}
                  leadId={leadId} setLeadId={setLeadId}
                  leadInfo={leadInfo}
                  grupo={grupo} setGrupo={setGrupo}
                  segmento={segmento} setSegmento={(v)=>{ setSegmento(v); setNomeTabela(""); setTabelaId(""); }}
                  nomeTabela={nomeTabela} setNomeTabela={(v)=>{ setNomeTabela(v); setTabelaId(""); }}
                  tabelaId={tabelaId} setTabelaId={setTabelaId}
                  credito={credito} setCredito={setCredito}
                  prazoVenda={prazoVenda} setPrazoVenda={setPrazoVenda}
                  forma={forma} setForma={setForma}
                  seguroPrest={seguroPrest} setSeguroPrest={setSeguroPrest}
                  lanceOfertPct={lanceOfertPct} setLanceOfertPct={setLanceOfertPct}
                  lanceEmbutPct={lanceEmbutPct} setLanceEmbutPct={setLanceEmbutPct}
                  parcContemplacao={parcContemplacao} setParcContemplacao={setParcContemplacao}
                  prazoAviso={prazoAviso}
                  calc={calc}
                  salvar={salvarSimulacao}
                  salvando={salvando}
                  simCode={simCode}
                  onGerarExtrato={()=> setExtratoOpen(true) }
                  // índice manual
                  indiceValue={acc12m}
                  indiceCode={indices.code}
                  onOpenIndice={()=>setIndicesOpen(true)}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Em breve: simulador para <strong>{activeAdmin?.name}</strong>.</div>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar Simulação
            </Button>
            {calc && <Button variant="secondary" onClick={()=>setExtratoOpen(true)} className="h-10 rounded-2xl px-4">Gerar Extrato</Button>}
            {simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{simCode}</strong></span>}
          </div>

          {/* Modal de Extrato */}
          {extratoOpen && calc && (
            <ExtratoModal
              onClose={()=>setExtratoOpen(false)}
              extrato={calc.extrato}
              onPDF={()=>gerarPDFExtrato(calc.extrato)}
              header={{
                corretora: "Consulmax",
                cnpj: "00.000.000/0000-00",
                telefoneAdm: "(11) 0000-0000",
                administradora: "Embracon",
                usuario: userName,
                userPhone: formatPhoneBR(userPhone),
                cliente: leadInfo?.nome || "",
                clientePhone: formatPhoneBR(leadInfo?.telefone),
                segmento: tabelaSelecionada?.segmento || "",
                taxaAdm: tabelaSelecionada?.taxa_adm_pct || 0,
                fr: tabelaSelecionada?.fundo_reserva_pct || 0,
                antecip: tabelaSelecionada?.antecip_pct || 0,
                limitador: tabelaSelecionada?.limitador_parcela_pct || 0,
                indice: `${indices.code} (12m: ${(acc12m*100).toFixed(2)}%)`,
                credito
              }}
            />
          )}
        </div>

        {/* coluna direita: índice manual */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Índice de Correção / Reajuste (12m)</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">Selecionado: <strong>{indices.code}</strong> • <strong>{(acc12m*100).toFixed(2)}%</strong></div>
                <button onClick={()=>setIndicesOpen(true)} className="px-3 py-1 rounded-full text-xs bg-primary text-white">Índice</button>
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Pré-contemplação: reajuste anual incide sobre o <strong>crédito</strong> contratado.  
                Pós-contemplação: reajuste anual incide sobre o <strong>saldo devedor</strong>.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <IndicesOverlay
        open={indicesOpen}
        onClose={()=>setIndicesOpen(false)}
        values={indices}
        onSave={(v)=>setIndices(v)}
      />
    </div>
  );
}

/* ============== Modal de Extrato (visual + PDF) ============== */
function ExtratoModal({
  onClose, extrato, onPDF, header
}: {
  onClose: () => void;
  extrato: ExtratoItem[];
  onPDF: () => void;
  header: {
    corretora: string; cnpj: string; telefoneAdm: string; administradora: string;
    usuario: string; userPhone: string;
    cliente: string; clientePhone: string;
    segmento: string; taxaAdm: number; fr: number; antecip: number; limitador: number; indice: string; credito: number;
  };
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">Extrato detalhado da simulação</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5"/></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Header bonito com logo */}
          <div className="flex items-center justify-between">
            <img src="/logo-consulmax.png" alt="Consulmax" className="h-8 w-auto" />
            <h2 className="font-bold text-lg">EXTRATO DE SIMULAÇÃO</h2>
            <div />
          </div>

          <div className="text-xs grid gap-1">
            <div className="font-semibold mt-2">-------------- DADOS DA CORRETORA ---------------------</div>
            <div>Corretora: {header.corretora} | CNPJ: {header.cnpj} | Telefone: {header.telefoneAdm} | Administradora: {header.administradora}</div>
            <div>Usuário: {header.usuario} | Telefone/Whats: {header.userPhone}</div>

            <div className="font-semibold mt-2">-------------- DADOS DO CLIENTE ---------------------</div>
            <div>Nome: {header.cliente} | Telefone: {header.clientePhone}</div>

            <div className="font-semibold mt-2">-------------DADOS DA SIMULAÇÃO---------------------</div>
            <div>Segmento: {header.segmento}</div>
            <div>% Taxa de Adm: {pctHuman(header.taxaAdm)} | Valor da Taxa de Adm: {maskBRL(header.taxaAdm * header.credito)}</div>
            <div>% Fundo Reserva: {pctHuman(header.fr)} | Valor do Fundo Reserva: {maskBRL(header.fr * header.credito)}</div>
            <div>% Antecipação: {pctHuman(header.antecip)} | Valor da antecipação da taxa de adm: {maskBRL(header.antecip * header.credito)}</div>
            <div>% Do limitador de Parcela: {pctHuman(header.limitador)}</div>
            <div>Índice: {header.indice}</div>
          </div>

          <div className="overflow-auto rounded-lg border max-h-[60vh]">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Parcela</th>
                  <th className="text-right p-2">Crédito</th>
                  <th className="text-right p-2">Valor Pago</th>
                  <th className="text-right p-2">Reajuste</th>
                  <th className="text-right p-2">Saldo Devedor</th>
                  <th className="text-right p-2">Investimento</th>
                  <th className="text-left p-2">Evento</th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{r.parcelaN}</td>
                    <td className="p-2 text-right">{brMoney(r.creditoMes)}</td>
                    <td className="p-2 text-right">{brMoney(r.valorParcela)}</td>
                    <td className="p-2 text-right">{r.reajusteAplicado ? brMoney(r.reajusteAplicado) : "—"}</td>
                    <td className="p-2 text-right">{brMoney(r.saldoAposPagamento)}</td>
                    <td className="p-2 text-right">{brMoney(r.investimento)}</td>
                    <td className="p-2">{r.evento || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} className="h-10 rounded-2xl px-4">Fechar</Button>
            <Button onClick={onPDF} className="h-10 rounded-2xl px-4">Baixar em PDF</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
/* ====================== Embracon UI ====================== */
type EmbraconProps = {
  leads: Lead[];
  adminTables: SimTable[];
  nomesTabelaSegmento: string[];
  variantesDaTabela: SimTable[];
  tabelaSelecionada: SimTable | null;
  prazoAte: number;
  faixa: { min: number; max: number } | null;
  leadId: string; setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string; setGrupo: (v: string) => void;

  segmento: string; setSegmento: (v: string) => void;
  nomeTabela: string; setNomeTabela: (v: string) => void;
  tabelaId: string; setTabelaId: (v: string) => void;

  credito: number; setCredito: (v: number) => void;
  prazoVenda: number; setPrazoVenda: (v: number) => void;
  forma: FormaContratacao; setForma: (v: FormaContratacao) => void;
  seguroPrest: boolean; setSeguroPrest: (v: boolean) => void;

  lanceOfertPct: number; setLanceOfertPct: (v: number) => void;
  lanceEmbutPct: number; setLanceEmbutPct: (v: number) => void;
  parcContemplacao: number; setParcContemplacao: (v: number) => void;

  prazoAviso: string | null;
  calc: ReturnType<typeof calcularSimulacao> | null;

  salvar: () => Promise<void>;
  salvando: boolean;
  simCode: number | null;

  onGerarExtrato: () => void;

  // índice manual (chip)
  indiceValue: number;
  indiceCode: "IPCA"|"INCC"|"IGPM";
  onOpenIndice: () => void;
};

function EmbraconSimulator(p: EmbraconProps) {
  const parcelaEscolhida = useMemo(()=>{
    if (!p.calc) return 0;
    // importante: sempre o MAIOR entre nova parcela sem limite e limitante
    return Math.max(p.calc.novaParcelaSemLimite, p.calc.parcelaLimitante);
  }, [p.calc]);

  return (
    <div className="space-y-6">
      {/* Lead */}
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <select className="w-full h-10 border rounded-md px-3" value={p.leadId} onChange={(e)=>p.setLeadId(e.target.value)}>
                <option value="">Escolha um lead</option>
                {p.leads.map((l)=> <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              {p.leadInfo && <p className="text-xs text-muted-foreground mt-1">{p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}</p>}
            </div>
            <div>
              <Label>Nº do Grupo (opcional)</Label>
              <Input value={p.grupo} onChange={(e)=>p.setGrupo(e.target.value)} placeholder="ex.: 9957"/>
            </div>
            <div className="flex items-end justify-end">
              <button onClick={p.onOpenIndice} className="px-3 py-1 rounded-full text-xs bg-primary text-white">Índice</button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plano */}
      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.segmento} onChange={(e)=>p.setSegmento(e.target.value)}>
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t)=>t.segmento))).map((s)=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Tabela</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.nomeTabela} disabled={!p.segmento} onChange={(e)=>p.setNomeTabela(e.target.value)}>
                  <option value="">{p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}</option>
                  {p.nomesTabelaSegmento.map((n)=> <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <Label>Prazo Até</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.tabelaId} disabled={!p.nomeTabela} onChange={(e)=>p.setTabelaId(e.target.value)}>
                  <option value="">{p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}</option>
                  {p.variantesDaTabela.map((t)=>(
                    <option key={t.id} value={t.id}>{t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR {pctHuman(t.fundo_reserva_pct)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Faixa de Crédito</Label>
                <Input readOnly value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""}/>
              </div>
            </CardContent>
          </Card>

          {/* Venda */}
          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div><Label>Valor do Crédito</Label><MoneyInput value={p.credito || 0} onChange={p.setCredito}/></div>
              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input type="number" value={p.prazoVenda || ""} onChange={(e)=>p.setPrazoVenda(Number(e.target.value))}/>
                {p.prazoAviso && <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>}
              </div>
              <div>
                <Label>Forma de Contratação</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.forma} disabled={!p.tabelaSelecionada} onChange={(e)=>p.setForma(e.target.value as any)}>
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                </select>
              </div>
              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button type="button" className={p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={()=>p.setSeguroPrest(true)}>Sim</Button>
                  <Button type="button" className={!p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={()=>p.setSeguroPrest(false)}>Não</Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>% Taxa de Adm: <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong></div>
                  <div>% Fundo Reserva: <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong></div>
                  <div>% Antecipação: <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> • Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong></div>
                  <div>Limitador de Parcela: <strong>{pctHuman(p.tabelaSelecionada.limitador_parcela_pct)}</strong></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>{p.tabelaSelecionada?.antecip_parcelas === 2 ? "Parcelas 1 e 2" : p.tabelaSelecionada?.antecip_parcelas === 1 ? "Parcela 1" : "Parcela Inicial"}</Label>
                <Input readOnly value={p.calc ? brMoney(p.calc.parcelaAte) : ""}/>
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input readOnly value={p.calc ? brMoney(p.calc.parcelaDemais) : ""}/>
              </div>
            </CardContent>
          </Card>

          {/* Lances */}
          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado (%)</Label><PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct}/></div>
              <div><Label>Lance Embutido (%)</Label><PercentInput valueDecimal={p.lanceEmbutPct} onChangeDecimal={(d)=>p.setLanceEmbutPct(clamp(d,0,0.25))} maxDecimal={0.25}/></div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={p.parcContemplacao} onChange={(e)=>p.setParcContemplacao(Math.max(1, Number(e.target.value)))}/>
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          {/* Pós */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input readOnly value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""}/></div>
              <div><Label>Lance Embutido</Label><Input readOnly value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""}/></div>
              <div><Label>Lance Próprio</Label><Input readOnly value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""}/></div>

              <div><Label>Lance Percebido (%)</Label><Input readOnly value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""}/></div>
              <div><Label>Novo Crédito</Label><Input readOnly value={p.calc ? brMoney(p.calc.novoCredito) : ""}/></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input readOnly value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""}/></div>

              <div><Label>Parcela Limitante</Label><Input readOnly value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""}/></div>
              <div><Label>Parcela Escolhida</Label><Input readOnly value={p.calc ? brMoney(parcelaEscolhida) : ""}/></div>
              <div><Label>Novo Prazo (meses)</Label><Input readOnly value={p.calc ? String(p.calc.novoPrazo) : ""}/></div>

              {p.calc?.has2aAntecipDepois && p.calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3">
                  <Label>2ª parcela (com antecipação)</Label>
                  <Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Botões */}
          <div className="flex items-center gap-3">
            <Button onClick={p.salvar} disabled={!p.calc || p.salvando} className="h-10 rounded-2xl px-4">
              {p.salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar Simulação
            </Button>
            <Button variant="secondary" disabled={!p.calc} onClick={p.onGerarExtrato} className="h-10 rounded-2xl px-4">Gerar Extrato</Button>
            {p.simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{p.simCode}</strong></span>}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}
