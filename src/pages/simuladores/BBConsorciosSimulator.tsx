// src/pages/simuladores/BBConsorciosSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  AlertTriangle,
  Building2,
  Calculator,
  Car,
  CheckCircle2,
  Copy,
  Download,
  Home,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";

type SegmentoBB = "auto_ipca" | "auto_fipe" | "pesados" | "imoveis" | "outros_bens";
type LanceKey = "livre" | "primeiro_fixo" | "segundo_fixo" | "limitado" | "fidelidade";
type RegraPos = "saldo_devedor_prazo_restante" | "mantem_parcela_reduz_prazo";

type CreditRange = { id: string; label: string; valor: number };
type PrazoRule = { id: string; prazo: number; taxaAdmPct: number; fundoReservaPct: number };
type LanceOption = { key: LanceKey; enabled: boolean; nomeComercial: string; pct: number };

type BBConfig = {
  creditRanges: CreditRange[];
  prazoRules: PrazoRule[];
  lanceOptions: LanceOption[];
  maxLanceEmbutidoPct: number;
  regraPosContemplacao: RegraPos;
  observacoesRegra?: string;
  proximaAssembleia?: string | null;
  nextAssemblyDate?: string | null;
  next_assembly_date?: string | null;
  assemblyResult?: Record<string, any> | null;
};

type BBGroup = {
  id: string;
  grupo: string;
  segmento: SegmentoBB;
  nome_grupo: string | null;
  observacoes: string | null;
  credito_min: number | null;
  credito_max: number | null;
  prazo_min: number | null;
  prazo_max: number | null;
  taxa_adm_pct: number | null;
  fundo_reserva_pct: number | null;
  seguro_pct: number | null;
  permite_lance_livre: boolean | null;
  permite_lance_embutido: boolean | null;
  lance_embutido_max_pct: number | null;
  permite_fixo_25: boolean | null;
  permite_fixo_50: boolean | null;
  config: BBConfig | Record<string, any> | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  proxima_assembleia?: string | null;
  data_proxima_assembleia?: string | null;
  next_assembly_date?: string | null;
  nextAssemblyDate?: string | null;
  [key: string]: any;
};

type GroupForm = {
  grupo: string;
  segmento: SegmentoBB;
  nome_grupo: string;
  observacoes: string;
  seguro_pct: string;
  is_active: boolean;
  permite_lance_embutido: boolean;
  regra_pos_contemplacao: RegraPos;
  observacoesRegra: string;
  creditRanges: { id: string; label: string; valor: string }[];
  prazoRules: { id: string; prazo: string; taxaAdmPct: string; fundoReservaPct: string }[];
  lanceOptions: { key: LanceKey; enabled: boolean; nomeComercial: string; pct: string }[];
  maxLanceEmbutidoPct: string;
};

type Lead = { id: string; nome: string; telefone: string | null; email: string | null; owner_id: string | null };

type LoggedUserProfile = {
  id: string;
  auth_user_id?: string | null;
  nome?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  telefone?: string | null;
  role?: string | null;
  user_role?: string | null;
};

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573", lightGold: "#E0CE8C", off: "#F5F5F5" };

const segmentos = [
  { key: "auto_ipca" as const, label: "Auto IPCA", statusLabel: "Automóvel", icon: Car },
  { key: "auto_fipe" as const, label: "Auto FIPE", statusLabel: "Automóvel", icon: ShieldCheck },
  { key: "pesados" as const, label: "Pesados", statusLabel: "Pesados", icon: Truck },
  { key: "imoveis" as const, label: "Imóveis", statusLabel: "Imóvel", icon: Home },
  { key: "outros_bens" as const, label: "Outros Bens", statusLabel: "Serviços e bens", icon: PackageCheck },
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
  { key: "primeiro_fixo", enabled: false, nomeComercial: "1º Lance Fixo", pct: 0 },
  { key: "segundo_fixo", enabled: false, nomeComercial: "2º Lance Fixo", pct: 0 },
  { key: "limitado", enabled: false, nomeComercial: "Lance Limitado", pct: 0 },
  { key: "fidelidade", enabled: false, nomeComercial: "Lance Fidelidade", pct: 0 },
];

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function brMoney(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
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
  const clean = (value || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function formatPercentInput(decimal?: number | null) {
  return ((Number(decimal || 0) * 100).toFixed(4)).replace(".", ",");
}

function pctHuman(decimal?: number | null, digits = 2) {
  return `${(Number(decimal || 0) * 100).toFixed(digits).replace(".", ",")}%`;
}

function numberFrom(value: string) {
  const clean = String(value || "").replace(/\D/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getUserPhone(user?: LoggedUserProfile | null) {
  return onlyDigits(user?.phone || user?.telefone || "");
}

function buildWhatsappLink(user?: LoggedUserProfile | null) {
  const phone = getUserPhone(user);
  return phone ? `https://wa.me/${phone}` : "";
}

function getSegmentoLabel(segmento?: string | null) {
  return segmentos.find((s) => s.key === segmento)?.label || segmento || "—";
}

function getStatusSegmentoLabel(segmento?: string | null) {
  return segmentos.find((s) => s.key === segmento)?.statusLabel || getSegmentoLabel(segmento);
}

function brDate(value?: string | null) {
  if (!value) return "A definir";
  const raw = String(value).trim();
  if (!raw) return "A definir";
  const match = raw.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (match) return match[1];
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("pt-BR");
  return raw;
}

function normalizeConfig(group?: BBGroup | null): BBConfig {
  const raw = (group?.config || {}) as Partial<BBConfig> & Record<string, any>;
  const legacyRanges: CreditRange[] = [];
  const min = Number(group?.credito_min || 0);
  const max = Number(group?.credito_max || 0);

  if (Array.isArray(raw.creditRanges) && raw.creditRanges.length) {
    legacyRanges.push(
      ...raw.creditRanges.map((r: any) => ({
        id: String(r.id || makeId("cred")),
        label: String(r.label || brMoney(Number(r.valor || 0))),
        valor: Number(r.valor || 0),
      }))
    );
  } else {
    if (min > 0) legacyRanges.push({ id: "legacy_min", label: brMoney(min), valor: min });
    if (max > 0 && max !== min) legacyRanges.push({ id: "legacy_max", label: brMoney(max), valor: max });
  }

  const prazoRules: PrazoRule[] = Array.isArray(raw.prazoRules) && raw.prazoRules.length
    ? raw.prazoRules.map((r: any) => ({
        id: String(r.id || makeId("prazo")),
        prazo: Number(r.prazo || 1),
        taxaAdmPct: Number(r.taxaAdmPct ?? group?.taxa_adm_pct ?? 0),
        fundoReservaPct: Number(r.fundoReservaPct ?? group?.fundo_reserva_pct ?? 0),
      }))
    : [
        {
          id: "legacy_prazo",
          prazo: Number(group?.prazo_max || group?.prazo_min || 80),
          taxaAdmPct: Number(group?.taxa_adm_pct || 0),
          fundoReservaPct: Number(group?.fundo_reserva_pct || 0),
        },
      ];

  const byKey = new Map<LanceKey, LanceOption>();
  DEFAULT_LANCES.forEach((l) => byKey.set(l.key, { ...l }));

  if (Array.isArray(raw.lanceOptions)) {
    raw.lanceOptions.forEach((l: any) => {
      if (l?.key && byKey.has(l.key)) {
        byKey.set(l.key, {
          key: l.key,
          enabled: l.enabled !== false,
          nomeComercial: String(l.nomeComercial || LANCE_LABELS[l.key as LanceKey]),
          pct: Number(l.pct || 0),
        });
      }
    });
  } else {
    byKey.set("livre", { key: "livre", enabled: group?.permite_lance_livre !== false, nomeComercial: "Lance Livre", pct: 0 });
    byKey.set("primeiro_fixo", { key: "primeiro_fixo", enabled: group?.permite_fixo_25 !== false, nomeComercial: "Fixo 25%", pct: 0.25 });
    byKey.set("segundo_fixo", { key: "segundo_fixo", enabled: group?.permite_fixo_50 !== false, nomeComercial: "Fixo 50%", pct: 0.5 });
  }

  return {
    creditRanges: legacyRanges.filter((r) => Number(r.valor || 0) > 0),
    prazoRules: prazoRules.filter((r) => Number(r.prazo || 0) > 0),
    lanceOptions: Array.from(byKey.values()),
    maxLanceEmbutidoPct: Number(raw.maxLanceEmbutidoPct ?? group?.lance_embutido_max_pct ?? 0.25),
    regraPosContemplacao: (raw.regraPosContemplacao as RegraPos) || "saldo_devedor_prazo_restante",
    observacoesRegra: String(raw.observacoesRegra || ""),
    proximaAssembleia: raw.proximaAssembleia || null,
    nextAssemblyDate: raw.nextAssemblyDate || null,
    next_assembly_date: raw.next_assembly_date || null,
    assemblyResult: raw.assemblyResult || null,
  };
}

function groupNextAssembly(group?: BBGroup | null) {
  const cfg = normalizeConfig(group);
  const assembly = cfg.assemblyResult && typeof cfg.assemblyResult === "object" ? cfg.assemblyResult : {};
  const raw =
    group?.proxima_assembleia ||
    group?.data_proxima_assembleia ||
    group?.next_assembly_date ||
    group?.nextAssemblyDate ||
    cfg.proximaAssembleia ||
    cfg.nextAssemblyDate ||
    cfg.next_assembly_date ||
    assembly.proximaAssembleia ||
    assembly.nextAssemblyDate ||
    assembly.next_assembly_date;
  if (raw) return String(raw);
  const text = `${group?.observacoes || ""} ${cfg.observacoesRegra || ""}`;
  const match = text.match(/(?:prox\.?|proxima|próxima)\s*(?:assem\.?|assembleia)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  return match?.[1] || null;
}

function defaultForm(segmento: SegmentoBB): GroupForm {
  return {
    grupo: "",
    segmento,
    nome_grupo: "",
    observacoes: "",
    seguro_pct: "0,0000",
    regra_pos_contemplacao: "saldo_devedor_prazo_restante",
    observacoesRegra: "",
    is_active: true,
    permite_lance_embutido: false,
    creditRanges: [{ id: makeId("cred"), label: "Faixa 1", valor: formatMoneyInput(0) }],
    prazoRules: [{ id: makeId("prazo"), prazo: "80", taxaAdmPct: "0,0000", fundoReservaPct: "0,0000" }],
    lanceOptions: DEFAULT_LANCES.map((l) => ({ ...l, pct: formatPercentInput(l.pct) })),
    maxLanceEmbutidoPct: "0,0000",
  };
}

function formFromGroup(group: BBGroup): GroupForm {
  const cfg = normalizeConfig(group);
  return {
    grupo: group.grupo || "",
    segmento: group.segmento || "auto_ipca",
    nome_grupo: group.nome_grupo || "",
    observacoes: group.observacoes || "",
    seguro_pct: formatPercentInput(group.seguro_pct),
    regra_pos_contemplacao: cfg.regraPosContemplacao,
    observacoesRegra: cfg.observacoesRegra || "",
    is_active: group.is_active !== false,
    permite_lance_embutido: group.permite_lance_embutido === true,
    creditRanges: cfg.creditRanges.length
      ? cfg.creditRanges.map((r) => ({ id: r.id, label: r.label, valor: formatMoneyInput(r.valor) }))
      : [{ id: makeId("cred"), label: "Faixa 1", valor: formatMoneyInput(0) }],
    prazoRules: cfg.prazoRules.length
      ? cfg.prazoRules.map((r) => ({ id: r.id, prazo: String(r.prazo || 1), taxaAdmPct: formatPercentInput(r.taxaAdmPct), fundoReservaPct: formatPercentInput(r.fundoReservaPct) }))
      : [{ id: makeId("prazo"), prazo: "80", taxaAdmPct: "0,0000", fundoReservaPct: "0,0000" }],
    lanceOptions: cfg.lanceOptions.map((l) => ({ key: l.key, enabled: l.enabled !== false, nomeComercial: l.nomeComercial || LANCE_LABELS[l.key], pct: formatPercentInput(l.pct) })),
    maxLanceEmbutidoPct: formatPercentInput(cfg.maxLanceEmbutidoPct),
  };
}

function payloadFromForm(form: GroupForm) {
  const creditRanges = form.creditRanges
    .map((r) => ({ id: r.id || makeId("cred"), label: r.label.trim() || formatMoneyInput(parseMoney(r.valor)), valor: parseMoney(r.valor) }))
    .filter((r) => r.valor > 0);

  const prazoRules = form.prazoRules
    .map((r) => ({ id: r.id || makeId("prazo"), prazo: Math.max(1, numberFrom(r.prazo)), taxaAdmPct: parsePercent(r.taxaAdmPct), fundoReservaPct: parsePercent(r.fundoReservaPct) }))
    .filter((r) => r.prazo > 0)
    .sort((a, b) => a.prazo - b.prazo);

  const lanceOptions = form.lanceOptions.map((l) => ({ key: l.key, enabled: l.enabled, nomeComercial: l.nomeComercial.trim() || LANCE_LABELS[l.key], pct: parsePercent(l.pct) }));
  const valores = creditRanges.map((r) => r.valor);
  const prazos = prazoRules.map((r) => r.prazo);
  const taxaAdmMedia = prazoRules.length ? prazoRules[prazoRules.length - 1].taxaAdmPct : 0;
  const fundoReservaMedia = prazoRules.length ? prazoRules[prazoRules.length - 1].fundoReservaPct : 0;
  const primeiroFixo = lanceOptions.find((l) => l.key === "primeiro_fixo");
  const segundoFixo = lanceOptions.find((l) => l.key === "segundo_fixo");
  const permiteLanceEmbutido = form.permite_lance_embutido;

  return {
    grupo: form.grupo.trim(),
    segmento: form.segmento,
    nome_grupo: form.nome_grupo.trim() || null,
    observacoes: form.observacoes.trim() || null,
    credito_min: valores.length ? Math.min(...valores) : 0,
    credito_max: valores.length ? Math.max(...valores) : 0,
    prazo_min: prazos.length ? Math.min(...prazos) : 1,
    prazo_max: prazos.length ? Math.max(...prazos) : 1,
    taxa_adm_pct: taxaAdmMedia,
    fundo_reserva_pct: fundoReservaMedia,
    seguro_pct: parsePercent(form.seguro_pct),
    permite_lance_livre: lanceOptions.find((l) => l.key === "livre")?.enabled ?? true,
    permite_lance_embutido: permiteLanceEmbutido,
    lance_embutido_max_pct: permiteLanceEmbutido ? parsePercent(form.maxLanceEmbutidoPct) : 0,
    permite_fixo_25: primeiroFixo?.enabled ?? false,
    permite_fixo_50: segundoFixo?.enabled ?? false,
    config: {
      creditRanges,
      prazoRules,
      lanceOptions,
      maxLanceEmbutidoPct: permiteLanceEmbutido ? parsePercent(form.maxLanceEmbutidoPct) : 0,
      regraPosContemplacao: form.regra_pos_contemplacao,
      observacoesRegra: form.observacoesRegra.trim(),
    } as BBConfig,
    is_active: form.is_active,
  };
}

function sqlForSetup() {
  return `create table if not exists public.sim_bb_groups (
  id uuid primary key default uuid_generate_v4(),
  grupo text not null,
  segmento text not null,
  nome_grupo text,
  observacoes text,
  credito_min numeric,
  credito_max numeric,
  prazo_min int,
  prazo_max int,
  taxa_adm_pct numeric,
  fundo_reserva_pct numeric,
  seguro_pct numeric,
  permite_lance_livre boolean default true,
  permite_lance_embutido boolean default true,
  lance_embutido_max_pct numeric default 0.25,
  permite_fixo_25 boolean default false,
  permite_fixo_50 boolean default false,
  config jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sim_bb_groups
add column if not exists config jsonb default '{}'::jsonb;

create index if not exists sim_bb_groups_segmento_idx
on public.sim_bb_groups(segmento);

create index if not exists sim_bb_groups_active_idx
on public.sim_bb_groups(is_active);`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[22px] border bg-white/75 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black" style={{ color: C.navy }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function calcBB(input: { group: BBGroup | null; credito: number; prazo: number; parcelaContemplacao: number; lanceKey: LanceKey; lanceLivrePct: number; usarEmbutido: boolean; lanceEmbutidoPct: number }) {
  const { group, credito, prazo, parcelaContemplacao, lanceKey, lanceLivrePct, usarEmbutido, lanceEmbutidoPct } = input;
  if (!group) return { result: null as any, error: "Selecione um grupo/tabela BB." };
  const creditoDigitado = Math.max(0, Number(credito || 0));
  if (!creditoDigitado) return { result: null as any, error: "Selecione ou informe o crédito desejado." };

  const cfg = normalizeConfig(group);
  const sortedPrazoRules = [...cfg.prazoRules].sort((a, b) => a.prazo - b.prazo);
  const exactRule = sortedPrazoRules.find((r) => r.prazo === prazo);
  const nearestRule = exactRule || sortedPrazoRules.find((r) => r.prazo >= prazo) || sortedPrazoRules[sortedPrazoRules.length - 1];
  const prazoMin = sortedPrazoRules.length ? Math.min(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_min || 1);
  const prazoMax = sortedPrazoRules.length ? Math.max(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_max || prazo || 1);
  const prazoFinal = clamp(Math.max(1, prazo || prazoMax), prazoMin || 1, prazoMax || prazo || 1);

  const taxaAdm = Number(nearestRule?.taxaAdmPct ?? group.taxa_adm_pct ?? 0);
  const fundoReserva = Number(nearestRule?.fundoReservaPct ?? group.fundo_reserva_pct ?? 0);
  const seguroPct = Number(group.seguro_pct || 0);
  const permiteEmbutido = group.permite_lance_embutido !== false;
  const maxEmbutidoPct = permiteEmbutido ? Number(cfg.maxLanceEmbutidoPct || 0) : 0;

  // Regra BB: a parcela antes da contemplação nasce sempre do crédito digitado,
  // não da maior faixa cadastrada do grupo. Valor de categoria = crédito + adm + FR.
  const valorCategoria = creditoDigitado * (1 + taxaAdm + fundoReserva);
  const parcelaBase = valorCategoria / prazoFinal;
  const seguroMensal = valorCategoria * seguroPct;
  const parcelaAntes = parcelaBase + seguroMensal;

  const lanceOption = cfg.lanceOptions.find((l) => l.key === lanceKey && l.enabled);
  if (!lanceOption) return { result: null as any, error: "A modalidade de lance selecionada não está habilitada para este grupo." };

  const lancePct = lanceKey === "livre" ? Math.max(0, lanceLivrePct) : Math.max(0, Number(lanceOption.pct || 0));
  const parcelaContempl = clamp(Math.max(1, parcelaContemplacao || 1), 1, prazoFinal);
  const prazoRestanteAposContemplacao = Math.max(1, prazoFinal - parcelaContempl);
  const totalPagoAteContemplacao = parcelaBase * parcelaContempl;
  const lanceOfertadoValor = creditoDigitado * lancePct;

  let embutidoPctFinal = 0;
  if (usarEmbutido) {
    if (!permiteEmbutido) return { result: null as any, error: "Este grupo não permite lance embutido." };
    embutidoPctFinal = Math.max(0, lanceEmbutidoPct);
    if (maxEmbutidoPct > 0 && embutidoPctFinal > maxEmbutidoPct) return { result: null as any, error: `Lance embutido acima do máximo permitido (${pctHuman(maxEmbutidoPct)}).` };
  }

  const lanceEmbutidoValor = creditoDigitado * embutidoPctFinal;
  if (lanceEmbutidoValor > lanceOfertadoValor + 0.01) return { result: null as any, error: "O lance embutido não pode ser maior que o lance ofertado." };

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const creditoLiquido = Math.max(0, creditoDigitado - lanceEmbutidoValor);
  const saldoAposPagamentos = Math.max(0, valorCategoria - totalPagoAteContemplacao);
  const saldoAposLance = Math.max(0, saldoAposPagamentos - lanceOfertadoValor);

  let parcelaApos = saldoAposLance / prazoRestanteAposContemplacao + seguroMensal;
  let prazoRestanteFinal = prazoRestanteAposContemplacao;
  if (cfg.regraPosContemplacao === "mantem_parcela_reduz_prazo" && parcelaAntes > 0) {
    prazoRestanteFinal = Math.max(1, Math.ceil(saldoAposLance / Math.max(1, parcelaAntes - seguroMensal)));
    parcelaApos = parcelaAntes;
  }

  const investimentoAteContemplacao = parcelaAntes * parcelaContempl + lanceProprioValor;
  return {
    result: {
      credito: creditoDigitado,
      creditoLiquido,
      prazo: prazoFinal,
      taxaAdm,
      fundoReserva,
      seguroPct,
      valorCategoria,
      parcelaAntes,
      parcelaApos,
      parcelaBase,
      seguroMensal,
      parcelaContemplacao: parcelaContempl,
      prazoRestanteAposContemplacao: prazoRestanteFinal,
      lancePct,
      lanceNome: lanceOption.nomeComercial,
      lanceOfertadoValor,
      lanceEmbutidoValor,
      lanceProprioValor,
      saldoAposLance,
      investimentoAteContemplacao,
    },
    error: "",
  };
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  drawRoundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  });
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
}

async function loadLogo() {
  const paths = ["/logo.png", "/logo-consulmax.png", "/consulmax-logo.png", "/LOGO - VERS 01.png"];
  for (const path of paths) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = path;
    });
    if (loaded) return loaded;
  }
  return null;
}

function marketingLancePct(cfg: BBConfig) {
  const preferred = cfg.lanceOptions.find((l) => l.enabled && l.pct > 0) || cfg.lanceOptions.find((l) => l.enabled);
  return Number(preferred?.pct || 0);
}

function statusRows(group: BBGroup) {
  const cfg = normalizeConfig(group);
  const prazos = [...cfg.prazoRules].sort((a, b) => b.prazo - a.prazo);
  const basePrazo = prazos[0] || { id: "prazo", prazo: Number(group.prazo_max || 1), taxaAdmPct: Number(group.taxa_adm_pct || 0), fundoReservaPct: Number(group.fundo_reserva_pct || 0) };
  const lancePct = marketingLancePct(cfg);
  return cfg.creditRanges.slice(0, 9).map((range) => {
    const valorCategoria = range.valor * (1 + Number(basePrazo.taxaAdmPct || 0) + Number(basePrazo.fundoReservaPct || 0));
    return {
      credito: brMoney(range.valor),
      parcela: brMoney(basePrazo.prazo > 0 ? valorCategoria / basePrazo.prazo : 0),
      prazo: `${basePrazo.prazo}x`,
      lance: lancePct > 0 ? pctHuman(lancePct, 0) : "Livre",
    };
  });
}

async function saveStatusImage(group: BBGroup) {
  const cfg = normalizeConfig(group);
  const rows = statusRows(group);
  if (!rows.length) {
    alert("Este grupo não possui faixas de crédito para gerar a imagem.");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
  gradient.addColorStop(0, C.navy);
  gradient.addColorStop(0.58, "#24304A");
  gradient.addColorStop(1, C.ruby);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = C.lightGold;
  ctx.beginPath();
  ctx.arc(930, 170, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(105, 1700, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const logo = await loadLogo();
  if (logo) {
    const maxW = 360;
    const ratio = Math.min(maxW / logo.width, 110 / logo.height);
    ctx.drawImage(logo, 80, 70, logo.width * ratio, logo.height * ratio);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 54px Arial";
    ctx.fillText("CONSULMAX", 80, 135);
    ctx.fillStyle = C.lightGold;
    ctx.font = "700 20px Arial";
    ctx.fillText("CONSÓRCIOS", 82, 166);
  }

  fillRoundRect(ctx, 80, 225, 920, 126, 32, "rgba(255,255,255,0.12)");
  ctx.fillStyle = C.lightGold;
  ctx.font = "800 30px Arial";
  ctx.fillText(`Próxima assembleia: ${brDate(groupNextAssembly(group))}`, 118, 278);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 38px Arial";
  ctx.fillText("Vagas limitadas", 118, 326);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 66px Arial";
  wrapText(ctx, "Tire seus sonhos do papel com a Consulmax", 80, 475, 880, 76);

  ctx.fillStyle = C.lightGold;
  ctx.font = "800 30px Arial";
  ctx.fillText(`Categoria: ${getStatusSegmentoLabel(group.segmento)}`, 82, 655);

  fillRoundRect(ctx, 60, 720, 960, 760, 34, "#FFFFFF");
  ctx.fillStyle = C.navy;
  ctx.font = "900 28px Arial";
  ctx.fillText("Crédito", 105, 785);
  ctx.fillText("Parcela", 370, 785);
  ctx.fillText("Prazo", 655, 785);
  ctx.fillText("% Lance", 795, 785);
  ctx.strokeStyle = "rgba(30,41,63,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(95, 815);
  ctx.lineTo(985, 815);
  ctx.stroke();

  rows.forEach((row, index) => {
    const y = 875 + index * 66;
    if (index % 2 === 0) fillRoundRect(ctx, 88, y - 42, 900, 56, 18, "#F7F8FB");
    ctx.fillStyle = C.navy;
    ctx.font = "800 26px Arial";
    ctx.fillText(row.credito, 105, y);
    ctx.fillText(row.parcela, 370, y);
    ctx.fillText(row.prazo, 655, y);
    ctx.fillStyle = C.ruby;
    ctx.fillText(row.lance, 795, y);
  });

  if (cfg.creditRanges.length > rows.length) {
    ctx.fillStyle = "#64748B";
    ctx.font = "700 22px Arial";
    ctx.fillText(`+ ${cfg.creditRanges.length - rows.length} opção(ões) disponíveis no CRM`, 105, 1435);
  }

  const footerY = 1570;
  if (group.permite_lance_embutido !== false && Number(cfg.maxLanceEmbutidoPct || 0) > 0) {
    fillRoundRect(ctx, 80, footerY, 920, 112, 28, "rgba(224,206,140,0.18)");
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 28px Arial";
    ctx.fillText(`Utilize até ${pctHuman(cfg.maxLanceEmbutidoPct, 0)} do crédito para pagar o lance`, 120, footerY + 65);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 34px Arial";
  ctx.fillText(`Grupo BB Consórcios Nº ${group.grupo}`, 80, 1770);
  ctx.fillStyle = C.lightGold;
  ctx.font = "700 24px Arial";
  ctx.fillText("Consulmax - Maximize as suas conquistas", 80, 1814);

  const safeGrupo = String(group.grupo || "bb").replace(/[^a-zA-Z0-9_-]/g, "-");
  const link = document.createElement("a");
  link.download = `status-bb-consorcios-grupo-${safeGrupo}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function ConfigOverlay({ open, onClose, initialSegmento, editing, groups, onEditGroup, onDeleteGroup, onSaved }: { open: boolean; onClose: () => void; initialSegmento: SegmentoBB; editing: BBGroup | null; groups: BBGroup[]; onEditGroup: (group: BBGroup | null) => void; onDeleteGroup: (group: BBGroup) => Promise<void>; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<GroupForm>(() => defaultForm(initialSegmento));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(editing ? formFromGroup(editing) : defaultForm(initialSegmento));
  }, [open, editing, initialSegmento]);

  if (!open) return null;

  function addCreditRange() {
    setForm((f) => {
      const nextIndex = f.creditRanges.length + 1;
      return { ...f, creditRanges: [...f.creditRanges, { id: makeId("cred"), label: `Faixa ${nextIndex}`, valor: formatMoneyInput(0) }] };
    });
  }

  function addPrazoRule() {
    setForm((f) => ({ ...f, prazoRules: [...f.prazoRules, { id: makeId("prazo"), prazo: "80", taxaAdmPct: "0,0000", fundoReservaPct: "0,0000" }] }));
  }

  async function save() {
    setError(null);
    const payload = payloadFromForm(form);
    if (!payload.grupo) return setError("Informe o grupo/código da tabela.");
    if (!(payload.config as BBConfig).creditRanges.length) return setError("Cadastre pelo menos uma faixa de crédito.");
    if (!(payload.config as BBConfig).prazoRules.length) return setError("Cadastre pelo menos uma regra de prazo/taxa.");
    if (!(payload.config as BBConfig).lanceOptions.some((l) => l.enabled)) return setError("Habilite pelo menos uma modalidade de lance.");
    setSaving(true);
    const req = editing?.id ? supabase.from("sim_bb_groups").update(payload as any).eq("id", editing.id) : supabase.from("sim_bb_groups").insert(payload as any);
    const { error: saveErr } = await req;
    setSaving(false);
    if (saveErr) return setError(saveErr.message);
    await onSaved();
    onEditGroup(null);
    setForm(defaultForm(form.segmento));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-[28px] border bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 p-4 backdrop-blur">
          <div><div className="text-lg font-black" style={{ color: C.navy }}>{editing ? "Editar grupo BB" : "Cadastrar grupo BB"}</div><div className="text-xs text-slate-500">Configure faixas de crédito, prazos, taxas e lances permitidos por grupo. A importação oficial vem automaticamente pelo robô BB.</div></div>
          <div className="flex gap-2">{editing && <Button variant="secondary" className="rounded-2xl" onClick={() => onEditGroup(null)} disabled={saving}>Novo grupo</Button>}<Button variant="secondary" className="rounded-2xl" onClick={onClose} disabled={saving}><X className="h-4 w-4" /></Button></div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div><Label>Segmento</Label><select className="h-10 w-full rounded-md border px-3" value={form.segmento} onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value as SegmentoBB }))}>{segmentos.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div><Label>Grupo / Código</Label><Input value={form.grupo} onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value }))} placeholder="Ex.: BB Auto IPCA 80" /></div>
          <div><Label>Nome comercial</Label><Input value={form.nome_grupo} onChange={(e) => setForm((f) => ({ ...f, nome_grupo: e.target.value }))} placeholder="Ex.: BB Consórcio Auto IPCA" /></div>
          <div><Label>Seguro mensal sobre categoria (%)</Label><Input value={form.seguro_pct} onChange={(e) => setForm((f) => ({ ...f, seguro_pct: e.target.value }))} placeholder="Ex.: 0,0000" /></div>

          <div className="md:col-span-2 rounded-[24px] border bg-slate-50/70 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-black" style={{ color: C.navy }}>Faixas de crédito</div><div className="text-xs text-slate-500">A tabela serve como referência dos créditos disponíveis no grupo. A simulação aceita o crédito digitado pelo usuário.</div></div><Button type="button" variant="secondary" className="rounded-2xl" onClick={addCreditRange}><Plus className="mr-2 h-4 w-4" />Adicionar faixa</Button></div><div className="space-y-2">{form.creditRanges.map((range, idx) => <div key={range.id} className="grid gap-2 md:grid-cols-[1fr_220px_44px]"><Input value={range.label} onChange={(e) => setForm((f) => ({ ...f, creditRanges: f.creditRanges.map((r) => r.id === range.id ? { ...r, label: e.target.value } : r) }))} placeholder="Nome da faixa. Ex.: 100 mil" /><Input value={range.valor} onChange={(e) => setForm((f) => ({ ...f, creditRanges: f.creditRanges.map((r) => r.id === range.id ? { ...r, valor: formatMoneyInput(parseMoney(e.target.value)) } : r) }))} /><Button type="button" variant="secondary" className="rounded-xl" disabled={form.creditRanges.length <= 1} onClick={() => setForm((f) => ({ ...f, creditRanges: f.creditRanges.filter((_, i) => i !== idx) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>
          <div className="md:col-span-2 rounded-[24px] border bg-slate-50/70 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-black" style={{ color: C.navy }}>Prazos e taxas</div><div className="text-xs text-slate-500">Cada prazo pode ter taxa de administração e fundo de reserva próprios.</div></div><Button type="button" variant="secondary" className="rounded-2xl" onClick={addPrazoRule}><Plus className="mr-2 h-4 w-4" />Adicionar prazo</Button></div><div className="space-y-2">{form.prazoRules.map((rule, idx) => <div key={rule.id} className="grid gap-2 md:grid-cols-[120px_1fr_1fr_44px]"><Input value={rule.prazo} onChange={(e) => setForm((f) => ({ ...f, prazoRules: f.prazoRules.map((r) => r.id === rule.id ? { ...r, prazo: e.target.value } : r) }))} placeholder="Prazo" /><Input value={rule.taxaAdmPct} onChange={(e) => setForm((f) => ({ ...f, prazoRules: f.prazoRules.map((r) => r.id === rule.id ? { ...r, taxaAdmPct: e.target.value } : r) }))} placeholder="Taxa adm %" /><Input value={rule.fundoReservaPct} onChange={(e) => setForm((f) => ({ ...f, prazoRules: f.prazoRules.map((r) => r.id === rule.id ? { ...r, fundoReservaPct: e.target.value } : r) }))} placeholder="Fundo reserva %" /><Button type="button" variant="secondary" className="rounded-xl" disabled={form.prazoRules.length <= 1} onClick={() => setForm((f) => ({ ...f, prazoRules: f.prazoRules.filter((_, i) => i !== idx) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>
          <div className="md:col-span-2 rounded-[24px] border bg-slate-50/70 p-4"><div className="mb-3"><div className="font-black" style={{ color: C.navy }}>Lances permitidos</div><div className="text-xs text-slate-500">Habilite/desabilite modalidades e configure o percentual quando for lance fixo/limitado/fidelidade.</div></div><div className="space-y-2">{form.lanceOptions.map((lance) => <div key={lance.key} className="grid gap-2 rounded-2xl border bg-white p-3 md:grid-cols-[180px_1fr_180px] md:items-center"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={lance.enabled} onChange={(e) => setForm((f) => ({ ...f, lanceOptions: f.lanceOptions.map((l) => l.key === lance.key ? { ...l, enabled: e.target.checked } : l) }))} />{LANCE_LABELS[lance.key]}</label><Input value={lance.nomeComercial} onChange={(e) => setForm((f) => ({ ...f, lanceOptions: f.lanceOptions.map((l) => l.key === lance.key ? { ...l, nomeComercial: e.target.value } : l) }))} placeholder="Nome comercial" /><Input value={lance.pct} disabled={lance.key === "livre"} onChange={(e) => setForm((f) => ({ ...f, lanceOptions: f.lanceOptions.map((l) => l.key === lance.key ? { ...l, pct: e.target.value } : l) }))} placeholder="Percentual" /></div>)}</div></div>
          <div className="md:col-span-2 rounded-[24px] border bg-slate-50/70 p-4"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.permite_lance_embutido} onChange={(e) => setForm((f) => ({ ...f, permite_lance_embutido: e.target.checked }))} />Este grupo permite lance embutido?</label>{form.permite_lance_embutido && <div className="mt-3 max-w-xs"><Label>Máximo de lance embutido (%)</Label><Input value={form.maxLanceEmbutidoPct} onChange={(e) => setForm((f) => ({ ...f, maxLanceEmbutidoPct: e.target.value }))} placeholder="Ex.: 25,0000" /></div>}</div>
          <div><Label>Regra pós-contemplação</Label><select className="h-10 w-full rounded-md border px-3" value={form.regra_pos_contemplacao} onChange={(e) => setForm((f) => ({ ...f, regra_pos_contemplacao: e.target.value as RegraPos }))}><option value="saldo_devedor_prazo_restante">Saldo devedor ÷ prazo restante</option><option value="mantem_parcela_reduz_prazo">Mantém parcela e reduz prazo</option></select></div>
          <div className="md:col-span-2"><Label>Observações do grupo/regra</Label><textarea className="min-h-[90px] w-full rounded-md border px-3 py-2 text-sm" value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} /></div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />Grupo ativo</label>
          {error && <div className="md:col-span-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="md:col-span-2 flex flex-wrap gap-2"><Button onClick={save} disabled={saving} className="rounded-2xl">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{editing ? "Salvar alterações" : "Salvar grupo"}</Button><Button variant="secondary" onClick={onClose} disabled={saving} className="rounded-2xl">Fechar</Button></div>
        </div>

        <div className="border-t bg-slate-50/70 p-5"><div className="mb-3 flex items-center justify-between gap-2"><div><div className="font-black" style={{ color: C.navy }}>Grupos cadastrados BB</div><div className="text-xs text-slate-500">A gestão dos grupos fica concentrada aqui dentro do menu de configuração.</div></div></div>{!groups.length && <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">Nenhum grupo cadastrado ainda.</div>}<div className="space-y-2">{groups.map((g) => { const cfg = normalizeConfig(g); const min = cfg.creditRanges.length ? Math.min(...cfg.creditRanges.map((r) => r.valor)) : Number(g.credito_min || 0); const max = cfg.creditRanges.length ? Math.max(...cfg.creditRanges.map((r) => r.valor)) : Number(g.credito_max || 0); return <div key={g.id} className="flex flex-col gap-3 rounded-2xl border bg-white p-3 md:flex-row md:items-center md:justify-between"><div><div className="font-black" style={{ color: C.navy }}>{g.nome_grupo || g.grupo}</div><div className="text-xs text-slate-500">{getSegmentoLabel(g.segmento)} • {brMoney(min)} a {brMoney(max)} • {cfg.prazoRules.length} prazo(s) • Embutido: {g.permite_lance_embutido === false ? "Não" : "Sim"} • {g.is_active === false ? "Inativo" : "Ativo"}</div></div><div className="flex gap-2"><Button variant="secondary" className="rounded-2xl" onClick={() => onEditGroup(g)}><Pencil className="h-4 w-4" /></Button><Button variant="secondary" className="rounded-2xl" onClick={() => onDeleteGroup(g)}><Trash2 className="h-4 w-4" /></Button></div></div>; })}</div></div>
      </div>
    </div>
  );
}

function GrupoTabela({ group, onSelectCredit }: { group: BBGroup | null; onSelectCredit?: (valor: number) => void }) {
  const cfg = normalizeConfig(group);
  if (!group || !cfg.creditRanges.length || !cfg.prazoRules.length) return null;
  const prazos = [...cfg.prazoRules].sort((a, b) => a.prazo - b.prazo);
  return (
    <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle style={{ color: C.navy }}>Tabela do grupo selecionado</CardTitle>
          <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => saveStatusImage(group)}><Download className="mr-2 h-4 w-4" />Salvar imagem</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-2xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Faixa</th><th className="p-3">Crédito</th><th className="p-3">Prazo</th><th className="p-3">Taxa adm</th><th className="p-3">Fundo reserva</th><th className="p-3">Parcela portal</th></tr></thead>
            <tbody>{cfg.creditRanges.flatMap((range) => prazos.map((prazo) => { const valorCategoria = range.valor * (1 + prazo.taxaAdmPct + prazo.fundoReservaPct); const parcela = prazo.prazo > 0 ? valorCategoria / prazo.prazo : 0; return <tr key={`${range.id}_${prazo.id}`} className="border-t cursor-pointer transition hover:bg-slate-50" title="Clique para usar este crédito na simulação" onClick={() => onSelectCredit?.(range.valor)}><td className="p-3 font-semibold text-slate-700">{range.label || brMoney(range.valor)}</td><td className="p-3">{brMoney(range.valor)}</td><td className="p-3">{prazo.prazo} meses</td><td className="p-3">{pctHuman(prazo.taxaAdmPct)}</td><td className="p-3">{pctHuman(prazo.fundoReservaPct)}</td><td className="p-3 font-semibold">{brMoney(parcela)}</td></tr>; }))}</tbody>
          </table>
        </div><div className="mt-2 text-xs text-slate-500">Clique em uma faixa para preencher automaticamente o campo Crédito desejado. A tabela é apenas referência dos créditos disponíveis; a simulação calcula a parcela antes com base no crédito digitado.</div>
      </CardContent>
    </Card>
  );
}

export default function BBConsorciosSimulator() {
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState<LoggedUserProfile | null>(null);
  const [bbAdminId, setBbAdminId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [groups, setGroups] = useState<BBGroup[]>([]);
  const [segmento, setSegmento] = useState<SegmentoBB>("auto_ipca");
  const [groupId, setGroupId] = useState<string>("");
  const [creditoInput, setCreditoInput] = useState(formatMoneyInput(0));
  const [prazoInput, setPrazoInput] = useState("80");
  const [parcelaContemplacaoInput, setParcelaContemplacaoInput] = useState("1");
  const [lanceKey, setLanceKey] = useState<LanceKey>("livre");
  const [lanceLivrePct, setLanceLivrePct] = useState("0,0000");
  const [usarEmbutido, setUsarEmbutido] = useState(true);
  const [lanceEmbutidoPct, setLanceEmbutidoPct] = useState("25,0000");
  const [configOpen, setConfigOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BBGroup | null>(null);
  const [copied, setCopied] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setTableMissing(false);
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id ?? null;
    if (authUserId) {
      const { data: me } = await supabase.from("users").select("id,auth_user_id,nome,email,phone,telefone,role,user_role").eq("auth_user_id", authUserId).maybeSingle();
      setUserProfile((me as LoggedUserProfile) || null);
      const role = String((me as any)?.role || (me as any)?.user_role || "").toLowerCase();
      setIsAdmin(role === "admin");
    }
    const leadsReq = await supabase.from("leads").select("id,nome,telefone,email,owner_id").order("created_at", { ascending: false }).limit(500);
    setLeads((leadsReq.data ?? []) as Lead[]);
    const { data: adminRows } = await supabase.from("sim_admins").select("id,name").or("name.ilike.%BB%,name.ilike.%Banco do Brasil%").limit(1);
    setBbAdminId((adminRows?.[0] as any)?.id ?? null);
    const { data, error } = await supabase.from("sim_bb_groups").select("*").order("segmento", { ascending: true }).order("grupo", { ascending: true });
    if (error) { if (String(error.message || "").toLowerCase().includes("does not exist")) setTableMissing(true); setGroups([]); } else { setGroups((data ?? []) as BBGroup[]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const activeGroups = useMemo(() => groups.filter((g) => g.is_active !== false), [groups]);
  const segmentGroups = useMemo(() => activeGroups.filter((g) => g.segmento === segmento), [activeGroups, segmento]);
  useEffect(() => { if (!segmentGroups.length) return setGroupId(""); if (!segmentGroups.some((g) => g.id === groupId)) setGroupId(segmentGroups[0].id); }, [segmentGroups, groupId]);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);
  const selectedConfig = useMemo(() => normalizeConfig(selectedGroup), [selectedGroup]);
  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId) || null, [leads, leadId]);
  const availableLances = useMemo(() => selectedConfig.lanceOptions.filter((l) => l.enabled), [selectedConfig]);
  const availablePrazos = useMemo(() => [...selectedConfig.prazoRules].sort((a, b) => a.prazo - b.prazo), [selectedConfig]);
  const grupoPermiteEmbutido = selectedGroup?.permite_lance_embutido !== false;

  useEffect(() => {
    if (availablePrazos.length && !availablePrazos.some((p) => String(p.prazo) === prazoInput)) setPrazoInput(String(availablePrazos[availablePrazos.length - 1].prazo));
    if (availableLances.length && !availableLances.some((l) => l.key === lanceKey)) setLanceKey(availableLances[0].key);
    if (!grupoPermiteEmbutido) setUsarEmbutido(false);
  }, [selectedGroup?.id, availablePrazos, availableLances, prazoInput, lanceKey, grupoPermiteEmbutido]);

  useEffect(() => {
    const livre = selectedConfig.lanceOptions.find((l) => l.key === "livre");
    setLanceLivrePct(formatPercentInput(livre?.pct || 0));
    setSimCode(null);
  }, [selectedGroup?.id]);

  const credito = parseMoney(creditoInput);
  const prazo = numberFrom(prazoInput);
  const parcelaContemplacao = numberFrom(parcelaContemplacaoInput);
  const calculation = calcBB({ group: selectedGroup, credito, prazo, parcelaContemplacao, lanceKey, lanceLivrePct: parsePercent(lanceLivrePct), usarEmbutido: grupoPermiteEmbutido && usarEmbutido, lanceEmbutidoPct: parsePercent(lanceEmbutidoPct) });
  const result = calculation.result;

  const resumoTexto = useMemo(() => {
    if (!result || !selectedGroup) return "";
    const segmentoLabel = getSegmentoLabel(selectedGroup.segmento);
    const grupoInfo = selectedGroup.grupo ? ` - Grupo ${selectedGroup.grupo}` : "";
    const telDigits = onlyDigits(getUserPhone(userProfile));
    const telComPais = telDigits ? (telDigits.startsWith("55") ? telDigits : `55${telDigits}`) : "";
    const wa = telComPais ? `https://wa.me/${telComPais}` : "";
    const clienteLinha = selectedLead ? `👤 Cliente: ${selectedLead.nome}\n\n` : "";
    const embutidoLinha = result.lanceEmbutidoValor > 0 ? `💼 Lance embutido: ${brMoney(result.lanceEmbutidoValor)}\n` : "";
    return `${clienteLinha}🎯 *Simulação BB Consórcios ${segmentoLabel}${grupoInfo}*

💰 Crédito contratado: ${brMoney(result.credito)}

📄 Prazo contratado: ${result.prazo} meses
💳 Parcela antes da contemplação: ${brMoney(result.parcelaAntes)}

📈 Após a contemplação (prevista na parcela ${result.parcelaContemplacao}):
🏦 Lance próprio: ${brMoney(result.lanceProprioValor)}
${embutidoLinha}
✅ Crédito líquido liberado: ${brMoney(result.creditoLiquido)}

💳 Parcela estimada após contemplação: ${brMoney(result.parcelaApos)}

⏳ Prazo restante: ${result.prazoRestanteAposContemplacao} meses

Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`;
  }, [result, selectedGroup, selectedLead, userProfile]);

  async function copyResumo() { if (!resumoTexto) return; await navigator.clipboard.writeText(resumoTexto); setCopied(true); setTimeout(() => setCopied(false), 1800); }

  async function salvarSimulacao() {
    if (!selectedGroup || !result) return;
    setSalvando(true);
    const payload: any = {
      lead_id: leadId || null,
      lead_nome: selectedLead?.nome || null,
      lead_telefone: selectedLead?.telefone || null,
      grupo: selectedGroup.grupo || null,
      segmento: getSegmentoLabel(selectedGroup.segmento),
      nome_tabela: selectedGroup.nome_grupo || `Grupo ${selectedGroup.grupo}`,
      credito: result.credito,
      prazo_venda: result.prazo,
      forma_contratacao: "Parcela Cheia",
      seguro_prestamista: result.seguroPct > 0,
      lance_modelo: "percentual",
      lance_base: "credito",
      modelo_lance: result.lanceNome,
      lance_ofertado_pct: result.lancePct,
      lance_embutido_pct: result.lanceEmbutidoValor > 0 ? parsePercent(lanceEmbutidoPct) : 0,
      parcela_contemplacao: result.parcelaContemplacao,
      valor_categoria: result.valorCategoria,
      parcela_termo: result.parcelaBase,
      parcela_demais: result.parcelaAntes,
      lance_ofertado_valor: result.lanceOfertadoValor,
      lance_embutido_valor: result.lanceEmbutidoValor,
      lance_proprio_valor: result.lanceProprioValor,
      novo_credito: result.creditoLiquido,
      nova_parcela_sem_limite: result.parcelaApos,
      parcela_escolhida: result.parcelaApos,
      saldo_devedor_final: result.saldoAposLance,
      novo_prazo: result.prazoRestanteAposContemplacao,
      adm_tax_pct: result.taxaAdm,
      fr_tax_pct: result.fundoReserva,
    };
    if (bbAdminId) payload.admin_id = bbAdminId;
    const { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();
    setSalvando(false);
    if (error) { alert("Erro ao salvar simulação: " + error.message); return; }
    setSimCode((data as any)?.code ?? null);
  }

  async function deleteGroup(group: BBGroup) { const ok = window.confirm(`Excluir o grupo ${group.grupo}?`); if (!ok) return; const { error } = await supabase.from("sim_bb_groups").delete().eq("id", group.id); if (error) return alert(error.message); await load(); if (editingGroup?.id === group.id) setEditingGroup(null); }

  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Carregando simulador BB Consórcios...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border p-6 md:p-8 shadow-sm" style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}><div className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.28)" }} /><div className="relative z-[1] flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div className="max-w-3xl text-white"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur"><Calculator className="h-3.5 w-3.5" /> Simulador BB Consórcios</div><h1 className="text-2xl md:text-4xl font-black tracking-tight">Configure a estratégia de crédito e lance</h1><p className="mt-3 text-sm md:text-base text-white/82">Simulação por grupo/tabela, com faixas de crédito, prazos, taxas e lances permitidos.</p></div>{isAdmin && <Button type="button" onClick={() => { setEditingGroup(null); setConfigOpen(true); }} className="h-11 shrink-0 rounded-2xl bg-white px-4 font-semibold text-slate-900 hover:bg-white/90"><Settings className="mr-2 h-4 w-4" /> Configurar grupos</Button>}</div></section>
      {tableMissing && <Card className="rounded-[28px] border border-amber-200 bg-amber-50/80 shadow-sm"><CardContent className="space-y-4 p-5"><div className="flex items-center gap-2 font-bold text-amber-800"><AlertTriangle className="h-5 w-5" /> Tabela sim_bb_groups ainda não existe</div><p className="text-sm text-amber-800">Rode este SQL no Supabase para habilitar o simulador BB:</p><pre className="max-h-[320px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-white">{sqlForSetup()}</pre></CardContent></Card>}
      <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]"><div className="space-y-4"><Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur"><CardHeader><CardTitle className="flex items-center gap-2" style={{ color: C.navy }}><UserRound className="h-5 w-5" /> Cliente e segmento</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Label>Selecionar lead</Label><select className="h-10 w-full rounded-md border px-3" value={leadId} onChange={(e) => setLeadId(e.target.value)}><option value="">Sem lead vinculado</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.nome} {lead.telefone ? `• ${lead.telefone}` : lead.email ? `• ${lead.email}` : ""}</option>)}</select></div><div className="md:col-span-2 grid gap-3 md:grid-cols-5">{segmentos.map((s) => { const Icon = s.icon; const active = segmento === s.key; return <button key={s.key} type="button" onClick={() => setSegmento(s.key)} className="rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: active ? C.ruby : "rgba(30,41,63,.12)", background: active ? "rgba(161,28,39,.08)" : "white" }}><Icon className="mb-2 h-5 w-5" style={{ color: active ? C.ruby : C.navy }} /><div className="text-sm font-black" style={{ color: C.navy }}>{s.label}</div></button>; })}</div></CardContent></Card><Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur"><CardHeader><CardTitle className="flex items-center gap-2" style={{ color: C.navy }}><Building2 className="h-5 w-5" /> Tabela e plano</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Label>Grupo/Tabela BB</Label><select className="h-10 w-full rounded-md border px-3" value={groupId} onChange={(e) => setGroupId(e.target.value)}>{!segmentGroups.length && <option value="">Nenhum grupo cadastrado para este segmento</option>}{segmentGroups.map((g) => { const cfg = normalizeConfig(g); const min = cfg.creditRanges.length ? Math.min(...cfg.creditRanges.map((r) => r.valor)) : Number(g.credito_min || 0); const max = cfg.creditRanges.length ? Math.max(...cfg.creditRanges.map((r) => r.valor)) : Number(g.credito_max || 0); return <option key={g.id} value={g.id}>{g.nome_grupo || g.grupo} • {brMoney(min)} a {brMoney(max)}</option>; })}</select></div><div><Label>Crédito desejado</Label><Input value={creditoInput} onChange={(e) => { setCreditoInput(formatMoneyInput(parseMoney(e.target.value))); setSimCode(null); }} placeholder="Digite o valor do crédito" />{selectedConfig.creditRanges.length > 0 && credito > 0 && <p className="mt-1 text-xs text-slate-500">Faixa cadastrada do grupo: {brMoney(Math.min(...selectedConfig.creditRanges.map((r) => r.valor)))} a {brMoney(Math.max(...selectedConfig.creditRanges.map((r) => r.valor)))}. Valores acima podem ser simulados com junção de cotas.</p>}</div><div><Label>Prazo</Label><select className="h-10 w-full rounded-md border px-3" value={prazoInput} onChange={(e) => setPrazoInput(e.target.value)}>{availablePrazos.map((p) => <option key={p.id} value={p.prazo}>{p.prazo} meses • Adm {pctHuman(p.taxaAdmPct)} • FR {pctHuman(p.fundoReservaPct)}</option>)}</select></div><div><Label>Contemplação estimada na parcela</Label><Input value={parcelaContemplacaoInput} onChange={(e) => setParcelaContemplacaoInput(e.target.value)} /></div><div><Label>Estratégia de lance</Label><select className="h-10 w-full rounded-md border px-3" value={lanceKey} onChange={(e) => setLanceKey(e.target.value as LanceKey)}>{availableLances.map((l) => <option key={l.key} value={l.key}>{l.nomeComercial}{l.key !== "livre" ? ` • ${pctHuman(l.pct)}` : ""}</option>)}</select></div>{lanceKey === "livre" && <div><Label>Percentual do lance livre</Label><Input value={lanceLivrePct} onChange={(e) => setLanceLivrePct(e.target.value)} placeholder="Ex.: 30,0000" /></div>}{grupoPermiteEmbutido ? <div className="rounded-2xl border bg-slate-50/70 p-3"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={usarEmbutido} onChange={(e) => setUsarEmbutido(e.target.checked)} />Usar lance embutido</label><div className="mt-1 text-xs text-slate-500">Máximo do grupo: {pctHuman(selectedConfig.maxLanceEmbutidoPct)}</div></div> : <div className="rounded-2xl border bg-slate-50/70 p-3 text-sm font-semibold text-slate-500">Este grupo não permite lance embutido.</div>}{grupoPermiteEmbutido && usarEmbutido && <div><Label>Percentual do lance embutido</Label><Input value={lanceEmbutidoPct} onChange={(e) => setLanceEmbutidoPct(e.target.value)} placeholder="Ex.: 25,0000" /></div>}</CardContent></Card></div><div className="space-y-4">{calculation.error && <Card className="rounded-[28px] border border-red-200 bg-red-50/80 shadow-sm"><CardContent className="flex items-center gap-2 p-4 text-sm font-semibold text-red-700"><AlertTriangle className="h-5 w-5" /> {calculation.error}</CardContent></Card>}{result && <><div className="grid gap-3 md:grid-cols-2"><Metric label="Crédito contratado" value={brMoney(result.credito)} hint={`Líquido estimado: ${brMoney(result.creditoLiquido)}`} /><Metric label="Parcela antes" value={brMoney(result.parcelaAntes)} hint={`Categoria: ${brMoney(result.valorCategoria)} ÷ ${result.prazo} meses`} /><Metric label="Lance ofertado" value={brMoney(result.lanceOfertadoValor)} hint={`${result.lanceNome} • ${pctHuman(result.lancePct)} sobre o crédito`} /><Metric label="Lance próprio" value={brMoney(result.lanceProprioValor)} hint={`Embutido: ${brMoney(result.lanceEmbutidoValor)}`} /><Metric label="Parcela pós-contemplação" value={brMoney(result.parcelaApos)} hint={`${result.prazoRestanteAposContemplacao} parcelas restantes`} /><Metric label="Investimento até contemplação" value={brMoney(result.investimentoAteContemplacao)} hint={`Até a parcela ${result.parcelaContemplacao}`} /></div><Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur"><CardHeader><CardTitle className="flex items-center gap-2" style={{ color: C.navy }}><CheckCircle2 className="h-5 w-5" /> Resumo para WhatsApp</CardTitle></CardHeader><CardContent className="space-y-3"><textarea className="min-h-[260px] w-full rounded-2xl border bg-slate-50 p-3 text-sm" readOnly value={resumoTexto} /><div className="flex flex-wrap items-center gap-2"><Button onClick={copyResumo} className="rounded-2xl"><Copy className="mr-2 h-4 w-4" /> {copied ? "Copiado!" : "Copiar resumo"}</Button><Button onClick={salvarSimulacao} disabled={salvando} className="rounded-2xl" variant="secondary">{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar simulação</Button>{simCode && <span className="rounded-full border bg-white px-3 py-2 text-xs font-bold" style={{ color: C.ruby }}>Simulação Nº {simCode}</span>}{buildWhatsappLink(userProfile) && <Button variant="secondary" className="rounded-2xl" onClick={() => window.open(buildWhatsappLink(userProfile), "_blank")}>Abrir WhatsApp</Button>}</div></CardContent></Card></>}</div></div>
      <GrupoTabela group={selectedGroup} onSelectCredit={(valor) => { setCreditoInput(formatMoneyInput(valor)); setSimCode(null); }} />
      <ConfigOverlay open={configOpen} onClose={() => setConfigOpen(false)} initialSegmento={segmento} editing={editingGroup} groups={groups} onEditGroup={setEditingGroup} onDeleteGroup={deleteGroup} onSaved={load} />
    </div>
  );
}
