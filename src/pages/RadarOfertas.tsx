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
  Database,
  Loader2,
  Search,
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

type SearchMode = "credito" | "parcela";

type RadarInput = {
  modo: SearchMode;
  segmento: string;
  adminId: string;
  creditoLiquido: string;
  parcelaDesejada: string;
  lanceProprio: string;
  prazoContemplacao: string;
  usarEmbutido: "sim" | "nao";
  embutidoPct: string;
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

const STORAGE_MANUAL_GROUPS = "@consulmax:radar-ofertas:manual-groups-v1";

const SAMPLE_GROUPS = `grupo;administradora;segmento;prazo_maximo;maior_pct_contemplado;menor_pct_contemplado
9974;Embracon;Automóvel;80;35,50;28,00
1201;Maggi;Imóvel;180;42,00;31,00
5010;BB Consórcios;Automóvel;84;30,00;25,00`;

const DEFAULT_INPUT: RadarInput = {
  modo: "credito",
  segmento: "",
  adminId: "todas",
  creditoLiquido: "150000",
  parcelaDesejada: "1500",
  lanceProprio: "30000",
  prazoContemplacao: "6",
  usarEmbutido: "sim",
  embutidoPct: "25",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function adminSlug(admin: AdminRow) {
  return admin.slug || slugify(admin.name);
}

function isAvailableAdmin(admin: AdminRow) {
  const key = `${adminSlug(admin)} ${normalizeText(admin.name)}`;
  return (
    key.includes("embracon") ||
    key.includes("maggi") ||
    key.includes("bb-consorcios") ||
    key.includes("bb consorcios") ||
    key.includes("banco do brasil")
  );
}

function adminRoute(admin: AdminRow) {
  const key = `${adminSlug(admin)} ${normalizeText(admin.name)}`;
  if (key.includes("maggi")) return "/simuladores/maggi";
  if (key.includes("bb-consorcios") || key.includes("bb consorcios") || key.includes("banco do brasil") || key.includes("bb"))
    return "/simuladores/bb-consorcios";
  if (key.includes("embracon")) return "/simuladores/embracon";
  return `/simuladores/${adminSlug(admin)}`;
}

function tableCreditMin(table: AnyRow) {
  return (
    pickNumber(table, ["faixa_credito_min", "credito_min", "min_credit", "valor_min", "minimo", "credito_de"]) ||
    onlyNumber(findByKey(table, ["faixa", "min"])) ||
    onlyNumber(findByKey(table, ["credito", "min"])) ||
    10_000
  );
}

function tableCreditMax(table: AnyRow) {
  return (
    pickNumber(table, ["faixa_credito_max", "credito_max", "max_credit", "valor_max", "maximo", "credito_ate", "credito_disponivel", "credito"]) ||
    onlyNumber(findByKey(table, ["faixa", "max"])) ||
    onlyNumber(findByKey(table, ["credito", "max"])) ||
    2_000_000
  );
}

function tableDeadline(table: AnyRow) {
  return pickNumber(table, ["prazo_limite", "prazo_maximo", "prazo", "max_prazo", "prazo_meses", "prazo_encerramento_meses"]) || 240;
}

function tableFeePct(table: AnyRow) {
  const raw =
    pickNumber(table, ["taxa_adm", "taxa_admin", "taxa_administracao", "administration_fee", "taxa"]) ||
    onlyNumber(findByKey(table, ["tax"])) ||
    18;
  return raw <= 1 ? raw * 100 : raw;
}

function maxEmbeddedPct(admin: AdminRow, table: AnyRow) {
  const behavior = admin.behavior || {};
  const raw =
    pickNumber(table, ["lance_embutido_max", "max_embutido", "embutido_max", "lance_embutido_pct", "max_lance_embutido"]) ||
    pickNumber(behavior, ["lance_embutido_max", "max_embutido", "embutido_max", "max_lance_embutido"]) ||
    25;
  return clamp(raw <= 1 ? raw * 100 : raw, 0, 80);
}

function groupAveragePct(group: AnyRow | null | undefined) {
  if (!group) return null;
  const raw =
    pickNumber(group, ["mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    onlyNumber(findByKey(group, ["media", "lance"])) ||
    onlyNumber(findByKey(group, ["mediana"]));
  if (!raw) return null;
  return raw <= 1 ? raw * 100 : raw;
}

function rowSegment(row: AnyRow) {
  return String(row.segmento || row.produto || row.category || "").trim();
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

function reducerOptions(table: AnyRow) {
  const haystack = normalizeText(
    `${Object.keys(table || {}).join(" ")} ${table.forma_contratacao || ""} ${table.redutor || ""} ${table.reduzida || ""} ${table.tipo_parcela || ""}`
  );
  const options = new Set<number>([1]);
  if (haystack.includes("25")) options.add(0.75);
  if (haystack.includes("50")) options.add(0.5);
  return [...options].sort((a, b) => a - b);
}

function splitManualLine(line: string) {
  if (line.includes(";")) return line.split(";");
  if (line.includes("\t")) return line.split("\t");
  return line.split(",");
}

function parseManualGroups(text: string): AnyRow[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const first = normalizeText(lines[0]);
  const hasHeader = first.includes("grupo") && first.includes("administradora");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map((line, index) => {
      const cols = splitManualLine(line).map((col) => col.trim());
      const [grupo, administradora, segmento, prazoMaximo, maiorPct, menorPct] = cols;
      const high = onlyNumber(maiorPct);
      const low = onlyNumber(menorPct);
      const mediana = high > 0 && low > 0 ? (high + low) / 2 : high || low || 0;

      if (!grupo || !administradora || !segmento) return null;

      return {
        id: `manual-${index}-${grupo}`,
        codigo: grupo,
        grupo,
        administradora,
        segmento,
        prazo_maximo: onlyNumber(prazoMaximo),
        prazo_limite: onlyNumber(prazoMaximo),
        maior_pct_contemplado: high,
        menor_pct_contemplado: low,
        mediana_lance: mediana,
        _manual: true,
      } as AnyRow;
    })
    .filter(Boolean) as AnyRow[];
}

function tableFromManualGroup(group: AnyRow, admin: AdminRow): AnyRow {
  return {
    ...group,
    id: group.id || group.codigo || group.grupo,
    admin_id: admin.id,
    nome_tabela: group.nome_tabela || group.nome || `Grupo ${group.codigo || group.grupo || "disponível"}`,
    faixa_credito_min: pickNumber(group, ["faixa_credito_min", "credito_min", "valor_min"]) || 10_000,
    faixa_credito_max: tableCreditMax(group),
    prazo_limite: tableDeadline(group),
    _source: "manual_group",
  };
}

function buildScenario(params: {
  input: RadarInput;
  admin: AdminRow;
  table: AnyRow;
  group: AnyRow | null;
  credit: number;
  reducer: number;
}) {
  const { input, admin, table, group, credit, reducer } = params;
  const desiredNet = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const ownBid = onlyNumber(input.lanceProprio);
  const desiredMonths = Math.max(0, onlyNumber(input.prazoContemplacao));

  const requestedEmbPct = onlyNumber(input.embutidoPct);
  const limitEmbPct = maxEmbeddedPct(admin, table);
  const embPct = input.usarEmbutido === "sim" ? clamp(requestedEmbPct, 0, limitEmbPct) : 0;

  const embedded = credit * (embPct / 100);
  const totalBid = ownBid + embedded;
  const net = Math.max(0, credit - embedded);
  const prazo = group ? Math.min(tableDeadline(table), tableDeadline(group)) : tableDeadline(table);
  const totalWithFee = credit * (1 + tableFeePct(table) / 100);
  const installment = (totalWithFee / Math.max(1, prazo)) * reducer;
  const bidPct = credit > 0 ? (totalBid / credit) * 100 : 0;
  const avgPct = groupAveragePct(group);

  const motivos: string[] = [];
  const alertas: string[] = [];
  let score = 45;

  if (input.modo === "credito") {
    if (net >= desiredNet) {
      score += 22;
      motivos.push("crédito líquido atende o valor desejado");
    } else {
      score -= 18;
      alertas.push("crédito líquido ficou abaixo do solicitado");
    }

    if (desiredInstallment > 0) {
      if (installment <= desiredInstallment) {
        score += 10;
        motivos.push("parcela estimada dentro do orçamento informado");
      } else {
        score -= 12;
        alertas.push("parcela estimada passa do limite informado");
      }
    }
  } else {
    if (installment <= desiredInstallment) {
      score += 24;
      motivos.push("parcela estimada atende ao valor informado");
    } else {
      score -= 22;
      alertas.push("parcela estimada passa do limite informado");
    }

    motivos.push(`com essa parcela, estima crédito líquido de ${brMoney(net)}`);
  }

  if (input.usarEmbutido === "sim" && requestedEmbPct > limitEmbPct) {
    alertas.push(`embutido limitado ao máximo configurado: ${brPct(limitEmbPct)}`);
  }

  if (embPct > 0) motivos.push(`usa lance embutido de ${brPct(embPct)}`);
  else motivos.push("não utiliza lance embutido");

  if (reducer < 1) motivos.push(`simula parcela reduzida de ${brPct(reducer * 100)} da parcela cheia`);

  if (avgPct !== null) {
    if (bidPct >= avgPct + 2) {
      score += 18;
      motivos.push(`lance ofertado acima da mediana/média do grupo (${brPct(avgPct)})`);
    } else if (bidPct >= avgPct) {
      score += 12;
      motivos.push(`lance ofertado próximo da mediana/média do grupo (${brPct(avgPct)})`);
    } else {
      score -= 10;
      alertas.push(`lance ofertado abaixo da mediana/média do grupo (${brPct(avgPct)})`);
    }
  } else {
    alertas.push("sem média/mediana de lance cadastrada para este grupo");
  }

  if (desiredMonths > 0 && desiredMonths <= 3 && (avgPct === null || bidPct < avgPct + 4)) {
    score -= 7;
    alertas.push("prazo de contemplação muito curto para a força do lance estimada");
  }

  const finalScore = clamp(Math.round(score), 0, 100);

  return {
    id: safeId(admin.id, table.id, group?.id, Math.round(credit), Math.round(embPct * 100), Math.round(reducer * 100)),
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
    segmento: String(table.segmento || group?.segmento || input.segmento || "Não informado"),
    estrategia: embPct > 0 ? "Lance próprio + embutido" : "Lance próprio sem embutido",
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
  } satisfies RadarOffer;
}

function buildOffers(input: RadarInput, admins: AdminRow[], tables: AnyRow[], groups: AnyRow[]) {
  const desiredNet = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  if (input.modo === "credito" && !desiredNet) return [];
  if (input.modo === "parcela" && !desiredInstallment) return [];

  const selectedAdmins = admins.filter((a) => (input.adminId === "todas" || a.id === input.adminId) && isAvailableAdmin(a));
  const byAdmin = new Map(selectedAdmins.map((a) => [a.id, a]));
  const results: RadarOffer[] = [];

  for (const table of tables) {
    const admin = byAdmin.get(String(table.admin_id || table.administradora_id || table.sim_admin_id || ""));
    if (!admin) continue;
    if (!matchesSegment(table, input.segmento)) continue;

    const possibleGroups = groups.filter((g) => groupMatches(g, admin, input.segmento || rowSegment(table)));
    const group = possibleGroups[0] || (table._source === "manual_group" || table._source === "sim_maggi_groups" ? table : null);

    const minCredit = tableCreditMin(table);
    const maxCredit = tableCreditMax(table);
    const prazo = tableDeadline(table);
    const feePct = tableFeePct(table);
    const reducers = reducerOptions(table);
    const credits: number[] = [];

    if (input.modo === "credito") {
      const embPct = input.usarEmbutido === "sim" ? clamp(onlyNumber(input.embutidoPct), 0, maxEmbeddedPct(admin, table)) : 0;
      const wantedGross = desiredNet / Math.max(0.1, 1 - embPct / 100);
      credits.push(clamp(wantedGross, minCredit, maxCredit));
      credits.push(clamp(wantedGross * 1.1, minCredit, maxCredit));
      credits.push(clamp(wantedGross * 1.25, minCredit, maxCredit));
    } else {
      for (const reducer of reducers) {
        const estimatedCredit = (desiredInstallment * prazo) / Math.max(0.1, 1 + feePct / 100) / Math.max(0.1, reducer);
        credits.push(clamp(estimatedCredit, minCredit, maxCredit));
        credits.push(clamp(estimatedCredit * 0.9, minCredit, maxCredit));
        credits.push(clamp(estimatedCredit * 1.1, minCredit, maxCredit));
      }
    }

    for (const credit of [...new Set(credits.map((value) => Math.round(value)))]) {
      for (const reducer of reducers) {
        results.push(buildScenario({ input, admin, table, group, credit, reducer }));
      }
    }
  }

  const unique = new Map<string, RadarOffer>();
  for (const offer of results.sort((a, b) => b.score - a.score)) {
    const key = `${offer.admin.id}-${offer.table.id}-${Math.round(offer.creditoContratado)}-${Math.round(offer.lanceEmbutido)}-${Math.round(offer.parcelaEstimada)}`;
    if (!unique.has(key)) unique.set(key, offer);
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 30);
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
              <p className="text-sm text-slate-600">{offer.table.nome_tabela || offer.table.name || "Tabela/Grupo sugerido"} {offer.group?.codigo ? `• Grupo ${offer.group.codigo}` : ""}</p>
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
            <p>Mediana/média: <b>{offer.mediaGrupoPct === null ? "não cadastrada" : brPct(offer.mediaGrupoPct)}</b></p>
            <p>Prazo base: <b>{offer.prazo} meses</b></p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function RadarOfertas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [tables, setTables] = useState<AnyRow[]>([]);
  const [groupsDb, setGroupsDb] = useState<AnyRow[]>([]);
  const [manualGroupsText, setManualGroupsText] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_MANUAL_GROUPS) || "";
    } catch {
      return "";
    }
  });
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

      const loadedAdmins = ((adminsRes.data || []) as AdminRow[]).filter((a) => a.id && a.name && isAvailableAdmin(a));
      const maggiAdmin = loadedAdmins.find((a) => normalizeText(a.name).includes("maggi") || normalizeText(a.slug).includes("maggi"));

      const simTables = ((tablesRes.data || []) as AnyRow[]).map((table) => ({ ...table, _source: "sim_tables" }));
      const maggiTables = ((maggiGroupsRes.data || []) as AnyRow[])
        .map((group) => ({
          ...group,
          admin_id: group.admin_id || maggiAdmin?.id,
          _source: "sim_maggi_groups",
          nome_tabela: group.nome_tabela || group.nome || `Grupo Maggi ${group.codigo || group.grupo || ""}`,
        }))
        .filter((group) => group.admin_id);

      setAdmins(loadedAdmins);
      setTables([...simTables, ...maggiTables].filter((table) => table.admin_id));
      setGroupsDb((groupsRes.data || []) as AnyRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MANUAL_GROUPS, manualGroupsText);
    } catch {}
  }, [manualGroupsText]);

  const manualGroups = useMemo(() => parseManualGroups(manualGroupsText), [manualGroupsText]);

  const manualTables = useMemo(() => {
    return manualGroups
      .map((group) => {
        const admin = admins.find((a) => {
          const adminName = normalizeText(a.name);
          const groupAdmin = normalizeText(group.administradora);
          return adminName.includes(groupAdmin) || groupAdmin.includes(adminName);
        });

        return admin ? tableFromManualGroup(group, admin) : null;
      })
      .filter(Boolean) as AnyRow[];
  }, [manualGroups, admins]);

  const effectiveTables = useMemo(() => [...tables, ...manualTables], [tables, manualTables]);
  const allGroups = useMemo(() => [...groupsDb, ...manualGroups, ...manualTables], [groupsDb, manualGroups, manualTables]);

  const availableAdmins = useMemo(() => {
    return admins.filter((admin) => effectiveTables.some((table) => String(table.admin_id) === admin.id));
  }, [admins, effectiveTables]);

  const segmentos = useMemo(() => {
    const set = new Set<string>();
    for (const table of effectiveTables) {
      const value = rowSegment(table);
      if (value) set.add(value);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [effectiveTables]);

  const offers = useMemo(() => buildOffers(input, availableAdmins, effectiveTables, allGroups), [input, availableAdmins, effectiveTables, allGroups]);

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
      `Tabela/Grupo: ${offer.table.nome_tabela || offer.table.name || "Sugestão"}`,
      offer.group?.codigo ? `Grupo: ${offer.group.codigo}` : null,
      `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
      `Crédito líquido estimado: ${brMoney(offer.creditoLiquido)}`,
      `Parcela estimada: ${brMoney(offer.parcelaEstimada)}`,
      `Lance próprio: ${brMoney(offer.lanceProprio)}`,
      `Lance embutido: ${brMoney(offer.lanceEmbutido)}`,
      `Lance total: ${brMoney(offer.lanceTotal)} (${brPct(offer.lanceTotalPct)})`,
      `Mediana/média: ${offer.mediaGrupoPct === null ? "não cadastrada" : brPct(offer.mediaGrupoPct)}`,
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
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">Encontre oportunidade por crédito ou por parcela.</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            O Radar busca apenas administradoras disponíveis com tabelas ou grupos cadastrados, limita o lance embutido pela configuração e usa médias/medianas para ranquear as melhores alternativas.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black" style={{ color: C.navy }}>Buscar ofertas</h2>
            <p className="text-sm text-slate-600">Escolha se o ponto de partida é o crédito líquido desejado ou o valor da parcela.</p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => update("modo", "credito")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "credito" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "credito" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por crédito</div>
              <div className="text-sm text-slate-600">Informe o crédito líquido e veja a parcela estimada.</div>
            </button>
            <button
              type="button"
              onClick={() => update("modo", "parcela")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "parcela" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "parcela" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por parcela</div>
              <div className="text-sm text-slate-600">Informe a parcela e veja quanto crédito dá para contratar.</div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {input.modo === "credito" ? (
              <Field label="Crédito líquido desejado">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.creditoLiquido} onChange={(e) => update("creditoLiquido", e.target.value)} placeholder="150000" />
              </Field>
            ) : (
              <Field label="Parcela desejada">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}

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
                <option value="todas">Todas disponíveis</option>
                {availableAdmins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Usar lance embutido?">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.usarEmbutido} onChange={(e) => update("usarEmbutido", e.target.value as RadarInput["usarEmbutido"])}>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </Field>
            <Field label="% de embutido utilizado">
              <input
                disabled={input.usarEmbutido === "nao"}
                className="w-full rounded-2xl border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                value={input.embutidoPct}
                onChange={(e) => update("embutidoPct", e.target.value)}
                placeholder="25"
              />
            </Field>
            {input.modo === "credito" && (
              <Field label="Parcela máxima opcional">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={() => setInput(DEFAULT_INPUT)}>Limpar filtros</Button>
            <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => setSearched(true)}>
              <Search className="mr-2 h-4 w-4" /> Buscar melhores ofertas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-4 flex items-start gap-2">
            <Database className="mt-1 h-5 w-5" style={{ color: C.ruby }} />
            <div>
              <h2 className="text-lg font-black" style={{ color: C.navy }}>Grupos disponíveis e resultados de assembleia</h2>
              <p className="text-sm text-slate-600">Cole os dados no modelo: grupo; administradora; segmento; prazo máximo; maior % contemplado; menor % contemplado. O Radar calcula a mediana automaticamente.</p>
            </div>
          </div>
          <textarea
            value={manualGroupsText}
            onChange={(e) => setManualGroupsText(e.target.value)}
            rows={6}
            className="w-full rounded-2xl border bg-white/80 p-3 font-mono text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#A11C27]/20"
            placeholder={SAMPLE_GROUPS}
          />
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{manualGroups.length} grupo(s) lido(s) desta área manual.</span>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setManualGroupsText(SAMPLE_GROUPS)}>Usar exemplo</Button>
          </div>
        </CardContent>
      </Card>

      {searched && (
        <div className="space-y-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/75 px-3 py-1 text-xs font-semibold" style={{ color: C.ruby }}>
              <Sparkles className="h-3.5 w-3.5" /> {offers.length} possibilidades analisadas
            </div>
            <h2 className="mt-2 text-xl font-black" style={{ color: C.navy }}>Melhor oportunidade por administradora</h2>
            <p className="text-sm text-slate-600">Administradoras sem simulador disponível ou sem tabela/grupo cadastrado não entram no ranking.</p>
          </div>

          {bestByAdmin.length === 0 ? (
            <Card className="rounded-[28px] border bg-white/80 p-6 text-sm text-slate-600">
              Nenhuma combinação aderente foi encontrada com os dados atuais. Revise crédito/parcela, segmento ou cadastre faixas e médias de grupo.
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
