// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X, ChevronsUpDown, Search } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { Popover, PopoverButton, PopoverContent, PopoverClose } from "@/components/ui/popover";

/* ========================= Tipos ========================= */
type UUID = string;
type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string; rules?: any };

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
  antecip_parcelas: 0 | 1 | 2;
  limitador_parcela_pct: number;
  seguro_prest_pct: number;

  // novo campo (pode não existir na base — tratamos fallback)
  embut_cap_pct?: number | null;

  // flags
  permite_lance_embutido: boolean;
  permite_lance_fixo_25: boolean;
  permite_lance_fixo_50: boolean;
  permite_lance_livre: boolean;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
  indice_correcao: string[];
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function formatBRLInputFromNumber(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string): number {
  const cents = Number((s || "").replace(/\D/g, "")) || 0;
  return cents / 100;
}
function formatPctInputFromDecimal(d: number): string {
  return (d * 100).toFixed(4).replace(".", ",");
}
function parsePctInputToDecimal(s: string): number {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v / 100;
}
function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ======================= Cálculo ========================= */
type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;

  taxaAdmFull: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: 0 | 1 | 2;
  limitadorPct: number;
  seguroPrestPct: number;

  modeloLance: "percentual" | "parcela";
  lanceBase: "credito" | "parcela_termo";
  prazoOriginalGrupo?: number;
  lanceOfertParcelas?: number;
  lanceEmbutParcelas?: number;
  lanceOfertPct?: number;
  lanceEmbutPct?: number;

  // teto do embutido (%)
  embutCapPct: number;

  // base de limite vinda do Add Administradora
  embutCapBase: "credito" | "parcela_termo";

  limitEnabled?: boolean;
  redutorPreEnabled?: boolean;
  redutorBase?: "credito" | "valor_categoria";

  parcContemplacao: number;
};

function calcularSimulacao(i: CalcInput) {
  const {
    credito: C,
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

    modeloLance,
    lanceBase,
    prazoOriginalGrupo,
    lanceOfertParcelas = 0,
    lanceEmbutParcelas = 0,
    lanceOfertPct = 0,
    lanceEmbutPct = 0,
    embutCapPct,
    embutCapBase,

    limitEnabled = true,
    redutorPreEnabled = false,
    redutorBase = "valor_categoria",

    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  // parcela termo (para base parcela_termo)
  const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
  const parcelaTermo = valorCategoria / prazoTermo;

  // fator forma
  let fatorForma = 1;
  if (forma === "Reduzida 25%") fatorForma = 0.75;
  if (forma === "Reduzida 50%") fatorForma = 0.5;

  // pré-contemplação
  const baseMensalPre =
    redutorPreEnabled && redutorBase === "valor_categoria"
      ? (valorCategoria / prazo) * fatorForma
      : (C * fatorForma + C * Math.max(0, taxaAdmFull - antecipPct) + C * frPct) / prazo;

  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;
  const antecipCada = antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;

  const parcelaAte = baseMensalPre + (antecipParcelas > 0 ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalPre + seguroMensal;

  const totalPagoSemSeguro =
    baseMensalPre * parcelasPagas +
    antecipCada * Math.min(parcelasPagas, antecipParcelas);

  // Teto do embutido (valor) conforme base
  const capValor =
    embutCapBase === "parcela_termo" ? embutCapPct * parcelaTermo : embutCapPct * C;

  // Lances
  let lanceOfertadoValor = 0;
  let lanceEmbutidoValor = 0;

  if (modeloLance === "parcela" && lanceBase === "parcela_termo") {
    lanceOfertadoValor = Math.max(0, parcelaTermo * Math.max(0, lanceOfertParcelas));
    lanceEmbutidoValor = Math.min(
      Math.max(0, parcelaTermo * Math.max(0, lanceEmbutParcelas)),
      capValor
    );
  } else {
    // percentual
    const embutPctClamped = clamp(lanceEmbutPct, 0, embutCapPct);
    lanceOfertadoValor = C * Math.max(0, lanceOfertPct);
    // limite aplicado sobre o valor
    const pretend = C * embutPctClamped;
    lanceEmbutidoValor = Math.min(pretend, capValor);
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  const saldoDevedorFinal = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);
  const novaParcelaSemLimite = saldoDevedorFinal / Math.max(1, prazoRestante);

  const parcelaLimitante = limitEnabled ? valorCategoria * limitadorPct : 0;

  // regra de Serviços: mantém parcela, ajusta prazo
  const isServicos = (segmento || "").toLowerCase().includes("serv");
  let aplicouLimitador = false;
  let parcelaEscolhida = isServicos
    ? parcelaDemais
    : (limitEnabled && parcelaLimitante > novaParcelaSemLimite
        ? (aplicouLimitador = true, parcelaLimitante)
        : novaParcelaSemLimite);

  const has2aAntecipDepois = antecipParcelas >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? parcelaEscolhida + antecipCada : null;

  let saldoParaPrazo = saldoDevedorFinal;
  if (has2aAntecipDepois) {
    saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipCada));
  }
  const novoPrazo = Math.max(1, Math.ceil(saldoParaPrazo / Math.max(1e-6, parcelaEscolhida)));

  return {
    valorCategoria, parcelaTermo,
    parcelaAte, parcelaDemais,
    lanceOfertadoValor, lanceEmbutidoValor, lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,
    novaParcelaSemLimite, parcelaLimitante, parcelaEscolhida,
    saldoDevedorFinal, novoPrazo,
    TA_efetiva: Math.max(0, taxaAdmFull - antecipPct),
    antecipAdicionalCada: antecipCada,
    has2aAntecipDepois, segundaParcelaComAntecipacao,
    aplicouLimitador,
    capValorAplicado: capValor,
  };
}

/* =================== Inputs com máscara =================== */
function MoneyInput({
  value, onChange, ...rest
}: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
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

function PercentInput({
  valueDecimal, onChangeDecimal, maxDecimal, ...rest
}: { valueDecimal: number; onChangeDecimal: (d: number) => void; maxDecimal?: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [text, setText] = useState<string>(formatPctInputFromDecimal(valueDecimal || 0));
  const lastProp = useRef<number>(valueDecimal);
  useEffect(() => {
    if (lastProp.current !== valueDecimal) {
      lastProp.current = valueDecimal;
      setText(formatPctInputFromDecimal(valueDecimal || 0));
    }
  }, [valueDecimal]);
  function commit(raw: string) {
    let d = parsePctInputToDecimal(raw);
    if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
    onChangeDecimal(d);
    lastProp.current = d;
    setText(formatPctInputFromDecimal(d));
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ========================= Página ======================== */
export default function Simuladores() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const openSetup = searchParams.get("setup") === "1";
  const routeAdminId = id ?? null;

  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(routeAdminId);

  useEffect(() => setActiveAdminId(routeAdminId), [routeAdminId]);
  useEffect(() => { if (!routeAdminId && !activeAdminId && admins.length) setActiveAdminId(admins[0].id); }, [routeAdminId, activeAdminId, admins]);

  const [mgrOpen, setMgrOpen] = useState(false);

  // seleção
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  const [segmento, setSegmento] = useState<string>("");
  const [nomeTabela, setNomeTabela] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");
  const [prazoAte, setPrazoAte] = useState<number>(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState<number>(0);
  const [prazoVenda, setPrazoVenda] = useState<number>(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);

  // lances
  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0);
  const [prazoOriginalGrupo, setPrazoOriginalGrupo] = useState<number>(0);
  const [lanceOfertParcelas, setLanceOfertParcelas] = useState<number>(0);
  const [lanceEmbutParcelas, setLanceEmbutParcelas] = useState<number>(0);

  const [parcContemplacao, setParcContemplacao] = useState<number>(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  const [userPhone, setUserPhone] = useState<string>("");
  const [assembleia, setAssembleia] = useState<string>("15/10");

  const [mgrTablesOpen, setMgrTablesOpen] = useState(false);

  // load
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name,rules").order("name"),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins((a ?? []) as Admin[]);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      let next = embr?.id ?? (a?.[0]?.id ?? null);
      if (routeAdminId && (a ?? []).some((ad: any) => ad.id === routeAdminId)) next = routeAdminId;
      setActiveAdminId(next);
      setLoading(false);
      if (openSetup) setTimeout(() => setMgrOpen(true), 0);
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("users").select("phone").eq("auth_user_id", uid).maybeSingle();
      setUserPhone((data?.phone || "").toString());
    })();
  }, []);

  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const activeAdmin = useMemo(() => admins.find((a) => a.id === activeAdminId) || null, [admins, activeAdminId]);
  const adminRules = (activeAdmin?.rules || {}) as any;

  const adminTables = useMemo(() => tables.filter((t) => t.admin_id === activeAdminId), [tables, activeAdminId]);
  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables.filter(t => (segmento ? t.segmento === segmento : true)).map(t => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);
  const variantesDaTabela = useMemo(() => adminTables.filter(t => t.segmento === segmento && t.nome_tabela === nomeTabela),
    [adminTables, segmento, nomeTabela]);
  const tabelaSelecionada = useMemo(() => tables.find(t => t.id === tabelaId) || null, [tables, tabelaId]);

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // Limite de embutido (%): prioridade tabela → regra admin → 25%
  const capPct =
    (tabelaSelecionada?.embut_cap_pct ?? null) != null
      ? Number(tabelaSelecionada!.embut_cap_pct)
      : (typeof adminRules?.embut_cap_adm_pct === "number" ? adminRules.embut_cap_adm_pct : 0.25);

  // Base do limite (definida no Add Administradora)
  const capBase: "credito" | "parcela_termo" =
    adminRules?.embut_cap_base === "parcela_termo" ? "parcela_termo" : "credito";

  // clamp do % inserido
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, capPct);
  useEffect(() => { if (lanceEmbutPct !== lanceEmbutPctValid) setLanceEmbutPct(lanceEmbutPctValid); }, [lanceEmbutPctValid]); // eslint-disable-line

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela." : null;
  const podeCalcular =
    !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) { setCalc(null); return; }
    const modelo: "percentual" | "parcela" = (adminRules?.modelo_lance ?? "percentual");
    const base: "credito" | "parcela_termo" =
      (adminRules?.modelo_lance_base ?? (modelo === "parcela" ? "parcela_termo" : "credito"));

    const inp: CalcInput = {
      credito, prazoVenda, forma, seguro: seguroPrest, segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct, frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct, antecipParcelas: tabelaSelecionada.antecip_parcelas,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct, seguroPrestPct: tabelaSelecionada.seguro_prest_pct,

      modeloLance: modelo, lanceBase: base, prazoOriginalGrupo: Number(prazoOriginalGrupo || prazoVenda),
      lanceOfertParcelas, lanceEmbutParcelas, lanceOfertPct, lanceEmbutPct: lanceEmbutPctValid,

      embutCapPct: capPct, embutCapBase: capBase,

      limitEnabled: adminRules?.limit_enabled !== false,
      redutorPreEnabled: adminRules?.redutor_pre_contemplacao_enabled === true,
      redutorBase: (adminRules?.redutor_base ?? "valor_categoria"),

      parcContemplacao,
    };
    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada, credito, prazoVenda, forma, seguroPrest,
    lanceOfertPct, lanceEmbutPctValid, parcContemplacao, adminRules,
    prazoOriginalGrupo, lanceOfertParcelas, lanceEmbutParcelas, capPct, capBase
  ]); // eslint-disable-line

  async function salvarSimulacao() {
    if (!tabelaSelecionada || !calc) return;
    setSalvando(true);

    // payload mínimo compatível (sem campos novos que possam não existir)
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

      parcela_contemplacao: parcContemplacao,

      // calculados
      valor_categoria: calc.valorCategoria,
      parcela_termo: calc.parcelaTermo,
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

      adm_tax_pct: tabelaSelecionada.taxa_adm_pct,
      fr_tax_pct: tabelaSelecionada.fundo_reserva_pct,
    };

    // Tentativa 1
    let { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();

    // Fallback se schema velho
    if (error && /column .* not found|schema cache|does not exist/i.test(error.message || "")) {
      try {
        const retry = await supabase.from("sim_simulations").insert(payload).select("code").single();
        data = retry.data; error = retry.error;
      } catch {}
    }

    setSalvando(false);
    if (error) { alert("Erro ao salvar simulação: " + error.message); return; }
    setSimCode(data?.code ?? null);
  }

  function handleTableCreatedOrUpdated(newTable: SimTable) {
    setTables((prev) => {
      const ok = prev.find((t) => t.id === newTable.id);
      return ok ? prev.map((t) => (t.id === newTable.id ? newTable : t)) : [newTable, ...prev];
    });
  }
  function handleTableDeleted(id: string) { setTables((prev) => prev.filter((t) => t.id !== id)); }

  // textos copiáveis
  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";
    const bem = ((segmento || tabelaSelecionada.segmento || "").toLowerCase().includes("imó") ? "imóvel"
      : (segmento || "").toLowerCase().includes("serv") ? "serviço"
      : (segmento || "").toLowerCase().includes("moto") ? "motocicleta" : "veículo");
    const primeira =
      tabelaSelecionada.antecip_parcelas === 2 ? "Parcelas 1 e 2" :
      tabelaSelecionada.antecip_parcelas === 1 ? "Parcela 1" : "Parcela inicial";
    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;
    const segunda =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª parcela com antecipação: ${brMoney(calc.segundaParcelaComAntecipacao)})` : "";
    return `🎯 Simulação

💰 Crédito contratado: ${brMoney(credito)}
💳 ${primeira}: ${brMoney(calc.parcelaAte)}
💵 Demais parcelas: ${brMoney(calc.parcelaDemais)}

📈 Após contemplação (prevista em ${parcContemplacao} meses)
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}
✅ Crédito líquido: ${brMoney(calc.novoCredito)}
📆 Parcelas restantes: ${brMoney(calc.parcelaEscolhida)}${segunda}
⏳ Prazo restante: ${calc.novoPrazo} meses

Fale comigo: ${wa}`;
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  async function copiarResumo() {
    try { await navigator.clipboard.writeText(resumoTexto); alert("Resumo copiado!"); }
    catch { alert("Não foi possível copiar."); }
  }

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";
    const segBase = segmento || tabelaSelecionada?.segmento || "Automóvel";
    const segNorm = segBase.toLowerCase().includes("imó") ? "Imóvel"
      : segBase.toLowerCase().includes("serv") ? "Serviços"
      : segBase.toLowerCase().includes("moto") ? "Motocicleta"
      : "Automóvel";
    const emoji = segBase.toLowerCase().includes("imó") ? "🏠"
      : segBase.toLowerCase().includes("serv") ? "✈️"
      : segBase.toLowerCase().includes("moto") ? "🏍️" : "🚗";
    const whats = formatPhoneBR(userPhone);
    const linha2 = (calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null)
      ? `\n💰 Parcela 2: ${brMoney(calc.segundaParcelaComAntecipacao)} (com antecipação)` : "";
    return `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA ${activeAdmin?.name || ""}🔥

Proposta ${segNorm}

${emoji} Crédito: ${brMoney(calc.novoCredito)}
💰 Parcela 1: ${brMoney(calc.parcelaAte)} (em até 3x no cartão)${linha2}
📆 + ${calc.novoPrazo}x de ${brMoney(calc.parcelaEscolhida)}
💵 Lance Próprio: ${brMoney(calc.lanceProprioValor)}
📢 Grupo: ${grupo || "—"}

Assembleia ${assembleia}
WhatsApp: ${whats || "—"}`;
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone, activeAdmin?.name]);

  async function copiarProposta() {
    try { await navigator.clipboard.writeText(propostaTexto); alert("Texto copiado!"); }
    catch { alert("Não foi possível copiar."); }
  }

  if (loading) return (<div className="p-6 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="ml-auto">
          {activeAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setMgrOpen(true)} className="h-10 rounded-2xl px-4">
              Gerenciar Tabelas
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
            <CardContent>
              {activeAdmin ? (
                <EmbraconSimulator
                  adminName={activeAdmin.name}
                  adminRules={adminRules}
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
                  segmento={segmento} setSegmento={(v)=>{setSegmento(v); setNomeTabela(""); setTabelaId("");}}
                  nomeTabela={nomeTabela} setNomeTabela={(v)=>{setNomeTabela(v); setTabelaId("");}}
                  tabelaId={tabelaId} setTabelaId={setTabelaId}
                  credito={credito} setCredito={setCredito}
                  prazoVenda={prazoVenda} setPrazoVenda={(n)=>{ setPrazoVenda(n); if(!prazoOriginalGrupo) setPrazoOriginalGrupo(n); }}
                  forma={forma} setForma={setForma}
                  seguroPrest={seguroPrest} setSeguroPrest={setSeguroPrest}
                  lanceOfertPct={lanceOfertPct} setLanceOfertPct={setLanceOfertPct}
                  lanceEmbutPct={lanceEmbutPct} setLanceEmbutPct={setLanceEmbutPct}
                  prazoOriginalGrupo={prazoOriginalGrupo} setPrazoOriginalGrupo={setPrazoOriginalGrupo}
                  lanceOfertParcelas={lanceOfertParcelas} setLanceOfertParcelas={setLanceOfertParcelas}
                  lanceEmbutParcelas={lanceEmbutParcelas} setLanceEmbutParcelas={setLanceEmbutParcelas}
                  parcContemplacao={parcContemplacao} setParcContemplacao={setParcContemplacao}
                  prazoAviso={prazoAviso}
                  calc={calc}
                  salvar={salvarSimulacao} salvando={salvando} simCode={simCode}
                  embutCapPct={capPct} embutCapBase={capBase}
                />
              ) : <div className="text-sm text-muted-foreground">Nenhuma administradora encontrada.</div>}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar Simulação
            </Button>
            {simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{simCode}</strong></span>}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div><div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div><div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div><div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">{seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}</div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Taxa Adm (total)</div><div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div><div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div><div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Valor de Categoria</div><div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                    <div>Parcela (termo)</div><div className="text-right">{calc ? brMoney(calc.parcelaTermo) : "—"}</div>
                    <div>Limite Embutido</div>
                    <div className="text-right">
                      {pctHuman(capPct)} • Base: {capBase === "credito" ? "Crédito" : "Parcela (termo)"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed" readOnly value={resumoTexto} />
              <div className="flex justify-end"><Button onClick={copiarResumo} disabled={!resumoTexto}>Copiar</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Texto: Oportunidade / Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Assembleia</Label><Input value={assembleia} onChange={(e) => setAssembleia(e.target.value)} placeholder="dd/mm" /></div>
              <textarea className="w-full h-72 border rounded-md p-3 text-sm leading-relaxed" readOnly value={propostaTexto} />
              <div className="flex justify-end"><Button onClick={copiarProposta} disabled={!propostaTexto}>Copiar</Button></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {mgrOpen && activeAdmin && (
        <TableManagerModal
          admin={activeAdmin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onCreatedOrUpdated={handleTableCreatedOrUpdated}
          onDeleted={handleTableDeleted}
        />
      )}
    </div>
  );
}

/* ====================== Modal Base ====================== */
function ModalBase({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string; }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Gerenciador de Tabelas ============== */
function TableManagerModal({
  admin, allTables, onClose, onCreatedOrUpdated, onDeleted,
}: { admin: Admin; allTables: SimTable[]; onClose: () => void; onCreatedOrUpdated: (t: SimTable) => void; onDeleted: (id: string) => void; }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SimTable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => setPage(1), [allTables.length]);

  const grouped = useMemo(() => [...allTables].sort((a, b) =>
    (a.segmento + a.nome_tabela + a.prazo_limite).localeCompare(b.segmento + b.nome_tabela + b.prazo_limite)
  ), [allTables]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(() => grouped.slice((page - 1) * pageSize, page * pageSize), [grouped, page]);

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela?")) return;
    setBusyId(id);
    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) { setBusyId(null); alert("Erro ao excluir simulações: " + delSims.error.message); return; }
    const { error } = await supabase.from("sim_tables").delete().eq("id", id);
    setBusyId(null);
    if (error) { alert("Erro ao excluir: " + error.message); return; }
    onDeleted(id);
  }

  return (
    <ModalBase onClose={onClose} title="Gerenciador de Tabelas">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">Admin ativa: <strong>{admin.name}</strong></div>
          <Button onClick={()=>{ setEditing(null); setShowForm(true); }} className="h-10 rounded-2xl px-4">
            <Plus className="h-4 w-4 mr-1" /> Nova Tabela
          </Button>
        </div>

        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Segmento</th>
                <th className="text-left p-2">Tabela</th>
                <th className="text-left p-2">Prazo</th>
                <th className="text-left p-2">% Adm</th>
                <th className="text-left p-2">% FR</th>
                <th className="text-left p-2">% Antecip</th>
                <th className="text-left p-2">Parc Ant.</th>
                <th className="text-left p-2">% Limite</th>
                <th className="text-left p-2">% Seguro</th>
                <th className="text-left p-2">% Limite Emb.</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.segmento}</td>
                  <td className="p-2">{t.nome_tabela}</td>
                  <td className="p-2">{t.prazo_limite}</td>
                  <td className="p-2">{pctHuman(t.taxa_adm_pct)}</td>
                  <td className="p-2">{pctHuman(t.fundo_reserva_pct)}</td>
                  <td className="p-2">{pctHuman(t.antecip_pct)}</td>
                  <td className="p-2">{t.antecip_parcelas}</td>
                  <td className="p-2">{pctHuman(t.limitador_parcela_pct)}</td>
                  <td className="p-2">{pctHuman(t.seguro_prest_pct)}</td>
                  <td className="p-2">{t.embut_cap_pct != null ? pctHuman(t.embut_cap_pct) : "—"}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={()=>{ setEditing(t); setShowForm(true); }} className="h-9 rounded-xl px-3">
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" disabled={busyId===t.id} onClick={()=>deletar(t.id)} className="h-9 rounded-xl px-3">
                        {busyId===t.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">Sem tabelas.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-sm">
          <div>{grouped.length>0 && <>Mostrando <strong>{(page-1)*pageSize+1}–{Math.min(page*pageSize, grouped.length)}</strong> de <strong>{grouped.length}</strong></>}</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>Anterior</Button>
            <span>Página {page} de {totalPages}</span>
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Próxima</Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={()=>setShowForm(false)}
          onSaved={(t)=>{ onCreatedOrUpdated(t); setShowForm(false); }}
        />
      )}
    </ModalBase>
  );
}

/* ===== Overlay (Novo/Editar Tabela) ===== */
function TableFormOverlay({
  adminId, initial, onSaved, onClose,
}: { adminId: string; initial?: SimTable; onSaved: (t: SimTable) => void; onClose: () => void; }) {
  const [segmento, setSegmento] = useState(initial?.segmento || "Imóvel Estendido");
  const [nome, setNome] = useState(initial?.nome_tabela || "Select Estendido");
  const [faixaMin, setFaixaMin] = useState(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState(initial?.prazo_limite ?? 240);

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(formatPctInputFromDecimal(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(formatPctInputFromDecimal(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(formatPctInputFromDecimal(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState<number>(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(formatPctInputFromDecimal(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(formatPctInputFromDecimal(initial?.seguro_prest_pct ?? 0.00061));

  const [embutCapHuman, setEmbutCapHuman] = useState(
    formatPctInputFromDecimal(initial?.embut_cap_pct ?? 0.25)
  ); // novo campo

  const [perEmbutido, setPerEmbutido] = useState(initial?.permite_lance_embutido ?? true);
  const [perFixo25, setPerFixo25] = useState(initial?.permite_lance_fixo_25 ?? true);
  const [perFixo50, setPerFixo50] = useState(initial?.permite_lance_fixo_50 ?? true);
  const [perLivre, setPerLivre] = useState(initial?.permite_lance_livre ?? true);

  const [cParcelaCheia, setCParcelaCheia] = useState(initial?.contrata_parcela_cheia ?? true);
  const [cRed25, setCRed25] = useState(initial?.contrata_reduzida_25 ?? true);
  const [cRed50, setCRed50] = useState(initial?.contrata_reduzida_50 ?? true);
  const [indices, setIndices] = useState((initial?.indice_correcao || ["IPCA"]).join(", "));

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function salvar() {
    setSaving(true);
    const payload: any = {
      admin_id: adminId,
      segmento,
      nome_tabela: nome,
      faixa_min: Number(faixaMin) || 0,
      faixa_max: Number(faixaMax) || 0,
      prazo_limite: Number(prazoLimite) || 0,
      taxa_adm_pct: parsePctInputToDecimal(taxaAdmHuman),
      fundo_reserva_pct: parsePctInputToDecimal(frHuman),
      antecip_pct: parsePctInputToDecimal(antecipHuman),
      antecip_parcelas: clamp(Number(antecipParcelas) || 0, 0, 2),
      limitador_parcela_pct: parsePctInputToDecimal(limHuman),
      seguro_prest_pct: parsePctInputToDecimal(seguroHuman),
      permite_lance_embutido: perEmbutido,
      permite_lance_fixo_25: perFixo25,
      permite_lance_fixo_50: perFixo50,
      permite_lance_livre: perLivre,
      contrata_parcela_cheia: cParcelaCheia,
      contrata_reduzida_25: cRed25,
      contrata_reduzida_50: cRed50,
      indice_correcao: indices.split(",").map((s) => s.trim()).filter(Boolean),
      embut_cap_pct: parsePctInputToDecimal(embutCapHuman), // novo campo
    };

    // Primeiro tenta com o novo campo; se a coluna não existir, reenvia sem ele.
    let res;
    if (initial) {
      res = await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single();
      if (res.error && /column .*embut_cap_pct.* does not exist|schema cache/i.test(res.error.message)) {
        delete payload.embut_cap_pct;
        res = await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single();
      }
    } else {
      res = await supabase.from("sim_tables").insert(payload).select("*").single();
      if (res.error && /column .*embut_cap_pct.* does not exist|schema cache/i.test(res.error.message)) {
        delete payload.embut_cap_pct;
        res = await supabase.from("sim_tables").insert(payload).select("*").single();
      }
    }

    setSaving(false);
    if (res.error) { alert("Erro ao salvar tabela: " + res.error.message); return; }
    onSaved(res.data as SimTable);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{initial ? "Editar Tabela" : "Nova Tabela"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 grid gap-3 md:grid-cols-4">
          <div><Label>Segmento</Label><Input value={segmento} onChange={(e)=>setSegmento(e.target.value)} /></div>
          <div><Label>Nome da Tabela</Label><Input value={nome} onChange={(e)=>setNome(e.target.value)} /></div>
          <div><Label>Faixa (mín)</Label><Input type="number" value={faixaMin} onChange={(e)=>setFaixaMin(Number(e.target.value))} /></div>
          <div><Label>Faixa (máx)</Label><Input type="number" value={faixaMax} onChange={(e)=>setFaixaMax(Number(e.target.value))} /></div>
          <div><Label>Prazo Limite (meses)</Label><Input type="number" value={prazoLimite} onChange={(e)=>setPrazoLimite(Number(e.target.value))} /></div>

          <div><Label>% Taxa Adm</Label><Input value={taxaAdmHuman} onChange={(e)=>setTaxaAdmHuman(e.target.value)} /></div>
          <div><Label>% Fundo Reserva</Label><Input value={frHuman} onChange={(e)=>setFrHuman(e.target.value)} /></div>
          <div><Label>% Antecipação da Adm</Label><Input value={antecipHuman} onChange={(e)=>setAntecipHuman(e.target.value)} /></div>

          <div>
            <Label>Parcelas da Antecipação</Label>
            <select className="w-full h-10 border rounded-md px-3" value={String(antecipParcelas)} onChange={(e)=>setAntecipParcelas(Number(e.target.value))}>
              <option value="0">0 (sem antecipação)</option>
              <option value="1">1 parcela</option>
              <option value="2">2 parcelas</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">Aceita apenas 0, 1 ou 2.</p>
          </div>

          <div><Label>% Limitador Parcela</Label><Input value={limHuman} onChange={(e)=>setLimHuman(e.target.value)} /></div>
          <div><Label>% Seguro por parcela</Label><Input value={seguroHuman} onChange={(e)=>setSeguroHuman(e.target.value)} /></div>

          <div className="md:col-span-2">
            <Label>Limite Lance Embutido (%)</Label>
            <Input value={embutCapHuman} onChange={(e)=>setEmbutCapHuman(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Teto do embutido desta tabela. A base (Crédito ou Parcela termo) vem do Add Administradora.
            </p>
          </div>

          <div className="col-span-2">
            <Label>Lances Permitidos</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={perEmbutido} onChange={(e)=>setPerEmbutido(e.target.checked)} />Embutido</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo25} onChange={(e)=>setPerFixo25(e.target.checked)} />Fixo 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo50} onChange={(e)=>setPerFixo50(e.target.checked)} />Fixo 50%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perLivre} onChange={(e)=>setPerLivre(e.target.checked)} />Livre</label>
            </div>
          </div>

          <div className="col-span-2">
            <Label>Formas de Contratação</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cParcelaCheia} onChange={(e)=>setCParcelaCheia(e.target.checked)} />Parcela Cheia</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed25} onChange={(e)=>setCRed25(e.target.checked)} />Reduzida 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed50} onChange={(e)=>setCRed50(e.target.checked)} />Reduzida 50%</label>
            </div>
          </div>

          <div className="md:col-span-4">
            <Label>Índice de Correção (separar por vírgula)</Label>
            <Input value={indices} onChange={(e)=>setIndices(e.target.value)} placeholder="IPCA, INCC, IGP-M" />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <Button onClick={salvar} disabled={saving} className="h-10 rounded-2xl px-4">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {initial ? "Salvar alterações" : "Salvar Tabela"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving} className="h-10 rounded-2xl px-4">Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== UI do Simulador ====================== */
type EmbraconProps = {
  adminName: string;
  adminRules: any;
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
  prazoOriginalGrupo: number; setPrazoOriginalGrupo: (v: number) => void;
  lanceOfertParcelas: number; setLanceOfertParcelas: (v: number) => void;
  lanceEmbutParcelas: number; setLanceEmbutParcelas: (v: number) => void;
  parcContemplacao: number; setParcContemplacao: (v: number) => void;
  prazoAviso: string | null;
  calc: ReturnType<typeof calcularSimulacao> | null;
  salvar: () => Promise<void>;
  salvando: boolean;
  simCode: number | null;
  embutCapPct: number;
  embutCapBase: "credito" | "parcela_termo";
};

function EmbraconSimulator(p: EmbraconProps) {
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");

  const filteredLeads = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const qRaw = leadQuery.trim(); const q = norm(qRaw); const qDigits = qRaw.replace(/\D/g, "");
    return p.leads.filter((l) => norm(l.nome || "").includes(q) || (!!qDigits && (l.telefone || "").replace(/\D/g, "").includes(qDigits)));
  }, [p.leads, leadQuery]);

  useEffect(() => { if (!leadOpen) setLeadQuery(""); }, [leadOpen]);

  const lanceModoParcela = (p.adminRules?.modelo_lance ?? "percentual") === "parcela";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{p.adminName}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <Popover onOpenChange={setLeadOpen}>
                <PopoverButton className="w-full justify-between h-10">{p.leadInfo?.nome || "Escolher lead"}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" /></PopoverButton>
                <PopoverContent className="min-w-[260px] p-2 z-50">
                  <div className="flex items-center gap-2 mb-2"><Search className="h-4 w-4 opacity-60" /><Input placeholder="Buscar lead..." value={leadQuery} onChange={(e)=>setLeadQuery(e.target.value)} className="h-8" /></div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filteredLeads.length ? filteredLeads.map((l)=>(<PopoverClose asChild key={l.id}>
                      <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-muted" onClick={()=>{ p.setLeadId(l.id); setLeadQuery(""); }}>
                        <div className="text-sm font-medium">{l.nome}</div>
                        {l.telefone && <div className="text-xs text-muted-foreground">{l.telefone}</div>}
                      </button>
                    </PopoverClose>)) : <div className="text-sm text-muted-foreground px-2 py-6 text-center">Nenhum lead encontrado</div>}
                  </div>
                </PopoverContent>
              </Popover>
              {p.leadInfo && <p className="text-xs text-muted-foreground mt-1">{p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}</p>}
            </div>
            <div><Label>Nº do Grupo (opcional)</Label><Input value={p.grupo} onChange={(e)=>p.setGrupo(e.target.value)} placeholder="ex.: 9957" /></div>
          </div>
        </CardContent>
      </Card>

      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.segmento} onChange={(e)=>p.setSegmento(e.target.value)}>
                  <option value="">Selecione</option>
                  {Array.from(new Set(p.adminTables.map(t=>t.segmento))).map((s)=>(<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <Label>Tabela</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.nomeTabela} disabled={!p.segmento} onChange={(e)=>p.setNomeTabela(e.target.value)}>
                  <option value="">{p.segmento ? "Selecione a tabela" : "Selecione o segmento"}</option>
                  {p.nomesTabelaSegmento.map((n)=>(<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div>
                <Label>Prazo Até</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.tabelaId} disabled={!p.nomeTabela} onChange={(e)=>p.setTabelaId(e.target.value)}>
                  <option value="">{p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela"}</option>
                  {p.variantesDaTabela.map((t)=>(<option key={t.id} value={t.id}>{t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR {pctHuman(t.fundo_reserva_pct)}</option>))}
                </select>
              </div>
              <div><Label>Faixa de Crédito</Label><Input value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""} readOnly /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div><Label>Valor do Crédito</Label><MoneyInput value={p.credito || 0} onChange={p.setCredito} /></div>
              <div><Label>Prazo da Venda (meses)</Label><Input type="number" value={p.prazoVenda || ""} onChange={(e)=>p.setPrazoVenda(Number(e.target.value))} />{p.prazoAviso && <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>}</div>
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
                  <div>% FR: <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong></div>
                  <div>% Antecip: <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> • {p.tabelaSelecionada.antecip_parcelas}x</div>
                  <div>Limitador Parcela: <strong>{pctHuman(p.tabelaSelecionada.limitador_parcela_pct)}</strong></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>{p.tabelaSelecionada?.antecip_parcelas === 2 ? "Parcelas 1 e 2" : p.tabelaSelecionada?.antecip_parcelas === 1 ? "Parcela 1" : "Parcela Inicial"}</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly />
              </div>
              <div><Label>Demais Parcelas</Label><Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {(p.adminRules?.modelo_lance ?? "percentual") === "parcela" ? (
                <>
                  <div><Label>Prazo original do grupo</Label><Input type="number" value={p.prazoOriginalGrupo || p.prazoVenda || 0} onChange={(e)=>p.setPrazoOriginalGrupo(Math.max(1, Number(e.target.value)))} /></div>
                  <div><Label>Qtde Parcelas (Lance Ofertado)</Label><Input type="number" value={p.lanceOfertParcelas} onChange={(e)=>p.setLanceOfertParcelas(Math.max(0, Number(e.target.value)))} /></div>
                  <div><Label>Qtde Parcelas (Lance Embutido)</Label><Input type="number" value={p.lanceEmbutParcelas} onChange={(e)=>p.setLanceEmbutParcelas(Math.max(0, Number(e.target.value)))} /></div>
                </>
              ) : (
                <>
                  <div><Label>Lance Ofertado (%)</Label><PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} /></div>
                  <div><Label>Lance Embutido (%)</Label><PercentInput valueDecimal={p.lanceEmbutPct} onChangeDecimal={(d)=>p.setLanceEmbutPct(clamp(d,0,p.embutCapPct))} maxDecimal={p.embutCapPct} /></div>
                </>
              )}

              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={p.parcContemplacao} onChange={(e)=>p.setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                <p className="text-xs text-muted-foreground mt-1">Menor que o Prazo da Venda.</p>
              </div>

              <div className="md:col-span-3 text-xs text-muted-foreground">
                Limite do embutido: <strong>{pctHuman(p.embutCapPct)}</strong> • Base <strong>{p.embutCapBase === "credito" ? "Crédito" : "Parcela (termo)"}</strong>.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""} readOnly /></div>
              <div><Label>Lance Próprio</Label><Input value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""} readOnly /></div>
              <div><Label>Lance Percebido (%)</Label><Input value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""} readOnly /></div>
              <div><Label>Novo Crédito</Label><Input value={p.calc ? brMoney(p.calc.novoCredito) : ""} readOnly /></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""} readOnly /></div>
              <div><Label>Parcela Limitante</Label><Input value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""} readOnly /></div>
              <div><Label>Parcela Escolhida</Label><Input value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""} readOnly /></div>
              <div><Label>Novo Prazo (meses)</Label><Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly /></div>
              {p.calc?.has2aAntecipDepois && p.calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3"><Label>2ª parcela (com antecipação)</Label><Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly /></div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}
