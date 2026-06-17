// src/pages/CentralGrupos.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Database, Loader2, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";

type AnyRow = Record<string, any>;

type GrupoCentral = {
  id: string;
  origem: "bb" | "maggi";
  administradora: string;
  grupo: string;
  nome: string;
  segmento: string;
  creditoMin: number;
  creditoMax: number;
  prazoMax: number;
  maiorPct: number | null;
  menorPct: number | null;
  medianaPct: number | null;
  lanceEmbutidoMaxPct: number | null;
  ativo: boolean;
  observacoes: string;
  raw: AnyRow;
};

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

function brMoney(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function brPct(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const value = Number(v) <= 1 ? Number(v) * 100 : Number(v);
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function n(v: unknown) {
  const value = Number(v || 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizePct(v: unknown) {
  const value = n(v);
  if (!value) return null;
  return value <= 1 ? value * 100 : value;
}

function normalizeSegmento(value: unknown) {
  const raw = String(value || "").trim();
  const map: Record<string, string> = {
    auto_ipca: "Auto IPCA",
    auto_fipe: "Auto FIPE",
    automoveis: "Automóveis",
    imoveis: "Imóveis",
    pesados: "Pesados",
    outros_bens: "Outros Bens",
  };
  return map[raw] || raw || "Não informado";
}

function creditRangeFromConfig(row: AnyRow) {
  const ranges = Array.isArray(row?.config?.creditRanges) ? row.config.creditRanges : [];
  const values = ranges.map((r: AnyRow) => n(r.valor)).filter((v: number) => v > 0);
  const legacyMin = n(row.credito_min);
  const legacyMax = n(row.credito_max);
  if (values.length) return { min: Math.min(...values), max: Math.max(...values) };
  return { min: legacyMin || legacyMax || 0, max: legacyMax || legacyMin || 0 };
}

function prazoMaxFrom(row: AnyRow) {
  const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : [];
  const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0);
  if (prazos.length) return Math.max(...prazos);
  return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min);
}

function lanceLivreFromConfig(row: AnyRow) {
  const opts = Array.isArray(row?.config?.lanceOptions) ? row.config.lanceOptions : [];
  const livre = opts.find((o: AnyRow) => String(o.key || "").includes("livre"));
  return normalizePct(livre?.pct);
}

function toBBGroup(row: AnyRow): GrupoCentral {
  const credit = creditRangeFromConfig(row);
  const minCont = lanceLivreFromConfig(row);
  const maior = normalizePct(row.maior_pct_contemplado || row.maior_pct_lance_livre || row.maior_lance_livre);
  const menor = normalizePct(row.menor_pct_contemplado || row.menor_pct_lance_livre || row.menor_lance_livre || minCont);
  const mediana = maior && menor ? (maior + menor) / 2 : maior || menor || minCont || null;

  return {
    id: `bb-${row.id}`,
    origem: "bb",
    administradora: "BB Consórcios",
    grupo: String(row.grupo || "—"),
    nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`),
    segmento: normalizeSegmento(row.segmento),
    creditoMin: credit.min,
    creditoMax: credit.max,
    prazoMax: prazoMaxFrom(row),
    maiorPct: maior,
    menorPct: menor,
    medianaPct: mediana,
    lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct),
    ativo: row.is_active !== false,
    observacoes: String(row.observacoes || row.config?.observacoesRegra || ""),
    raw: row,
  };
}

function toMaggiGroup(row: AnyRow): GrupoCentral {
  const credit = creditRangeFromConfig(row);
  const maxEmb = normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct);
  const maior = normalizePct(row.maior_pct_contemplado || row.maior_pct_lance_livre || row.maior_lance_livre);
  const menor = normalizePct(row.menor_pct_contemplado || row.menor_pct_lance_livre || row.menor_lance_livre);
  const mediana = maior && menor ? (maior + menor) / 2 : maior || menor || lanceLivreFromConfig(row) || null;

  return {
    id: `maggi-${row.id}`,
    origem: "maggi",
    administradora: "Maggi",
    grupo: String(row.grupo || "—"),
    nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`),
    segmento: normalizeSegmento(row.segmento),
    creditoMin: credit.min,
    creditoMax: credit.max,
    prazoMax: prazoMaxFrom(row),
    maiorPct: maior,
    menorPct: menor,
    medianaPct: mediana,
    lanceEmbutidoMaxPct: maxEmb,
    ativo: row.is_active !== false,
    observacoes: String(row.observacoes || row.perfil_grupo || row.config?.customRuleNotes || ""),
    raw: row,
  };
}

export default function CentralGrupos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bb, setBb] = useState<AnyRow[]>([]);
  const [maggi, setMaggi] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState("todas");
  const [status, setStatus] = useState("ativos");

  async function load() {
    setLoading(true);
    const [bbRes, maggiRes] = await Promise.all([
      supabase.from("sim_bb_groups").select("*").order("grupo", { ascending: true }),
      supabase.from("sim_maggi_groups").select("*").order("grupo", { ascending: true }),
    ]);

    setBb((bbRes.data || []) as AnyRow[]);
    setMaggi((maggiRes.data || []) as AnyRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const grupos = useMemo(() => [...bb.map(toBBGroup), ...maggi.map(toMaggiGroup)], [bb, maggi]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grupos.filter((g) => {
      if (admin !== "todas" && g.origem !== admin) return false;
      if (status === "ativos" && !g.ativo) return false;
      if (status === "inativos" && g.ativo) return false;
      if (!q) return true;
      return `${g.administradora} ${g.grupo} ${g.nome} ${g.segmento}`.toLowerCase().includes(q);
    });
  }, [grupos, query, admin, status]);

  const ativos = grupos.filter((g) => g.ativo).length;
  const comMediana = grupos.filter((g) => g.medianaPct !== null).length;

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Central de Grupos...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section className="rounded-[30px] border p-6 md:p-8 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
          <Database className="h-3.5 w-3.5" /> Central de Grupos
        </div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tight">Grupos ativos e disponíveis para o Radar de Ofertas</h1>
        <p className="mt-3 max-w-3xl text-sm md:text-base text-white/80">
          Esta central consolida os grupos cadastrados nos simuladores BB Consórcios e Maggi, incluindo segmento, faixa de crédito, prazo, lance embutido e média/mediana da última assembleia quando houver informação cadastrada.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total de grupos" value={String(grupos.length)} hint="BB + Maggi cadastrados" />
        <Metric title="Grupos ativos" value={String(ativos)} hint="Entram no Radar de Ofertas" />
        <Metric title="Com mediana/média" value={String(comMediana)} hint="Base para ranquear lance livre" />
      </div>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" style={{ color: C.ruby }} />
            <h2 className="font-black" style={{ color: C.navy }}>Filtros</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.5fr_.8fr_.8fr_auto]">
            <label className="relative block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-2xl border py-2 pl-9 pr-3 text-sm" placeholder="Buscar por grupo, segmento ou administradora" />
            </label>
            <select value={admin} onChange={(e) => setAdmin(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm">
              <option value="todas">Todas</option>
              <option value="bb">BB Consórcios</option>
              <option value="maggi">Maggi</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm">
              <option value="ativos">Ativos</option>
              <option value="todos">Todos</option>
              <option value="inativos">Inativos</option>
            </select>
            <Button variant="outline" className="rounded-2xl" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Administradora</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">Segmento</th>
                <th className="px-4 py-3">Faixa de crédito</th>
                <th className="px-4 py-3">Prazo máx.</th>
                <th className="px-4 py-3">Maior %</th>
                <th className="px-4 py-3">Menor %</th>
                <th className="px-4 py-3">Mediana</th>
                <th className="px-4 py-3">Embutido máx.</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="border-t hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-semibold" style={{ color: C.navy }}>{g.administradora}</td>
                  <td className="px-4 py-3"><div className="font-bold">{g.grupo}</div><div className="max-w-[220px] truncate text-xs text-slate-500">{g.nome}</div></td>
                  <td className="px-4 py-3">{g.segmento}</td>
                  <td className="px-4 py-3">{brMoney(g.creditoMin)} até {brMoney(g.creditoMax)}</td>
                  <td className="px-4 py-3">{g.prazoMax || "—"} meses</td>
                  <td className="px-4 py-3">{brPct(g.maiorPct)}</td>
                  <td className="px-4 py-3">{brPct(g.menorPct)}</td>
                  <td className="px-4 py-3 font-bold" style={{ color: C.ruby }}>{brPct(g.medianaPct)}</td>
                  <td className="px-4 py-3">{brPct(g.lanceEmbutidoMaxPct)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${g.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{g.ativo ? "Ativo" : "Inativo"}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Nenhum grupo encontrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: C.navy }}><Bot className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black" style={{ color: C.navy }}>Robô das administradoras</h2>
            <p className="text-sm text-slate-600">Preparado como próxima fase: o robô deve rodar no backend, com credenciais criptografadas, registro de logs e sem expor usuário/senha no navegador.</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700"><ShieldCheck className="h-4 w-4" /> Não vamos salvar senha em tela de frontend nem commitar credenciais no GitHub.</div>
          </div>
          <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => navigate("/radar-ofertas")}>Abrir Radar <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, hint }: { title: string; value: string; hint: string }) {
  return <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur"><CardContent className="p-5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div><div className="mt-1 text-3xl font-black" style={{ color: C.navy }}>{value}</div><div className="mt-1 text-xs text-slate-500">{hint}</div></CardContent></Card>;
}
