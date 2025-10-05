// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { Loader2, Plus, Pencil, Trash2, X, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverButton, PopoverContent, PopoverClose } from "@/components/ui/popover";

/* ========================= Tipos ========================= */
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
  indice_correcao: string[];
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

/** BRL mask */
function formatBRLInputFromNumber(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

/** Percent “25,0000” <-> 0.25 (decimal) */
function formatPctInputFromDecimal(d: number): string {
  return (d * 100).toFixed(4).replace(".", ",");
}
function parsePctInputToDecimal(s: string): number {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Exceção do limitador: Motocicleta >= 20k => 1% */
function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if (segmento?.toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/** Formata telefone BR para exibição */
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
  lanceOfertPct: number;
  lanceEmbutPct: number; // <= 0.25
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
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  // Flags de categoria
  const segLower = (segmento || "").toLowerCase();
  const isServico = segLower.includes("serv");
  const isMoto = segLower.includes("moto");

  // TA efetiva (parte que vai para as parcelas mensais)
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  // Valor de categoria (base para saldo + limitador + seguro)
  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  // Fator do Fundo Comum conforme contratação
  const fundoComumFactor =
    forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  // Parcela base (SEM seguro)
  const baseMensalSemSeguro =
    (C * fundoComumFactor + C * TA_efetiva + C * frPct) / prazo;

  // Seguro mensal (só soma na parcela, não abate saldo)
  const seguroMensal = seguro ? valorCategoria * i.seguroPrestPct : 0;

  // Antecipação (somada nas primeiras 1 ou 2 parcelas)
  const antecipAdicionalCada =
    antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;

  // Exibição até a contemplação
  const parcelaAte =
    (baseMensalSemSeguro + (antecipParcelas > 0 ? antecipAdicionalCada : 0)) +
    seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // TOTAL PAGO ATÉ A CONTEMPLAÇÃO (SEM seguro)
  const totalPagoSemSeguro =
    baseMensalSemSeguro * parcelasPagas +
    antecipAdicionalCada * Math.min(parcelasPagas, antecipParcelas);

  // Lances
  const lanceOfertadoValor = C * lanceOfertPct;
  const lanceEmbutidoValor = C * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  // SALDO DEVEDOR FINAL (valorCategoria - pagos - lance ofertado)
  const saldoDevedorFinal = Math.max(
    0,
    valorCategoria - totalPagoSemSeguro - lanceOfertadoValor
  );

  // NOVA PARCELA (sem limite) = saldo final / prazo restante (SEM seguro)
  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;

  // LIMITADOR (sobre valor de categoria)
  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C);
  const parcelaLimitante = limitadorBase > 0 ? valorCategoria * limitadorBase : 0;

  // Regras especiais: Serviços OU Moto < 20k => mantém parcela, recalcula apenas prazo
  const manterParcela = isServico || (isMoto && C < 20000);

  let aplicouLimitador = false;
  let parcelaEscolhida = baseMensalSemSeguro; // sempre sem seguro

  if (!manterParcela) {
    // regra padrão: se limitador for maior que a nova parcela, aplica limitador
    if (limitadorBase > 0 && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    } else {
      // sem limitador: usa a própria novaParcelaSemLimite (mantém prazo)
      parcelaEscolhida = novaParcelaSemLimite;
    }
  }

  // Caso especial: antecipação em 2x e contemplação na 1ª parcela
  const has2aAntecipDepois = antecipParcelas >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois
    ? parcelaEscolhida + antecipAdicionalCada /* (sem seguro no saldo) */
    : null;

  // NOVO PRAZO
  const parcelasIguais =
    Math.abs(parcelaEscolhida - novaParcelaSemLimite) < 0.005;

  let novoPrazo: number;
  if (parcelasIguais && !has2aAntecipDepois) {
    novoPrazo = prazoRestante;
  } else {
    let saldoParaPrazo = saldoDevedorFinal;
    if (has2aAntecipDepois) {
      saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipAdicionalCada));
    }
    novoPrazo = Math.max(1, Math.ceil(saldoParaPrazo / parcelaEscolhida));
  }

  return {
    valorCategoria,
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,
    novaParcelaSemLimite, // (SEM seguro)
    parcelaLimitante,     // (SEM seguro)
    parcelaEscolhida,     // (SEM seguro)
    saldoDevedorFinal,
    novoPrazo,
    TA_efetiva,
    fundoComumFactor,
    antecipAdicionalCada,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
    aplicouLimitador,
  };
}

/* ========== Inputs com máscara (Money / Percent) ========== */
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

function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  ...rest
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const display = formatPctInputFromDecimal(valueDecimal || 0);
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          let d = parsePctInputToDecimal(e.target.value);
          if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
          onChangeDecimal(d);
        }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ========================= Página ======================== */
export default function Simuladores() {
  const { adminKey, id } = useParams<{ adminKey?: string; id?: string }>();
  const [searchParams] = useSearchParams(); // ?setup=1
  const openSetup = searchParams.get("setup") === "1";
  const routeKey = adminKey ?? id ?? null; // slug ou id
  
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null);
  const [prefs, setPrefs] = useState<any | null>(null); // sim_admin_calc_prefs
  const [activeTab, setActiveTab] = useState<"simular" | "configurar">("simular");
  const [mgrOpen, setMgrOpen] = useState(false);

  useEffect(() => {
    setActiveAdminId(routeKey as string | null);
  }, [routeKey]);

  // carrega admin por id OU slug e decide a aba inicial
  useEffect(() => {
    let mounted = true;

    async function fetchAdminAndPrefs() {
      if (!routeKey) {
        setAdmin(null);
        setPrefs(null);
        return;
      }

      setLoadingAdmin(true);

      // tenta por id
      let { data: byId } = await supabase
        .from("sim_admins")
        .select("id,name")
        .eq("id", routeKey)
        .maybeSingle();

      // se não achou por id, tenta por slug
      if (!byId) {
        const { data: bySlug } = await supabase
          .from("sim_admins")
          .select("id,name")
          .eq("slug", routeKey)
          .maybeSingle();
        byId = bySlug || null;
      }

      if (!mounted) return;
      setAdmin(byId);

      if (byId?.id) {
        const { data: prefsRow } = await supabase
          .from("sim_admin_calc_prefs")
          .select("*")
          .eq("admin_id", byId.id)
          .maybeSingle();

        if (!mounted) return;
        setActiveAdminId(byId.id);
        setPrefs(prefsRow || null);

        // decide aba inicial
        const shouldOpenSetup = openSetup || !prefsRow;
        setActiveTab(shouldOpenSetup ? "configurar" : "simular");
      }

      if (!mounted) return;
      setLoadingAdmin(false);
    }

    fetchAdminAndPrefs();
    return () => { mounted = false; };
  }, [routeKey, openSetup]);

  useEffect(() => {
    if (!routeKey && !activeAdminId && admins.length) {
      setActiveAdminId(admins[0].id);
    }
  }, [routeKey, activeAdminId, admins]);

  // seleção Embracon
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

  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0);
  const [parcContemplacao, setParcContemplacao] = useState<number>(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // telefone do usuário logado (para o Resumo / Proposta)
  const [userPhone, setUserPhone] = useState<string>("");

  // Texto livre para “Assembleia”
  const [assembleia, setAssembleia] = useState<string>("15/10");

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
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));

      // 1) padrão: Embracon > ou o primeiro da lista
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      let nextActiveId = embr?.id ?? (a?.[0]?.id ?? null);

      // 2) se a URL tiver um adminId/slug válido, priorize ele
      if (routeKey && (a ?? []).some((ad: any) => ad.id === routeKey)) {
        nextActiveId = routeKey as string;
      }
      setActiveAdminId(nextActiveId);

      // 3) terminou o loading
      setLoading(false);

      // 4) se a URL tiver ?setup=1, abre o modal de tabelas
      if (openSetup) {
        setTimeout(() => setMgrOpen(true), 0);
      }
    })();
  }, []); // carregamento inicial

  // pega telefone do usuário logado
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserPhone((data?.phone || "").toString());
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

  // nomes de tabela distintos por segmento
  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  // variantes (linhas) do nome escolhido (prazo e taxas diferentes)
  const variantesDaTabela = useMemo(() => {
    return adminTables.filter(
      (t) => t.segmento === segmento && t.nome_tabela === nomeTabela
    );
  }, [adminTables, segmento, nomeTabela]);

  const tabelaSelecionada = useMemo(
    () => tables.find((t) => t.id === tabelaId) || null,
    [tables, tabelaId]
  );

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({
      min: tabelaSelecionada.faixa_min,
      max: tabelaSelecionada.faixa_max,
    });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25)
      setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50)
      setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // valida % embutido
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid)
      setLanceEmbutPct(lanceEmbutPctValid);
  }, [lanceEmbutPct]); // eslint-disable-line

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

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: (tabelaSelecionada.antecip_parcelas as 0 | 1 | 2) ?? 0,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
      lanceOfertPct,
      lanceEmbutPct: lanceEmbutPctValid,
      parcContemplacao,
    };
    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPctValid,
    parcContemplacao,
  ]); // eslint-disable-line

  async function salvarSimulacao() {
    if (!tabelaSelecionada || !calc) return;
    setSalvando(true);

    const payload = {
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
      lance_embutido_pct: lanceEmbutPctValid,
      parcela_contemplacao: parcContemplacao,
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
    };

    const { data, error } = await supabase
      .from("sim_simulations")
      .insert(payload)
      .select("code")
      .single();
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

  // ===== Resumo da Proposta (texto copiável) =====
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
        ? ` (2ª parcela com antecipação: ${brMoney(
            calc.segundaParcelaComAntecipacao
          )})`
        : "";

    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    return (
`🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

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
${wa}`
    );
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  // ===== Novo: Texto “OPORTUNIDADE / PROPOSTA EMBRACON” =====
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

    return (
`🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

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
✅ Alta taxa de contemplação`
    );
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone]);

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

  /* ==== GUARDS DE RENDER ==== */
  if (!routeKey) {
    return (
      <Card>
        <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
        <CardContent>Escolha uma administradora no menu para configurar ou simular.</CardContent>
      </Card>
    );
  }

  if (loadingAdmin) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando administradora…
      </div>
    );
  }

  if (!admin) {
    return <div className="text-destructive">Administradora não encontrada.</div>;
  }

  /* ==== RETURN PRINCIPAL ==== */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{admin.name}</h1>
        <div className="space-x-2">
          <Button
            variant="secondary"
            onClick={() => setMgrOpen(true)}
            title="Abrir gerenciador de tabelas desta administradora"
          >
            Gerenciar Tabelas
          </Button>
          <Button
            variant={activeTab === "configurar" ? "default" : "outline"}
            onClick={() => setActiveTab("configurar")}
          >
            Configurar
          </Button>
          <Button
            variant={activeTab === "simular" ? "default" : "outline"}
            onClick={() => setActiveTab("simular")}
          >
            Simular
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="configurar">Configurar</TabsTrigger>
          <TabsTrigger value="simular">Simular</TabsTrigger>
        </TabsList>

        <TabsContent value="configurar">
          <AdminCalcSetup
            adminId={admin.id}
            initialPrefs={prefs}
            onSaved={(p) => { setPrefs(p); setActiveTab("simular"); }}
          />
        </TabsContent>

        <TabsContent value="simular">
          {!prefs ? (
            <Card>
              <CardHeader><CardTitle>Configuração pendente</CardTitle></CardHeader>
              <CardContent>
                Para simular {admin.name}, você precisa <b>configurar</b> primeiro.
                <div className="mt-3">
                  <Button onClick={() => setActiveTab("configurar")}>Abrir Configuração</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* layout em duas colunas */}
              <div className="grid grid-cols-12 gap-4">
                {/* coluna esquerda: simulador */}
                <div className="col-span-12 lg:col-span-8">
                  <Card>
                    <CardHeader>
                      <CardTitle>Simuladores</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {admin.name === "Embracon" ? (
                        <EmbraconSimulator
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
                          setPrazoVenda={setPrazoVenda}
                          forma={forma}
                          setForma={setForma}
                          seguroPrest={seguroPrest}
                          setSeguroPrest={setSeguroPrest}
                          lanceOfertPct={lanceOfertPct}
                          setLanceOfertPct={setLanceOfertPct}
                          lanceEmbutPct={lanceEmbutPct}
                          setLanceEmbutPct={setLanceEmbutPct}
                          parcContemplacao={parcContemplacao}
                          setParcContemplacao={setParcContemplacao}
                          prazoAviso={prazoAviso}
                          calc={calc}
                          salvar={salvarSimulacao}
                          salvando={salvando}
                          simCode={simCode}
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Em breve: simulador para <strong>{admin.name}</strong>.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Ações principais */}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
                      {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Salvar Simulação
                    </Button>
                    {simCode && (
                      <span className="text-sm">
                        ✅ Salvo como <strong>Simulação #{simCode}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* coluna direita: memória + textos */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Memória de Cálculo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {!tabelaSelecionada ? (
                        <div className="text-muted-foreground">
                          Selecione uma tabela para ver os detalhes.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>Crédito</div>
                            <div className="text-right font-medium">
                              {brMoney(credito || 0)}
                            </div>
                            <div>Prazo da Venda</div>
                            <div className="text-right">{prazoVenda || "-"}</div>
                            <div>Forma</div>
                            <div className="text-right">{forma}</div>
                            <div>Seguro / parcela</div>
                            <div className="text-right">
                              {seguroPrest
                                ? pctHuman(tabelaSelecionada.seguro_prest_pct)
                                : "—"}
                            </div>
                          </div>
                          <hr className="my-2" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>Fundo Comum (fator)</div>
                            <div className="text-right">
                              {calc
                                ? (calc.fundoComumFactor * 100).toFixed(0) + "%"
                                : "—"}
                            </div>
                            <div>Taxa Adm (total)</div>
                            <div className="text-right">
                              {pctHuman(tabelaSelecionada.taxa_adm_pct)}
                            </div>
                            <div>TA efetiva</div>
                            <div className="text-right">
                              {calc ? pctHuman(calc.TA_efetiva) : "—"}
                            </div>
                            <div>Fundo Reserva</div>
                            <div className="text-right">
                              {pctHuman(tabelaSelecionada.fundo_reserva_pct)}
                            </div>
                            <div>Antecipação Adm</div>
                            <div className="text-right">
                              {pctHuman(tabelaSelecionada.antecip_pct)} •{" "}
                              {tabelaSelecionada.antecip_parcelas}x
                            </div>
                            <div>Limitador Parcela</div>
                            <div className="text-right">
                              {pctHuman(
                                resolveLimitadorPct(
                                  tabelaSelecionada.limitador_parcela_pct,
                                  tabelaSelecionada.segmento,
                                  credito || 0
                                )
                              )}
                            </div>
                            <div>Valor de Categoria</div>
                            <div className="text-right">
                              {calc ? brMoney(calc.valorCategoria) : "—"}
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Resumo antigo */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Resumo da Proposta</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <textarea
                        className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed"
                        style={{ lineHeight: "1.6" }}
                        readOnly
                        value={resumoTexto}
                        placeholder="Preencha os campos da simulação para gerar o resumo."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button onClick={copiarResumo} disabled={!resumoTexto}>
                          Copiar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* NOVO: OPORTUNIDADE / PROPOSTA EMBRACON */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Texto: Oportunidade / Proposta Embracon</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Label>Assembleia (ex.: 15/10)</Label>
                          <Input
                            value={assembleia}
                            onChange={(e) => setAssembleia(e.target.value)}
                            placeholder="dd/mm"
                          />
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
                        <Button onClick={copiarProposta} disabled={!propostaTexto}>
                          Copiar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Overlay de gerenciamento de tabelas */}
      {mgrOpen && admin && (
        <TableManagerModal
          admin={admin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onCreatedOrUpdated={handleTableCreatedOrUpdated}
          onDeleted={handleTableDeleted}
        />
      )}
    </div>
  );
} // fecha o componente Simuladores

/* =============== Modal: base com ESC para fechar =============== */
function ModalBase({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
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
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Modal: Gerenciar Tabelas (com paginação) ============== */
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

  // reset página quando muda a lista
  useEffect(() => setPage(1), [allTables.length]);

  const grouped = useMemo(() => {
    return [...allTables].sort((a, b) => {
      const sa = (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase();
      const sb = (b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase();
      return sa.localeCompare(sb);
    });
  }, [allTables]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(
    () => grouped.slice((page - 1) * pageSize, page * pageSize),
    [grouped, page]
  );

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (As simulações vinculadas a ela também serão excluídas)")) return;
    setBusyId(id);

    // 1) Exclui simulações dependentes (evita erro de FK)
    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) {
      setBusyId(null);
      alert("Erro ao excluir simulações vinculadas: " + delSims.error.message);
      return;
    }

    // 2) Exclui a tabela
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
                <th className="text-left p-2">% Limite</th>
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
                        {busyId === t.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Sem tabelas para esta administradora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div className="flex items-center justify-between mt-3 text-sm">
          <div>
            {grouped.length > 0 && (
              <>
                Mostrando{" "}
                <strong>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, grouped.length)}
                </strong>{" "}
                de <strong>{grouped.length}</strong>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={() => setShowForm(false)}
          onSaved={(t) => {
            onCreatedOrUpdated(t);
            setShowForm(false);
          }}
        />
      )}
    </ModalBase>
  );
}

/* ===== Overlay de Formulário (Novo / Editar) de Tabela ==== */
function TableFormOverlay({
  adminId,
  initial,
  onSaved,
  onClose,
}: {
  adminId: string;
  initial?: SimTable;
  onSaved: (t: SimTable) => void;
  onClose: () => void;
}) {
  const [segmento, setSegmento] = useState(initial?.segmento || "Imóvel Estendido");
  const [nome, setNome] = useState(initial?.nome_tabela || "Select Estendido");
  const [faixaMin, setFaixaMin] = useState<number>(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState<number>(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState<number>(initial?.prazo_limite ?? 240);

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(formatPctInputFromDecimal(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(formatPctInputFromDecimal(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(formatPctInputFromDecimal(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState<number>(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(formatPctInputFromDecimal(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(formatPctInputFromDecimal(initial?.seguro_prest_pct ?? 0.00061));

  const [perEmbutido, setPerEmbutido] = useState<boolean>(initial?.permite_lance_embutido ?? true);
  const [perFixo25, setPerFixo25] = useState<boolean>(initial?.permite_lance_fixo_25 ?? true);
  const [perFixo50, setPerFixo50] = useState<boolean>(initial?.permite_lance_fixo_50 ?? true);
  const [perLivre, setPerLivre] = useState<boolean>(initial?.permite_lance_livre ?? true);

  const [cParcelaCheia, setCParcelaCheia] = useState<boolean>(initial?.contrata_parcela_cheia ?? true);
  const [cRed25, setCRed25] = useState<boolean>(initial?.contrata_reduzida_25 ?? true);
  const [cRed50, setCRed50] = useState<boolean>(initial?.contrata_reduzida_50 ?? true);
  const [indices, setIndices] = useState<string>((initial?.indice_correcao || ["IPCA"]).join(", "));

  const [saving, setSaving] = useState(false);

  // ESC para fechar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function salvar() {
    setSaving(true);
    const payload: Omit<SimTable, "id"> = {
      admin_id: adminId,
      segmento,
      nome_tabela: nome,
      faixa_min: Number(faixaMin) || 0,
      faixa_max: Number(faixaMax) || 0,
      prazo_limite: Number(prazoLimite) || 0,
      taxa_adm_pct: parsePctInputToDecimal(taxaAdmHuman),
      fundo_reserva_pct: parsePctInputToDecimal(frHuman),
      antecip_pct: parsePctInputToDecimal(antecipHuman),
      antecip_parcelas: Number(antecipParcelas) || 0,
      limitador_parcela_pct: parsePctInputToDecimal(limHuman),
      seguro_prest_pct: parsePctInputToDecimal(seguroHuman),
      permite_lance_embutido: perEmbutido,
      permite_lance_fixo_25: perFixo25,
      permite_lance_fixo_50: perFixo50,
      // ⬇️ mantenha só este (é o que existe na sua tabela/tipo)
      permite_lance_livre: perLivre,
      contrata_parcela_cheia: cParcelaCheia,
      contrata_reduzida_25: cRed25,
      contrata_reduzida_50: cRed50,
      indice_correcao: indices.split(",").map((s) => s.trim()).filter(Boolean),
    };

    let res;
    if (initial) {
      res = await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single();
    } else {
      res = await supabase.from("sim_tables").insert(payload).select("*").single();
    }
    setSaving(false);
    if ((res as any).error) { alert("Erro ao salvar tabela: " + (res as any).error.message); return; }
    onSaved((res as any).data as SimTable);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{initial ? "Editar Tabela" : "Nova Tabela"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 grid gap-3 md:grid-cols-4">
          <div><Label>Segmento</Label><Input value={segmento} onChange={(e) => setSegmento(e.target.value)} /></div>
          <div><Label>Nome da Tabela</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Faixa (mín)</Label><Input type="number" value={faixaMin} onChange={(e) => setFaixaMin(Number(e.target.value))} /></div>
          <div><Label>Faixa (máx)</Label><Input type="number" value={faixaMax} onChange={(e) => setFaixaMax(Number(e.target.value))} /></div>
          <div><Label>Prazo Limite (meses)</Label><Input type="number" value={prazoLimite} onChange={(e) => setPrazoLimite(Number(e.target.value))} /></div>

          <div><Label>% Taxa Adm</Label><Input value={taxaAdmHuman} onChange={(e) => setTaxaAdmHuman(e.target.value)} /></div>
          <div><Label>% Fundo Reserva</Label><Input value={frHuman} onChange={(e) => setFrHuman(e.target.value)} /></div>
          <div><Label>% Antecipação da Adm</Label><Input value={antecipHuman} onChange={(e) => setAntecipHuman(e.target.value)} /></div>
          <div><Label>Parcelas da Antecipação</Label><Input type="number" value={antecipParcelas} onChange={(e) => setAntecipParcelas(Number(e.target.value))} /></div>

          <div><Label>% Limitador Parcela</Label><Input value={limHuman} onChange={(e) => setLimHuman(e.target.value)} /></div>
          <div><Label>% Seguro por parcela</Label><Input value={seguroHuman} onChange={(e) => setSeguroHuman(e.target.value)} /></div>

          <div className="col-span-2">
            <Label>Lances Permitidos</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={perEmbutido} onChange={(e) => setPerEmbutido(e.target.checked)} />Embutido</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo25} onChange={(e) => setPerFixo25(e.target.checked)} />Fixo 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo50} onChange={(e) => setPerFixo50(e.target.checked)} />Fixo 50%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perLivre} onChange={(e) => setPerLivre(e.target.checked)} />Livre</label>
            </div>
          </div>

          <div className="col-span-2">
            <Label>Formas de Contratação</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cParcelaCheia} onChange={(e) => setCParcelaCheia(e.target.checked)} />Parcela Cheia</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed25} onChange={(e) => setCRed25(e.target.checked)} />Reduzida 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed50} onChange={(e) => setCRed50(e.target.checked)} />Reduzida 50%</label>
            </div>
          </div>

          <div className="md:col-span-4">
            <Label>Índice de Correção (separar por vírgula)</Label>
            <Input value={indices} onChange={(e) => setIndices(e.target.value)} placeholder="IPCA, INCC, IGP-M" />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <Button onClick={salvar} disabled={saving} className="h-10 rounded-2xl px-4">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {initial ? "Salvar alterações" : "Salvar Tabela"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving} className="h-10 rounded-2xl px-4">
              Cancelar
            </Button>
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
};

function EmbraconSimulator(p: EmbraconProps) {
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");

  const filteredLeads = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const qRaw = leadQuery.trim();
    const q = norm(qRaw);
    const qDigits = qRaw.replace(/\D/g, ""); // busca por telefone

    return p.leads.filter((l) => {
      const nome = norm(l.nome || "");
      const tel = (l.telefone || "").replace(/\D/g, "");
      return nome.includes(q) || (!!qDigits && tel.includes(qDigits));
    });
  }, [p.leads, leadQuery]);

  useEffect(() => {
    if (!leadOpen) setLeadQuery("");
  }, [leadOpen]);

  return (
    <div className="space-y-6">
      {/* Lead */}
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <Popover onOpenChange={setLeadOpen}>
                <PopoverButton className="w-full justify-between h-10">
                  {p.leadInfo?.nome || "Escolher lead"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </PopoverButton>

                <PopoverContent className="min-w-[260px] p-2 z-50">
                  {/* Busca */}
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 opacity-60" />
                    <Input
                      placeholder="Buscar lead por nome ou telefone..."
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      className="h-8"
                    />
                  </div>

                  {/* Lista */}
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filteredLeads.length > 0 ? (
                      filteredLeads.map((l) => (
                        <PopoverClose asChild key={l.id}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-muted"
                            onClick={() => {
                              p.setLeadId(l.id);
                              setLeadQuery(""); // limpa a busca
                            }}
                          >
                            <div className="text-sm font-medium">{l.nome}</div>
                            {l.telefone && (
                              <div className="text-xs text-muted-foreground">{l.telefone}</div>
                            )}
                          </button>
                        </PopoverClose>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground px-2 py-6 text-center">
                        Nenhum lead encontrado
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {p.leadInfo && (
                <p className="text-xs text-muted-foreground mt-1">
                  {p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}
                </p>
              )}
            </div>

            <div>
              <Label>Nº do Grupo (opcional)</Label>
              <Input
                value={p.grupo}
                onChange={(e) => p.setGrupo(e.target.value)}
                placeholder="ex.: 9957"
              />
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
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.segmento}
                  onChange={(e) => p.setSegmento(e.target.value)}
                >
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <Label>Tabela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.nomeTabela}
                  disabled={!p.segmento}
                  onChange={(e) => p.setNomeTabela(e.target.value)}
                >
                  <option value="">
                    {p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}
                  </option>
                  {p.nomesTabelaSegmento.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Prazo Até</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.tabelaId}
                  disabled={!p.nomeTabela}
                  onChange={(e) => p.setTabelaId(e.target.value)}
                >
                  <option value="">
                    {p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}
                  </option>
                  {p.variantesDaTabela.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR{" "}
                      {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input
                  value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>

          {/* Venda */}
          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Valor do Crédito</Label>
                <MoneyInput value={p.credito || 0} onChange={p.setCredito} />
              </div>

              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input
                  type="number"
                  value={p.prazoVenda || ""}
                  onChange={(e) => p.setPrazoVenda(Number(e.target.value))}
                />
                {p.prazoAviso && (
                  <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>
                )}
              </div>

              <div>
                <Label>Forma de Contratação</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.forma}
                  disabled={!p.tabelaSelecionada}
                  onChange={(e) => p.setForma(e.target.value as FormaContratacao)}
                >
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && (
                    <option value="Parcela Cheia">Parcela Cheia</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && (
                    <option value="Reduzida 25%">Reduzida 25%</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && (
                    <option value="Reduzida 50%">Reduzida 50%</option>
                  )}
                </select>
              </div>

              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className={
                      p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    className={
                      !p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(false)}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>
                    % Taxa de Adm:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong>
                  </div>
                  <div>
                    % Fundo Reserva:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong>
                  </div>
                  <div>
                    % Antecipação:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> •
                    Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong>
                  </div>
                  <div>
                    Limitador de Parcela:{" "}
                    <strong>
                      {pctHuman(
                        resolveLimitadorPct(
                          p.tabelaSelecionada.limitador_parcela_pct,
                          p.tabelaSelecionada.segmento,
                          p.credito || 0
                        )
                      )}
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento até a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>
                  {p.tabelaSelecionada?.antecip_parcelas === 2
                    ? "Parcelas 1 e 2"
                    : p.tabelaSelecionada?.antecip_parcelas === 1
                    ? "Parcela 1"
                    : "Parcela Inicial"}
                </Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* === Configurações do Lance (RESTAURADO) === */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Lance</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado (%)</Label>
                <PercentInput
                  valueDecimal={p.lanceOfertPct}
                  onChangeDecimal={p.setLanceOfertPct}
                />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <PercentInput
                  valueDecimal={p.lanceEmbutPct}
                  onChangeDecimal={(d) => {
                    if (d > 0.25) {
                      alert("Lance embutido limitado a 25,0000% do crédito. Voltando para 25%.");
                      p.setLanceEmbutPct(0.25);
                    } else {
                      p.setLanceEmbutPct(d);
                    }
                  }}
                  maxDecimal={0.25}
                />
              </div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input
                  type="number"
                  value={p.parcContemplacao}
                  onChange={(e) =>
                    p.setParcContemplacao(Math.max(1, Number(e.target.value)))
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deve ser menor que o Prazo da Venda.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pós */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento após a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Lance Embutido</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Lance Próprio</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""}
                  readOnly
                />
              </div>

              <div>
                <Label>Lance Percebido (%)</Label>
                <Input
                  value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Novo Crédito</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.novoCredito) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Nova Parcela (sem limite)</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""}
                  readOnly
                />
              </div>

              <div>
                <Label>Parcela Limitante</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Parcela Escolhida</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Novo Prazo (meses)</Label>
                <Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly />
              </div>

              {p.calc?.has2aAntecipDepois && p.calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3">
                  <Label>2ª parcela (com antecipação)</Label>
                  <Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Selecione um lead para abrir o simulador.
        </div>
      )}
    </div>
  );
}

function AdminCalcSetup({
  adminId,
  initialPrefs,
  onSaved,
}: {
  adminId: string;
  initialPrefs: any | null;
  onSaved: (prefs: any) => void;
}) {
  const [saving, setSaving] = useState(false);

  // estados com defaults
  const [formas_definicao, setFormasDefinicao] = useState<string>(initialPrefs?.formas_definicao ?? "adm");
  const [adm_cheia, setAdmCheia] = useState<boolean>(initialPrefs?.adm_permite_parcela_cheia ?? true);
  const [adm_r25, setAdmR25] = useState<boolean>(initialPrefs?.adm_permite_reduzida_25 ?? false);
  const [adm_r50, setAdmR50] = useState<boolean>(initialPrefs?.adm_permite_reduzida_50 ?? false);

  const [redutor_modo, setRedutorModo] = useState<string>(initialPrefs?.redutor_modo ?? "sobre_credito");
  const [redutor_override, setRedutorOverride] = useState<boolean>(initialPrefs?.redutor_permite_override_tabela ?? true);

  const [embutido_max_modo, setEmbutidoMaxModo] = useState<string>(initialPrefs?.embutido_max_modo ?? "tabela");
  const [embutido_max_pct, setEmbutidoMaxPct] = useState<number | "">(initialPrefs?.embutido_max_pct ?? "");
  const [base_embutido, setBaseEmbutido] = useState<string>(initialPrefs?.base_embutido ?? "credito");
  const [base_embutido_override, setBaseEmbutidoOverride] = useState<boolean>(initialPrefs?.base_embutido_permite_override_tabela ?? true);

  const [base_pct_lance_ofertado, setBasePctLanceOfertado] = useState<string>(initialPrefs?.base_pct_lance_ofertado ?? "credito");
  const [base_pct_lance_override, setBasePctLanceOverride] = useState<boolean>(initialPrefs?.base_pct_lance_ofertado_permite_override_tabela ?? true);

  const [limitador_ativo, setLimitadorAtivo] = useState<boolean>(initialPrefs?.limitador_pos_contemplacao_ativo ?? false);
  const [limitador_def, setLimitadorDef] = useState<string>(initialPrefs?.limitador_definicao ?? "tabela");
  const [limitador_pct, setLimitadorPct] = useState<number | "">(initialPrefs?.limitador_pct ?? "");
  const [limitador_base, setLimitadorBase] = useState<string>(initialPrefs?.limitador_base ?? "credito");

  async function handleSave() {
    setSaving(true);
    const payload = {
      admin_id: adminId,
      formas_definicao,
      adm_permite_parcela_cheia: adm_cheia,
      adm_permite_reduzida_25: adm_r25,
      adm_permite_reduzida_50: adm_r50,
      redutor_modo,
      redutor_permite_override_tabela: redutor_override,
      antecipacao_adm_modo: "tabela",
      embutido_max_modo,
      embutido_max_pct: embutido_max_pct === "" ? null : Number(embutido_max_pct),
      base_embutido,
      base_embutido_permite_override_tabela: base_embutido_override,
      base_pct_lance_ofertado,
      base_pct_lance_ofertado_permite_override_tabela: base_pct_lance_override,
      limitador_pos_contemplacao_ativo: limitador_ativo,
      limitador_definicao: limitador_def,
      limitador_pct: limitador_pct === "" ? null : Number(limitador_pct),
      limitador_base,
    };

    // upsert
    const { data, error } = await supabase
      .from("sim_admin_calc_prefs")
      .upsert(payload, { onConflict: "admin_id" })
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      console.error(error);
      return;
    }
    onSaved(data);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Comportamentos do Cálculo (Padrão da Adm)</CardTitle></CardHeader>
      <CardContent className="space-y-6">

        {/* Formas de Contratação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Formas de Contratação</Label>
            <select className="w-full border rounded p-2" value={formas_definicao} onChange={e => setFormasDefinicao(e.target.value)}>
              <option value="adm">Padrão Adm</option>
              <option value="tabela">Definido por Tabela/Segmento</option>
            </select>
          </div>
          {formas_definicao === "adm" && (
            <div className="md:col-span-2 grid grid-cols-3 gap-3 items-end">
              <label className="flex items-center gap-2"><input type="checkbox" checked={adm_cheia} onChange={e=>setAdmCheia(e.target.checked)}/>Cheia</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={adm_r25} onChange={e=>setAdmR25(e.target.checked)}/>Reduzida 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={adm_r50} onChange={e=>setAdmR50(e.target.checked)}/>Reduzida 50%</label>
            </div>
          )}
        </div>

        {/* Redutor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Cálculo do Redutor</Label>
            <select className="w-full border rounded p-2" value={redutor_modo} onChange={e=>setRedutorModo(e.target.value as any)}>
              <option value="sobre_credito">Sobre o Crédito</option>
              <option value="valor_categoria">Crédito + Taxas (Valor de Categoria)</option>
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={redutor_override} onChange={e=>setRedutorOverride(e.target.checked)}/>
              Permitir override por Tabela
            </label>
          </div>
        </div>

        {/* Embutido */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Embutido Máx</Label>
            <select className="w-full border rounded p-2" value={embutido_max_modo} onChange={e=>setEmbutidoMaxModo(e.target.value as any)}>
              <option value="adm">Padrão Adm</option>
              <option value="tabela">Definido por Tabela</option>
            </select>
          </div>
          {embutido_max_modo === "adm" && (
            <div>
              <Label>Percentual (humanizado)</Label>
              <Input type="number" step="0.1" value={embutido_max_pct} onChange={e=>setEmbutidoMaxPct(e.target.value === "" ? "" : Number(e.target.value))} placeholder="ex.: 25" />
            </div>
          )}
          <div>
            <Label>Base do Embutido</Label>
            <select className="w-full border rounded p-2" value={base_embutido} onChange={e=>setBaseEmbutido(e.target.value as any)}>
              <option value="credito">Crédito</option>
              <option value="valor_categoria">Valor de Categoria</option>
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={base_embutido_override} onChange={e=>setBaseEmbutidoOverride(e.target.checked)}/>
              Permitir override por Tabela
            </label>
          </div>
        </div>

        {/* Base % do lance ofertado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Base % do Lance Ofertado</Label>
            <select className="w-full border rounded p-2" value={base_pct_lance_ofertado} onChange={e=>setBasePctLanceOfertado(e.target.value as any)}>
              <option value="credito">Crédito</option>
              <option value="valor_categoria">Valor de Categoria</option>
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={base_pct_lance_override} onChange={e=>setBasePctLanceOverride(e.target.checked)}/>
              Permitir override por Tabela
            </label>
          </div>
        </div>

        {/* Pós-contemplação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Limitador pós-contemplação</Label>
            <select
              className="w-full border rounded p-2"
              value={limitador_ativo ? "sim" : "nao"}
              onChange={(e)=>setLimitadorAtivo(e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>

          {limitador_ativo && (
            <>
              <div>
                <Label>Quem define?</Label>
                <select className="w-full border rounded p-2" value={limitador_def} onChange={e=>setLimitadorDef(e.target.value as any)}>
                  <option value="tabela">Definido por Tabela</option>
                  <option value="adm">Padrão Adm</option>
                </select>
              </div>
              {limitador_def === "adm" && (
                <>
                  <div>
                    <Label>% (humanizado)</Label>
                    <Input type="number" step="0.1" value={limitador_pct} onChange={e=>setLimitadorPct(e.target.value === "" ? "" : Number(e.target.value))} placeholder="ex.: 2.8" />
                  </div>
                  <div>
                    <Label>Base</Label>
                    <select className="w-full border rounded p-2" value={limitador_base} onChange={e=>setLimitadorBase(e.target.value as any)}>
                      <option value="credito">Crédito</option>
                      <option value="valor_categoria">Valor de Categoria</option>
                      <option value="parcela_vigente">% sobre parcela vigente</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar configuração"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
