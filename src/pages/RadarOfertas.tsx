// src/pages/RadarOfertas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

type AnyRow = Record<string, any>;

type AdminRow = {
  id: string;
  name: string;
  slug?: string | null;
  behavior?: AnyRow | null;
};

type RadarInput = {
  segmento: string;
  adminId: string;
  creditoLiquido: string;
  parcelaMax: string;
  lanceProprio: string;
  prazoContemplacao: string;
  estrategia: "equilibrada" | "conservadora" | "agressiva";
  embutido: "auto" | "sim" | "nao";
};

type RadarOffer = {
  id: string;
  admin: AdminRow;
  table: AnyRow;
  group?: AnyRow | null;
  score: number;
  scoreLabel: string;
  creditoContratado: number;
  creditoLiquido: number;
  parcelaEstimada: number;
  lanceProprio: number;
  lanceEmbutido: number;
  lanceTotal: number;
  lanceTotalPct: number;
  mediaGrupoPct: number | null;
  prazo: number;
  segmento: string;
  estrategia: string;
  motivos: string[];
  alertas: string[];
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
  off: "#F5F5F5",
};

const DEFAULT_INPUT: RadarInput = {
  segmento: "",
  adminId: "todas",
  creditoLiquido: "150000",
  parcelaMax: "1500",
  lanceProprio: "30000",
  prazoContemplacao: "6",
  estrategia: "equilibrada",
  embutido: "auto",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function brPct(value: number) {
  return `${(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function slugify(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickNumber(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return 0;
  for (const key of keys) {
    const n = onlyNumber(row[key]);
    if (n > 0) return n;
  }
  return 0;
}

function findByKey(row: AnyRow, includes: string[], excludes: string[] = []) {
  const entries = Object.keys(row || {});
  const key = entries.find((k) => {
    const nk = normalizeText(k);
    return includes.every((term) => nk.includes(term)) && excludes.every((term) => !nk.includes(term));
  });
  return key ? row[key] : undefined;
}

function tableCreditMin(table: AnyRow) {
  return (
    pickNumber(table, ["faixa_credito_min", "credito_min", "min_credit", "valor_min", "minimo", "credito_de"]) ||
    onlyNumber(findByKey(table, ["faixa", "min"])) ||
    onlyNumber(findByKey(table, ["credito", "min"]))
  );
}

function tableCreditMax(table: AnyRow) {
  return (
    pickNumber(table, ["faixa_credito_max", "credito_max", "max_credit", "valor_max", "maximo", "credito_ate"]) ||
    onlyNumber(findByKey(table, ["faixa", "max"])) ||
    onlyNumber(findByKey(table, ["credito", "max"]))
  );
}

function tableDeadline(table: AnyRow) {
  return pickNumber(table, ["prazo_limite", "prazo_maximo", "prazo", "max_prazo", "prazo_meses"]) || 240;
}

function tableFeePct(table: AnyRow) {
  const raw =
    pickNumber(table, ["taxa_adm", "taxa_admin", "taxa_administracao", "administration_fee", "taxa"]) ||
    onlyNumber(findByKey(table, ["tax"])) ||
    0;
  if (raw <= 0) return 18;
  return raw <= 1 ? raw * 100 : raw;
}

function maxEmbeddedPct(admin: AdminRow, table: AnyRow) {
  const behavior = admin.behavior || {};
  const raw =
    pickNumber(table, ["lance_embutido_max", "max_embutido", "embutido_max", "lance_embutido_pct"]) ||
    pickNumber(behavior, ["lance_embutido_max", "max_embutido", "embutido_max"]) ||
    25;
  return raw <= 1 ? raw * 100 : raw;
}

function groupAveragePct(group: AnyRow | null | undefined) {
  if (!group) return null;
  const raw =
    pickNumber(group, ["media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    onlyNumber(findByKey(group, ["media", "lance"])) ||
    onlyNumber(findByKey(group, ["mediana"]));
  if (!raw) return null;
  return raw <= 1 ? raw * 100 : raw;
}

function adminSlug(admin: AdminRow) {
  return admin.slug || slugify(admin.name);
}

function adminRoute(admin: AdminRow) {
  const key = `${adminSlug(admin)} ${normalizeText(admin.name)}`;
  if (key.includes("maggi")) return "/simuladores/maggi";
  if (key.includes("bb-consorcios") || key.includes("bb consorcios") || key.includes("banco do brasil")) return "/simuladores/bb-consorcios";
  if (key.includes("embracon")) return "/simuladores/embracon";
  return `/simuladores/${adminSlug(admin)}`;
}

function matchesSegment(row: AnyRow, segmento: string) {
  if (!segmento) return true;
  const haystack = normalizeText(`${row.segmento || ""} ${row.produto || ""} ${row.nome_tabela || ""} ${row.name || ""}`);
  return haystack.includes(normalizeText(segmento));
}

function groupMatches(group: AnyRow, admin: AdminRow, segmento: string) {
  const adminName = normalizeText(admin.name);
  const adminSlugText = normalizeText(adminSlug(admin));
  const gAdmin = normalizeText(group.administradora || group.admin || group.admin_name || group.name_admin || "");
  const sameAdmin = !gAdmin || adminName.includes(gAdmin) || gAdmin.includes(adminName) || gAdmin.includes(adminSlugText);
  return sameAdmin && matchesSegment(group, segmento);
}

function scoreLabel(score: number) {
  if (score >= 86) return "Excelente oportunidade";
  if (score >= 72) return "Boa aderência";
  if (score >= 58) return "Ajustável";
  return "Fora do ideal";
}

function safeId(...parts: Array<string | number | undefined>) {
  return parts.filter(Boolean).join("-").replace(/[^a-zA-Z0-9_-]/g, "");
}

function buildOffers(input: RadarInput, admins: AdminRow[], tables: AnyRow[], groups: AnyRow[]) {
  const desiredNet = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaMax);
  const ownBid = onlyNumber(input.lanceProprio);
  const desiredMonths = Math.max(0, onlyNumber(input.prazoContemplacao));
  if (!desiredNet || !desiredInstallment) return [];

  const selectedAdmins = admins.filter((a) => input.adminId === "todas" || a.id === input.adminId);
  const byAdmin = new Map(selectedAdmins.map((a) => [a.id, a]));
  const results: RadarOffer[] = [];

  for (const table of tables) {
    const admin = byAdmin.get(String(table.admin_id || table.administradora_id || table.sim_admin_id || ""));
    if (!admin) continue;
    if (!matchesSegment(table, input.segmento)) continue;

    const minCredit = tableCreditMin(table) || Math.max(desiredNet, 10000);
    const maxCredit = tableCreditMax(table) || Math.max(desiredNet * 1.7, minCredit);
    const prazo = tableDeadline(table);
    const feePct = tableFeePct(table);
    const maxEmb = Math.max(0, Math.min(50, maxEmbeddedPct(admin, table)));
    const possibleGroups = groups.filter((g) => groupMatches(g, admin, input.segmento));
    const group = possibleGroups[0] || null;
    const avgPct = groupAveragePct(group);

    const factors = input.estrategia === "agressiva" ? [1, 1.15, 1.3, 1.5] : input.estrategia === "conservadora" ? [1, 1.08, 1.18] : [1, 1.1, 1.25, 1.4];
    const embeddedOptions = input.embutido === "nao" ? [0] : input.embutido === "sim" ? [Math.min(25, maxEmb)] : [0, Math.min(15, maxEmb), Math.min(25, maxEmb)];

    for (const factor of factors) {
      const credit = Math.min(maxCredit, Math.max(minCredit, desiredNet * factor));
      for (const embPct of embeddedOptions) {
        const embedded = credit * (embPct / 100);
        const totalBid = ownBid + embedded;
        const net = Math.max(0, credit - embedded);
        const totalWithFee = credit * (1 + feePct / 100);
        const installment = totalWithFee / Math.max(1, prazo);
        const bidPct = credit > 0 ? (totalBid / credit) * 100 : 0;

        const motivos: string[] = [];
        const alertas: string[] = [];
        let score = 45;

        const netGap = Math.abs(net - desiredNet) / desiredNet;
        if (net >= desiredNet) {
          score += 18;
          motivos.push("crédito líquido atende o valor desejado");
        } else {
          score -= Math.min(18, netGap * 40);
          alertas.push("crédito líquido ficou abaixo do solicitado");
        }

        if (installment <= desiredInstallment) {
          score += 18;
          motivos.push("parcela estimada dentro do orçamento informado");
        } else {
          const over = (installment - desiredInstallment) / desiredInstallment;
          score -= Math.min(22, over * 55);
          alertas.push("parcela estimada passa do limite informado");
        }

        if (ownBid > 0) {
          score += 7;
          motivos.push("usa lance próprio disponível do cliente");
        }

        if (embPct > 0) {
          if (input.estrategia === "conservadora") score -= 3;
          else score += 6;
          motivos.push(`usa lance embutido de ${brPct(embPct)} para aumentar poder de oferta`);
        } else {
          motivos.push("preserva o crédito sem lance embutido");
        }

        if (avgPct !== null) {
          if (bidPct >= avgPct + 2) {
            score += 16;
            motivos.push(`lance ofertado acima da média do grupo (${brPct(avgPct)})`);
          } else if (bidPct >= avgPct) {
            score += 10;
            motivos.push(`lance ofertado próximo/acima da média do grupo (${brPct(avgPct)})`);
          } else {
            score -= 8;
            alertas.push(`lance ofertado abaixo da média do grupo (${brPct(avgPct)})`);
          }
        } else {
          score += 2;
          alertas.push("sem média histórica de lance cadastrada para este grupo");
        }

        if (desiredMonths > 0) {
          if (avgPct !== null && bidPct >= avgPct && desiredMonths <= 6) score += 5;
          if (desiredMonths <= 3 && (avgPct === null || bidPct < avgPct + 4)) {
            score -= 8;
            alertas.push("prazo de contemplação muito curto para a força do lance estimada");
          }
        }

        const estrategia = embPct > 0 ? "Lance próprio + embutido" : "Lance próprio sem embutido";
        const finalScore = Math.max(0, Math.min(100, Math.round(score)));

        results.push({
          id: safeId(admin.id, table.id, group?.id, Math.round(credit), Math.round(embPct * 100)),
          admin,
          table,
          group,
          score: finalScore,
          scoreLabel: scoreLabel(finalScore),
          creditoContratado: credit,
          creditoLiquido: net,
          parcelaEstimada: installment,
          lanceProprio: ownBid,
          lanceEmbutido: embedded,
          lanceTotal: totalBid,
          lanceTotalPct: bidPct,
          mediaGrupoPct: avgPct,
          prazo,
          segmento: String(table.segmento || input.segmento || "Não informado"),
          estrategia,
          motivos: motivos.slice(0, 4),
          alertas: alertas.slice(0, 3),
        });
      }
    }
  }

  const unique = new Map<string, RadarOffer>();
  for (const offer of results.sort((a, b) => b.score - a.score)) {
    const key = `${offer.admin.id}-${offer.table.id}-${Math.round(offer.creditoContratado)}-${Math.round(offer.lanceEmbutido)}`;
    if (!unique.has(key)) unique.set(key, offer);
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 24);
}

function OfferCard({ offer, rank, onOpen, onCopy }: { offer: RadarOffer; rank: number; onOpen: () => void; onCopy: () => void }) {
  const scoreColor = offer.score >= 86 ? "#166534" : offer.score >= 72 ? C.navy : offer.score >= 58 ? "#92400e" : C.ruby;

  return (
    <Card className="overflow-hidden rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-start md:justify-between" style={{ background: "linear-gradient(135deg, rgba(255,255,255,.96), rgba(245,245,245,.82))" }}>
          <div className="flex gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: rank === 1 ? C.ruby : C.navy }}>
              {rank === 1 ? <Trophy className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.18em]" style={{ color: C.gold }}>#{rank} • {offer.scoreLabel}</div>
              <h3 className="mt-1 text-lg font-black" style={{ color: C.navy }}>{offer.admin.name}</h3>
              <p className="text-sm text-slate-600">{offer.table.nome_tabela || offer.table.name || "Tabela sugerida"} {offer.group?.codigo ? `• Grupo ${offer.group.codigo}` : ""}</p>
            </div>
          </div>

          <div className="rounded-2xl border px-4 py-3 text-center" style={{ borderColor: "rgba(30,41,63,.12)", color: scoreColor }}>
            <div className="text-2xl font-black">{offer.score}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[.14em]">score</div>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-4">
          <Metric label="Crédito contratado" value={brMoney(offer.creditoContratado)} />
          <Metric label="Crédito líquido" value={brMoney(offer.creditoLiquido)} />
          <Metric label="Parcela estimada" value={brMoney(offer.parcelaEstimada)} />
          <Metric label="Lance total" value={`${brMoney(offer.lanceTotal)} • ${brPct(offer.lanceTotalPct)}`} />
        </div>

        <div className="grid gap-4 px-5 pb-5 md:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border bg-white/70 p-4">
            <div className="mb-2 text-sm font-bold" style={{ color: C.navy }}>Por que entrou no radar</div>
            <div className="space-y-2">
              {offer.motivos.map((m) => (
                <div key={m} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{m}</span>
                </div>
              ))}
              {offer.alertas.map((m) => (
                <div key={m} className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white/70 p-4 text-sm text-slate-700">
            <div className="mb-2 font-bold" style={{ color: C.navy }}>Estratégia sugerida</div>
            <p>{offer.estrategia}</p>
            <p className="mt-2">Lance próprio: <b>{brMoney(offer.lanceProprio)}</b></p>
            <p>Embutido: <b>{brMoney(offer.lanceEmbutido)}</b></p>
            <p>Média do grupo: <b>{offer.mediaGrupoPct === null ? "não cadastrada" : brPct(offer.mediaGrupoPct)}</b></p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
          <Button variant="outline" className="rounded-2xl" onClick={onCopy}>
            <Copy className="mr-2 h-4 w-4" /> Copiar resumo
          </Button>
          <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={onOpen}>
            Abrir simulador <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/75 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

export default function RadarOfertas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [tables, setTables] = useState<AnyRow[]>([]);
  const [groups, setGroups] = useState<AnyRow[]>([]);
  const [input, setInput] = useState<RadarInput>(DEFAULT_INPUT);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const [adminsRes, tablesRes, groupsRes, maggiGroupsRes] = await Promise.all([
        supabase.from("sim_admins").select("*").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("groups").select("*"),
        supabase.from("sim_maggi_groups").select("*"),
      ]);

      if (!alive) return;

      setAdmins(((adminsRes.data || []) as AdminRow[]).filter((a) => a.id && a.name));
      setTables((tablesRes.data || []) as AnyRow[]);
      setGroups([...(groupsRes.data || []), ...(maggiGroupsRes.data || [])] as AnyRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const segmentos = useMemo(() => {
    const set = new Set<string>();
    for (const table of tables) {
      const value = String(table.segmento || table.produto || "").trim();
      if (value) set.add(value);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tables]);

  const offers = useMemo(() => buildOffers(input, admins, tables, groups), [input, admins, tables, groups]);

  const bestByAdmin = useMemo(() => {
    const map = new Map<string, RadarOffer>();
    for (const offer of offers) {
      if (!map.has(offer.admin.id)) map.set(offer.admin.id, offer);
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }, [offers]);

  function update<K extends keyof RadarInput>(key: K, value: RadarInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function copyOffer(offer: RadarOffer) {
    const text = [
      `Radar de Ofertas Consulmax`,
      `Administradora: ${offer.admin.name}`,
      `Tabela: ${offer.table.nome_tabela || offer.table.name || "Tabela sugerida"}`,
      offer.group?.codigo ? `Grupo: ${offer.group.codigo}` : null,
      `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
      `Crédito líquido estimado: ${brMoney(offer.creditoLiquido)}`,
      `Parcela estimada: ${brMoney(offer.parcelaEstimada)}`,
      `Lance próprio: ${brMoney(offer.lanceProprio)}`,
      `Lance embutido: ${brMoney(offer.lanceEmbutido)}`,
      `Lance total: ${brMoney(offer.lanceTotal)} (${brPct(offer.lanceTotalPct)})`,
      `Score: ${offer.score}/100 - ${offer.scoreLabel}`,
      `Estratégia: ${offer.estrategia}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard?.writeText(text).catch(() => {});
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Radar de Ofertas...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
        <div className="absolute -bottom-24 left-12 h-60 w-60 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="relative z-[1] max-w-4xl text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Target className="h-3.5 w-3.5" /> Radar de Ofertas
          </div>
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">Encontre a melhor estratégia antes de montar a proposta.</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            Informe o que o cliente deseja e o Radar cruza administradoras, tabelas, faixas de crédito, prazo, lance próprio, lance embutido e média do grupo para sugerir as melhores oportunidades.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" style={{ color: C.ruby }} />
            <div>
              <h2 className="text-lg font-black" style={{ color: C.navy }}>Buscar ofertas</h2>
              <p className="text-sm text-slate-600">A primeira versão usa uma engine aproximada e defensiva. Conforme a gente alimentar médias reais de grupos, o score fica mais preciso.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Crédito líquido desejado">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.creditoLiquido} onChange={(e) => update("creditoLiquido", e.target.value)} placeholder="150000" />
            </Field>
            <Field label="Parcela máxima">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaMax} onChange={(e) => update("parcelaMax", e.target.value)} placeholder="1500" />
            </Field>
            <Field label="Lance próprio disponível">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.lanceProprio} onChange={(e) => update("lanceProprio", e.target.value)} placeholder="30000" />
            </Field>
            <Field label="Prazo desejado para contemplação">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.prazoContemplacao} onChange={(e) => update("prazoContemplacao", e.target.value)} placeholder="6 meses" />
            </Field>

            <Field label="Segmento">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.segmento} onChange={(e) => update("segmento", e.target.value)}>
                <option value="">Todos</option>
                {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Administradora">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.adminId} onChange={(e) => update("adminId", e.target.value)}>
                <option value="todas">Todas</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Lance embutido">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.embutido} onChange={(e) => update("embutido", e.target.value as RadarInput["embutido"])}>
                <option value="auto">O sistema decide</option>
                <option value="sim">Forçar embutido</option>
                <option value="nao">Não usar embutido</option>
              </select>
            </Field>
            <Field label="Perfil da estratégia">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.estrategia} onChange={(e) => update("estrategia", e.target.value as RadarInput["estrategia"])}>
                <option value="conservadora">Conservadora</option>
                <option value="equilibrada">Equilibrada</option>
                <option value="agressiva">Agressiva</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={() => setInput(DEFAULT_INPUT)}>Limpar filtros</Button>
            <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => setSearched(true)}>
              <Search className="mr-2 h-4 w-4" /> Buscar melhores ofertas
            </Button>
          </div>
        </CardContent>
      </Card>

      {searched && (
        <div className="space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-white/75 px-3 py-1 text-xs font-semibold" style={{ color: C.ruby }}>
                <Sparkles className="h-3.5 w-3.5" /> {offers.length} possibilidades analisadas
              </div>
              <h2 className="mt-2 text-xl font-black" style={{ color: C.navy }}>Melhor oportunidade por administradora</h2>
              <p className="text-sm text-slate-600">O ranking abaixo evita repetir várias opções da mesma administradora no topo.</p>
            </div>
          </div>

          {bestByAdmin.length === 0 ? (
            <Card className="rounded-[28px] border bg-white/80 p-6 text-sm text-slate-600">
              Nenhuma combinação aderente foi encontrada com os dados atuais. Revise crédito líquido, parcela máxima ou cadastre faixas/médias de grupo nas tabelas.
            </Card>
          ) : (
            <div className="space-y-4">
              {bestByAdmin.map((offer, index) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  rank={index + 1}
                  onOpen={() => navigate(adminRoute(offer.admin))}
                  onCopy={() => copyOffer(offer)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
