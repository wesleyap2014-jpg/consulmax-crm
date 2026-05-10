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
  Copy,
  Home,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
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

type SeguroTiming = "none" | "contratacao" | "contemplacao";

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

type MaggiConfig = {
  creditRanges: CreditRange[];
  prazoRules: PrazoRule[];
  lanceOptions: LanceOption[];
  maxLanceEmbutidoPct: number;
  seguroTiming: SeguroTiming;
  customRule: CustomRule;
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
  seguroTiming: SeguroTiming;
  regra_pos_contemplacao: RegraPos;
  custom_rule_notes: string;
  custom_le_prazo_pct: string;
  custom_le_parcela_pct: string;
  custom_ll_prazo_pct: string;
  custom_ll_parcela_pct: string;
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

function normalizeConfig(group?: Partial<MaggiGroup> | null): MaggiConfig {
  const raw = (group?.config || {}) as Record<string, any>;

  const rawRanges = Array.isArray(raw.creditRanges) ? raw.creditRanges : [];
  const rawPrazoRules = Array.isArray(raw.prazoRules) ? raw.prazoRules : [];
  const rawLances = Array.isArray(raw.lanceOptions) ? raw.lanceOptions : [];

  const legacyMin = Number(group?.credito_min || 0);
  const legacyMax = Number(group?.credito_max || 0);
  const legacyPrazo = Number(
    group?.prazo_original || group?.prazo_restante || 0
  );

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
      enabled:
        typeof saved?.enabled === "boolean" ? saved.enabled : base.enabled,
      nomeComercial: String(saved?.nomeComercial || base.nomeComercial),
      pct: Number(saved?.pct || base.pct || 0),
    };
  });

  const rawCustom = raw.customRule || {};

  return {
    creditRanges,
    prazoRules,
    lanceOptions,
    maxLanceEmbutidoPct: Number(
      raw.maxLanceEmbutidoPct ?? group?.lance_embutido_max_pct ?? 0.25
    ),
    seguroTiming: (raw.seguroTiming || "none") as SeguroTiming,
    customRule: {
      lePrazoPct: Number(rawCustom.lePrazoPct ?? DEFAULT_CUSTOM_RULE.lePrazoPct),
      leParcelaPct: Number(
        rawCustom.leParcelaPct ?? DEFAULT_CUSTOM_RULE.leParcelaPct
      ),
      llPrazoPct: Number(rawCustom.llPrazoPct ?? DEFAULT_CUSTOM_RULE.llPrazoPct),
      llParcelaPct: Number(
        rawCustom.llParcelaPct ?? DEFAULT_CUSTOM_RULE.llParcelaPct
      ),
    },
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
    seguroTiming: "none",
    regra_pos_contemplacao: "saldo_devedor_prazo_restante",
    custom_rule_notes: "",
    custom_le_prazo_pct: "100,0000",
    custom_le_parcela_pct: "0,0000",
    custom_ll_prazo_pct: "50,0000",
    custom_ll_parcela_pct: "50,0000",
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
    seguroTiming: config.seguroTiming,
    regra_pos_contemplacao:
      (group.regra_pos_contemplacao as RegraPos) ||
      "saldo_devedor_prazo_restante",
    custom_rule_notes: config.customRuleNotes || "",
    custom_le_prazo_pct: formatPercentInput(config.customRule.lePrazoPct),
    custom_le_parcela_pct: formatPercentInput(config.customRule.leParcelaPct),
    custom_ll_prazo_pct: formatPercentInput(config.customRule.llPrazoPct),
    custom_ll_parcela_pct: formatPercentInput(config.customRule.llParcelaPct),
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
    .sort((a, b) => b.prazo - a.prazo);

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
      seguroTiming: form.seguroTiming,
      customRule: {
        lePrazoPct: parsePercent(form.custom_le_prazo_pct),
        leParcelaPct: parsePercent(form.custom_le_parcela_pct),
        llPrazoPct: parsePercent(form.custom_ll_prazo_pct),
        llParcelaPct: parsePercent(form.custom_ll_parcela_pct),
      },
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
  return (
    cfg.prazoRules.find((r) => r.id === prazoRuleId) ||
    cfg.prazoRules[0] ||
    null
  );
}

function findLanceOption(
  group: MaggiGroup | null,
  lanceKey: LanceKey
): LanceOption | null {
  if (!group) return null;

  const cfg = normalizeConfig(group);
  return cfg.lanceOptions.find((l) => l.key === lanceKey && l.enabled) || null;
}

function findCreditRange(
  group: MaggiGroup | null,
  credito: number
): CreditRange | null {
  if (!group || !credito) return null;

  const ranges = normalizeConfig(group).creditRanges;
  if (!ranges.length) return null;

  const ordered = [...ranges].sort((a, b) => a.valor - b.valor);
  return (
    ordered.find((r) => credito <= r.valor) || ordered[ordered.length - 1] || null
  );
}

function calcPreviewParcela(
  credito: number,
  prazoRule: PrazoRule,
  seguroPct: number,
  seguroTiming: SeguroTiming
) {
  const valorCategoria =
    credito * (1 + prazoRule.taxaAdmPct + prazoRule.fundoReservaPct);

  const parcelaBase = valorCategoria / Math.max(1, prazoRule.prazo);
  const seguro = seguroTiming === "contratacao" ? valorCategoria * seguroPct : 0;

  return parcelaBase + seguro;
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
  const seguroTiming = cfg.seguroTiming;

  const prazo = Math.max(1, Number(prazoRule.prazo || 1));
  const parcelaContempl = Math.max(1, Number(parcelaContemplacao || 1));
  const prazoAposContemplacao = Math.max(1, prazo - parcelaContempl);

  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);

  // Base de cálculo dos lances: Crédito + Taxas.
  const baseLance = valorCategoria;

  const seguroMensal = valorCategoria * seguroPct;

  const parcelaBase = valorCategoria / prazo;

  const parcelaAntes =
    parcelaBase + (seguroTiming === "contratacao" ? seguroMensal : 0);

  const totalPagoAteContemplacao = parcelaBase * parcelaContempl;

  const seguroDepois =
    seguroTiming === "contratacao" || seguroTiming === "contemplacao"
      ? seguroMensal
      : 0;

  const maxEmbutidoPct = Number(cfg.maxLanceEmbutidoPct || 0);

  const lanceProprioPct =
    lanceKey === "livre"
      ? Math.max(0, lanceLivrePct)
      : Number(lanceOption.pct || 0);

  let lanceEmbutidoFinalPct = 0;

  // Agora qualquer lance permitido pode usar lance embutido.
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

  const lanceLivreValor = baseLance * lanceProprioPct;
  const lanceEmbutidoValor = baseLance * lanceEmbutidoFinalPct;
  const lanceOfertadoValor = lanceLivreValor + lanceEmbutidoValor;

  const creditoLiquido = Math.max(0, credito - lanceEmbutidoValor);

  const saldoDevedorProjetado = Math.max(
    0,
    valorCategoria - totalPagoAteContemplacao - lanceOfertadoValor
  );

  let parcelaApos =
    saldoDevedorProjetado / prazoAposContemplacao + seguroDepois;

  let prazoFinal = prazoAposContemplacao;

  let parcelasAmortizadasLE = 0;
  let parcelasAmortizadasLL = 0;

  if (group.regra_pos_contemplacao === "mantem_parcela_reduz_prazo") {
    const parcelaReferencia = Math.max(1, parcelaAntes - seguroMensal);

    prazoFinal = Math.max(
      1,
      Math.ceil(saldoDevedorProjetado / parcelaReferencia)
    );

    parcelaApos = parcelaReferencia + seguroDepois;
  }

  if (group.regra_pos_contemplacao === "custom") {
    const parcelaReferencia = Math.max(1, parcelaBase);

    const valorLEPrazo = lanceEmbutidoValor * cfg.customRule.lePrazoPct;
    const valorLLPrazo = lanceLivreValor * cfg.customRule.llPrazoPct;

    parcelasAmortizadasLE = Math.round(valorLEPrazo / parcelaReferencia);
    parcelasAmortizadasLL = Math.round(valorLLPrazo / parcelaReferencia);

    prazoFinal = Math.max(
      1,
      prazoAposContemplacao - parcelasAmortizadasLE - parcelasAmortizadasLL
    );

    parcelaApos = saldoDevedorProjetado / prazoFinal + seguroDepois;
  }

  return {
    error: "",
    result: {
      prazo,
      taxaAdm,
      fundoReserva,
      valorCategoria,
      baseLance,
      parcelaAntes,
      totalPagoAteContemplacao,
      lanceLivreValor,
      lanceEmbutidoValor,
      lanceOfertadoValor,
      creditoLiquido,
      saldoDevedorProjetado,
      parcelaApos,
      prazoAposContemplacao: prazoFinal,
      percentualLanceTotal: baseLance > 0 ? lanceOfertadoValor / baseLance : 0,
      lanceNome: lanceOption.nomeComercial || LANCE_LABELS[lanceOption.key],
      lanceProprioPct,
      lanceEmbutidoFinalPct,
      parcelasAmortizadasLE,
      parcelasAmortizadasLL,
      seguroMensal,
      seguroTiming,
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
              Cadastre faixas, prazos, lances e regras específicas por grupo.
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
                      g.is_active === false
                        ? "bg-slate-50 opacity-75"
                        : "bg-white"
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
                          {cfg.prazoRules.length} prazo(s)
                        </div>
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
                  value={form.seguroTiming}
                  onChange={(e) =>
                    update("seguroTiming", e.target.value as SeguroTiming)
                  }
                >
                  <option value="none">Não usar seguro</option>
                  <option value="contratacao">Na contratação</option>
                  <option value="contemplacao">Na contemplação</option>
                </select>
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

              <div className="md:col-span-2 rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black" style={{ color: C.navy }}>
                      Faixas de crédito
                    </h4>
                    <p className="text-xs text-slate-500">
                      Adicione quantas faixas forem necessárias para o grupo.
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
                  percentual.
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

              {form.regra_pos_contemplacao === "custom" && (
                <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    Regra customizada
                  </div>

                  <p className="mt-1 text-xs">
                    Configure como o Lance Embutido e o Lance Livre/Recurso
                    Próprio serão usados para abater prazo e/ou valor das
                    parcelas.
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>% do LE que abaterá no prazo</Label>
                      <Input
                        value={form.custom_le_prazo_pct}
                        onChange={(e) =>
                          update("custom_le_prazo_pct", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <Label>% do LE que abaterá no valor das parcelas</Label>
                      <Input
                        value={form.custom_le_parcela_pct}
                        onChange={(e) =>
                          update("custom_le_parcela_pct", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <Label>% do LL que abaterá no prazo</Label>
                      <Input
                        value={form.custom_ll_prazo_pct}
                        onChange={(e) =>
                          update("custom_ll_prazo_pct", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <Label>% do LL que abaterá no valor das parcelas</Label>
                      <Input
                        value={form.custom_ll_parcela_pct}
                        onChange={(e) =>
                          update("custom_ll_parcela_pct", e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <textarea
                    className="mt-3 min-h-[80px] w-full rounded-md border bg-white p-3 text-sm"
                    value={form.custom_rule_notes}
                    onChange={(e) =>
                      update("custom_rule_notes", e.target.value)
                    }
                    placeholder="Observações sobre a regra customizada deste grupo..."
                  />
                </div>
              )}

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
