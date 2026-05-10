// src/pages/simuladores/MaggiSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  AlertTriangle,
  Calculator,
  Car,
  CheckCircle2,
  Copy,
  Home,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";

type SegmentoMaggi = "automoveis" | "imoveis";

type LanceKey =
  | "livre"
  | "primeiro_fixo"
  | "segundo_fixo"
  | "limitado"
  | "fidelidade";

type RegraPos =
  | "saldo_devedor_prazo_restante"
  | "mantem_parcela_reduz_prazo"
  | "custom";

type SeguroMomento = "contratacao" | "contemplacao";

type PrimeiraParcelaTipo = "nenhum" | "valor_fixo" | "pct_credito" | "pct_categoria";

type CreditRange = {
  id: string;
  label: string;
  valor: number;
};

type PrazoRule = {
  id: string;
  prazo: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
};

type LanceOption = {
  key: LanceKey;
  enabled: boolean;
  nomeComercial: string;
  pct: number;
};

type CustomRule = {
  lePrazoPct: number;
  leParcelaPct: number;
  llPrazoPct: number;
  llParcelaPct: number;
};

type FirstParcelRule = {
  enabled: boolean;
  tipo: PrimeiraParcelaTipo;
  valor: number;
};

type MaggiConfig = {
  creditRanges: CreditRange[];
  prazoRules: PrazoRule[];
  lanceOptions: LanceOption[];
  maxLanceEmbutidoPct: number;
  seguroMomento: SeguroMomento;
  customRule: CustomRule;
  firstParcelRule: FirstParcelRule;
  customRuleNotes?: string;
};

type MaggiGroup = {
  id: string;
  grupo: string;
  segmento: SegmentoMaggi;
  nome_grupo: string | null;
  perfil_grupo: string | null;
  observacoes: string | null;
  credito_min: number | null;
  credito_max: number | null;
  prazo_original: number | null;
  prazo_restante: number | null;
  taxa_adm_pct: number | null;
  fundo_reserva_pct: number | null;
  seguro_pct: number | null;
  permite_lance_livre: boolean | null;
  permite_lance_embutido: boolean | null;
  permite_lance_fixo: boolean | null;
  lance_embutido_max_pct: number | null;
  lance_fixo_pct: number | null;
  regra_pos_contemplacao: string | null;
  config: MaggiConfig | Record<string, any> | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GroupForm = {
  grupo: string;
  segmento: SegmentoMaggi;
  nome_grupo: string;
  perfil_grupo: string;
  observacoes: string;
  seguro_pct: string;
  seguroMomento: SeguroMomento;
  regra_pos_contemplacao: RegraPos;
  custom_rule_notes: string;
  is_active: boolean;
  creditRanges: { id: string; label: string; valor: string }[];
  prazoRules: {
    id: string;
    prazo: string;
    taxaAdmPct: string;
    fundoReservaPct: string;
  }[];
  lanceOptions: {
    key: LanceKey;
    enabled: boolean;
    nomeComercial: string;
    pct: string;
  }[];
  maxLanceEmbutidoPct: string;
  customRule: {
    lePrazoPct: string;
    leParcelaPct: string;
    llPrazoPct: string;
    llParcelaPct: string;
  };
  firstParcelRule: {
    enabled: boolean;
    tipo: PrimeiraParcelaTipo;
    valor: string;
  };
};

type Lead = {
  id: string;
  nome?: string | null;
  name?: string | null;
  telefone?: string | null;
  phone?: string | null;
  email?: string | null;
  created_at?: string | null;
};

type LoggedUserProfile = {
  id: string;
  auth_user_id?: string | null;
  nome?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  telefone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  user_role?: string | null;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const segmentos = [
  { key: "automoveis" as const, label: "Automóveis", icon: Car },
  { key: "imoveis" as const, label: "Imóveis", icon: Home },
];

const LANCE_LABELS: Record<LanceKey, string> = {
  livre: "Lance Livre",
  primeiro_fixo: "1º Lance Fixo",
  segundo_fixo: "2º Lance Fixo",
  limitado: "Lance Limitado",
  fidelidade: "Lance Fidelidade",
};

const DEFAULT_LANCES: LanceOption[] = [
  { key: "livre", enabled: true, nomeComercial: "Lance Livre", pct: 0 },
  {
    key: "primeiro_fixo",
    enabled: false,
    nomeComercial: "1º Lance Fixo",
    pct: 0,
  },
  {
    key: "segundo_fixo",
    enabled: false,
    nomeComercial: "2º Lance Fixo",
    pct: 0,
  },
  {
    key: "limitado",
    enabled: false,
    nomeComercial: "Lance Limitado",
    pct: 0,
  },
  {
    key: "fidelidade",
    enabled: false,
    nomeComercial: "Lance Fidelidade",
    pct: 0,
  },
];

const DEFAULT_CUSTOM_RULE: CustomRule = {
  lePrazoPct: 1,
  leParcelaPct: 0,
  llPrazoPct: 0.5,
  llParcelaPct: 0.5,
};

const DEFAULT_FIRST_PARCEL_RULE: FirstParcelRule = {
  enabled: false,
  tipo: "nenhum",
  valor: 0,
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function brMoney(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function parseMoney(value: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

function formatMoneyInput(value: number) {
  return brMoney(value || 0);
}

function parsePercent(value: string) {
  const clean = (value || "")
    .replace(/\s|%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(clean);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function formatPercentInput(decimal?: number | null) {
  return ((Number(decimal || 0) * 100).toFixed(4)).replace(".", ",");
}

function pctHuman(decimal?: number | null, digits = 4) {
  return `${(Number(decimal || 0) * 100)
    .toFixed(digits)
    .replace(".", ",")}%`;
}

function numberFrom(value: string) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function getLeadName(lead?: Lead | null) {
  return String(lead?.nome || lead?.name || "Lead sem nome");
}

function getLeadPhone(lead?: Lead | null) {
  return String(lead?.telefone || lead?.phone || "");
}

function getUserName(user?: LoggedUserProfile | null) {
  return String(user?.nome || user?.name || user?.email || "Consultor");
}

function getUserPhone(user?: LoggedUserProfile | null) {
  return onlyDigits(user?.phone || user?.telefone || "");
}

function buildWhatsappLink(user?: LoggedUserProfile | null) {
  const phone = getUserPhone(user);
  return phone ? `https://wa.me/${phone}` : "";
}

function sanitizeCustomRule(raw?: Partial<CustomRule> | null): CustomRule {
  return {
    lePrazoPct: Number(raw?.lePrazoPct ?? DEFAULT_CUSTOM_RULE.lePrazoPct),
    leParcelaPct: Number(raw?.leParcelaPct ?? DEFAULT_CUSTOM_RULE.leParcelaPct),
    llPrazoPct: Number(raw?.llPrazoPct ?? DEFAULT_CUSTOM_RULE.llPrazoPct),
    llParcelaPct: Number(raw?.llParcelaPct ?? DEFAULT_CUSTOM_RULE.llParcelaPct),
  };
}

function sanitizeFirstParcelRule(
  raw?: Partial<FirstParcelRule> | null
): FirstParcelRule {
  const tipo: PrimeiraParcelaTipo =
    raw?.tipo === "valor_fixo" ||
    raw?.tipo === "pct_credito" ||
    raw?.tipo === "pct_categoria"
      ? raw.tipo
      : "nenhum";

  return {
    enabled: Boolean(raw?.enabled && tipo !== "nenhum"),
    tipo,
    valor: Number(raw?.valor || 0),
  };
}

function normalizeConfig(group?: Partial<MaggiGroup> | null): MaggiConfig {
  const raw = (group?.config || {}) as Record<string, any>;

  const rawRanges = Array.isArray(raw.creditRanges) ? raw.creditRanges : [];
  const rawPrazoRules = Array.isArray(raw.prazoRules) ? raw.prazoRules : [];
  const rawLances = Array.isArray(raw.lanceOptions) ? raw.lanceOptions : [];

  const legacyMin = Number(group?.credito_min || 0);
  const legacyMax = Number(group?.credito_max || 0);
  const legacyPrazo = Number(group?.prazo_original || group?.prazo_restante || 0);

  const creditRanges: CreditRange[] = rawRanges.length
    ? rawRanges.map((r: any, idx: number) => ({
        id: String(r.id || makeId("faixa")),
        label: String(r.label || `Faixa ${idx + 1}`),
        valor: Number(r.valor || 0),
      }))
    : [
        { id: makeId("faixa"), label: "Faixa 1", valor: legacyMin },
        { id: makeId("faixa"), label: "Faixa 2", valor: legacyMax },
      ].filter((r) => r.valor > 0);

  const prazoRules: PrazoRule[] = rawPrazoRules.length
    ? rawPrazoRules.map((r: any) => ({
        id: String(r.id || makeId("prazo")),
        prazo: Number(r.prazo || 0),
        taxaAdmPct: Number(r.taxaAdmPct || 0),
        fundoReservaPct: Number(r.fundoReservaPct || 0),
      }))
    : [
        {
          id: makeId("prazo"),
          prazo: legacyPrazo || 1,
          taxaAdmPct: Number(group?.taxa_adm_pct || 0),
          fundoReservaPct: Number(group?.fundo_reserva_pct || 0),
        },
      ].filter((r) => r.prazo > 0);

  const lanceOptions: LanceOption[] = DEFAULT_LANCES.map((base) => {
    const saved = rawLances.find((x: any) => x?.key === base.key);

    return {
      key: base.key,
      enabled: typeof saved?.enabled === "boolean" ? saved.enabled : base.enabled,
      nomeComercial: String(saved?.nomeComercial || base.nomeComercial),
      pct: Number(saved?.pct || base.pct || 0),
    };
  });

  return {
    creditRanges,
    prazoRules,
    lanceOptions,
    maxLanceEmbutidoPct: Number(
      raw.maxLanceEmbutidoPct ?? group?.lance_embutido_max_pct ?? 0.25
    ),
    seguroMomento:
      raw.seguroMomento === "contemplacao" ? "contemplacao" : "contratacao",
    customRule: sanitizeCustomRule(raw.customRule),
    firstParcelRule: sanitizeFirstParcelRule(raw.firstParcelRule),
    customRuleNotes: String(raw.customRuleNotes || ""),
  };
}

function defaultForm(segmento: SegmentoMaggi): GroupForm {
  return {
    grupo: "",
    segmento,
    nome_grupo: "",
    perfil_grupo: "",
    observacoes: "",
    seguro_pct: "0,0000",
    seguroMomento: "contratacao",
    regra_pos_contemplacao: "saldo_devedor_prazo_restante",
    custom_rule_notes: "",
    is_active: true,
    creditRanges: [
      {
        id: makeId("faixa"),
        label: "Faixa 1",
        valor: formatMoneyInput(0),
      },
    ],
    prazoRules: [
      {
        id: makeId("prazo"),
        prazo: "0",
        taxaAdmPct: "0,0000",
        fundoReservaPct: "0,0000",
      },
    ],
    lanceOptions: DEFAULT_LANCES.map((o) => ({
      key: o.key,
      enabled: o.enabled,
      nomeComercial: o.nomeComercial,
      pct: formatPercentInput(o.pct),
    })),
    maxLanceEmbutidoPct: "25,0000",
    customRule: {
      lePrazoPct: "100,0000",
      leParcelaPct: "0,0000",
      llPrazoPct: "50,0000",
      llParcelaPct: "50,0000",
    },
    firstParcelRule: {
      enabled: false,
      tipo: "nenhum",
      valor: formatMoneyInput(0),
    },
  };
}

function formFromGroup(group: MaggiGroup): GroupForm {
  const config = normalizeConfig(group);

  return {
    grupo: group.grupo || "",
    segmento: group.segmento || "automoveis",
    nome_grupo: group.nome_grupo || "",
    perfil_grupo: group.perfil_grupo || "",
    observacoes: group.observacoes || "",
    seguro_pct: formatPercentInput(group.seguro_pct),
    seguroMomento: config.seguroMomento,
    regra_pos_contemplacao:
      (group.regra_pos_contemplacao as RegraPos) ||
      "saldo_devedor_prazo_restante",
    custom_rule_notes: config.customRuleNotes || "",
    is_active: group.is_active !== false,
    creditRanges: config.creditRanges.length
      ? config.creditRanges.map((r, idx) => ({
          id: r.id,
          label: r.label || `Faixa ${idx + 1}`,
          valor: formatMoneyInput(r.valor),
        }))
      : [
          {
            id: makeId("faixa"),
            label: "Faixa 1",
            valor: formatMoneyInput(0),
          },
        ],
    prazoRules: config.prazoRules.length
      ? config.prazoRules.map((r) => ({
          id: r.id,
          prazo: String(r.prazo || 0),
          taxaAdmPct: formatPercentInput(r.taxaAdmPct),
          fundoReservaPct: formatPercentInput(r.fundoReservaPct),
        }))
      : [
          {
            id: makeId("prazo"),
            prazo: "0",
            taxaAdmPct: "0,0000",
            fundoReservaPct: "0,0000",
          },
        ],
    lanceOptions: config.lanceOptions.map((o) => ({
      key: o.key,
      enabled: o.enabled,
      nomeComercial: o.nomeComercial,
      pct: formatPercentInput(o.pct),
    })),
    maxLanceEmbutidoPct: formatPercentInput(config.maxLanceEmbutidoPct),
    customRule: {
      lePrazoPct: formatPercentInput(config.customRule.lePrazoPct),
      leParcelaPct: formatPercentInput(config.customRule.leParcelaPct),
      llPrazoPct: formatPercentInput(config.customRule.llPrazoPct),
      llParcelaPct: formatPercentInput(config.customRule.llParcelaPct),
    },
    firstParcelRule: {
      enabled: config.firstParcelRule.enabled,
      tipo: config.firstParcelRule.tipo,
      valor:
        config.firstParcelRule.tipo === "valor_fixo"
          ? formatMoneyInput(config.firstParcelRule.valor)
          : formatPercentInput(config.firstParcelRule.valor),
    },
  };
}

function normalizeGroupPayload(form: GroupForm) {
  const creditRanges = form.creditRanges
    .map((r, idx) => ({
      id: r.id || makeId("faixa"),
      label: r.label || `Faixa ${idx + 1}`,
      valor: parseMoney(r.valor),
    }))
    .filter((r) => r.valor > 0)
    .sort((a, b) => a.valor - b.valor);

  const prazoRules = form.prazoRules
    .map((r) => ({
      id: r.id || makeId("prazo"),
      prazo: numberFrom(r.prazo),
      taxaAdmPct: parsePercent(r.taxaAdmPct),
      fundoReservaPct: parsePercent(r.fundoReservaPct),
    }))
    .filter((r) => r.prazo > 0)
    .sort((a, b) => a.prazo - b.prazo);

  const lanceOptions = form.lanceOptions.map((o) => ({
    key: o.key,
    enabled: o.enabled,
    nomeComercial: o.nomeComercial.trim() || LANCE_LABELS[o.key],
    pct: parsePercent(o.pct),
  }));

  const firstPrazo = prazoRules[0] || null;
  const creditoMin = creditRanges[0]?.valor || 0;
  const creditoMax = creditRanges[creditRanges.length - 1]?.valor || 0;
  const primeiroFixo = lanceOptions.find((o) => o.key === "primeiro_fixo");

  const customRule: CustomRule = {
    lePrazoPct: parsePercent(form.customRule.lePrazoPct),
    leParcelaPct: parsePercent(form.customRule.leParcelaPct),
    llPrazoPct: parsePercent(form.customRule.llPrazoPct),
    llParcelaPct: parsePercent(form.customRule.llParcelaPct),
  };

  const firstParcelRule: FirstParcelRule = {
    enabled: form.firstParcelRule.enabled && form.firstParcelRule.tipo !== "nenhum",
    tipo: form.firstParcelRule.enabled ? form.firstParcelRule.tipo : "nenhum",
    valor:
      form.firstParcelRule.tipo === "valor_fixo"
        ? parseMoney(form.firstParcelRule.valor)
        : parsePercent(form.firstParcelRule.valor),
  };

  return {
    grupo: form.grupo.trim(),
    segmento: form.segmento,
    nome_grupo: form.nome_grupo.trim() || null,
    perfil_grupo: form.perfil_grupo.trim() || null,
    observacoes: form.observacoes.trim() || null,

    credito_min: creditoMin,
    credito_max: creditoMax,

    prazo_original: firstPrazo?.prazo || 0,
    prazo_restante: firstPrazo?.prazo || 0,

    taxa_adm_pct: firstPrazo?.taxaAdmPct || 0,
    fundo_reserva_pct: firstPrazo?.fundoReservaPct || 0,
    seguro_pct: parsePercent(form.seguro_pct),

    permite_lance_livre:
      lanceOptions.find((o) => o.key === "livre")?.enabled ?? true,
    permite_lance_embutido: true,
    permite_lance_fixo: lanceOptions.some(
      (o) => o.key !== "livre" && o.enabled
    ),

    lance_embutido_max_pct: parsePercent(form.maxLanceEmbutidoPct),
    lance_fixo_pct: primeiroFixo?.pct || 0,

    regra_pos_contemplacao: form.regra_pos_contemplacao,
    is_active: form.is_active,

    config: {
      creditRanges,
      prazoRules,
      lanceOptions,
      maxLanceEmbutidoPct: parsePercent(form.maxLanceEmbutidoPct),
      seguroMomento: form.seguroMomento,
      customRule,
      firstParcelRule,
      customRuleNotes: form.custom_rule_notes.trim(),
    },
  };
}

function findPrazoRule(
  group: MaggiGroup | null,
  prazoRuleId: string
): PrazoRule | null {
  if (!group) return null;

  const cfg = normalizeConfig(group);
  return cfg.prazoRules.find((r) => r.id === prazoRuleId) || cfg.prazoRules[0] || null;
}

function findLanceOption(
  group: MaggiGroup | null,
  lanceKey: LanceKey
): LanceOption | null {
  if (!group) return null;

  const cfg = normalizeConfig(group);
  return cfg.lanceOptions.find((l) => l.key === lanceKey && l.enabled) || null;
}

function findCreditRange(group: MaggiGroup | null, credito: number): CreditRange | null {
  if (!group || !credito) return null;

  const ranges = normalizeConfig(group).creditRanges;
  if (!ranges.length) return null;

  const ordered = [...ranges].sort((a, b) => a.valor - b.valor);
  return ordered.find((r) => credito <= r.valor) || ordered[ordered.length - 1] || null;
}

function calcFirstParcelAdd(input: {
  credito: number;
  valorCategoria: number;
  rule: FirstParcelRule;
}) {
  const { credito, valorCategoria, rule } = input;

  if (!rule.enabled || rule.tipo === "nenhum") return 0;

  if (rule.tipo === "valor_fixo") return Math.max(0, Number(rule.valor || 0));
  if (rule.tipo === "pct_credito") return Math.max(0, credito * Number(rule.valor || 0));
  if (rule.tipo === "pct_categoria")
    return Math.max(0, valorCategoria * Number(rule.valor || 0));

  return 0;
}

function calcPreviewParcela(input: {
  credito: number;
  prazoRule: PrazoRule;
  seguroPct: number;
  seguroMomento: SeguroMomento;
}) {
  const { credito, prazoRule, seguroPct, seguroMomento } = input;

  const prazo = Math.max(1, Number(prazoRule.prazo || 1));
  const taxaAdm = Number(prazoRule.taxaAdmPct || 0);
  const fundoReserva = Number(prazoRule.fundoReservaPct || 0);
  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);
  const parcelaBase = valorCategoria / prazo;
  const seguroMensal = valorCategoria * Number(seguroPct || 0);

  return parcelaBase + (seguroMomento === "contratacao" ? seguroMensal : 0);
}

function calcMaggi(input: {
  group: MaggiGroup | null;
  credito: number;
  prazoRuleId: string;
  lanceKey: LanceKey;
  lanceLivrePct: number;
  usarEmbutido: boolean;
  lanceEmbutidoPct: number;
  parcelaContemplacao: number;
}) {
  const {
    group,
    credito,
    prazoRuleId,
    lanceKey,
    lanceLivrePct,
    usarEmbutido,
    lanceEmbutidoPct,
    parcelaContemplacao,
  } = input;

  if (!group || !credito) return { result: null as any, error: "" };

  const cfg = normalizeConfig(group);
  const prazoRule = findPrazoRule(group, prazoRuleId);
  const lanceOption = findLanceOption(group, lanceKey);

  if (!prazoRule) {
    return {
      result: null as any,
      error: "Cadastre pelo menos uma faixa de prazo para este grupo.",
    };
  }

  if (!lanceOption) {
    return {
      result: null as any,
      error: "Selecione um lance permitido para este grupo.",
    };
  }

  const taxaAdm = Number(prazoRule.taxaAdmPct || 0);
  const fundoReserva = Number(prazoRule.fundoReservaPct || 0);
  const seguroPct = Number(group.seguro_pct || 0);
  const seguroMomento = cfg.seguroMomento || "contratacao";
  const customRule = sanitizeCustomRule(cfg.customRule);
  const firstParcelRule = sanitizeFirstParcelRule(cfg.firstParcelRule);

  const prazo = Math.max(1, Number(prazoRule.prazo || 1));
  const parcelaContempl = clamp(Math.max(1, Number(parcelaContemplacao || 1)), 1, prazo);
  const prazoAposContemplacaoBase = Math.max(1, prazo - parcelaContempl);

  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);
  const baseLance = valorCategoria;

  const seguroMensal = valorCategoria * seguroPct;
  const parcelaBase = valorCategoria / prazo;

  const demaisParcelasAntes =
    parcelaBase + (seguroMomento === "contratacao" ? seguroMensal : 0);

  const adicionalPrimeiraParcela = calcFirstParcelAdd({
    credito,
    valorCategoria,
    rule: firstParcelRule,
  });

  const parcela1 = demaisParcelasAntes + adicionalPrimeiraParcela;
  const parcelaAntes = demaisParcelasAntes;

  const totalPagoAteContemplacao =
    parcelaBase * parcelaContempl + adicionalPrimeiraParcela;

  const maxEmbutidoPct = Number(cfg.maxLanceEmbutidoPct || 0);

  const percentualLanceTotal =
    lanceKey === "livre"
      ? Math.max(0, lanceLivrePct)
      : Math.max(0, Number(lanceOption.pct || 0));

  const lanceOfertadoValor = baseLance * percentualLanceTotal;

  let lanceEmbutidoFinalPct = 0;

  if (usarEmbutido) {
    lanceEmbutidoFinalPct = Math.max(0, lanceEmbutidoPct);

    if (maxEmbutidoPct > 0 && lanceEmbutidoFinalPct > maxEmbutidoPct) {
      return {
        result: null as any,
        error: `O lance embutido informado (${pctHuman(
          lanceEmbutidoFinalPct
        )}) é maior que o máximo permitido neste grupo (${pctHuman(
          maxEmbutidoPct
        )}).`,
      };
    }
  }

  const lanceEmbutidoValor = baseLance * lanceEmbutidoFinalPct;

  if (lanceEmbutidoValor > lanceOfertadoValor + 0.01) {
    return {
      result: null as any,
      error:
        "O lance embutido não pode ser maior que o lance ofertado. Ajuste o percentual do lance embutido ou aumente o lance ofertado.",
    };
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);

  const saldoDevedorInicial = valorCategoria;
  const saldoAposParcelasPagas = Math.max(
    0,
    saldoDevedorInicial - totalPagoAteContemplacao
  );

  const saldoDevedorProjetado = Math.max(
    0,
    saldoAposParcelasPagas - lanceOfertadoValor
  );

  let parcelaApos = saldoDevedorProjetado / prazoAposContemplacaoBase;
  let prazoFinal = prazoAposContemplacaoBase;

  let parcelasAmortizadasPorLE = 0;
  let parcelasAmortizadasPorLL = 0;

  if (group.regra_pos_contemplacao === "mantem_parcela_reduz_prazo") {
    const parcelaReferencia = Math.max(1, parcelaBase);
    prazoFinal = Math.max(1, Math.ceil(saldoDevedorProjetado / parcelaReferencia));
    parcelaApos = parcelaReferencia;
  }

  if (group.regra_pos_contemplacao === "custom") {
    const valorLEParaPrazo = lanceEmbutidoValor * clamp(customRule.lePrazoPct, 0, 1);
    const valorLLParaPrazo = lanceProprioValor * clamp(customRule.llPrazoPct, 0, 1);

    parcelasAmortizadasPorLE =
      parcelaBase > 0 ? Math.ceil(valorLEParaPrazo / parcelaBase) : 0;

    parcelasAmortizadasPorLL =
      parcelaBase > 0 ? Math.ceil(valorLLParaPrazo / parcelaBase) : 0;

    prazoFinal = Math.max(
      1,
      prazoAposContemplacaoBase - parcelasAmortizadasPorLE - parcelasAmortizadasPorLL
    );

    parcelaApos = saldoDevedorProjetado / prazoFinal;
  }

  if (seguroMomento === "contemplacao") {
    parcelaApos += seguroMensal;
  }

  const creditoLiquido = Math.max(0, credito - lanceEmbutidoValor);

  return {
    error: "",
    result: {
      prazo,
      taxaAdm,
      fundoReserva,
      valorCategoria,
      baseLance,
      seguroMensal,
      seguroMomento,
      parcelaBase,
      parcela1,
      demaisParcelasAntes,
      adicionalPrimeiraParcela,
      parcelaAntes,
      totalPagoAteContemplacao,
      saldoDevedorInicial,
      saldoAposParcelasPagas,
      lanceOfertadoValor,
      lanceLivreValor: lanceProprioValor,
      lanceProprioValor,
      lanceEmbutidoValor,
      creditoLiquido,
      saldoDevedorProjetado,
      parcelaApos,
      prazoAposContemplacao: prazoFinal,
      prazoAposContemplacaoBase,
      percentualLanceTotal,
      lanceNome: lanceOption.nomeComercial || LANCE_LABELS[lanceOption.key],
      lanceProprioPct: baseLance > 0 ? lanceProprioValor / baseLance : 0,
      lanceEmbutidoFinalPct,
      parcelasAmortizadasPorLE,
      parcelasAmortizadasPorLL,
      customRule,
      firstParcelRule,
    },
  };
}

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-3xl border bg-white/80 p-4 shadow-sm backdrop-blur"
      style={{ borderColor: "rgba(30,41,63,.10)" }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-xl font-black" style={{ color: C.navy }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl"
        style={{ background: "rgba(161,28,39,.10)", color: C.ruby }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-black" style={{ color: C.navy }}>
          {title}
        </h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function ConfigGroupsOverlay({
  open,
  onClose,
  segmento,
  groups,
  onReload,
}: {
  open: boolean;
  onClose: () => void;
  segmento: SegmentoMaggi;
  groups: MaggiGroup[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<MaggiGroup | null>(null);
  const [form, setForm] = useState<GroupForm>(() => defaultForm(segmento));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editing) setForm(formFromGroup(editing));
    else setForm(defaultForm(segmento));
  }, [open, editing, segmento]);

  if (!open) return null;

  function update<K extends keyof GroupForm>(key: K, value: GroupForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateCreditRange(
    id: string,
    field: "label" | "valor",
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      creditRanges: prev.creditRanges.map((r) =>
        r.id === id ? { ...r, [field]: value } : r
      ),
    }));
  }

  function updatePrazoRule(
    id: string,
    field: "prazo" | "taxaAdmPct" | "fundoReservaPct",
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      prazoRules: prev.prazoRules.map((r) =>
        r.id === id ? { ...r, [field]: value } : r
      ),
    }));
  }

  function updateLanceOption(
    key: LanceKey,
    field: "enabled" | "nomeComercial" | "pct",
    value: boolean | string
  ) {
    setForm((prev) => ({
      ...prev,
      lanceOptions: prev.lanceOptions.map((l) =>
        l.key === key ? { ...l, [field]: value } : l
      ),
    }));
  }

  function updateCustomRule(
    field: keyof GroupForm["customRule"],
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      customRule: {
        ...prev.customRule,
        [field]: value,
      },
    }));
  }

  function updateFirstParcelRule(
    field: keyof GroupForm["firstParcelRule"],
    value: boolean | string
  ) {
    setForm((prev) => {
      const next = {
        ...prev.firstParcelRule,
        [field]: value,
      };

      if (field === "enabled" && value === false) {
        next.tipo = "nenhum";
      }

      if (field === "enabled" && value === true && next.tipo === "nenhum") {
        next.tipo = "valor_fixo";
      }

      return {
        ...prev,
        firstParcelRule: next,
      };
    });
  }

  async function saveGroup() {
    const payload = normalizeGroupPayload(form);

    if (!payload.grupo) {
      alert("Informe o número do grupo.");
      return;
    }

    if ((payload.config.creditRanges || []).length === 0) {
      alert("Cadastre pelo menos uma faixa de crédito.");
      return;
    }

    if ((payload.config.prazoRules || []).length === 0) {
      alert(
        "Cadastre pelo menos uma faixa de prazo, taxa de administração e fundo reserva."
      );
      return;
    }

    if (!(payload.config.lanceOptions || []).some((l: LanceOption) => l.enabled)) {
      alert("Marque pelo menos uma modalidade de lance permitida.");
      return;
    }

    const custom = payload.config.customRule as CustomRule;
    const leTotal = Number(custom.lePrazoPct || 0) + Number(custom.leParcelaPct || 0);
    const llTotal = Number(custom.llPrazoPct || 0) + Number(custom.llParcelaPct || 0);

    if (payload.regra_pos_contemplacao === "custom") {
      if (Math.abs(leTotal - 1) > 0.0001) {
        alert(
          "Na regra customizada, a soma dos percentuais do Lance Embutido precisa fechar 100%."
        );
        return;
      }

      if (Math.abs(llTotal - 1) > 0.0001) {
        alert(
          "Na regra customizada, a soma dos percentuais do Lance Livre/Próprio precisa fechar 100%."
        );
        return;
      }
    }

    setSaving(true);

    const result = editing
      ? await supabase
          .from("sim_maggi_groups")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single()
      : await supabase
          .from("sim_maggi_groups")
          .insert(payload)
          .select("*")
          .single();

    setSaving(false);

    if (result.error) {
      alert(`Erro ao salvar grupo: ${result.error.message}`);
      return;
    }

    setEditing(null);
    setForm(defaultForm(segmento));
    await onReload();
  }

  async function deleteGroup(group: MaggiGroup) {
    if (!confirm(`Excluir o grupo ${group.grupo}?`)) return;

    setDeletingId(group.id);

    const { error } = await supabase
      .from("sim_maggi_groups")
      .delete()
      .eq("id", group.id);

    setDeletingId(null);

    if (error) {
      alert(`Erro ao excluir grupo: ${error.message}`);
      return;
    }

    if (editing?.id === group.id) setEditing(null);
    await onReload();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-black" style={{ color: C.navy }}>
              Configurar grupos Maggi
            </h2>
            <p className="text-sm text-slate-500">
              Cadastre faixas, prazos, lances, seguro e regras específicas por
              grupo.
            </p>
          </div>

          <button
            className="rounded-2xl border p-2 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-76px)] gap-0 overflow-y-auto lg:grid-cols-[.85fr_1.35fr]">
          <div className="border-r p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold" style={{ color: C.navy }}>
                Grupos cadastrados
              </h3>

              <Button
                variant="secondary"
                className="h-9 rounded-2xl"
                onClick={() => {
                  setEditing(null);
                  setForm(defaultForm(segmento));
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Novo
              </Button>
            </div>

            <div className="space-y-2">
              {groups.map((g) => {
                const cfg = normalizeConfig(g);

                return (
                  <div
                    key={g.id}
                    className={`rounded-2xl border p-3 text-sm ${
                      g.is_active === false ? "bg-slate-50 opacity-75" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black" style={{ color: C.navy }}>
                          Grupo {g.grupo}{" "}
                          {g.is_active === false && (
                            <span className="text-xs font-semibold text-slate-400">
                              • Inativo
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500">
                          {g.nome_grupo || g.perfil_grupo || "Sem descrição"}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {cfg.creditRanges.length} faixa(s) de crédito •{" "}
                          {cfg.prazoRules.length} prazo(s) • Seguro na{" "}
                          {cfg.seguroMomento === "contratacao"
                            ? "contratação"
                            : "contemplação"}
                        </div>

                        {cfg.firstParcelRule.enabled && (
                          <div className="mt-1 text-xs text-amber-700">
                            1ª parcela diferenciada configurada
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1">
                        <button
                          className="rounded-xl border p-2 hover:bg-slate-50"
                          onClick={() => setEditing(g)}
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          className="rounded-xl border p-2 hover:bg-red-50"
                          onClick={() => deleteGroup(g)}
                          type="button"
                          disabled={deletingId === g.id}
                        >
                          {deletingId === g.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {groups.length === 0 && (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                  Nenhum grupo cadastrado para este segmento.
                </div>
              )}
            </div>
          </div>

          <div className="p-5">
            <h3 className="mb-4 font-bold" style={{ color: C.navy }}>
              {editing ? `Editando grupo ${editing.grupo}` : "Novo grupo"}
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Segmento</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={form.segmento}
                  onChange={(e) =>
                    update("segmento", e.target.value as SegmentoMaggi)
                  }
                >
                  <option value="automoveis">Automóveis</option>
                  <option value="imoveis">Imóveis</option>
                </select>
              </div>

              <div>
                <Label>Grupo</Label>
                <Input
                  value={form.grupo}
                  onChange={(e) => update("grupo", e.target.value)}
                  placeholder="Ex.: 2020"
                />
              </div>

              <div>
                <Label>Nome do grupo</Label>
                <Input
                  value={form.nome_grupo}
                  onChange={(e) => update("nome_grupo", e.target.value)}
                  placeholder="Ex.: Imóvel Flex"
                />
              </div>

              <div>
                <Label>Perfil do grupo</Label>
                <Input
                  value={form.perfil_grupo}
                  onChange={(e) => update("perfil_grupo", e.target.value)}
                  placeholder="Ex.: Bom para lance embutido"
                />
              </div>

              <div>
                <Label>Seguro mensal (%)</Label>
                <Input
                  value={form.seguro_pct}
                  onChange={(e) => update("seguro_pct", e.target.value)}
                />
              </div>

              <div>
                <Label>Momento do seguro</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={form.seguroMomento}
                  onChange={(e) =>
                    update("seguroMomento", e.target.value as SeguroMomento)
                  }
                >
                  <option value="contratacao">Na contratação</option>
                  <option value="contemplacao">Na contemplação</option>
                </select>

                <p className="mt-1 text-xs text-slate-500">
                  Na contratação entra nas parcelas iniciais. Na contemplação
                  entra apenas após contemplar.
                </p>
              </div>

              <div>
                <Label>Máx. lance embutido (%)</Label>
                <Input
                  value={form.maxLanceEmbutidoPct}
                  onChange={(e) =>
                    update("maxLanceEmbutidoPct", e.target.value)
                  }
                />
              </div>

              <div>
                <Label>Regra pós-contemplação</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={form.regra_pos_contemplacao}
                  onChange={(e) =>
                    update("regra_pos_contemplacao", e.target.value as RegraPos)
                  }
                >
                  <option value="saldo_devedor_prazo_restante">
                    Saldo devedor ÷ prazo restante
                  </option>
                  <option value="mantem_parcela_reduz_prazo">
                    Mantém parcela e reduz prazo
                  </option>
                  <option value="custom">Customizada</option>
                </select>
              </div>

              <div className="md:col-span-2 rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black" style={{ color: C.navy }}>
                      1ª parcela diferenciada
                    </h4>
                    <p className="text-xs text-slate-500">
                      Use quando a primeira parcela tiver adesão, taxa ou valor
                      adicional em relação às demais parcelas.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.firstParcelRule.enabled}
                    onChange={(e) =>
                      updateFirstParcelRule("enabled", e.target.checked)
                    }
                  />
                  Ativar 1ª parcela diferenciada
                </label>

                {form.firstParcelRule.enabled && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Tipo de adicional</Label>
                      <select
                        className="h-10 w-full rounded-md border px-3"
                        value={form.firstParcelRule.tipo}
                        onChange={(e) => {
                          const tipo = e.target.value as PrimeiraParcelaTipo;
                          updateFirstParcelRule("tipo", tipo);
                          updateFirstParcelRule(
                            "valor",
                            tipo === "valor_fixo"
                              ? formatMoneyInput(0)
                              : "0,0000"
                          );
                        }}
                      >
                        <option value="valor_fixo">Valor fixo adicional</option>
                        <option value="pct_credito">% sobre o crédito</option>
                        <option value="pct_categoria">
                          % sobre crédito + taxas
                        </option>
                      </select>
                    </div>

                    <div>
                      <Label>
                        {form.firstParcelRule.tipo === "valor_fixo"
                          ? "Valor adicional"
                          : "Percentual adicional (%)"}
                      </Label>
                      <Input
                        value={form.firstParcelRule.valor}
                        inputMode={
                          form.firstParcelRule.tipo === "valor_fixo"
                            ? "numeric"
                            : "decimal"
                        }
                        onChange={(e) =>
                          updateFirstParcelRule(
                            "valor",
                            form.firstParcelRule.tipo === "valor_fixo"
                              ? formatMoneyInput(parseMoney(e.target.value))
                              : e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="md:col-span-2 rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black" style={{ color: C.navy }}>
                      Faixas de crédito
                    </h4>
                    <p className="text-xs text-slate-500">
                      Adicione os créditos disponíveis ou valores de referência
                      para o grupo.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    onClick={() =>
                      update("creditRanges", [
                        ...form.creditRanges,
                        {
                          id: makeId("faixa"),
                          label: `Faixa ${form.creditRanges.length + 1}`,
                          valor: formatMoneyInput(0),
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add faixa
                  </Button>
                </div>

                <div className="grid gap-3">
                  {form.creditRanges.map((r, idx) => (
                    <div
                      key={r.id}
                      className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                    >
                      <Input
                        value={r.label || `Faixa ${idx + 1}`}
                        onChange={(e) =>
                          updateCreditRange(r.id, "label", e.target.value)
                        }
                        placeholder={`Faixa ${idx + 1}`}
                      />

                      <Input
                        value={r.valor}
                        inputMode="numeric"
                        onChange={(e) =>
                          updateCreditRange(
                            r.id,
                            "valor",
                            formatMoneyInput(parseMoney(e.target.value))
                          )
                        }
                      />

                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-2xl"
                        onClick={() =>
                          update(
                            "creditRanges",
                            form.creditRanges.filter((x) => x.id !== r.id)
                          )
                        }
                        disabled={form.creditRanges.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black" style={{ color: C.navy }}>
                      Faixas de prazo, taxa de adm e fundo reserva
                    </h4>
                    <p className="text-xs text-slate-500">
                      Cada prazo pode ter taxa de administração e fundo reserva
                      próprios.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    onClick={() =>
                      update("prazoRules", [
                        ...form.prazoRules,
                        {
                          id: makeId("prazo"),
                          prazo: "0",
                          taxaAdmPct: "0,0000",
                          fundoReservaPct: "0,0000",
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add prazo
                  </Button>
                </div>

                <div className="grid gap-3">
                  {form.prazoRules.map((r) => (
                    <div
                      key={r.id}
                      className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                      <Input
                        type="number"
                        value={r.prazo}
                        onChange={(e) =>
                          updatePrazoRule(r.id, "prazo", e.target.value)
                        }
                        placeholder="Prazo"
                      />

                      <Input
                        value={r.taxaAdmPct}
                        onChange={(e) =>
                          updatePrazoRule(r.id, "taxaAdmPct", e.target.value)
                        }
                        placeholder="Taxa adm %"
                      />

                      <Input
                        value={r.fundoReservaPct}
                        onChange={(e) =>
                          updatePrazoRule(
                            r.id,
                            "fundoReservaPct",
                            e.target.value
                          )
                        }
                        placeholder="Fundo reserva %"
                      />

                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-2xl"
                        onClick={() =>
                          update(
                            "prazoRules",
                            form.prazoRules.filter((x) => x.id !== r.id)
                          )
                        }
                        disabled={form.prazoRules.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 rounded-3xl border p-4">
                <h4 className="mb-1 font-black" style={{ color: C.navy }}>
                  Lances permitidos
                </h4>
                <p className="mb-3 text-xs text-slate-500">
                  Para lances pré-configurados, informe o nome comercial e o
                  percentual. O lance embutido poderá compor qualquer modalidade
                  marcada.
                </p>

                <div className="grid gap-3">
                  {form.lanceOptions.map((l) => (
                    <div
                      key={l.key}
                      className="grid gap-2 rounded-2xl border bg-slate-50/60 p-3 md:grid-cols-[190px_1fr_160px] md:items-center"
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={l.enabled}
                          onChange={(e) =>
                            updateLanceOption(
                              l.key,
                              "enabled",
                              e.target.checked
                            )
                          }
                        />
                        {LANCE_LABELS[l.key]}
                      </label>

                      <Input
                        value={l.nomeComercial}
                        onChange={(e) =>
                          updateLanceOption(
                            l.key,
                            "nomeComercial",
                            e.target.value
                          )
                        }
                        placeholder="Nome comercial"
                        disabled={l.key !== "livre" && !l.enabled}
                      />

                      {l.key === "livre" ? (
                        <Input
                          value="Digitado na simulação"
                          readOnly
                          className="text-xs text-slate-500"
                        />
                      ) : (
                        <Input
                          value={l.pct}
                          onChange={(e) =>
                            updateLanceOption(l.key, "pct", e.target.value)
                          }
                          placeholder="% do lance"
                          disabled={!l.enabled}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {form.regra_pos_contemplacao === "custom" && (
                <div className="md:col-span-2 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    Regra customizada de amortização
                  </div>

                  <p className="mt-1 text-xs">
                    Defina quanto do Lance Embutido e quanto do Lance
                    Livre/Próprio será usado para reduzir prazo ou reduzir valor
                    das parcelas. A soma de cada bloco precisa fechar 100%.
                  </p>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-amber-200 bg-white p-3">
                      <h5 className="mb-3 font-black" style={{ color: C.navy }}>
                        Lance Embutido
                      </h5>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>% do LE que abaterá no prazo</Label>
                          <Input
                            value={form.customRule.lePrazoPct}
                            onChange={(e) =>
                              updateCustomRule("lePrazoPct", e.target.value)
                            }
                          />
                        </div>

                        <div>
                          <Label>% do LE que abaterá nas parcelas</Label>
                          <Input
                            value={form.customRule.leParcelaPct}
                            onChange={(e) =>
                              updateCustomRule("leParcelaPct", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-white p-3">
                      <h5 className="mb-3 font-black" style={{ color: C.navy }}>
                        Lance Livre / Próprio
                      </h5>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>% do LL que abaterá no prazo</Label>
                          <Input
                            value={form.customRule.llPrazoPct}
                            onChange={(e) =>
                              updateCustomRule("llPrazoPct", e.target.value)
                            }
                          />
                        </div>

                        <div>
                          <Label>% do LL que abaterá nas parcelas</Label>
                          <Input
                            value={form.customRule.llParcelaPct}
                            onChange={(e) =>
                              updateCustomRule("llParcelaPct", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Label>Observação da regra customizada</Label>
                    <textarea
                      className="mt-1 min-h-[80px] w-full rounded-md border bg-white p-3 text-sm"
                      value={form.custom_rule_notes}
                      onChange={(e) =>
                        update("custom_rule_notes", e.target.value)
                      }
                      placeholder="Descreva a regra operacional deste grupo..."
                    />
                  </div>
                </div>
              )}

              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => update("is_active", e.target.checked)}
                  />
                  Grupo ativo
                </label>
              </div>

              <div className="md:col-span-2">
                <Label>Observações internas</Label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border p-3 text-sm"
                  value={form.observacoes}
                  onChange={(e) => update("observacoes", e.target.value)}
                  placeholder="Regras específicas, cuidados comerciais, perfil de contemplação..."
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                className="h-10 rounded-2xl"
                onClick={saveGroup}
                disabled={saving}
                style={{ background: C.ruby }}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar grupo
              </Button>

              <Button
                variant="secondary"
                className="h-10 rounded-2xl"
                onClick={() => {
                  setEditing(null);
                  setForm(defaultForm(segmento));
                }}
                disabled={saving}
              >
                Limpar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MaggiSimulator() {
  const [segmento, setSegmento] = useState<SegmentoMaggi>("automoveis");
  const [groups, setGroups] = useState<MaggiGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loggedUser, setLoggedUser] = useState<LoggedUserProfile | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [credito, setCredito] = useState(0);
  const [prazoRuleId, setPrazoRuleId] = useState("");
  const [lanceKey, setLanceKey] = useState<LanceKey>("livre");
  const [lanceLivrePctInput, setLanceLivrePctInput] = useState("20,0000");
  const [usarEmbutido, setUsarEmbutido] = useState(false);
  const [lanceEmbutidoPctInput, setLanceEmbutidoPctInput] =
    useState("25,0000");
  const [parcelaContemplacao, setParcelaContemplacao] = useState(1);

  const [savingSimulation, setSavingSimulation] = useState(false);

  async function loadLoggedUser() {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id ?? null;

    setAuthUserId(uid);

    if (!uid) {
      setLoggedUser(null);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select(
        "id, auth_user_id, nome, email, phone, telefone, avatar_url, role, user_role"
      )
      .eq("auth_user_id", uid)
      .maybeSingle();

    setLoggedUser((profile ?? null) as LoggedUserProfile | null);
  }

  async function loadGroups() {
    setLoadingGroups(true);

    const { data, error } = await supabase
      .from("sim_maggi_groups")
      .select("*")
      .order("segmento", { ascending: true })
      .order("grupo", { ascending: true });

    if (error) {
      console.error("Erro ao carregar grupos Maggi:", error.message);
      setGroups([]);
    } else {
      setGroups((data ?? []) as MaggiGroup[]);
    }

    setLoadingGroups(false);
  }

  async function loadLeads() {
    setLoadingLeads(true);

    const { data, error } = await supabase
      .from("leads")
      .select("id, nome, name, telefone, phone, email, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Erro ao carregar leads:", error.message);
      setLeads([]);
    } else {
      setLeads((data ?? []) as Lead[]);
    }

    setLoadingLeads(false);
  }

  useEffect(() => {
    loadLoggedUser();
    loadGroups();
    loadLeads();
  }, []);

  const configGroups = useMemo(
    () => groups.filter((g) => g.segmento === segmento),
    [groups, segmento]
  );

  const activeGroups = useMemo(
    () => configGroups.filter((g) => g.is_active !== false),
    [configGroups]
  );

  const selectedGroup = useMemo(
    () => activeGroups.find((g) => g.id === selectedGroupId) || null,
    [activeGroups, selectedGroupId]
  );

  const selectedConfig = useMemo(
    () => normalizeConfig(selectedGroup),
    [selectedGroup]
  );

  const activeLanceOptions = useMemo(
    () => selectedConfig.lanceOptions.filter((o) => o.enabled),
    [selectedConfig]
  );

  const selectedFaixa = useMemo(
    () => findCreditRange(selectedGroup, credito),
    [selectedGroup, credito]
  );

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();

    if (!q) return leads.slice(0, 30);

    return leads
      .filter((lead) => {
        const hay = [
          getLeadName(lead),
          getLeadPhone(lead),
          lead.email || "",
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      })
      .slice(0, 30);
  }, [leads, leadSearch]);

  const previewRows = useMemo(() => {
    if (!selectedGroup) return [];

    const cfg = normalizeConfig(selectedGroup);
    const seguroPct = Number(selectedGroup.seguro_pct || 0);

    return cfg.creditRanges.map((range) => ({
      id: range.id,
      label: range.label,
      credito: range.valor,
      parcelas: cfg.prazoRules.map((rule) => ({
        id: rule.id,
        prazo: rule.prazo,
        valor: calcPreviewParcela({
          credito: range.valor,
          prazoRule: rule,
          seguroPct,
          seguroMomento: cfg.seguroMomento,
        }),
      })),
    }));
  }, [selectedGroup]);

  useEffect(() => {
    setSelectedGroupId("");
    setPrazoRuleId("");
    setCredito(0);
    setUsarEmbutido(false);
  }, [segmento]);

  useEffect(() => {
    if (selectedGroup) {
      const cfg = normalizeConfig(selectedGroup);
      setPrazoRuleId(cfg.prazoRules[0]?.id || "");
      setLanceKey(
        (cfg.lanceOptions.find((o) => o.enabled)?.key || "livre") as LanceKey
      );
    }
  }, [selectedGroupId, selectedGroup]);

  useEffect(() => {
    if (
      activeLanceOptions.length &&
      !activeLanceOptions.some((o) => o.key === lanceKey)
    ) {
      setLanceKey(activeLanceOptions[0].key);
    }
  }, [activeLanceOptions, lanceKey]);

  const { result, error: calcError } = useMemo(() => {
    return calcMaggi({
      group: selectedGroup,
      credito,
      prazoRuleId,
      lanceKey,
      lanceLivrePct: parsePercent(lanceLivrePctInput),
      usarEmbutido,
      lanceEmbutidoPct: parsePercent(lanceEmbutidoPctInput),
      parcelaContemplacao,
    });
  }, [
    selectedGroup,
    credito,
    prazoRuleId,
    lanceKey,
    lanceLivrePctInput,
    usarEmbutido,
    lanceEmbutidoPctInput,
    parcelaContemplacao,
  ]);

  const whatsappLink = useMemo(() => {
    return buildWhatsappLink(loggedUser);
  }, [loggedUser]);

  const resumoTexto = useMemo(() => {
    if (!selectedGroup || !result) return "";

    const segmentoLabel = segmento === "imoveis" ? "Imóveis" : "Automóveis";
    const wa = whatsappLink || "https://wa.me/";

    return `🎯 *Simulação Maggi ${segmentoLabel} - Grupo ${selectedGroup.grupo}*

💰 Crédito contratado: ${brMoney(credito)}

💳 Parcela 1: ${brMoney(result.parcela1)}

💵 Demais parcelas até a contemplação: ${brMoney(result.demaisParcelasAntes)}

📈 Após a contemplação (prevista em ${parcelaContemplacao} meses):
🏦 Lance próprio: ${brMoney(result.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(result.creditoLiquido)}

📆 Parcelas restantes (valor): ${brMoney(result.parcelaApos)}

⏳ Prazo restante: ${result.prazoAposContemplacao} meses

Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`;
  }, [
    selectedGroup,
    result,
    segmento,
    credito,
    parcelaContemplacao,
    whatsappLink,
  ]);

  async function copiarResumo() {
    if (!resumoTexto) return;

    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  async function saveSimulation() {
    if (!selectedGroup || !result) {
      alert("Gere uma simulação antes de salvar.");
      return;
    }

    if (!selectedLeadId) {
      alert("Selecione um lead antes de salvar a simulação.");
      return;
    }

    setSavingSimulation(true);

    const payload = {
      lead_id: selectedLeadId,
      user_id: loggedUser?.id ?? null,
      created_by: authUserId,
      administradora: "Maggi",
      admin_name: "Maggi",
      segmento,
      grupo: selectedGroup.grupo,
      group_id: selectedGroup.id,
      credito,
      prazo: result.prazo,
      parcela: result.demaisParcelasAntes,
      parcela_1: result.parcela1,
      parcela_apos: result.parcelaApos,
      lance_ofertado_pct: result.percentualLanceTotal,
      lance_embutido_pct: result.lanceEmbutidoFinalPct,
      lance_ofertado_valor: result.lanceOfertadoValor,
      lance_embutido_valor: result.lanceEmbutidoValor,
      lance_proprio_valor: result.lanceProprioValor,
      credito_liquido: result.creditoLiquido,
      prazo_apos: result.prazoAposContemplacao,
      resultado_json: {
        source: "MaggiSimulator",
        selectedLead,
        selectedGroup,
        selectedConfig,
        input: {
          segmento,
          credito,
          prazoRuleId,
          lanceKey,
          lanceLivrePctInput,
          usarEmbutido,
          lanceEmbutidoPctInput,
          parcelaContemplacao,
        },
        result,
        resumoTexto,
        vendedor: {
          id: loggedUser?.id ?? null,
          auth_user_id: authUserId,
          nome: getUserName(loggedUser),
          telefone: getUserPhone(loggedUser),
        },
        created_at: new Date().toISOString(),
      },
    };

    const attempts = [
      payload,
      {
        lead_id: payload.lead_id,
        administradora: payload.administradora,
        segmento: payload.segmento,
        credito: payload.credito,
        prazo: payload.prazo,
        parcela: payload.parcela,
        resultado_json: payload.resultado_json,
        created_by: payload.created_by,
      },
      {
        lead_id: payload.lead_id,
        segmento: payload.segmento,
        credito: payload.credito,
        prazo: payload.prazo,
        resultado: payload.resultado_json,
      },
    ];

    let lastError: any = null;

    for (const item of attempts) {
      const { error } = await supabase.from("sim_simulations").insert(item);

      if (!error) {
        setSavingSimulation(false);
        alert("Simulação salva com sucesso!");
        return;
      }

      lastError = error;
    }

    setSavingSimulation(false);
    alert(
      `Não foi possível salvar a simulação. Verifique as colunas da tabela sim_simulations. Erro: ${
        lastError?.message || "erro desconhecido"
      }`
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[28px] border p-6 shadow-sm md:p-8"
        style={{
          background:
            "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))",
          borderColor: "rgba(255,255,255,.22)",
        }}
      >
        <div
          className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl"
          style={{ background: "rgba(181,165,115,.28)" }}
        />

        <div className="relative z-[1] flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Calculator className="h-3.5 w-3.5" />
              Simulador Maggi
            </div>

            <h1 className="text-2xl font-black tracking-tight md:text-4xl">
              Estratégia por grupo e modalidade de lance
            </h1>

            <p className="mt-3 text-sm text-white/82 md:text-base">
              Escolha o lead, selecione o grupo Maggi e configure a estratégia
              para visualizar o resultado projetado.
            </p>
          </div>

          <Button
            className="h-11 rounded-2xl bg-white text-slate-900 hover:bg-white/90"
            onClick={() => setConfigOpen(true)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Configurar grupos
          </Button>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base" style={{ color: C.navy }}>
            Bem desejado
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {segmentos.map((item) => {
              const Icon = item.icon;
              const active = segmento === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSegmento(item.key)}
                  className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border transition hover:-translate-y-0.5"
                  style={{
                    borderColor: active ? C.ruby : "rgba(161,28,39,.55)",
                    background: active ? "rgba(161,28,39,.08)" : "#fff",
                    color: C.ruby,
                    boxShadow: active
                      ? "0 10px 24px rgba(161,28,39,.16)"
                      : "none",
                  }}
                >
                  <Icon className="h-8 w-8" />
                  <span className="text-xs font-black uppercase">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_.95fr]">
        <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
          <CardHeader>
            <SectionTitle
              icon={Settings}
              title="Configuração da simulação"
              subtitle="Selecione lead, grupo, prazo, crédito, seguro e lance permitido."
            />
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-3xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserRound className="h-4 w-4" style={{ color: C.ruby }} />
                <div>
                  <div className="font-black" style={{ color: C.navy }}>
                    Lead / Cliente
                  </div>
                  <div className="text-xs text-slate-500">
                    Selecione o lead para vincular e salvar a simulação.
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder={
                    loadingLeads
                      ? "Carregando leads..."
                      : "Buscar por nome, telefone ou e-mail"
                  }
                />
              </div>

              <div className="mt-3 max-h-52 overflow-y-auto rounded-2xl border">
                {filteredLeads.map((lead) => {
                  const active = selectedLeadId === lead.id;

                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50"
                      style={{
                        background: active ? "rgba(161,28,39,.06)" : undefined,
                      }}
                    >
                      <div>
                        <div className="font-bold" style={{ color: C.navy }}>
                          {getLeadName(lead)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {getLeadPhone(lead) || lead.email || "Sem contato"}
                        </div>
                      </div>

                      {active && (
                        <CheckCircle2
                          className="h-4 w-4"
                          style={{ color: C.ruby }}
                        />
                      )}
                    </button>
                  );
                })}

                {!loadingLeads && filteredLeads.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">
                    Nenhum lead encontrado.
                  </div>
                )}
              </div>

              {selectedLead && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  Lead selecionado:{" "}
                  <strong style={{ color: C.navy }}>
                    {getLeadName(selectedLead)}
                  </strong>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Grupo Maggi</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={loadingGroups}
                >
                  <option value="">
                    {loadingGroups ? "Carregando grupos..." : "Selecione o grupo"}
                  </option>
                  {activeGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Grupo {g.grupo} {g.nome_grupo ? `• ${g.nome_grupo}` : ""}
                    </option>
                  ))}
                </select>

                {!loadingGroups && activeGroups.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Nenhum grupo ativo cadastrado para este segmento.
                  </p>
                )}
              </div>

              <div>
                <Label>Faixa de prazo / taxa</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={prazoRuleId}
                  onChange={(e) => setPrazoRuleId(e.target.value)}
                  disabled={!selectedGroup}
                >
                  <option value="">Selecione o prazo</option>
                  {selectedConfig.prazoRules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.prazo} meses • Adm {pctHuman(r.taxaAdmPct)} • FR{" "}
                      {pctHuman(r.fundoReservaPct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Valor do crédito</Label>
                <Input
                  value={formatMoneyInput(credito)}
                  inputMode="numeric"
                  onChange={(e) => setCredito(parseMoney(e.target.value))}
                />
                {selectedFaixa && (
                  <p className="mt-1 text-xs text-slate-500">
                    Faixa referência: {selectedFaixa.label} •{" "}
                    {brMoney(selectedFaixa.valor)}
                  </p>
                )}
              </div>

              <div>
                <Label>Contemplação prevista na parcela</Label>
                <Input
                  type="number"
                  value={parcelaContemplacao}
                  onChange={(e) =>
                    setParcelaContemplacao(
                      Math.max(1, Number(e.target.value || 1))
                    )
                  }
                />
              </div>

              <div>
                <Label>Lance permitido</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={lanceKey}
                  onChange={(e) => setLanceKey(e.target.value as LanceKey)}
                  disabled={!selectedGroup}
                >
                  {activeLanceOptions.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.nomeComercial || LANCE_LABELS[m.key]}{" "}
                      {m.key !== "livre" ? `• ${pctHuman(m.pct)}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {lanceKey === "livre" && (
                <div>
                  <Label>% do lance ofertado</Label>
                  <Input
                    value={lanceLivrePctInput}
                    onChange={(e) => setLanceLivrePctInput(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    O lance ofertado será calculado sobre crédito + taxas.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border p-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={usarEmbutido}
                  onChange={(e) => setUsarEmbutido(e.target.checked)}
                  disabled={!selectedGroup}
                />
                Usar lance embutido
              </label>

              <p className="mt-1 text-xs text-slate-500">
                O lance embutido compõe o lance ofertado, não soma por fora.
              </p>

              {usarEmbutido && (
                <div className="mt-3 max-w-sm">
                  <Label>% do lance embutido</Label>
                  <Input
                    value={lanceEmbutidoPctInput}
                    onChange={(e) => setLanceEmbutidoPctInput(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Máximo permitido:{" "}
                    {pctHuman(selectedConfig.maxLanceEmbutidoPct)}
                  </p>
                </div>
              )}
            </div>

            {selectedGroup && (
              <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
                <div className="font-black" style={{ color: C.navy }}>
                  Grupo {selectedGroup.grupo}
                </div>
                <div className="mt-1">
                  Perfil: {selectedGroup.perfil_grupo || "—"}
                </div>
                <div className="mt-1">
                  Base dos lances: <strong>Crédito + taxas</strong>
                </div>
                <div className="mt-1">
                  Seguro:{" "}
                  <strong>
                    {selectedConfig.seguroMomento === "contratacao"
                      ? "na contratação"
                      : "na contemplação"}
                  </strong>
                </div>
                {selectedConfig.firstParcelRule.enabled && (
                  <div className="mt-1">
                    1ª parcela: <strong>diferenciada</strong>
                  </div>
                )}
                {selectedGroup.observacoes && (
                  <div className="mt-2 text-xs">
                    Obs.: {selectedGroup.observacoes}
                  </div>
                )}
              </div>
            )}

            {selectedGroup && previewRows.length > 0 && (
              <div className="rounded-3xl border bg-white p-4">
                <div className="mb-3">
                  <h3 className="font-black" style={{ color: C.navy }}>
                    Tabela prévia das faixas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simulação inicial por crédito e prazo cadastrado no grupo.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-[1] rounded-l-2xl bg-slate-100 px-3 py-3 text-left text-xs font-black uppercase text-slate-600">
                          Crédito
                        </th>
                        {selectedConfig.prazoRules.map((rule, idx) => (
                          <th
                            key={rule.id}
                            className={`bg-slate-100 px-3 py-3 text-left text-xs font-black uppercase text-slate-600 ${
                              idx === selectedConfig.prazoRules.length - 1
                                ? "rounded-r-2xl"
                                : ""
                            }`}
                          >
                            {rule.prazo} meses
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={row.id}>
                          <td className="sticky left-0 z-[1] border-b bg-white px-3 py-3 font-black text-slate-700">
                            <button
                              type="button"
                              className="text-left hover:underline"
                              style={{ color: C.ruby }}
                              onClick={() => setCredito(row.credito)}
                            >
                              {brMoney(row.credito)}
                            </button>
                            <div className="text-xs font-normal text-slate-400">
                              {row.label}
                            </div>
                          </td>

                          {row.parcelas.map((p) => (
                            <td
                              key={p.id}
                              className="border-b px-3 py-3 font-semibold text-slate-700"
                            >
                              {brMoney(p.valor)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Clique no crédito para preencher automaticamente o valor da
                  simulação.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
          <CardHeader>
            <SectionTitle
              icon={TrendingUp}
              title="Resultado da simulação"
              subtitle="Cards calculados com base no perfil do grupo."
            />
          </CardHeader>

          <CardContent>
            {calcError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4" />
                  Atenção
                </div>
                <p className="mt-1">{calcError}</p>
              </div>
            )}

            {!result ? (
              <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">
                Selecione um lead, grupo, prazo e informe o valor do crédito
                para gerar a simulação.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    title="Crédito contratado"
                    value={brMoney(credito)}
                  />
                  <MetricCard
                    title="Parcela 1"
                    value={brMoney(result.parcela1)}
                    hint={
                      result.adicionalPrimeiraParcela > 0
                        ? `Inclui adicional de ${brMoney(
                            result.adicionalPrimeiraParcela
                          )}`
                        : "Sem adicional configurado."
                    }
                  />
                  <MetricCard
                    title="Demais até contemplar"
                    value={brMoney(result.demaisParcelasAntes)}
                    hint={`Até a parcela ${parcelaContemplacao}`}
                  />
                  <MetricCard
                    title="Lance próprio"
                    value={brMoney(result.lanceProprioValor)}
                    hint={pctHuman(result.lanceProprioPct)}
                  />
                  <MetricCard
                    title="Crédito líquido"
                    value={brMoney(result.creditoLiquido)}
                    hint="Após lance embutido, se houver."
                  />
                  <MetricCard
                    title="Parcela após"
                    value={brMoney(result.parcelaApos)}
                    hint={`${result.prazoAposContemplacao} meses estimados`}
                  />
                  <MetricCard
                    title="Lance ofertado"
                    value={brMoney(result.lanceOfertadoValor)}
                    hint={pctHuman(result.percentualLanceTotal)}
                  />
                  <MetricCard
                    title="Lance embutido"
                    value={brMoney(result.lanceEmbutidoValor)}
                    hint={pctHuman(result.lanceEmbutidoFinalPct)}
                  />
                </div>

                <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div
                    className="flex items-center gap-2 font-black"
                    style={{ color: C.navy }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Prévia do texto para WhatsApp
                  </div>

                  <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-relaxed text-slate-700">
                    {resumoTexto}
                  </pre>
                </div>

                <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div
                    className="flex items-center gap-2 font-black"
                    style={{ color: C.navy }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Memória de cálculo
                  </div>

                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">
                        Saldo devedor inicial
                      </div>
                      <div className="mt-1 text-base font-black text-slate-800">
                        {brMoney(result.saldoDevedorInicial)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">
                        Parcelas pagas até contemplação
                      </div>
                      <div className="mt-1 text-base font-black text-slate-800">
                        {brMoney(result.totalPagoAteContemplacao)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">
                        Saldo após lance
                      </div>
                      <div className="mt-1 text-base font-black text-slate-800">
                        {brMoney(result.saldoDevedorProjetado)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">
                        Seguro mensal
                      </div>
                      <div className="mt-1 text-base font-black text-slate-800">
                        {brMoney(result.seguroMensal)}
                      </div>
                    </div>
                  </div>

                  {selectedGroup?.regra_pos_contemplacao === "custom" && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <div className="font-black">
                        Regra customizada aplicada
                      </div>
                      <div className="mt-1">
                        Parcelas amortizadas pelo LE:{" "}
                        <strong>{result.parcelasAmortizadasPorLE}</strong>
                      </div>
                      <div className="mt-1">
                        Parcelas amortizadas pelo LL:{" "}
                        <strong>{result.parcelasAmortizadasPorLL}</strong>
                      </div>
                      <div className="mt-1">
                        Novo prazo estimado:{" "}
                        <strong>{result.prazoAposContemplacao} meses</strong>
                      </div>
                    </div>
                  )}
                </div>

                {!whatsappLink && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Não encontrei telefone no usuário logado. O link do
                    WhatsApp ficará incompleto até preencher o campo{" "}
                    <strong>phone</strong> ou <strong>telefone</strong> em{" "}
                    <strong>users</strong>.
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    className="h-10 rounded-2xl"
                    onClick={copiarResumo}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar WhatsApp
                  </Button>

                  <Button
                    className="h-10 rounded-2xl"
                    onClick={saveSimulation}
                    disabled={savingSimulation || !selectedLeadId || !result}
                    style={{ background: C.ruby }}
                  >
                    {savingSimulation ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Simulação
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfigGroupsOverlay
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        segmento={segmento}
        groups={configGroups}
        onReload={loadGroups}
      />
    </div>
  );
}
