// src/pages/GiroDeCarteiraV2.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCcw,
  Search,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

type UserRow = {
  id: string;
  auth_user_id: string;
  nome?: string | null;
  role?: string | null;
  user_role?: string | null;
};

type PersonRow = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
};

type GiroRaw = {
  id?: string | null;
  task_id?: string | null;
  giro_task_id?: string | null;
  cliente_id?: string | null;
  lead_id?: string | null;
  owner_auth_id?: string | null;
  cliente_nome?: string | null;
  lead_nome?: string | null;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  carteira_total?: number | null;
  carteira_ativa_total?: number | null;
  valor_carteira_ativa?: number | null;
  faixa?: string | null;
  segmento?: string | null;
  categoria?: string | null;
  periodicidade_meses?: number | null;
  due_date?: string | null;
  data_prevista?: string | null;
  proximo_giro_em?: string | null;
  last_done_at?: string | null;
  ultimo_giro_em?: string | null;
  [key: string]: any;
};

type GiroItem = GiroRaw & {
  _id: string;
  _nome: string;
  _telefone: string | null;
  _email: string | null;
  _observacoes: string | null;
  _carteira: number;
  _faixa: string;
  _dueYMD: string | null;
};

type QuickFilter = "todos" | "atrasados" | "hoje" | "sem_contato";
type SortMode = "data" | "valor" | "nome";
type CanalGiro = "whatsapp" | "ligacao" | "email" | "presencial";

type RegistroState = {
  item: GiroItem;
  canal: CanalGiro;
  resumo: string;
  pediuIndicacao: boolean;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
};

function onlyDigits(v?: string | null) {
  return String(v || "").replace(/\D+/g, "");
}

function isAdminUser(u?: UserRow | null) {
  return String(u?.role || u?.user_role || "").toLowerCase() === "admin";
}

function first(...values: Array<string | null | undefined>) {
  return values.find((v) => String(v || "").trim())?.trim() || null;
}

function toYMD(v?: string | Date | null) {
  if (!v) return null;
  const raw = typeof v === "string" ? v.trim() : v.toISOString();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateBR(v?: string | null) {
  const ymd = toYMD(v);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}

function daysLate(ymd?: string | null) {
  if (!ymd) return null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [ay, am, ad] = today.split("-").map(Number);
  const [by, bm, bd] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad, 12) - Date.UTC(by, bm - 1, bd, 12)) / 86400000);
}

function waLink(phone?: string | null, text?: string) {
  const d = onlyDigits(phone);
  if (!d) return null;
  const normalized = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text || "")}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0]?.[0] || ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""}`.toUpperCase();
}

function statusInfo(item: GiroItem) {
  const late = daysLate(item._dueYMD);
  if (late != null && late > 0) return { label: `${late} dia(s) atrasado`, tone: "danger" as const, stripe: "bg-red-500", text: "text-red-700" };
  if (late === 0) return { label: "Hoje", tone: "gold" as const, stripe: "bg-amber-500", text: "text-amber-700" };
  return { label: "Previsto", tone: "default" as const, stripe: "bg-slate-300", text: "text-slate-600" };
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" | "gold" | "navy" | "ok" }) {
  const cls =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "gold"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "navy"
          ? "border-slate-200 bg-slate-100 text-slate-800"
          : tone === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white/70 text-slate-700";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function mapRows(rows: any[] | null | undefined) {
  const m = new Map<string, PersonRow>();
  (rows || []).forEach((r: any) => {
    if (r?.id) m.set(String(r.id), r as PersonRow);
  });
  return m;
}

const canalOptions: Array<{ key: CanalGiro; label: string; icon: React.ElementType }> = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "ligacao", label: "Ligação", icon: Phone },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "presencial", label: "Presencial", icon: UserRound },
];

export default function GiroDeCarteiraV2() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<GiroRaw[]>([]);
  const [clientes, setClientes] = useState<Map<string, PersonRow>>(new Map());
  const [leads, setLeads] = useState<Map<string, PersonRow>>(new Map());
  const [dueCount, setDueCount] = useState(0);
  const [source, setSource] = useState<"view" | "rpc" | "none">("none");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [sortMode, setSortMode] = useState<SortMode>("data");
  const [registro, setRegistro] = useState<RegistroState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadCurrentUser() {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const authId = auth.user?.id;
    if (!authId) throw new Error("Usuário não autenticado.");

    const { data, error } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role")
      .eq("auth_user_id", authId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Usuário não encontrado na tabela users.");
    return data as UserRow;
  }

  async function loadCount(user: UserRow, admin: boolean) {
    const readRpc = async () => {
      const { data, error } = await supabase.rpc("giro_due_count");
      if (error) throw error;
      return Number(data || 0);
    };

    try {
      if (admin) {
        const { data, error } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count");
        if (error) throw error;
        return (data || []).reduce((acc: number, row: any) => acc + Number(row?.due_count || 0), 0);
      }

      const { data, error } = await supabase
        .from("v_giro_due_count")
        .select("owner_auth_id,due_count")
        .eq("owner_auth_id", user.auth_user_id)
        .maybeSingle();

      if (error) throw error;
      return Number((data as any)?.due_count || 0);
    } catch {
      return await readRpc();
    }
  }

  async function loadItems(user: UserRow, admin: boolean) {
    try {
      let q = supabase.from("v_giro_due_items").select("*").limit(5000);
      if (!admin) q = q.eq("owner_auth_id", user.auth_user_id);
      const { data, error } = await q;
      if (error) throw error;
      setSource("view");
      return (data || []) as GiroRaw[];
    } catch {
      const { data, error } = await supabase.rpc("next_giro_batch");
      if (error) throw error;
      setSource("rpc");
      return (Array.isArray(data) ? data : []) as GiroRaw[];
    }
  }

  async function loadPeople(rows: GiroRaw[]) {
    const clienteIds = Array.from(new Set(rows.map((r) => r.cliente_id).filter(Boolean).map(String)));
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean).map(String)));

    let clientesMap = new Map<string, PersonRow>();
    let leadsMap = new Map<string, PersonRow>();

    if (clienteIds.length) {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nome,telefone,email,observacoes")
        .in("id", clienteIds);
      if (!error) clientesMap = mapRows(data as any[]);
    }

    if (leadIds.length) {
      const { data, error } = await supabase
        .from("leads")
        .select("id,nome,telefone,email")
        .in("id", leadIds);
      if (!error) leadsMap = mapRows(data as any[]);
    }

    setClientes(clientesMap);
    setLeads(leadsMap);
  }

  async function loadAll(mode: "first" | "refresh" = "first") {
    if (mode === "first") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setErr(null);

    try {
      const user = me || (await loadCurrentUser());
      const admin = isAdminUser(user);
      const [count, rows] = await Promise.all([loadCount(user, admin), loadItems(user, admin)]);
      setMe(user);
      setIsAdmin(admin);
      setDueCount(count);
      setItems(rows);
      await loadPeople(rows);
    } catch (e: any) {
      console.error("[GiroDeCarteiraV2] loadAll error:", e);
      setErr(String(e?.message || e));
      setItems([]);
      setClientes(new Map());
      setLeads(new Map());
      setDueCount(0);
      setSource("none");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll("first");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enriched = useMemo<GiroItem[]>(() => {
    return items.map((item, index) => {
      const cliente = item.cliente_id ? clientes.get(String(item.cliente_id)) : undefined;
      const lead = item.lead_id ? leads.get(String(item.lead_id)) : undefined;
      const nome = first(cliente?.nome, item.cliente_nome, item.lead_nome, lead?.nome, item.nome) || "Cliente sem cadastro";
      const telefone = first(cliente?.telefone, item.telefone, lead?.telefone);
      const email = first(cliente?.email, item.email, lead?.email);
      const observacoes = first(cliente?.observacoes, item.observacoes);
      const carteira = Number(item.valor_carteira_ativa ?? item.carteira_ativa_total ?? item.carteira_total ?? 0) || 0;
      const faixa = first(item.faixa, item.segmento, item.categoria) || "Sem faixa";
      const due = toYMD(item.due_date || item.data_prevista || item.proximo_giro_em);
      const id = first(item.task_id, item.giro_task_id, item.id) || `giro-${index}`;
      return { ...item, _id: id, _nome: nome, _telefone: telefone, _email: email, _observacoes: observacoes, _carteira: carteira, _faixa: faixa, _dueYMD: due };
    });
  }, [items, clientes, leads]);

  const atrasados = useMemo(() => enriched.filter((item) => { const d = daysLate(item._dueYMD); return d != null && d > 0; }).length, [enriched]);
  const hoje = useMemo(() => enriched.filter((item) => daysLate(item._dueYMD) === 0).length, [enriched]);
  const semContato = useMemo(() => enriched.filter((item) => !item._telefone && !item._email).length, [enriched]);
  const totalCarteira = useMemo(() => enriched.reduce((acc, item) => acc + item._carteira, 0), [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = onlyDigits(q);

    let arr = enriched.filter((item) => {
      const late = daysLate(item._dueYMD);
      if (quickFilter === "atrasados" && !(late != null && late > 0)) return false;
      if (quickFilter === "hoje" && late !== 0) return false;
      if (quickFilter === "sem_contato" && (item._telefone || item._email)) return false;

      if (!q) return true;
      const hay = [item._nome, item._telefone, item._email, item._faixa, item._observacoes].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q) || Boolean(digits && onlyDigits(item._telefone).includes(digits));
    });

    arr = [...arr].sort((a, b) => {
      if (sortMode === "valor") return b._carteira - a._carteira;
      if (sortMode === "nome") return a._nome.localeCompare(b._nome, "pt-BR");
      const da = a._dueYMD || "9999-12-31";
      const db = b._dueYMD || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return b._carteira - a._carteira;
    });

    return arr;
  }, [enriched, search, quickFilter, sortMode]);

  function buildWhatsAppMessage(item: GiroItem) {
    const primeiro = item._nome.trim().split(/\s+/)[0] || "tudo bem";
    return `Olá, ${primeiro}! Aqui é da Consulmax. Estou passando para fazer nosso giro de acompanhamento da sua carteira.`;
  }

  function openRegistro(item: GiroItem) {
    setRegistro({
      item,
      canal: item._telefone ? "whatsapp" : item._email ? "email" : "ligacao",
      resumo: "",
      pediuIndicacao: true,
    });
  }

  async function confirmarRegistro() {
    if (!registro) return;
    const item = registro.item;
    setSavingId(item._id);
    setErr(null);

    try {
      const { error } = await supabase.rpc("mark_giro_done", {
        p_task_id: item._id,
        p_canal: registro.canal,
        p_resumo: registro.resumo || null,
        p_pediu_indicacao: registro.pediuIndicacao,
      });
      if (error) throw error;
      setRegistro(null);
      await loadAll("refresh");
    } catch (e: any) {
      console.error("[GiroDeCarteiraV2] mark_giro_done error:", e);
      setErr(String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-90px)] px-3 py-3 md:px-5 md:py-5 text-slate-900">
      <div className="mx-auto w-full max-w-[1920px] space-y-5">
        <section
          className="relative overflow-hidden rounded-[2rem] border border-white/60 p-5 md:p-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)]"
          style={{ background: "linear-gradient(135deg, rgba(30,41,63,.96), rgba(161,28,39,.92) 54%, rgba(181,165,115,.76))" }}
        >
          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
                <RefreshCcw className="h-3.5 w-3.5" />
                Fonte: {source === "view" ? "v_giro_due_items" : source === "rpc" ? "next_giro_batch" : "carregando"}
              </div>
              <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-white">Giro de Carteira</h1>
              <p className="mt-2 text-sm md:text-base text-white/80">Acompanhamento ativo da carteira, relacionamento com clientes e pedido de indicação.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill tone="gold">{isAdmin ? "Admin — visão geral" : "Vendedor — suas tarefas"}</Pill>
                <Pill tone="navy">{me?.nome || "Usuário"}</Pill>
              </div>
            </div>

            <button type="button" onClick={() => loadAll("refresh")} disabled={refreshing || loading} className="inline-flex items-center justify-center rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-60">
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Atualizar
            </button>
          </div>
        </section>

        {err && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Erro ao carregar Giro de Carteira</div>
                <div className="mt-1 break-words">{err}</div>
              </div>
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Pendências" value={String(dueCount)} desc="Contagem oficial" icon={<RefreshCcw className="h-5 w-5" style={{ color: C.ruby }} />} />
          <Kpi title="Clientes listados" value={String(enriched.length)} desc="Itens carregados" icon={<UserRound className="h-5 w-5" style={{ color: C.navy }} />} />
          <Kpi title="Atrasados" value={String(atrasados)} desc="Data anterior a hoje" icon={<AlertTriangle className="h-5 w-5 text-amber-700" />} />
          <Kpi title="Carteira envolvida" value={fmtBRL(totalCarteira)} desc={`${hoje} giro(s) para hoje`} icon={<Wallet className="h-5 w-5" style={{ color: C.gold }} />} />
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Lista de giros pendentes</h2>
                <p className="text-sm text-slate-500">Organize por prioridade, contato ou valor da carteira.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterButton active={quickFilter === "todos"} onClick={() => setQuickFilter("todos")}>Todos ({enriched.length})</FilterButton>
                <FilterButton active={quickFilter === "atrasados"} onClick={() => setQuickFilter("atrasados")}>Atrasados ({atrasados})</FilterButton>
                <FilterButton active={quickFilter === "hoje"} onClick={() => setQuickFilter("hoje")}>Hoje ({hoje})</FilterButton>
                <FilterButton active={quickFilter === "sem_contato"} onClick={() => setQuickFilter("sem_contato")}>Sem contato ({semContato})</FilterButton>
              </div>
            </div>

            <div className="grid w-full gap-2 md:grid-cols-[1fr_190px] xl:max-w-2xl">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, e-mail, faixa..." className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400" />
              </div>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                <option value="data">Ordenar por data</option>
                <option value="valor">Ordenar por valor</option>
                <option value="nome">Ordenar por nome</option>
              </select>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[2rem] border border-white/70 bg-white/80 p-10 text-center shadow-sm backdrop-blur-xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-500">Carregando giros...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[2rem] border border-white/70 bg-white/80 p-10 text-center shadow-sm backdrop-blur-xl">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h3 className="mt-3 text-lg font-semibold text-slate-950">Nenhum giro pendente</h3>
            <p className="mt-1 text-sm text-slate-500">Não há tarefas para os filtros atuais.</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {filtered.map((item) => {
              const st = statusInfo(item);
              const wa = waLink(item._telefone, buildWhatsAppMessage(item));
              return (
                <article key={item._id} className="group relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${st.stripe}`} />
                  <div className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
                          {initials(item._nome)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-slate-950">{item._nome}</h3>
                            <Pill tone={st.tone}>{st.label}</Pill>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Pill tone="navy">{item._faixa}</Pill>
                            <Pill>{fmtBRL(item._carteira)}</Pill>
                            {item.periodicidade_meses ? <Pill>{item.periodicidade_meses} mês(es)</Pill> : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-wide text-slate-400"><CalendarClock className="h-3.5 w-3.5" />Data</div>
                          <div className={`text-sm font-semibold ${st.text}`}>{fmtDateBR(item._dueYMD)}</div>
                        </div>
                        <button type="button" disabled={savingId === item._id} onClick={() => openRegistro(item)} className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60" style={{ background: C.ruby }}>
                          {savingId === item._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          Registrar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Contato</div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-700"><Phone className="h-4 w-4 text-slate-400" /><span>{item._telefone || "Sem telefone"}</span></div>
                          <div className="flex items-center gap-2 text-sm text-slate-700"><Mail className="h-4 w-4 text-slate-400" /><span className="truncate">{item._email || "Sem e-mail"}</span></div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</div>
                        <div className="line-clamp-3 text-sm text-slate-600">{item._observacoes || "Sem observações cadastradas."}</div>
                      </div>

                      <div className="flex flex-row gap-2 xl:w-40 xl:flex-col xl:justify-end">
                        {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</a> : null}
                        {item._telefone ? <a href={`tel:${onlyDigits(item._telefone)}`} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Phone className="mr-2 h-4 w-4" />Ligar</a> : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {registro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">Registrar giro</div>
                <h3 className="mt-3 text-xl font-semibold text-slate-950">{registro.item._nome}</h3>
                <p className="mt-1 text-sm text-slate-500">Registre o canal utilizado e o resumo do que foi conversado com o cliente.</p>
              </div>
              <button type="button" onClick={() => setRegistro(null)} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Canal do contato</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {canalOptions.map((opt) => {
                    const Icon = opt.icon;
                    const active = registro.canal === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setRegistro((prev) => (prev ? { ...prev, canal: opt.key } : prev))}
                        className={`inline-flex items-center justify-center rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                          active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Resumo da conversa</label>
                <textarea
                  value={registro.resumo}
                  onChange={(e) => setRegistro((prev) => (prev ? { ...prev, resumo: e.target.value } : prev))}
                  rows={5}
                  placeholder="Ex.: Atualizei o cliente sobre o grupo, expliquei próximos passos, tirei dúvidas, pedi indicação e combinei novo contato."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-slate-400"
                />
              </div>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={registro.pediuIndicacao}
                  onChange={(e) => setRegistro((prev) => (prev ? { ...prev, pediuIndicacao: e.target.checked } : prev))}
                  className="h-4 w-4"
                />
                Pedi indicação durante o contato
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setRegistro(null)} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmarRegistro} disabled={savingId === registro.item._id} className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60" style={{ background: C.ruby }}>
                {savingId === registro.item._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Confirmar registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, desc, icon }: { title: string; value: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{title}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{desc}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-[#A11C27] bg-[#A11C27] text-white shadow-sm"
          : "border-slate-200 bg-white/80 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
