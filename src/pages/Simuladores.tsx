// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import { useParams, useLocation, useSearchParams } from "react-router-dom";
import { ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverButton, PopoverContent, PopoverClose } from "@/components/ui/popover";

/* ========================= Tipos ========================= */

// ====== Enums TS (alinhados com os enums do banco) ======
type FormsMode = "adm" | "table";
type RedutorMode = "credito" | "valor_categoria";
type BaseMode = "credito" | "valor_categoria" | "parcela_vigente";
type LimitMode = "adm" | "table";

// ====== Config padrão por Administradora (campos novos em sim_admins) ======
type AdminCalcConfig = {
  slug?: string | null;

  // Formas de contratação
  forms_mode?: FormsMode; // quem define as formas (adm|table)
  forms_adm_parcela_cheia?: boolean | null;
  forms_adm_red25?: boolean | null;
  forms_adm_red50?: boolean | null;

  // Redutor (parcela reduzida)
  reductor_mode?: RedutorMode; // padrão da Adm
  reductor_allow_table_override?: boolean | null;

  // Lance embutido (cap e bases)
  embut_cap_mode?: LimitMode; // quem define o teto do embutido (adm|table)
  embut_cap_adm_pct?: number | null; // decimal 0..1
  embut_base?: BaseMode; // base para embutido
  embut_base_allow_table_override?: boolean | null;

  // Lance ofertado (base %)
  ofert_base?: BaseMode;
  ofert_base_allow_table_override?: boolean | null;

  // Limitador pós-contemplação
  limit_enabled?: boolean | null;
  limit_mode?: LimitMode; // quem define (%)
  limit_adm_pct?: number | null; // decimal 0..1
  limit_adm_base?: BaseMode | null;
};

// Expande o tipo Admin (sem quebrar o existente)
type AdminFull = Admin & AdminCalcConfig;

// ====== Overrides por Tabela (campos novos em sim_tables) ======
type SimTableOverrides = {
  // Formas de contratação (quando forms_mode="table")
  forms_tbl_parcela_cheia?: boolean | null;
  forms_tbl_red25?: boolean | null;
  forms_tbl_red50?: boolean | null;

  // Redutor
  reductor_mode_override?: RedutorMode | null;

  // Lance embutido / ofertado
  embut_cap_override_pct?: number | null; // 0..1
  embut_base_override?: BaseMode | null;
  ofert_base_override?: BaseMode | null;

  // Limitador pós
  limit_pct_override?: number | null; // 0..1
  limit_base_override?: BaseMode | null;
};

// Anexa overrides ao SimTable existente (todos opcionais)
type SimTableWithOverrides = SimTable & SimTableOverrides;

/* ========== Resolver de Regras (Adm -> Tabela [-> Grupo futuramente]) ========== */

// Regras resolvidas e normalizadas para o motor de cálculo
type RuleSet = {
  // Formas de contratação efetivamente permitidas
  forms: {
    parcela_cheia: boolean;
    red25: boolean;
    red50: boolean;
  };

  // Redutor antes da contemplação
  redutorMode: RedutorMode; // "credito" | "valor_categoria"

  // Lance embutido
  embutCapPct: number; // 0..1
  embutBase: Exclude<BaseMode, "parcela_vigente">; // só "credito" | "valor_categoria"

  // Lance ofertado
  ofertBase: Exclude<BaseMode, "parcela_vigente">;

  // Limitador pós-contemplação
  limit: {
    enabled: boolean;
    pct?: number;         // 0..1
    base?: BaseMode;      // "credito" | "valor_categoria" | "parcela_vigente"
  };
};

function clamp01(n: number | null | undefined) {
  const x = typeof n === "number" ? n : 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * resolveRules: aplica precedência e devolve a configuração final para cálculo.
 * Por enquanto: Adm -> Tabela. (Grupo/Segmento podem ser encaixados depois.)
 */
function resolveRules(
  admin: AdminFull | null | undefined,
  table?: SimTableWithOverrides | null
  // , groupRule?: GroupOverrides | null   // futuramente
): RuleSet {
  // 1) Defaults seguros (espelham comportamento atual)
  let forms_parcela_cheia = true;
  let forms_red25 = true;
  let forms_red50 = true;

  let redutorMode: RedutorMode = "valor_categoria";

  let embutCapPct = 0.25;
  let embutBase: Exclude<BaseMode, "parcela_vigente"> = "credito";

  let ofertBase: Exclude<BaseMode, "parcela_vigente"> = "credito";

  let limitEnabled = true;
  let limitSource: LimitMode = "table";
  let limitPct: number | undefined = undefined;
  let limitBase: BaseMode | undefined = undefined;

  // 2) Carrega padrão da Adm (se existir)
  if (admin) {
    // Formas (quem define)
    const mode = admin.forms_mode ?? "table";
    if (mode === "adm") {
      forms_parcela_cheia = !!admin.forms_adm_parcela_cheia;
      forms_red25 = !!admin.forms_adm_red25;
      forms_red50 = !!admin.forms_adm_red50;
    }
    // Redutor
    redutorMode = (admin.reductor_mode ?? "valor_categoria") as RedutorMode;

    // Embutido: cap e base
    // cap: quem define? (adm/table)
    const capMode = (admin.embut_cap_mode ?? "adm") as LimitMode;
    if (capMode === "adm") {
      embutCapPct = clamp01(admin.embut_cap_adm_pct ?? 0.25);
    } else {
      // será resolvido pela tabela (se disponível); se não houver, cai no adm
      embutCapPct = clamp01(admin.embut_cap_adm_pct ?? 0.25);
    }
    embutBase = ((admin.embut_base as BaseMode) ?? "credito") === "valor_categoria" ? "valor_categoria" : "credito";

    // Ofertado: base %
    ofertBase = ((admin.ofert_base as BaseMode) ?? "credito") === "valor_categoria" ? "valor_categoria" : "credito";

    // Limitador pós
    limitEnabled = !!admin.limit_enabled;
    limitSource = (admin.limit_mode ?? "table") as LimitMode;
    if (limitSource === "adm") {
      limitPct = admin.limit_adm_pct ?? undefined;
      limitBase = (admin.limit_adm_base as BaseMode) ?? undefined;
    }
  }

  // 3) Aplica overrides da Tabela (quando existirem)
  if (table) {
    // Formas por Tabela (só quando o forms_mode não é "adm")
    if ((admin?.forms_mode ?? "table") === "table") {
      forms_parcela_cheia = table.forms_tbl_parcela_cheia ?? forms_parcela_cheia;
      forms_red25 = table.forms_tbl_red25 ?? forms_red25;
      forms_red50 = table.forms_tbl_red50 ?? forms_red50;
    }

    // Redutor: só se a Adm permitir override
    if (admin?.reductor_allow_table_override && table.reductor_mode_override) {
      redutorMode = table.reductor_mode_override;
    }

    // Embutido: cap e base
    const capMode = (admin?.embut_cap_mode ?? "adm") as LimitMode;
    if (capMode === "table") {
      if (typeof table.embut_cap_override_pct === "number") {
        embutCapPct = clamp01(table.embut_cap_override_pct);
      }
    }
    if (admin?.embut_base_allow_table_override && table.embut_base_override) {
      embutBase = table.embut_base_override === "valor_categoria" ? "valor_categoria" : "credito";
    }

    // Ofertado: base %
    if (admin?.ofert_base_allow_table_override && table.ofert_base_override) {
      ofertBase = table.ofert_base_override === "valor_categoria" ? "valor_categoria" : "credito";
    }

    // Limitador pós (quando source = table)
    if (limitSource === "table") {
      // Se a tabela trouxe %/base, consideramos que está habilitado
      if (typeof table.limit_pct_override === "number" && table.limit_pct_override >= 0) {
        limitPct = clamp01(table.limit_pct_override);
        limitBase = (table.limit_base_override as BaseMode) ?? limitBase;
        // se a Adm não desabilitou explicitamente, ativamos
        limitEnabled = admin?.limit_enabled === false ? false : true;
      }
    }
  }

  // 4) Clamp e consistências finais
  // – Embutido nunca passa de 25% por segurança (regra do negócio atual)
  embutCapPct = Math.min(embutCapPct, 0.25);

  // – Limitador: se não houver % definido, considera disabled (a menos que adm 'adm' tenha pct/base)
  const limitHasPct =
    (limitSource === "adm" && typeof limitPct === "number") ||
    (limitSource === "table" && typeof limitPct === "number");
  const limitFinalEnabled = limitEnabled && !!limitHasPct;

  const rules: RuleSet = {
    forms: {
      parcela_cheia: !!forms_parcela_cheia,
      red25: !!forms_red25,
      red50: !!forms_red50,
    },
    redutorMode,
    embutCapPct: embutCapPct,
    embutBase,
    ofertBase,
    limit: {
      enabled: limitFinalEnabled,
      pct: limitFinalEnabled ? limitPct : undefined,
      base: limitFinalEnabled ? (limitBase as BaseMode | undefined) : undefined,
    },
  };

  return rules;
}

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
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams(); // se usa ?setup=1
  const setup = searchParams.get("setup") === "1";
  const routeAdminId = id ?? null;
  
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminFull[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(routeAdminId);
  
  useEffect(() => {
  setActiveAdminId(routeAdminId);
}, [routeAdminId]);

useEffect(() => {
  if (!routeAdminId && !activeAdminId && admins.length) {
    setActiveAdminId(admins[0].id);
  }
}, [routeAdminId, activeAdminId, admins]);

const [mgrOpen, setMgrOpen] = useState(false);


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

// URL: /simuladores/:id?setup=1
const adminId = routeAdminId;   // reaproveita o id já lido lá em cima
const openSetup = setup;        // reaproveita o boolean já calculado
const { pathname: _pathname } = useLocation();
const showTopChips = false;     // ou pathname === "/simuladores"

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
  supabase.from("sim_admins").select(`
    id, name,
    slug,
    forms_mode,
    forms_adm_parcela_cheia, forms_adm_red25, forms_adm_red50,
    reductor_mode, reductor_allow_table_override,
    embut_cap_mode, embut_cap_adm_pct, embut_base, embut_base_allow_table_override,
    ofert_base, ofert_base_allow_table_override,
    limit_enabled, limit_mode, limit_adm_pct, limit_adm_base
  `).order("name", { ascending: true }),
  supabase.from("sim_tables").select("*"),
  supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
]);

setAdmins((a ?? []) as AdminFull[]);
setTables(t ?? []);
setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));

// 1) padrão: Embracon > ou o primeiro da lista
const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
let nextActiveId = embr?.id ?? (a?.[0]?.id ?? null);

// 2) se a URL tiver um adminId válido, priorize ele
if (adminId && (a ?? []).some((ad: any) => ad.id === adminId)) {
  nextActiveId = adminId as string;
}
setActiveAdminId(nextActiveId);

// 3) terminou o loading
setLoading(false);

// 4) se a URL tiver ?setup=1, abre o modal de tabelas
if (openSetup) {
  setTimeout(() => setMgrOpen(true), 0);
}
    })();
  }, []);

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

  const activeAdmin = admins.find((a) => a.id === activeAdminId);
const activeAdminFull = activeAdmin as AdminFull | undefined;

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

  // Regras resolvidas (precedência: Adm -> Tabela)
const rules = useMemo(() => {
  return resolveRules(
    activeAdminFull || null,
    (tabelaSelecionada as SimTableWithOverrides) || null
  );
}, [activeAdminFull, tabelaSelecionada]);

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

// valida % embutido com teto resolvido (Adm/Tabela)
const embutCapMax = rules?.embutCapPct ?? 0.25;
const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, embutCapMax);
useEffect(() => {
  if (lanceEmbutPct !== lanceEmbutPctValid) {
    setLanceEmbutPct(lanceEmbutPctValid);
  }
}, [lanceEmbutPct, lanceEmbutPctValid]); // eslint-disable-line

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
    return (seg || "Automóvel");
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

  return (
    <div className="p-6 space-y-4">
      {/* topo: admins + botões */}
<div className="flex flex-wrap items-center gap-2">
  {/* Chips de administradoras (escondidos quando showTopChips === false) */}
  {showTopChips && (
    <div className="flex flex-wrap gap-2">
      {admins.map((a) => (
        <Button
          key={a.id}
          variant={activeAdminId === a.id ? "default" : "secondary"}
          onClick={() => setActiveAdminId(a.id)}
          className="h-10 rounded-2xl px-4"
        >
          {a.name}
        </Button>
      ))}
    </div>
  )}

  <div className="ml-auto flex items-center gap-2">
    {activeAdmin && (
      <>
        {/* ✅ Mantido SEM depender do showTopChips */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMgrOpen(true)}
          className="h-10 rounded-2xl px-4"
        >
          Gerenciar Tabelas
        </Button>

        {/* ⛔️ "+ Add Administradora" só aparece se showTopChips === true */}
        {showTopChips && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => alert("Em breve: adicionar administradora.")}
            className="h-10 rounded-2xl px-4 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-1" /> + Add Administradora
          </Button>
        )}
      </>
    )}
  </div>
</div>

      {/* layout em duas colunas */}
<div className="grid grid-cols-12 gap-4">
  {/* coluna esquerda: simulador */}
  <div className="col-span-12 lg:col-span-8">
    <Card>
      <CardHeader>
        <CardTitle>Simuladores</CardTitle>
      </CardHeader>
      <CardContent>
        {activeAdmin ? (
          activeAdmin.name === "Embracon" ? (
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
              embutCapMax={embutCapMax}
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
              Em breve: simulador para <strong>{activeAdmin.name}</strong>.
            </div>
          )
        ) : (
          <div className="text-sm text-muted-foreground">
            Nenhuma administradora encontrada.
          </div>
        )}
      </CardContent>
    </Card>
  </div>
</div>

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
  const [faixaMin, setFaixaMin] = useState(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState(initial?.prazo_limite ?? 240);

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(formatPctInputFromDecimal(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(formatPctInputFromDecimal(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(formatPctInputFromDecimal(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(formatPctInputFromDecimal(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(formatPctInputFromDecimal(initial?.seguro_prest_pct ?? 0.00061));

  const [perEmbutido, setPerEmbutido] = useState(initial?.permite_lance_embutido ?? true);
  const [perFixo25, setPerFixo25] = useState(initial?.permite_lance_fixo_25 ?? true);
  const [perFixo50, setPerFixo50] = useState(initial?.permite_lance_fixo_50 ?? true);
  const [perLivre, setPerLivre] = useState(initial?.permite_lance_livre ?? true);

  const [cParcelaCheia, setCParcelaCheia] = useState(initial?.contrata_parcela_cheia ?? true);
  const [cRed25, setCRed25] = useState(initial?.contrata_reduzida_25 ?? true);
  const [cRed50, setCRed50] = useState(initial?.contrata_reduzida_50 ?? true);
  const [indices, setIndices] = useState((initial?.indice_correcao || ["IPCA"]).join(", "));

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
      permite_livre: perLivre as any, // compat
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
    if (res.error) { alert("Erro ao salvar tabela: " + res.error.message); return; }
    onSaved(res.data as SimTable);
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

  /* 👇 teto do lance embutido já resolvido (Adm/Tabela) */
  embutCapMax: number;

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
                  onChange={(e) => p.setForma(e.target.value as any)}
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
                if (d > p.embutCapMax) {
  alert(`Lance embutido limitado a ${(p.embutCapMax * 100).toFixed(4)}% do crédito/base. Voltando para o máximo permitido.`);
  p.setLanceEmbutPct(p.embutCapMax);
} else {
  p.setLanceEmbutPct(d);
}
                  }}
                  maxDecimal={p.embutCapMax}
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
