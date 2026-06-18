import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, CheckCircle2, Database, Loader2, RefreshCw, Search, SlidersHorizontal, XCircle } from "lucide-react";

type AnyRow = Record<string, any>;
type StepStatus = "pending" | "running" | "done" | "error";
type MedianSort = "none" | "asc" | "desc";
type SyncMode = "bb" | "bb_assemblies" | "maggi" | null;

type SyncStep = { key: string; label: string; status: StepStatus; found?: number; message?: string };
type AssemblyProgress = { total: number; done: number; success: number; error: number; currentGroup: string; running: boolean };
type GrupoCentral = { id: string; origem: "bb" | "maggi"; administradora: string; grupo: string; nome: string; segmento: string; creditoMin: number; creditoMax: number; prazoMax: number; maiorPct: number | null; menorPct: number | null; medianaPct: number | null; lanceEmbutidoMaxPct: number | null; ativo: boolean };

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };
const BB_SEGMENTS = [
  { key: "auto_ipca", label: "Auto IPCA" },
  { key: "auto_fipe", label: "Auto FIPE" },
  { key: "outros_bens", label: "Outros Bens" },
  { key: "pesados", label: "Pesados" },
  { key: "motocicleta", label: "Motocicleta" },
  { key: "imoveis", label: "Imóveis" },
];

function brMoney(v: number) { return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }); }
function brPct(v?: number | null) { if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"; const value = Number(v) <= 1 ? Number(v) * 100 : Number(v); return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; }
function n(v: unknown) { const value = Number(v || 0); return Number.isFinite(value) ? value : 0; }
function normalizePct(v: unknown) { const value = n(v); if (!value) return null; return value <= 1 ? value * 100 : value; }
function normalizeSegmento(value: unknown) { const raw = String(value || "").trim(); const map: Record<string, string> = { auto_ipca: "Auto IPCA", auto_fipe: "Auto FIPE", automoveis: "Automóveis", imoveis: "Imóveis", pesados: "Pesados", outros_bens: "Outros Bens", motocicleta: "Motocicleta" }; return map[raw] || raw || "Não informado"; }
function creditRangeFromConfig(row: AnyRow) { const ranges = Array.isArray(row?.config?.creditRanges) ? row.config.creditRanges : []; const values = ranges.map((r: AnyRow) => n(r.valor)).filter((v: number) => v > 0); const legacyMin = n(row.credito_min); const legacyMax = n(row.credito_max); if (values.length) return { min: Math.min(...values), max: Math.max(...values) }; return { min: legacyMin || legacyMax || 0, max: legacyMax || legacyMin || 0 }; }
function prazoMaxFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); if (prazos.length) return Math.max(...prazos); return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); }
function lanceLivreFromConfig(row: AnyRow) { const opts = Array.isArray(row?.config?.lanceOptions) ? row.config.lanceOptions : []; const livre = opts.find((o: AnyRow) => String(o.key || "").includes("livre")); return normalizePct(livre?.pct); }
function assemblyValue(row: AnyRow, field: "maiorPct" | "menorPct" | "medianaPct") { const fromConfig = row?.config?.assemblyResult?.[field]; if (fromConfig !== undefined && fromConfig !== null) return normalizePct(fromConfig); if (field === "maiorPct") return normalizePct(row.maior_pct_contemplado || row.maior_pct_lance_livre || row.maior_lance_livre); if (field === "menorPct") return normalizePct(row.menor_pct_contemplado || row.menor_pct_lance_livre || row.menor_lance_livre); return normalizePct(row.mediana_pct_contemplado || row.mediana_pct_lance_livre || row.mediana_lance_livre); }

function toBBGroup(row: AnyRow): GrupoCentral { const credit = creditRangeFromConfig(row); const minCont = lanceLivreFromConfig(row); const maior = assemblyValue(row, "maiorPct"); const menor = assemblyValue(row, "menorPct") || minCont; const medianaFromRobot = assemblyValue(row, "medianaPct"); const mediana = medianaFromRobot || (maior && menor ? (maior + menor) / 2 : maior || menor || minCont || null); return { id: `bb-${row.id}`, origem: "bb", administradora: "BB Consórcios", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false }; }
function toMaggiGroup(row: AnyRow): GrupoCentral { const credit = creditRangeFromConfig(row); const maior = normalizePct(row.maior_pct_contemplado || row.maior_pct_lance_livre || row.maior_lance_livre); const menor = normalizePct(row.menor_pct_contemplado || row.menor_pct_lance_livre || row.menor_lance_livre); const mediana = maior && menor ? (maior + menor) / 2 : maior || menor || lanceLivreFromConfig(row) || null; return { id: `maggi-${row.id}`, origem: "maggi", administradora: "Maggi", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false }; }
function newSteps(): SyncStep[] { return BB_SEGMENTS.map((s) => ({ ...s, status: "pending" })); }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export default function CentralGrupos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bb, setBb] = useState<AnyRow[]>([]);
  const [maggi, setMaggi] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState("todas");
  const [status, setStatus] = useState("ativos");
  const [segmento, setSegmento] = useState("todos");
  const [medianSort, setMedianSort] = useState<MedianSort>("none");
  const [syncing, setSyncing] = useState<SyncMode>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(null);
  const [syncSteps, setSyncSteps] = useState<SyncStep[]>([]);
  const [assemblyProgress, setAssemblyProgress] = useState<AssemblyProgress>({ total: 0, done: 0, success: 0, error: 0, currentGroup: "", running: false });
  const [assemblyErrors, setAssemblyErrors] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const [bbRes, maggiRes] = await Promise.all([supabase.from("sim_bb_groups").select("*").order("grupo", { ascending: true }), supabase.from("sim_maggi_groups").select("*").order("grupo", { ascending: true })]);
    setBb((bbRes.data || []) as AnyRow[]);
    setMaggi((maggiRes.data || []) as AnyRow[]);
    setLoading(false);
  }

  async function callRobot(administradora: "bb" | "maggi", payload: Record<string, any> = {}) {
    const { data } = await supabase.auth.getSession();
    const sessionToken = data.session?.access_token;
    if (!sessionToken) throw new Error("Sessão expirada. Faça login novamente.");
    const response = await fetch("/api/robots/sync-groups", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` }, body: JSON.stringify({ administradora, ...payload }) });
    const rawText = await response.text();
    let json: any = {};
    try { json = rawText ? JSON.parse(rawText) : {}; } catch { json = {}; }
    const rawPreview = rawText ? rawText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) : "";
    const message = json?.message || json?.error || rawPreview || `Robô retornou HTTP ${response.status} sem mensagem em JSON.`;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${message}`);
    return { json, message };
  }

  async function syncBBGroupsQueue() {
    setSyncSteps(newSteps());
    let total = 0;
    const errors: string[] = [];
    for (const item of BB_SEGMENTS) {
      setSyncSteps((steps) => steps.map((s) => s.key === item.key ? { ...s, status: "running", message: "Sincronizando grupos..." } : s));
      try { const { json, message } = await callRobot("bb", { segmento: item.key }); const found = Number(json?.found || 0); total += Number.isFinite(found) ? found : 0; setSyncSteps((steps) => steps.map((s) => s.key === item.key ? { ...s, status: "done", found, message } : s)); }
      catch (err: any) { const text = err?.message || "Erro ao sincronizar grupos."; errors.push(`${item.label}: ${text}`); setSyncSteps((steps) => steps.map((s) => s.key === item.key ? { ...s, status: "error", message: text } : s)); }
    }
    return { total, errors };
  }

  async function syncBBAssembliesQueue() {
    const { data, error } = await supabase.from("sim_bb_groups").select("grupo,is_active").eq("is_active", true).order("grupo", { ascending: true });
    if (error) throw error;
    const groups = Array.from(new Set((data || []).map((row: AnyRow) => String(row.grupo || "").trim()).filter((group: string) => group && group !== "000000")));
    setAssemblyErrors([]);
    setAssemblyProgress({ total: groups.length, done: 0, success: 0, error: 0, currentGroup: "", running: true });
    let success = 0;
    let failed = 0;
    for (const group of groups) {
      setAssemblyProgress((prev) => ({ ...prev, currentGroup: group, running: true }));
      try { await callRobot("bb", { tipo: "assembleia", grupo: group }); success += 1; setAssemblyProgress((prev) => ({ ...prev, done: prev.done + 1, success: prev.success + 1 })); }
      catch (err: any) { const text = err?.message || "Erro ao atualizar assembleia."; failed += 1; setAssemblyErrors((prev) => [`Grupo ${group}: ${text}`, ...prev].slice(0, 6)); setAssemblyProgress((prev) => ({ ...prev, done: prev.done + 1, error: prev.error + 1 })); }
      await sleep(500);
    }
    setAssemblyProgress((prev) => ({ ...prev, currentGroup: "", running: false }));
    return { total: groups.length, success, failed };
  }

  async function syncBBFullQueue() {
    setSyncing("bb");
    setSyncMessage(null);
    setAssemblyErrors([]);
    setAssemblyProgress({ total: 0, done: 0, success: 0, error: 0, currentGroup: "", running: false });
    try { const groupResult = await syncBBGroupsQueue(); await load(); const assemblyResult = await syncBBAssembliesQueue(); await load(); const type = groupResult.errors.length || assemblyResult.failed ? "warn" : "ok"; setSyncMessage({ type, text: `Sincronização BB concluída: ${groupResult.total} grupo(s) processado(s) e ${assemblyResult.success}/${assemblyResult.total} assembleia(s) atualizada(s).` }); }
    catch (err: any) { setSyncMessage({ type: "error", text: err?.message || "Erro ao sincronizar BB." }); }
    finally { setSyncing(null); }
  }

  async function syncBBAssembliesOnly() {
    setSyncing("bb_assemblies");
    setSyncMessage(null);
    setSyncSteps([]);
    setAssemblyErrors([]);
    setAssemblyProgress({ total: 0, done: 0, success: 0, error: 0, currentGroup: "", running: false });
    try {
      const assemblyResult = await syncBBAssembliesQueue();
      await load();
      const type = assemblyResult.failed ? "warn" : "ok";
      setSyncMessage({ type, text: `Resultado de assembleias BB concluído: ${assemblyResult.success}/${assemblyResult.total} assembleia(s) atualizada(s).` });
    } catch (err: any) {
      setSyncMessage({ type: "error", text: err?.message || "Erro ao sincronizar assembleias BB." });
    } finally {
      setSyncing(null);
    }
  }

  async function syncRobot(administradora: "bb" | "maggi") {
    if (administradora === "bb") { await syncBBFullQueue(); return; }
    setSyncing(administradora); setSyncMessage(null); setSyncSteps([]);
    try { const { json, message } = await callRobot(administradora); setSyncMessage({ type: json?.ok ? "ok" : "warn", text: message }); await load(); }
    catch (err: any) { setSyncMessage({ type: "error", text: err?.message || "Erro ao chamar robô." }); }
    finally { setSyncing(null); }
  }

  useEffect(() => { load(); }, []);
  const grupos = useMemo(() => [...bb.map(toBBGroup), ...maggi.map(toMaggiGroup)], [bb, maggi]);
  const segmentos = useMemo(() => Array.from(new Set(grupos.map((g) => g.segmento).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [grupos]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = grupos.filter((g) => { if (admin !== "todas" && g.origem !== admin) return false; if (status === "ativos" && !g.ativo) return false; if (status === "inativos" && g.ativo) return false; if (segmento !== "todos" && g.segmento !== segmento) return false; if (!q) return true; return `${g.administradora} ${g.grupo} ${g.nome} ${g.segmento}`.toLowerCase().includes(q); });
    if (medianSort === "none") return list;
    return [...list].sort((a, b) => { const av = a.medianaPct ?? Number.POSITIVE_INFINITY; const bv = b.medianaPct ?? Number.POSITIVE_INFINITY; return medianSort === "asc" ? av - bv : bv - av; });
  }, [grupos, query, admin, status, segmento, medianSort]);

  const ativos = grupos.filter((g) => g.ativo).length;
  const comMediana = grupos.filter((g) => g.medianaPct !== null).length;
  const finished = syncSteps.filter((s) => s.status === "done" || s.status === "error").length;
  const progress = syncSteps.length ? Math.round((finished / syncSteps.length) * 100) : 0;
  const assemblyPercent = assemblyProgress.total ? Math.round((assemblyProgress.done / assemblyProgress.total) * 100) : 0;
  function toggleMedianSort() { setMedianSort((current) => current === "none" ? "asc" : current === "asc" ? "desc" : "none"); }
  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Carregando Central de Grupos...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section className="rounded-[30px] border p-6 md:p-8 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium"><Database className="h-3.5 w-3.5" /> Central de Grupos</div><h1 className="text-2xl md:text-4xl font-black tracking-tight">Grupos ativos e disponíveis para o Radar de Ofertas</h1><p className="mt-3 max-w-3xl text-sm md:text-base text-white/80">Base consolidada dos grupos BB Consórcios e Maggi para uso no Radar de Ofertas.</p></section>
      <div className="grid gap-4 md:grid-cols-3"><Metric title="Total de grupos" value={String(grupos.length)} hint="BB + Maggi cadastrados" /><Metric title="Grupos ativos" value={String(ativos)} hint="Entram no Radar de Ofertas" /><Metric title="Com mediana/média" value={String(comMediana)} hint="Base para ranquear lance livre" /></div>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur"><CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-start"><div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: C.navy }}><Bot className="h-5 w-5" /></div><div><h2 className="font-black" style={{ color: C.navy }}>Robô das administradoras</h2><p className="text-sm text-slate-600">O botão BB sincroniza grupos por segmento e, em seguida, atualiza o resultado de assembleia dos grupos ativos. O botão temporário roda somente a fila de assembleias.</p>{syncSteps.length > 0 && <div className="mt-4 rounded-3xl border bg-white p-4"><div className="mb-3 flex justify-between text-sm font-semibold" style={{ color: C.navy }}><span>1. Grupos BB por segmento</span><span>{progress}%</span></div><div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: C.ruby }} /></div><div className="grid gap-2 md:grid-cols-2">{syncSteps.map((step) => <div key={step.key} className="flex items-start gap-2 rounded-2xl border bg-slate-50 px-3 py-2 text-xs">{step.status === "running" && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-600" />}{step.status === "done" && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />}{step.status === "error" && <XCircle className="mt-0.5 h-4 w-4 text-red-600" />}{step.status === "pending" && <span className="mt-1 h-3 w-3 rounded-full border border-slate-300" />}<div className="min-w-0"><div className="font-bold text-slate-800">{step.label}</div><div className="truncate text-slate-500">{step.status === "done" ? `${step.found || 0} grupo(s) processado(s)` : step.message || "Aguardando"}</div></div></div>)}</div></div>}{assemblyProgress.total > 0 && <div className="mt-4 rounded-3xl border bg-white p-4"><div className="mb-3 flex justify-between text-sm font-semibold" style={{ color: C.navy }}><span>2. Resultado de assembleias BB</span><span>{assemblyProgress.done}/{assemblyProgress.total} • {assemblyPercent}%</span></div><div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${assemblyPercent}%`, background: C.gold }} /></div><div className="text-xs text-slate-600">{assemblyProgress.running ? `Sincronizando grupo ${assemblyProgress.currentGroup}...` : "Fila de assembleias concluída."}</div><div className="mt-3 grid gap-2 md:grid-cols-3 text-xs"><div className="rounded-2xl border bg-slate-50 px-3 py-2">Total: <strong>{assemblyProgress.total}</strong></div><div className="rounded-2xl border bg-emerald-50 px-3 py-2 text-emerald-700">Sucesso: <strong>{assemblyProgress.success}</strong></div><div className="rounded-2xl border bg-red-50 px-3 py-2 text-red-700">Erros: <strong>{assemblyProgress.error}</strong></div></div>{assemblyErrors.length > 0 && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><div className="mb-1 font-bold">Últimos erros:</div>{assemblyErrors.map((error, index) => <div key={`${index}-${error}`} className="truncate">{error}</div>)}</div>}</div>}{syncMessage && <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${syncMessage.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : syncMessage.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}`}>{syncMessage.text}</div>}</div><div className="flex flex-col gap-2 md:min-w-[220px]"><Button variant="outline" className="rounded-2xl" disabled={!!syncing} onClick={() => syncRobot("bb")}>{syncing === "bb" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Sincronizar BB</Button><Button variant="outline" className="rounded-2xl" disabled={!!syncing} onClick={syncBBAssembliesOnly}>{syncing === "bb_assemblies" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Só Assembleias BB</Button><Button variant="outline" className="rounded-2xl" disabled={!!syncing} onClick={() => syncRobot("maggi")}>{syncing === "maggi" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Sincronizar Maggi</Button><Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => navigate("/radar-ofertas")}>Abrir Radar <ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur"><CardContent className="p-5 space-y-4"><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" style={{ color: C.ruby }} /><h2 className="font-black" style={{ color: C.navy }}>Filtros</h2></div><div className="grid gap-3 md:grid-cols-[1.5fr_.8fr_.8fr_.8fr_auto]"><label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-2xl border py-2 pl-9 pr-3 text-sm" placeholder="Buscar por grupo, segmento ou administradora" /></label><select value={admin} onChange={(e) => setAdmin(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm"><option value="todas">Todas</option><option value="bb">BB Consórcios</option><option value="maggi">Maggi</option></select><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm"><option value="ativos">Ativos</option><option value="todos">Todos</option><option value="inativos">Inativos</option></select><select value={segmento} onChange={(e) => setSegmento(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm"><option value="todos">Todos segmentos</option>{segmentos.map((s) => <option key={s} value={s}>{s}</option>)}</select><Button variant="outline" className="rounded-2xl" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div></CardContent></Card>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur"><CardContent className="p-0 overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Administradora</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">Segmento</th><th className="px-4 py-3">Faixa de crédito</th><th className="px-4 py-3">Prazo máx.</th><th className="px-4 py-3">Maior %</th><th className="px-4 py-3">Menor %</th><th className="px-4 py-3"><button type="button" onClick={toggleMedianSort} className="font-bold underline-offset-2 hover:underline">Mediana {medianSort === "asc" ? "↑" : medianSort === "desc" ? "↓" : "↕"}</button></th><th className="px-4 py-3">Embutido máx.</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{filtered.map((g) => <tr key={g.id} className="border-t hover:bg-slate-50/70"><td className="px-4 py-3 font-semibold" style={{ color: C.navy }}>{g.administradora}</td><td className="px-4 py-3"><div className="font-bold">{g.grupo}</div><div className="max-w-[220px] truncate text-xs text-slate-500">{g.nome}</div></td><td className="px-4 py-3">{g.segmento}</td><td className="px-4 py-3">{brMoney(g.creditoMin)} até {brMoney(g.creditoMax)}</td><td className="px-4 py-3">{g.prazoMax || "—"} meses</td><td className="px-4 py-3">{brPct(g.maiorPct)}</td><td className="px-4 py-3">{brPct(g.menorPct)}</td><td className="px-4 py-3 font-bold" style={{ color: C.ruby }}>{brPct(g.medianaPct)}</td><td className="px-4 py-3">{brPct(g.lanceEmbutidoMaxPct)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${g.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{g.ativo ? "Ativo" : "Inativo"}</span></td></tr>)}{filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Nenhum grupo encontrado.</td></tr>}</tbody></table></CardContent></Card>
    </div>
  );
}
function Metric({ title, value, hint }: { title: string; value: string; hint: string }) { return <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur"><CardContent className="p-5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div><div className="mt-1 text-3xl font-black" style={{ color: C.navy }}>{value}</div><div className="mt-1 text-xs text-slate-500">{hint}</div></CardContent></Card>; }
