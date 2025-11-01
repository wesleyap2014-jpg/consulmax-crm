// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

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
  antecip_parcelas: number; // 0|1|2|... (CHECK ok)
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
  // NOVO — pode ser null (aí usa o limite da administradora):
  embutido_limit_pct?: number | null;
};

// Admin.rules esperado:
// {
//   modelo_lance: "percentual" | "parcela",
//   modelo_lance_base: "credito" | "parcela_termo",
//   embut_cap_adm_pct: number,          // ex.: 0.25
//   embut_base: "credito" | "parcela_termo",
//   limit_enabled: boolean,
//   redutor_pre_contemplacao_enabled: boolean,
//   redutor_base: "valor_categoria" | "credito"
// }

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

function parseBRL(s: string): number {
  const d = onlyDigits(s);
  return (d ? parseInt(d, 10) : 0) / 100;
}
function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ========== PercentInput (sem “pulo” do cursor) ========== */
function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  placeholder,
  className,
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState<string>(() => (valueDecimal * 100).toString().replace(".", ","));

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
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <Input
        className="text-right"
        value={raw}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/* ========== Money input (mantém estética) ========== */
function MoneyInput({
  value,
  onChange,
  className,
  ...rest
}: { value: number; onChange: (n: number) => void; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      className={`text-right ${className || ""}`}
      inputMode="numeric"
      value={fmtBRL(value || 0)}
      onChange={(e) => onChange(parseBRL(e.target.value))}
    />
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
  lanceOfertParcelas?: number;
  lanceEmbutParcelas?: number;
  lanceOfertPct?: number;
  lanceEmbutPct?: number;
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

  // Valor de categoria
  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  // Parcela termo (usada como base quando a regra é "parcela_termo")
  const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
  const parcelaTermo = valorCategoria / prazoTermo;

  // Fator da forma
  let fatorForma = 1;
  if (forma === "Reduzida 25%") fatorForma = 0.75;
  if (forma === "Reduzida 50%") fatorForma = 0.5;

  // Base pré-contemplação: se habilitado, pelo valor de categoria
  const baseMensalPre =
    redutorPreEnabled && redutorBase === "valor_categoria"
      ? (valorCategoria / prazo) * fatorForma
      : (C * fatorForma + C * Math.max(0, taxaAdmFull - antecipPct) + C * frPct) / prazo;

  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;

  // Antecipação
  const antParc = Math.max(0, Number(antecipParcelas) || 0);
  const antecipCada = antParc > 0 ? (C * antecipPct) / antParc : 0;

  const parcelaAte = baseMensalPre + (antParc > 0 ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalPre + seguroMensal;

  // Pago até a contemplação (sem seguro)
  const totalPagoSemSeguro = baseMensalPre * parcelasPagas + antecipCada * Math.min(parcelasPagas, antParc);

  // ===== Lances =====
  const embutLimitValorBase = embutCapBase === "parcela_termo" ? parcelaTermo * prazoTermo : C;
  const embutValorMaximo = (embutCapPct ?? 0.25) * embutLimitValorBase;

  let lanceOfertadoValor = 0;
  let lanceEmbutidoValor = 0;

  if (modeloLance === "parcela" && lanceBase === "parcela_termo") {
    const ofertValor = Math.max(0, parcelaTermo * Math.max(0, lanceOfertParcelas));
    const embutValor = Math.max(0, parcelaTermo * Math.max(0, lanceEmbutParcelas));
    lanceOfertadoValor = ofertValor;
    lanceEmbutidoValor = Math.min(embutValor, embutValorMaximo);
  } else {
    lanceOfertadoValor = C * Math.max(0, lanceOfertPct);
    const embutPctClamp = Math.min(Math.max(0, lanceEmbutPct), embutCapPct ?? 0.25);
    lanceEmbutidoValor = Math.min(C * embutPctClamp, embutValorMaximo);
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  const saldoDevedorFinal = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);

  // Pós
  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;
  const parcelaLimitante = limitEnabled ? valorCategoria * limitadorPct : 0;

  // Serviços: não reduz valor da parcela, apenas prazo
  const isServicos = (segmento || "").toLowerCase().includes("serv");

  let aplicouLimitador = false;
  let parcelaEscolhida = novaParcelaSemLimite;
  if (!isServicos) {
    if (limitEnabled && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    }
  } else {
    parcelaEscolhida = parcelaDemais;
  }

  // 2ª antecipação após 1ª
  const has2aAntecipDepois = antParc >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? parcelaEscolhida + antecipCada : null;

  // Novo prazo (Serviços mantém parcela e recalcula prazo)
  let saldoParaPrazo = saldoDevedorFinal;
  if (has2aAntecipDepois) saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipCada));
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

  // Lances (ambos modos)
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

  useEffect(() => setActiveAdminId(routeAdminId), [routeAdminId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name,rules").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id,nome,telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins((a ?? []) as Admin[]);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));

      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      const defaultId = routeAdminId && (a ?? []).some((ad: any) => ad.id === routeAdminId) ? routeAdminId : embr?.id ?? a?.[0]?.id ?? null;
      setActiveAdminId(defaultId);

      setLoading(false);
      if (setup) setTimeout(() => setMgrOpen(true), 0);
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
    const list = adminTables.filter((t) => (segmento ? t.segmento === segmento : true)).map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  const variantesDaTabela = useMemo(
    () => adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela),
    [adminTables, segmento, nomeTabela]
  );

  const tabelaSelecionada = useMemo(() => tables.find((t) => t.id === tabelaId) || null, [tables, tabelaId]);

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // Limite do embutido: Tabela > Admin
  const embutCapPct = (tabelaSelecionada?.embutido_limit_pct ?? adminRules?.embut_cap_adm_pct ?? 0.25) as number;
  useEffect(() => {
    if (lanceEmbutPct > embutCapPct) setLanceEmbutPct(embutCapPct);
  }, [lanceEmbutPct, embutCapPct]);

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  // Cálculo
  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    const modeloLance = (adminRules?.modelo_lance ?? "percentual") as "percentual" | "parcela";
    const lanceBase = (adminRules?.modelo_lance_base ??
      (modeloLance === "parcela" ? "parcela_termo" : "credito")) as "credito" | "parcela_termo";

    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: Number(tabelaSelecionada.antecip_parcelas || 0),
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,

      modeloLance,
      lanceBase,
      prazoOriginalGrupo: Number(prazoOriginalGrupo || prazoVenda),

      embutCapPct,
      embutCapBase: (adminRules?.embut_base ?? "credito") as "credito" | "parcela_termo",

      limitEnabled: adminRules?.limit_enabled !== false,
      redutorPreEnabled: adminRules?.redutor_pre_contemplacao_enabled === true,
      redutorBase: (adminRules?.redutor_base ?? "valor_categoria") as any,

      parcContemplacao,

      // lanças
      lanceOfertParcelas,
      lanceEmbutParcelas,
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

      // regras usadas no cálculo
      lance_modelo: adminRules?.modelo_lance ?? "percentual",
      lance_base: adminRules?.modelo_lance_base ?? (adminRules?.modelo_lance === "parcela" ? "parcela_termo" : "credito"),
      prazo_original_grupo: prazoOriginalGrupo || null,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: Math.min(lanceEmbutPct, embutCapPct),
      lance_ofertado_parcelas: lanceOfertParcelas,
      lance_embutido_parcelas: lanceEmbutParcelas,

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

  /* ===== Textos ===== */
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

    const telDigits = onlyDigits(userPhone);
    const wa = telDigits ? `https://wa.me/${telDigits}` : "";

    const p2 =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª parcela com antecipação: ${brMoney(calc.segundaParcelaComAntecipacao)})`
        : "";

    return `🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(credito)}
💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (Primeira parcela em até 3x no cartão)
💵 Demais parcelas até a contemplação: ${brMoney(calc.parcelaDemais)}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}
✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${brMoney(calc.parcelaEscolhida)}${p2}
⏳ Prazo restante: ${calc.novoPrazo} meses

👉 Quer simular com o valor do seu ${bem} dos sonhos?
Me chama aqui 👇
${wa}`;
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";
    return `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA ${activeAdmin?.name || ""}🔥

Crédito: ${brMoney(calc.novoCredito)}
Parcela 1: ${brMoney(calc.parcelaAte)} (Em até 3x no cartão)
+ ${calc.novoPrazo}x de ${brMoney(calc.parcelaEscolhida)}
Lance Próprio: ${brMoney(calc.lanceProprioValor)}

Assembleia ${assembleia}`;
  }, [calc, podeCalcular, activeAdmin?.name, assembleia]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <div>{activeAdmin && <Button size="sm" onClick={() => setMgrOpen(true)}>Gerenciar Tabelas</Button>}</div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Esquerda (form) */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* linha 1 */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6">
                  <Label>Selecionar lead</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                  >
                    <option value="">—</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label>Grupo (opcional)</Label>
                  <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="ex.: 9677" />
                </div>
              </div>

              {/* linha 2 */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Label>Segmento</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={segmento}
                    onChange={(e) => {
                      setSegmento(e.target.value);
                      setNomeTabela("");
                      setTabelaId("");
                    }}
                  >
                    <option value="">Automóvel / Imóvel / Serviços…</option>
                    {Array.from(new Set(adminTables.map((t) => t.segmento))).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Nome da Tabela</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={nomeTabela}
                    onChange={(e) => {
                      setNomeTabela(e.target.value);
                      setTabelaId("");
                    }}
                    disabled={!segmento}
                  >
                    <option value="">Selecione…</option>
                    {nomesTabelaSegmento.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Variantes</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={tabelaId}
                    onChange={(e) => setTabelaId(e.target.value)}
                    disabled={!nomeTabela}
                  >
                    <option value="">Selecione…</option>
                    {variantesDaTabela.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome_tabela} • {t.prazo_limite}m
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* linha 3 */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Label>Crédito</Label>
                  <MoneyInput value={credito} onChange={setCredito} />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Prazo da venda</Label>
                  <Input
                    inputMode="numeric"
                    value={prazoVenda || ""}
                    onChange={(e) => {
                      const n = Number(onlyDigits(e.target.value));
                      setPrazoVenda(n);
                      if (!prazoOriginalGrupo) setPrazoOriginalGrupo(n);
                    }}
                  />
                  {!!prazoAviso && <div className="text-xs text-amber-600 mt-1">{prazoAviso}</div>}
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Forma</Label>
                  <select className="w-full h-10 rounded-md border px-3" value={forma} onChange={(e) => setForma(e.target.value as any)}>
                    <option>Parcela Cheia</option>
                    <option disabled={!tabelaSelecionada?.contrata_reduzida_25}>Reduzida 25%</option>
                    <option disabled={!tabelaSelecionada?.contrata_reduzida_50}>Reduzida 50%</option>
                  </select>
                </div>
              </div>

              {/* linha 4 */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Label>Seguro Prestamista</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={seguroPrest ? "1" : "0"}
                    onChange={(e) => setSeguroPrest(e.target.value === "1")}
                  >
                    <option value="0">Sem seguro</option>
                    <option value="1">Com seguro</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Parcela de Contemplação (mês)</Label>
                  <select
                    className="w-full h-10 rounded-md border px-3"
                    value={parcContemplacao}
                    onChange={(e) => setParcContemplacao(Number(e.target.value))}
                  >
                    {Array.from({ length: Math.max(1, prazoVenda || 1) }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>% Lance ofertado</Label>
                  <PercentInput valueDecimal={lanceOfertPct} onChangeDecimal={setLanceOfertPct} maxDecimal={1} />
                </div>
              </div>

              {/* linha 5 */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Label>% Lance embutido</Label>
                  <PercentInput valueDecimal={lanceEmbutPct} onChangeDecimal={setLanceEmbutPct} maxDecimal={embutCapPct} />
                  <div className="text-xs text-muted-foreground mt-1">
                    Limite: {(embutCapPct * 100).toFixed(2)}% • Base: {(adminRules?.embut_base ?? "credito") === "parcela_termo" ? "Parcela (termo)" : "Crédito"}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label>Prazo original do grupo (para lance em parcelas)</Label>
                  <Input
                    inputMode="numeric"
                    value={prazoOriginalGrupo || ""}
                    onChange={(e) => setPrazoOriginalGrupo(Number(onlyDigits(e.target.value)))}
                  />
                </div>
                <div className="col-span-12 md:col-span-2">
                  <Label>Qtde parcelas (ofertado)</Label>
                  <Input
                    inputMode="numeric"
                    value={lanceOfertParcelas || ""}
                    onChange={(e) => setLanceOfertParcelas(Number(onlyDigits(e.target.value)))}
                  />
                </div>
                <div className="col-span-12 md:col-span-2">
                  <Label>Qtde parcelas (embutido)</Label>
                  <Input
                    inputMode="numeric"
                    value={lanceEmbutParcelas || ""}
                    onChange={(e) => setLanceEmbutParcelas(Number(onlyDigits(e.target.value)))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {simCode && <span className="text-sm">✅ Simulação #{simCode}</span>}
          </div>
        </div>

        {/* Direita (memória + textos) */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Cálculo</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div><div className="text-right">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div><div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div><div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div><div className="text-right">{seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}</div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Taxa Adm (total)</div><div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div><div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div><div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div><div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Valor de Categoria</div><div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                    <div>Parcela (termo)</div><div className="text-right">{calc ? brMoney(calc.parcelaTermo) : "—"}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="w-full h-64 border rounded-md p-3 text-sm" readOnly value={resumoTexto} />
              <div className="flex justify-end">
                <Button onClick={async () => navigator.clipboard.writeText(resumoTexto)} disabled={!resumoTexto}>
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Texto: Oportunidade / Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Label>Assembleia (ex.: 15/10)</Label>
              <Input value={assembleia} onChange={(e) => setAssembleia(e.target.value)} placeholder="dd/mm" />
              <textarea className="w-full h-60 border rounded-md p-3 text-sm" readOnly value={propostaTexto} />
              <div className="flex justify-end">
                <Button onClick={async () => navigator.clipboard.writeText(propostaTexto)} disabled={!propostaTexto}>
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Overlay de gerenciamento */}
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

/* =============== Modal Base =============== */
function ModalBase({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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

/* ============== Gerenciador de Tabelas ============== */
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

  const rows = useMemo(() => {
    return [...allTables].sort((a, b) => {
      const sa = (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase();
      const sb = (b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase();
      return sa.localeCompare(sb);
    });
  }, [allTables]);

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (Simulações vinculadas serão excluídas)")) return;
    setBusyId(id);
    // apaga simulações dependentes (evita travar por FK externas)
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
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Admin ativa: <strong>{admin.name}</strong></div>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
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
              {rows.map((t) => (
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
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === t.id}
                        onClick={() => deletar(t.id)}
                      >
                        {busyId === t.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-muted-foreground">
                    Sem tabelas para esta administradora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showForm && (
          <TableFormOverlay
            admin={admin}
            editing={editing}
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

/* ============== Form de Tabela (mesma estética) ============== */
function TableFormOverlay({
  admin,
  editing,
  onClose,
  onSaved,
}: {
  admin: Admin;
  editing: SimTable | null;
  onClose: () => void;
  onSaved: (t: SimTable) => void;
}) {
  const isEdit = !!editing;
  const [form, setForm] = useState<Partial<SimTable>>(() => {
    if (!editing) {
      return {
        admin_id: admin.id,
        segmento: "",
        nome_tabela: "",
        faixa_min: 0,
        faixa_max: 0,
        prazo_limite: 60,
        taxa_adm_pct: 0,
        fundo_reserva_pct: 0,
        antecip_pct: 0,
        antecip_parcelas: 0,
        limitador_parcela_pct: 0,
        seguro_prest_pct: 0,
        permite_lance_embutido: true,
        permite_lance_fixo_25: true,
        permite_lance_fixo_50: true,
        permite_lance_livre: true,
        contrata_parcela_cheia: true,
        contrata_reduzida_25: true,
        contrata_reduzida_50: true,
        indice_correcao: ["IPCA"],
        embutido_limit_pct: null,
      };
    }
    return { ...editing };
  });
  const [saving, setSaving] = useState(false);

  function setNum<K extends keyof SimTable>(field: K, v: number) {
    setForm((f) => ({ ...f, [field]: isNaN(v) ? 0 : v }));
  }

  async function save() {
    setSaving(true);
    const payload = { ...form } as any;

    if (!isEdit) {
      const { data, error } = await supabase.from("sim_tables").insert(payload).select("*").single();
      setSaving(false);
      if (error) return alert("Erro ao salvar: " + error.message);
      onSaved(data as SimTable);
      return;
    }

    const { data, error } = await supabase.from("sim_tables").update(payload).eq("id", editing!.id).select("*").single();
    setSaving(false);
    if (error) return alert("Erro ao atualizar: " + error.message);
    onSaved(data as SimTable);
  }

  return (
    <ModalBase onClose={onClose} title={isEdit ? "Editar Tabela" : "Nova Tabela"}>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <Label>Segmento</Label>
            <Input value={form.segmento || ""} onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value }))} />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Nome da Tabela</Label>
            <Input value={form.nome_tabela || ""} onChange={(e) => setForm((f) => ({ ...f, nome_tabela: e.target.value }))} />
          </div>

          <div className="col-span-6">
            <Label>Faixa (mín)</Label>
            <MoneyInput value={form.faixa_min || 0} onChange={(n) => setNum("faixa_min", n)} />
          </div>
          <div className="col-span-6">
            <Label>Faixa (máx)</Label>
            <MoneyInput value={form.faixa_max || 0} onChange={(n) => setNum("faixa_max", n)} />
          </div>

          <div className="col-span-4">
            <Label>Prazo Limite (meses)</Label>
            <Input
              inputMode="numeric"
              value={form.prazo_limite ?? ""}
              onChange={(e) => setNum("prazo_limite", Number(onlyDigits(e.target.value)))}
            />
          </div>
          <div className="col-span-4">
            <Label>% Taxa Adm</Label>
            <PercentInput valueDecimal={form.taxa_adm_pct || 0} onChangeDecimal={(d) => setNum("taxa_adm_pct", d)} />
          </div>
          <div className="col-span-4">
            <Label>% Fundo Reserva</Label>
            <PercentInput valueDecimal={form.fundo_reserva_pct || 0} onChangeDecimal={(d) => setNum("fundo_reserva_pct", d)} />
          </div>

          <div className="col-span-4">
            <Label>% Antecipação da Adm</Label>
            <PercentInput valueDecimal={form.antecip_pct || 0} onChangeDecimal={(d) => setNum("antecip_pct", d)} />
          </div>
          <div className="col-span-4">
            <Label>Parcelas da Antecipação</Label>
            <Input
              inputMode="numeric"
              value={form.antecip_parcelas ?? ""}
              onChange={(e) => setNum("antecip_parcelas", Number(onlyDigits(e.target.value)))}
            />
          </div>
          <div className="col-span-4">
            <Label>% Limitador Parcela</Label>
            <PercentInput valueDecimal={form.limitador_parcela_pct || 0} onChangeDecimal={(d) => setNum("limitador_parcela_pct", d)} />
          </div>

          <div className="col-span-4">
            <Label>% Seguro por parcela</Label>
            <PercentInput valueDecimal={form.seguro_prest_pct || 0} onChangeDecimal={(d) => setNum("seguro_prest_pct", d)} />
          </div>

          {/* NOVO campo — sem alterar layout da lista */}
          <div className="col-span-4">
            <Label>Limite Lance Embutido (%)</Label>
            <PercentInput
              valueDecimal={form.embutido_limit_pct ?? 0}
              onChangeDecimal={(d) => setForm((f) => ({ ...f, embutido_limit_pct: d }))}
              placeholder="ex.: 25,0000"
            />
            <div className="text-xs text-muted-foreground mt-1">
              Se vazio, usa o limite da administradora ({pctHuman(admin.rules?.embut_cap_adm_pct ?? 0.25)}).
            </div>
          </div>

          <div className="col-span-12">
            <Label>Índice de Correção (separar por vírgula)</Label>
            <Input
              value={(form.indice_correcao || []).join(", ")}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  indice_correcao: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                }))
              }
            />
          </div>

          <div className="col-span-12 grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.contrata_parcela_cheia}
                onChange={(e) => setForm((f) => ({ ...f, contrata_parcela_cheia: e.target.checked }))}
              />
              Parcela Cheia
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.contrata_reduzida_25}
                onChange={(e) => setForm((f) => ({ ...f, contrata_reduzida_25: e.target.checked }))}
              />
              Reduzida 25%
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.contrata_reduzida_50}
                onChange={(e) => setForm((f) => ({ ...f, contrata_reduzida_50: e.target.checked }))}
              />
              Reduzida 50%
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Salvar alterações" : "Salvar Tabela"}
          </Button>
        </div>
      </div>
    </ModalBase>
  );
}
