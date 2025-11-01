// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  antecip_parcelas: number; // 0|1|2|...
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  permite_lance_embutido: boolean;
  permite_lance_fixo_25: boolean;
  permite_lance_fixo_50: boolean;
  permite_lance_livre: boolean;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
  indice_correcao: string[];
  // OPCIONAL (se existir na base, sobrepõe o limite da admin)
  limite_lance_embut_pct?: number | null;
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const pctHuman = (v: number) => `${(v * 100).toFixed(4)}%`;

function formatBRLInputFromNumber(n: number): string {
  return (isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ========== Percent Input (anti “pulo”) ========== */
function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  placeholder,
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string>(() => (valueDecimal * 100 || 0).toString().replace(".", ","));

  useEffect(() => {
    const target = (valueDecimal * 100).toString().replace(".", ",");
    if (target !== raw) setRaw(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueDecimal]);

  function commit(val: string) {
    const clean = val.trim().replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(clean);
    let dec = isNaN(num) ? 0 : num / 100;
    if (typeof maxDecimal === "number") dec = clamp(dec, 0, maxDecimal);
    onChangeDecimal(dec);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={raw}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className="text-right"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ======================= Cálculo ========================= */
export type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;

  taxaAdmFull: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: number;
  limitadorPct: number;
  seguroPrestPct: number;

  modeloLance: "percentual" | "parcela";
  lanceBase: "credito" | "parcela_termo";
  prazoOriginalGrupo?: number;

  // modo “parcela”
  lanceOfertParcelas?: number;
  lanceEmbutParcelas?: number;

  // modo “percentual”
  lanceOfertPct?: number;
  lanceEmbutPct?: number;

  // limite do embutido
  embutCapPct?: number | null;
  embutCapBase?: "credito" | "parcela_termo";

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
    embutCapPct = 0.25,
    embutCapBase = "credito",

    limitEnabled = true,
    redutorPreEnabled = false,
    redutorBase = "valor_categoria",

    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
  const parcelaTermo = valorCategoria / prazoTermo;

  let fatorForma = 1;
  if (forma === "Reduzida 25%") fatorForma = 0.75;
  if (forma === "Reduzida 50%") fatorForma = 0.5;

  const baseMensalPre =
    redutorPreEnabled && redutorBase === "valor_categoria"
      ? (valorCategoria / prazo) * fatorForma
      : (C * fatorForma + C * Math.max(0, taxaAdmFull - antecipPct) + C * frPct) / prazo;

  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;

  const antParcelas = Math.max(0, Number(antecipParcelas) || 0);
  const antecipCada = antParcelas > 0 ? (C * antecipPct) / antParcelas : 0;

  const parcelaAte = baseMensalPre + (antParcelas > 0 ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalPre + seguroMensal;

  const totalPagoSemSeguro = baseMensalPre * parcelasPagas + antecipCada * Math.min(parcelasPagas, antParcelas);

  // ===== Lances =====
  let lanceOfertadoValor = 0;
  let lanceEmbutidoValor = 0;

  // Limite absoluto para embutido
  const embutLimitValorBase = embutCapBase === "parcela_termo" ? parcelaTermo * prazoTermo : C;
  const embutValorMaximo = (embutCapPct ?? 0.25) * embutLimitValorBase;

  if (modeloLance === "parcela" && lanceBase === "parcela_termo") {
    const ofertValor = Math.max(0, parcelaTermo * Math.max(0, lanceOfertParcelas));
    const embutValor = Math.max(0, parcelaTermo * Math.max(0, lanceEmbutParcelas));
    lanceOfertadoValor = ofertValor;
    lanceEmbutidoValor = Math.min(embutValor, embutValorMaximo);
  } else {
    // percentual sobre base do lance (crédito) + cap
    lanceOfertadoValor = C * Math.max(0, lanceOfertPct);
    const embutPct = Math.min(Math.max(0, lanceEmbutPct), embutCapPct ?? 0.25);
    lanceEmbutidoValor = Math.min((lanceBase === "parcela_termo" ? parcelaTermo * prazoTermo : C) * embutPct, embutValorMaximo);
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  const saldoDevedorFinal = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);

  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;
  const parcelaLimitante = limitEnabled ? valorCategoria * limitadorPct : 0;

  const isServicos = (segmento || "").toLowerCase().includes("serv");

  let aplicouLimitador = false;
  let parcelaEscolhida = novaParcelaSemLimite;
  if (!isServicos) {
    if (limitEnabled && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    }
  } else {
    // manter a parcela e recalcular somente o prazo
    parcelaEscolhida = parcelaDemais;
  }

  const has2aAntecipDepois = antParcelas >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? parcelaEscolhida + antecipCada : null;

  let saldoParaPrazo = saldoDevedorFinal;
  if (has2aAntecipDepois) {
    saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipCada));
  }
  const novoPrazo = Math.max(1, Math.ceil(saldoParaPrazo / parcelaEscolhida));

  return {
    valorCategoria,
    parcelaTermo,

    parcelaAte,
    parcelaDemais,

    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,

    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida,
    saldoDevedorFinal,
    novoPrazo,

    TA_efetiva: Math.max(0, taxaAdmFull - antecipPct),
    antecipAdicionalCada: antecipCada,
    has2aAntecipDepois,
    segundaParcelaComAntecipacao,
    aplicouLimitador,
  } as const;
}

/* ========== Inputs com máscara ========== */
function MoneyInput({
  value,
  onChange,
  ...rest
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

/* ========================= Página ======================== */
export default function Simuladores() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const setup = searchParams.get("setup") === "1";
  const routeAdminId = id ?? null;

  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(routeAdminId);

  useEffect(() => setActiveAdminId(routeAdminId), [routeAdminId]);
  useEffect(() => {
    if (!routeAdminId && !activeAdminId && admins.length) {
      setActiveAdminId(admins[0].id);
    }
  }, [routeAdminId, activeAdminId, admins]);

  const [mgrOpen, setMgrOpen] = useState(false);

  // seleção geral
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

  // Lances
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

  const adminId = routeAdminId;
  const openSetup = setup;

  // Load basic data (admins com rules e tabelas)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name,rules").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*").order("created_at", { ascending: false }),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins((a ?? []) as Admin[]);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));

      // default admin
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      let nextActiveId = embr?.id ?? (a?.[0]?.id ?? null);
      if (adminId && (a ?? []).some((ad: any) => ad.id === adminId)) nextActiveId = adminId as string;
      setActiveAdminId(nextActiveId);

      setLoading(false);
      if (openSetup) setTimeout(() => setMgrOpen(true), 0);
    })();
  }, []); // eslint-disable-line

  // user phone
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
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  const variantesDaTabela = useMemo(() => {
    return adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela);
  }, [adminTables, segmento, nomeTabela]);

  const tabelaSelecionada = useMemo(() => tables.find((t) => t.id === tabelaId) || null, [tables, tabelaId]);

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]);

  // limite do embutido (tabela sobrepõe admin, se existir)
  const embutCapPct =
    (tabelaSelecionada?.limite_lance_embut_pct ?? null) ??
    (adminRules?.embut_cap_adm_pct ?? 0.25);
  const embutCapBase = (adminRules?.embut_base ?? "credito") as "credito" | "parcela_termo";

  useEffect(() => {
    if (lanceEmbutPct > embutCapPct) setLanceEmbutPct(embutCapPct);
  }, [lanceEmbutPct, embutCapPct]);

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular = !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  // cálculo
  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    const modeloLance = (adminRules?.modelo_lance ?? "percentual") as "percentual" | "parcela";
    const lanceBase = (adminRules?.modelo_lance_base ?? (modeloLance === "parcela" ? "parcela_termo" : "credito")) as
      | "credito"
      | "parcela_termo";

    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,

      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: (tabelaSelecionada.antecip_parcelas as any) ?? 0,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,

      modeloLance,
      lanceBase,
      prazoOriginalGrupo: Number(prazoOriginalGrupo || prazoVenda),

      // cap do embutido
      embutCapPct,
      embutCapBase,

      limitEnabled: adminRules?.limit_enabled !== false,
      redutorPreEnabled: adminRules?.redutor_pre_contemplacao_enabled === true,
      redutorBase: (adminRules?.redutor_base ?? "valor_categoria") as any,

      parcContemplacao,

      // Modo “parcela”
      lanceOfertParcelas,
      lanceEmbutParcelas,

      // Modo “percentual”
      lanceOfertPct,
      lanceEmbutPct,
    };

    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
    adminRules,
    prazoOriginalGrupo,
    lanceOfertParcelas,
    lanceEmbutParcelas,
    embutCapPct,
    embutCapBase,
  ]);

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

      lance_modelo: adminRules?.modelo_lance ?? "percentual",
      lance_base: adminRules?.modelo_lance_base ?? (adminRules?.modelo_lance === "parcela" ? "parcela_termo" : "credito"),
      prazo_original_grupo: prazoOriginalGrupo || null,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: Math.min(lanceEmbutPct, embutCapPct),
      lance_ofertado_parcelas: lanceOfertParcelas,
      lance_embutido_parcelas: lanceEmbutParcelas,

      parcela_contemplacao: parcContemplacao,

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

    const { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar simulação: " + error.message);
      return;
    }
    setSimCode(data?.code ?? null);
  }

  function handleTableCreatedOrUpdated(newTable: SimTable) {
    setTables((prev) => {
      const exists = prev.find((t) => t.id === newTable.id);
      if (exists) return prev.map((t) => (t.id === newTable.id ? newTable : t));
      return [newTable, ...prev];
    });
  }
  function handleTableDeleted(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  // ===== Resumos =====
  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";

    const bem = (() => {
      const seg = (segmento || tabelaSelecionada.segmento || "").toLowerCase();
      if (seg.includes("imó")) return "imóvel";
      if (seg.includes("serv")) return "serviço";
      if (seg.includes("moto")) return "motocicleta";
      return "veículo";
    })();

    const primeiraParcelaLabel =
      tabelaSelecionada.antecip_parcelas === 2
        ? "Parcelas 1 e 2"
        : tabelaSelecionada.antecip_parcelas === 1
        ? "Parcela 1"
        : "Parcela inicial";

    const parcelaRestanteValor = brMoney(calc.parcelaEscolhida);
    const segundaParcExtra =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª parcela com antecipação: ${brMoney(calc.segundaParcelaComAntecipacao)})`
        : "";

    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    return `🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (Primeira parcela em até 3x sem juros no cartão)

💵 Demais parcelas até a contemplação: ${brMoney(calc.parcelaDemais)}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${parcelaRestanteValor}${segundaParcExtra}

⏳ Prazo restante: ${calc.novoPrazo} meses

💡 Um planejamento inteligente que cabe no seu bolso e acelera a realização do seu sonho!

👉 Quer simular com o valor do seu ${bem} dos sonhos?
Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`;
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  function normalizarSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "Imóvel";
    if (s.includes("auto")) return "Automóvel";
    if (s.includes("moto")) return "Motocicleta";
    if (s.includes("serv")) return "Serviços";
    if (s.includes("pesad")) return "Pesados";
    return seg || "Automóvel";
  }
  function emojiDoSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "🏠";
    if (s.includes("moto")) return "🏍️";
    if (s.includes("serv")) return "✈️";
    if (s.includes("pesad")) return "🚚";
    return "🚗";
  }

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";

    const segBase = segmento || tabelaSelecionada?.segmento || "Automóvel";
    const seg = normalizarSegmento(segBase);
    const emoji = emojiDoSegmento(segBase);

    const parcela1 = brMoney(calc.parcelaAte);
    const mostraParc2 = !!(calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null);
    const linhaParc2 = mostraParc2 ? `\n💰 Parcela 2: ${brMoney(calc.segundaParcelaComAntecipacao!)} (com antecipação)` : "";

    const linhaPrazo = `📆 + ${calc.novoPrazo}x de ${brMoney(calc.parcelaEscolhida)}`;
    const grupoTxt = grupo || "—";
    const whatsappFmt = formatPhoneBR(userPhone);
    const whatsappLine = whatsappFmt ? `\nWhatsApp: ${whatsappFmt}` : "";

    return `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA ${activeAdmin?.name || ""}🔥

Proposta ${seg}

${emoji} Crédito: ${brMoney(calc.novoCredito)}
💰 Parcela 1: ${parcela1} (Em até 3x no cartão)${linhaParc2}
${linhaPrazo}
💵 Lance Próprio: ${brMoney(calc.lanceProprioValor)}
📢 Grupo: ${grupoTxt}

🚨 POUCAS VAGAS DISPONÍVEIS🚨

Assembleia ${assembleia}

📲 Garanta sua vaga agora!${whatsappLine}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`;
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone, activeAdmin?.name]);

  async function copiarProposta() {
    try {
      await navigator.clipboard.writeText(propostaTexto);
      alert("Texto copiado!");
    } catch {
      alert("Não foi possível copiar o texto.");
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-2">
          {activeAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setMgrOpen(true)} className="h-10 rounded-2xl px-4">
              Gerenciar Tabelas
            </Button>
          )}
        </div>
      </div>

      {/* layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* esquerda */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Simuladores</CardTitle>
            </CardHeader>
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
                  leadId={leadId}
                  setLeadId={setLeadId}
                  leadInfo={leadInfo}
                  grupo={grupo}
                  setGrupo={setGrupo}
                  segmento={segmento}
                  setSegmento={(v) => {
                    setSegmento(v);
                    setNomeTabela("");
                    setTabelaId("");
                  }}
                  nomeTabela={nomeTabela}
                  setNomeTabela={(v) => {
                    setNomeTabela(v);
                    setTabelaId("");
                  }}
                  tabelaId={tabelaId}
                  setTabelaId={setTabelaId}
                  credito={credito}
                  setCredito={setCredito}
                  prazoVenda={prazoVenda}
                  setPrazoVenda={(n) => {
                    setPrazoVenda(n);
                    if (!prazoOriginalGrupo) setPrazoOriginalGrupo(n);
                  }}
                  forma={forma}
                  setForma={setForma}
                  seguroPrest={seguroPrest}
                  setSeguroPrest={setSeguroPrest}
                  lanceOfertPct={lanceOfertPct}
                  setLanceOfertPct={setLanceOfertPct}
                  lanceEmbutPct={lanceEmbutPct}
                  setLanceEmbutPct={setLanceEmbutPct}
                  prazoOriginalGrupo={prazoOriginalGrupo}
                  setPrazoOriginalGrupo={setPrazoOriginalGrupo}
                  lanceOfertParcelas={lanceOfertParcelas}
                  setLanceOfertParcelas={setLanceOfertParcelas}
                  lanceEmbutParcelas={lanceEmbutParcelas}
                  setLanceEmbutParcelas={setLanceEmbutParcelas}
                  parcContemplacao={parcContemplacao}
                  setParcContemplacao={setParcContemplacao}
                  prazoAviso={prazoAviso}
                  calc={calc}
                  salvar={salvarSimulacao}
                  salvando={salvando}
                  simCode={simCode}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Nenhuma administradora encontrada.</div>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{simCode}</strong></span>}
          </div>
        </div>

        {/* direita */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div>
                    <div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div>
                    <div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div>
                    <div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">{seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}</div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Taxa Adm (total)</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div>
                    <div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Valor de Categoria</div>
                    <div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                    <div>Parcela (termo)</div>
                    <div className="text-right">{calc ? brMoney(calc.parcelaTermo) : "—"}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea
                className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={resumoTexto}
                placeholder="Preencha os campos da simulação para gerar o resumo."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarResumo} disabled={!resumoTexto}>Copiar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Texto: Oportunidade / Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Assembleia (ex.: 15/10)</Label>
                  <Input value={assembleia} onChange={(e) => setAssembleia(e.target.value)} placeholder="dd/mm" />
                </div>
              </div>
              <textarea
                className="w-full h-72 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={propostaTexto}
                placeholder="Preencha a simulação para gerar o texto."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarProposta} disabled={!propostaTexto}>Copiar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Overlay de gerenciamento de tabelas */}
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

/* ================== EmbraconSimulator (UI) ================== */
function EmbraconSimulator(props: {
  adminName: string;
  adminRules: any;
  leads: Lead[];
  adminTables: SimTable[];
  nomesTabelaSegmento: string[];
  variantesDaTabela: SimTable[];
  tabelaSelecionada: SimTable | null;
  prazoAte: number;
  faixa: { min: number; max: number } | null;

  leadId: string;
  setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;

  grupo: string;
  setGrupo: (v: string) => void;

  segmento: string;
  setSegmento: (v: string) => void;
  nomeTabela: string;
  setNomeTabela: (v: string) => void;
  tabelaId: string;
  setTabelaId: (v: string) => void;

  credito: number;
  setCredito: (n: number) => void;
  prazoVenda: number;
  setPrazoVenda: (n: number) => void;
  forma: FormaContratacao;
  setForma: (v: FormaContratacao) => void;
  seguroPrest: boolean;
  setSeguroPrest: (v: boolean) => void;

  // lances
  lanceOfertPct: number;
  setLanceOfertPct: (n: number) => void;
  lanceEmbutPct: number;
  setLanceEmbutPct: (n: number) => void;

  prazoOriginalGrupo: number;
  setPrazoOriginalGrupo: (n: number) => void;
  lanceOfertParcelas: number;
  setLanceOfertParcelas: (n: number) => void;
  lanceEmbutParcelas: number;
  setLanceEmbutParcelas: (n: number) => void;

  parcContemplacao: number;
  setParcContemplacao: (n: number) => void;

  prazoAviso: string | null;

  calc: ReturnType<typeof calcularSimulacao> | null;

  salvar: () => void;
  salvando: boolean;
  simCode: number | null;
}) {
  const p = props;
  const leads = p.leads;

  const modeloLance = (p.adminRules?.modelo_lance ?? "percentual") as "percentual" | "parcela";
  const lanceBase = (p.adminRules?.modelo_lance_base ?? (modeloLance === "parcela" ? "parcela_termo" : "credito")) as
    | "credito"
    | "parcela_termo";

  const limiteInfo =
    (p.tabelaSelecionada?.limite_lance_embut_pct ?? null) ??
    (p.adminRules?.embut_cap_adm_pct ?? 0.25);

  return (
    <div className="space-y-4">
      {/* Seleções */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-6">
          <Label>Lead (opcional)</Label>
          <Popover>
            <PopoverButton asChild>
              <Button variant="outline" className="w-full justify-between">
                {p.leadInfo ? `${p.leadInfo.nome} ${p.leadInfo.telefone ? `• ${formatPhoneBR(p.leadInfo.telefone)}` : ""}` : "Selecionar lead"}
                <ChevronsUpDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverButton>
            <PopoverContent className="p-0 w-[420px]">
              <div className="p-2 border-b flex items-center gap-2">
                <Search className="h-4 w-4 opacity-60" />
                <Input placeholder="Buscar por nome ou telefone..." onChange={() => {}} />
              </div>
              <div className="max-h-72 overflow-auto">
                {leads.map((l) => (
                  <button
                    key={l.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60"
                    onClick={() => p.setLeadId(l.id)}
                  >
                    <div className="font-medium">{l.nome}</div>
                    {l.telefone && <div className="text-xs text-muted-foreground">{formatPhoneBR(l.telefone)}</div>}
                  </button>
                ))}
              </div>
              <div className="p-2 border-t text-right">
                <PopoverClose asChild>
                  <Button size="sm" variant="secondary">OK</Button>
                </PopoverClose>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label>Grupo (opcional)</Label>
          <Input value={p.grupo} onChange={(e) => p.setGrupo(e.target.value)} placeholder="ex.: 9677" />
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label>Segmento</Label>
          <Input value={p.segmento} onChange={(e) => p.setSegmento(e.target.value)} placeholder="Automóvel / Imóvel / Serviços..." />
        </div>

        <div className="col-span-12 md:col-span-6">
          <Label>Nome da Tabela</Label>
          <div className="flex gap-2">
            <Input value={p.nomeTabela} onChange={(e) => p.setNomeTabela(e.target.value)} placeholder="Ex.: Select Estendido" />
            <Popover>
              <PopoverButton asChild>
                <Button variant="outline">Variantes</Button>
              </PopoverButton>
              <PopoverContent className="p-0 w-80">
                <div className="max-h-64 overflow-auto">
                  {p.nomesTabelaSegmento.map((n) => (
                    <button key={n} className="w-full text-left px-3 py-2 hover:bg-muted/60" onClick={() => p.setNomeTabela(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Label>Variante</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {p.variantesDaTabela.map((t) => (
              <Button
                key={t.id}
                variant={p.tabelaId === t.id ? "default" : "outline"}
                onClick={() => p.setTabelaId(t.id)}
                className="h-10 rounded-xl"
              >
                {t.prazo_limite}m • Adm {pctHuman(t.taxa_adm_pct)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Parâmetros */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 md:col-span-3">
          <Label>Crédito</Label>
          <MoneyInput value={p.credito} onChange={p.setCredito} placeholder="R$ 0,00" />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label>Prazo da venda</Label>
          <Input inputMode="numeric" value={p.prazoVenda || ""} onChange={(e) => p.setPrazoVenda(Number(e.target.value || 0))} />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label>Forma</Label>
          <select value={p.forma} onChange={(e) => p.setForma(e.target.value as any)} className="h-10 w-full rounded-md border px-3">
            <option>Parcela Cheia</option>
            <option>Reduzida 25%</option>
            <option>Reduzida 50%</option>
          </select>
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label>Seguro Prestamista</Label>
          <select value={String(p.seguroPrest)} onChange={(e) => p.setSeguroPrest(e.target.value === "true")} className="h-10 w-full rounded-md border px-3">
            <option value="false">Sem seguro</option>
            <option value="true">Com seguro</option>
          </select>
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label>Parcela de Contemplação (mês)</Label>
          <Input inputMode="numeric" value={p.parcContemplacao || ""} onChange={(e) => p.setParcContemplacao(Number(e.target.value || 0))} />
        </div>

        {modeloLance === "parcela" ? (
          <>
            <div className="col-span-6 md:col-span-3">
              <Label>Prazo original do grupo (termo)</Label>
              <Input inputMode="numeric" value={p.prazoOriginalGrupo || ""} onChange={(e) => p.setPrazoOriginalGrupo(Number(e.target.value || 0))} />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label>Qtd parcelas (Lance ofertado)</Label>
              <Input inputMode="numeric" value={p.lanceOfertParcelas || ""} onChange={(e) => p.setLanceOfertParcelas(Number(e.target.value || 0))} />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label>Qtd parcelas (Lance embutido)</Label>
              <Input inputMode="numeric" value={p.lanceEmbutParcelas || ""} onChange={(e) => p.setLanceEmbutParcelas(Number(e.target.value || 0))} />
            </div>
          </>
        ) : (
          <>
            <div className="col-span-6 md:col-span-3">
              <Label>% Lance ofertado</Label>
              <PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} placeholder="0,00" />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label>% Lance embutido</Label>
              <PercentInput valueDecimal={p.lanceEmbutPct} onChangeDecimal={p.setLanceEmbutPct} placeholder="0,00" maxDecimal={limiteInfo} />
              <div className="text-[11px] text-muted-foreground mt-1">
                Limite: {(limiteInfo * 100).toFixed(2)}% • Base: <b>{lanceBase === "parcela_termo" ? "Parcela termo" : "Crédito"}</b>
              </div>
            </div>
          </>
        )}
      </div>

      {p.prazoAviso && <div className="text-sm text-yellow-600">{p.prazoAviso}</div>}

      {/* Resultado */}
      <div className="border rounded-xl p-3">
        {!p.calc ? (
          <div className="text-sm text-muted-foreground">Preencha os campos para calcular.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Parcela 1 (até 2)</div>
              <div className="font-medium">{brMoney(p.calc.parcelaAte)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Demais (pré)</div>
              <div className="font-medium">{brMoney(p.calc.parcelaDemais)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Após contemplação</div>
              <div className="font-medium">{brMoney(p.calc.parcelaEscolhida)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Novo prazo</div>
              <div className="font-medium">{p.calc.novoPrazo} meses</div>
            </div>
            <div>
              <div className="text-muted-foreground">Lance próprio</div>
              <div className="font-medium">{brMoney(p.calc.lanceProprioValor)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Crédito líquido</div>
              <div className="font-medium">{brMoney(p.calc.novoCredito)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =============== Modal Base =============== */
function ModalBase({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Modal: Gerenciar Tabelas ============== */
function TableManagerModal({
  admin,
  allTables,
  onClose,
  onCreatedOrUpdated,
  onDeleted,
}: {
  admin: Admin;
  allTables: SimTable[];
  onClose: () => void;
  onCreatedOrUpdated: (t: SimTable) => void;
  onDeleted: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SimTable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => setPage(1), [allTables.length]);

  const grouped = useMemo(() => {
    return [...allTables].sort((a, b) => {
      const sa = (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase();
      const sb = (b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase();
      return sa.localeCompare(sb);
    });
  }, [allTables]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(() => grouped.slice((page - 1) * pageSize, page * pageSize), [grouped, page]);

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (Simulações vinculadas serão removidas)")) return;
    setBusyId(id);

    // Remove simulações da tabela
    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) {
      setBusyId(null);
      alert("Erro ao excluir simulações vinculadas: " + delSims.error.message);
      return;
    }

    const { error } = await supabase.from("sim_tables").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    onDeleted(id);
  }

  return (
    <ModalBase onClose={onClose} title="Gerenciador de Tabelas">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            Admin ativa: <strong>{admin.name}</strong>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="h-10 rounded-2xl px-4"
          >
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
                <th className="text-left p-2">% Limite Parcela</th>
                <th className="text-left p-2">% Seguro</th>
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
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(t);
                          setShowForm(true);
                        }}
                        className="h-9 rounded-xl px-3"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === t.id}
                        onClick={() => deletar(t.id)}
                        className="h-9 rounded-xl px-3"
                      >
                        {busyId === t.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-muted-foreground">
                    Sem tabelas para esta administradora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Próxima
            </Button>
          </div>
        </div>

        {showForm && (
          <TableFormOverlay
            admin={admin}
            table={editing}
            onClose={() => setShowForm(false)}
            onSaved={(t) => {
              onCreatedOrUpdated(t);
              setShowForm(false);
            }}
          />
        )}
      </div>
    </ModalBase>
  );
}

/* ============== Overlay: Form de Tabela (Create/Update) ============== */
function TableFormOverlay({
  admin,
  table,
  onClose,
  onSaved,
}: {
  admin: Admin;
  table: SimTable | null;
  onClose: () => void;
  onSaved: (t: SimTable) => void;
}) {
  const isEdit = !!table;

  const [segmento, setSegmento] = useState<string>(table?.segmento || "");
  const [nomeTabela, setNomeTabela] = useState<string>(table?.nome_tabela || "");
  const [faixaMin, setFaixaMin] = useState<number>(table?.faixa_min || 0);
  const [faixaMax, setFaixaMax] = useState<number>(table?.faixa_max || 0);
  const [prazoLimite, setPrazoLimite] = useState<number>(table?.prazo_limite || 0);

  const [taxaAdmPct, setTaxaAdmPct] = useState<number>(table?.taxa_adm_pct || 0);
  const [frPct, setFrPct] = useState<number>(table?.fundo_reserva_pct || 0);
  const [antecipPct, setAntecipPct] = useState<number>(table?.antecip_pct || 0);
  const [antecipParcelas, setAntecipParcelas] = useState<number>(table?.antecip_parcelas || 0);
  const [limitadorParcelaPct, setLimitadorParcelaPct] = useState<number>(table?.limitador_parcela_pct || 0);
  const [seguroPrestPct, setSeguroPrestPct] = useState<number>(table?.seguro_prest_pct || 0);

  const [contrataCheia, setContrataCheia] = useState<boolean>(table?.contrata_parcela_cheia ?? true);
  const [contrataR25, setContrataR25] = useState<boolean>(table?.contrata_reduzida_25 ?? true);
  const [contrataR50, setContrataR50] = useState<boolean>(table?.contrata_reduzida_50 ?? true);

  const [indiceCorrecaoRaw, setIndiceCorrecaoRaw] = useState<string>((table?.indice_correcao || []).join(", "));

  // NOVO — Limite Lance Embutido na Tabela (opcional)
  const [limiteEmbutPct, setLimiteEmbutPct] = useState<number>(
    (table?.limite_lance_embut_pct ?? null) ?? (admin.rules?.embut_cap_adm_pct ?? 0.25)
  );

  async function handleSubmit() {
    const payload: any = {
      admin_id: admin.id,
      segmento,
      nome_tabela: nomeTabela,
      faixa_min: faixaMin,
      faixa_max: faixaMax,
      prazo_limite: prazoLimite,
      taxa_adm_pct: taxaAdmPct,
      fundo_reserva_pct: frPct,
      antecip_pct: antecipPct,
      antecip_parcelas: antecipParcelas,
      limitador_parcela_pct: limitadorParcelaPct,
      seguro_prest_pct: seguroPrestPct,
      contrata_parcela_cheia: contrataCheia,
      contrata_reduzida_25: contrataR25,
      contrata_reduzida_50: contrataR50,
      indice_correcao: indiceCorrecaoRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    // Envia o campo somente se a coluna existir (tentativa segura):
    // Muitos clientes já criaram a coluna via migração; se não existir, o Supabase ignora/retorna erro.
    // Para não falhar salvamento, tentamos incluir, e se der erro 42703 (column not exist), reenviamos sem o campo.
    let firstTry = await supabase.from("sim_tables").upsert(
      isEdit ? { id: table!.id, ...payload, limite_lance_embut_pct: limiteEmbutPct } : { ...payload, limite_lance_embut_pct: limiteEmbutPct }
    ).select("*").single();

    if (firstTry.error && String(firstTry.error.code) === "42703") {
      // Reenvia sem a coluna opcional
      firstTry = await supabase.from("sim_tables").upsert(
        isEdit ? { id: table!.id, ...payload } : { ...payload }
      ).select("*").single();
    }

    if (firstTry.error) {
      alert("Erro ao salvar tabela: " + firstTry.error.message);
      return;
    }
    onSaved(firstTry.data as SimTable);
  }

  return (
    <ModalBase onClose={onClose} title={isEdit ? "Editar Tabela" : "Nova Tabela"}>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Label>Segmento</Label>
            <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Automóvel / Imóvel / Serviços..." />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Nome da Tabela</Label>
            <Input value={nomeTabela} onChange={(e) => setNomeTabela(e.target.value)} placeholder="Select Estendido..." />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>Faixa (mín)</Label>
            <MoneyInput value={faixaMin} onChange={setFaixaMin} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>Faixa (máx)</Label>
            <MoneyInput value={faixaMax} onChange={setFaixaMax} />
          </div>

          <div className="col-span-6 md:col-span-2">
            <Label>Prazo Limite (meses)</Label>
            <Input inputMode="numeric" value={prazoLimite || ""} onChange={(e) => setPrazoLimite(Number(e.target.value || 0))} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>% Taxa Adm (total)</Label>
            <PercentInput valueDecimal={taxaAdmPct} onChangeDecimal={setTaxaAdmPct} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>% Fundo Reserva</Label>
            <PercentInput valueDecimal={frPct} onChangeDecimal={setFrPct} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>% Antecipação da Adm</Label>
            <PercentInput valueDecimal={antecipPct} onChangeDecimal={setAntecipPct} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>Parcelas da Antecipação</Label>
            <Input inputMode="numeric" value={antecipParcelas || ""} onChange={(e) => setAntecipParcelas(Number(e.target.value || 0))} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>% Limitador Parcela (pós)</Label>
            <PercentInput valueDecimal={limitadorParcelaPct} onChangeDecimal={setLimitadorParcelaPct} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label>% Seguro por parcela</Label>
            <PercentInput valueDecimal={seguroPrestPct} onChangeDecimal={setSeguroPrestPct} />
          </div>

          {/* NOVO: Limite Lance Embutido nesta Tabela (opcional) */}
          <div className="col-span-6 md:col-span-2">
            <Label>Limite Lance Embutido (%)</Label>
            <PercentInput valueDecimal={limiteEmbutPct} onChangeDecimal={setLimiteEmbutPct} />
            <div className="text-[11px] text-muted-foreground mt-1">Se vazio/0, será usado o limite da administradora.</div>
          </div>

          <div className="col-span-12">
            <Label>Índice de Correção (separar por vírgula)</Label>
            <Input value={indiceCorrecaoRaw} onChange={(e) => setIndiceCorrecaoRaw(e.target.value)} placeholder="IPCA, INCC..." />
          </div>

          <div className="col-span-12">
            <Label>Formas de Contratação</Label>
            <div className="flex flex-wrap gap-3 mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={contrataCheia} onChange={(e) => setContrataCheia(e.target.checked)} /> Parcela Cheia
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={contrataR25} onChange={(e) => setContrataR25(e.target.checked)} /> Reduzida 25%
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={contrataR50} onChange={(e) => setContrataR50(e.target.checked)} /> Reduzida 50%
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>{isEdit ? "Salvar alterações" : "Salvar Tabela"}</Button>
        </div>
      </div>
    </ModalBase>
  );
}
