// src/pages/GiroDeCarteiraV2.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertTriangle,
  ArrowRight,
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
  email?: string | null;
  role?: string | null;
  user_role?: string | null;
};

type ClienteRow = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
};

type LeadRow = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
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
  created_at?: string | null;
  [key: string]: any;
};

type GiroItem = GiroRaw & {
  _taskId: string | null;
  _nome: string;
  _telefone: string | null;
  _email: string | null;
  _observacoes: string | null;
  _carteira: number;
  _faixa: string;
  _dueYMD: string | null;
  _lastYMD: string | null;
};

type RegistroState = {
  item: GiroItem;
  canal: "whatsapp" | "ligacao" | "email" | "presencial";
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

function pickFirst(...values: Array<string | null | undefined>) {
  return values.find((v) => String(v || "").trim())?.trim() || null;
}

function toYMD(v?: string | Date | null) {
  if (!v) return null;
  const raw = typeof v === "string" ? v.trim() : v.toISOString();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateBR(v?: string | Date | null) {
  const ymd = toYMD(v);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}

function daysDiffFromToday(ymd?: string | null) {
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

function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((r) => [r.id, r]));
}

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function taskIdOf(item: GiroRaw) {
  return pickFirst(item.task_id, item.giro_task_id, item.id);
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

  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls)}>{children}</span>;
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
          <div className="h-4 w-40 rounded-full bg-slate-200 animate-pulse" />
          <div className="mt-4 h-8 w-64 rounded-full bg-slate-200 animate-pulse" />
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="h-8 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-8 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-8 rounded-full bg-slate-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

const canalOptions: Array<{ key: RegistroState["canal"]; label: string; icon: React.ElementType }> = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "ligacao", label: "Ligação", icon: Phone },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "presencial", label: "Presencial", icon: UserRound },
];

export default function GiroDeCarteiraV2() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<UserRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rawItems, setRawItems] = useState<GiroRaw[]>([]);
  const [clientes, setClientes] = useState<Map<string, ClienteRow>>(new Map());
  const [leads, setLeads] = useState<Map<string, LeadRow>>(new Map());
  const [dueCount, setDueCount] = useState(0);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [registro, setRegistro] = useState<RegistroState | null>(null);

  async function loadCurrentUser() {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const authId = auth.user?.id;
    if (!authId) throw new Error("Usuário não autenticado.");

    const { data, error } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,email,role,user_role,is_active")
      .eq("auth_user_id", authId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Usuário não encontrado na tabela users.");
    return data as UserRow;
  }

  async function loadCount(user: UserRow, admin: boolean) {
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
  }

  async function loadItems(user: UserRow, admin: boolean) {
    let q = supabase.from("v_giro_due_items").select("*").limit(5000);
    if (!admin) q = q.eq("owner_auth_id", user.auth_user_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as GiroRaw[];
  }

  async function loadPeople(items: GiroRaw[]) {
    const clienteIds = Array.from(new Set(items.map((i) => i.cliente_id).filter(Boolean) as string[]));
    const leadIds = Array.from(new Set(items.map((i) => i.lead_id).filter(Boolean) as string[]));

    let clientesMap = new Map<string, ClienteRow>();
    let leadsMap = new Map<string, LeadRow>();

    if (clienteIds.length) {
      const { data, error } = await supabase.from("clientes").select("id,nome,telefone,email,observacoes").in("id", clienteIds);
      if (!error && data) clientesMap = mapById(data as ClienteRow[]);
    }

    if (leadIds.length) {
      const { data, error } = await supabase.from("leads").select("id,nome,telefone,email").in("id", leadIds);
      if (!error && data) leadsMap = mapById(data as LeadRow[]);
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
      const [count, items] = await Promise.all([loadCount(user, admin), loadItems(user, admin)]);

      setMe(user);
      setIsAdmin(admin);
      setDueCount(count);
      setRawItems(items);
      await loadPeople(items);
    } catch (e: any) {
      console.error("[GiroDeCarteiraV2] loadAll error:", e);
      setErr(String(e?.message || e));
      setRawItems([]);
      setDueCount(0);
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
    return rawItems
      .map((item) => {
        const cliente = item.cliente_id ? clientes.get(item.cliente_id) : undefined;
        const lead = item.lead_id ? leads.get(item.lead_id) : undefined;
        const nome = pickFirst(cliente?.nome, item.cliente_nome, item.lead_nome, lead?.nome, item.nome) || "Cliente sem cadastro";
        const telefone = pickFirst(cliente?.telefone, item.telefone, lead?.telefone);
        const email = pickFirst(cliente?.email, item.email, lead?.email);
        const observacoes = pickFirst(cliente?.observacoes, item.observacoes);
        const carteira = Number(item.valor_carteira_ativa ?? item.carteira_ativa_total ?? item.carteira_total ?? 0);
        const faixa = pickFirst(item.faixa, item.segmento, item.categoria) || "Sem faixa";
        const dueYMD = toYMD(item.due_date || item.data_prevista || item.proximo_giro_em);
        const lastYMD = toYMD(item.last_done_at || item.ultimo_giro_em);

        return {
          ...item,
          _taskId: taskIdOf(item),
          _nome: nome,
          _telefone: telefone,
          _email: email,
          _observacoes: observacoes,
          _carteira: Number.isFinite(carteira) ? carteira : 0,
          _faixa: faixa,
          _dueYMD: dueYMD,
          _lastYMD: lastYMD,
        };
      })
      .sort((a, b) => {
        const da = a._dueYMD || "9999-12-31";
        const db = b._dueYMD || "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        return b._carteira - a._carteira;
      });
  }, [rawItems, clientes, leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    const digits = onlyDigits(q);

    return enriched.filter((item) => {
      const hay = [item._nome, item._telefone, item._email, item._faixa, item._observacoes, item.owner_auth_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const tel = onlyDigits(item._telefone);
      return hay.includes(q) || Boolean(digits && tel.includes(digits));
    });
  }, [enriched, search]);

  const totalCarteira = useMemo(() => enriched.reduce((acc, item) => acc + item._carteira, 0), [enriched]);
  const atrasados = useMemo(() => enriched.filter((item) => { const diff = daysDiffFromToday(item._dueYMD); return diff != null && diff > 0; }).length, [enriched]);
  const hoje = useMemo(() => enriched.filter((item) => daysDiffFromToday(item._dueYMD) === 0).length, [enriched]);

  function buildWhatsAppMessage(item: GiroItem) {
    const primeiro = item._nome.trim().split(/\s+/)[0] || "tudo bem";
    return [
      `Olá, ${primeiro}! Aqui é da Consulmax.`,
      "Estou passando para fazer nosso giro de acompanhamento da sua carteira.",
      "Quero te atualizar sobre próximos passos, oportunidades e também saber se posso te ajudar com alguma estratégia.",
    ].join(" ");
  }

  function openRegistro(item: GiroItem) {
    setRegistro({ item, canal: "whatsapp", resumo: "", pediuIndicacao: true });
  }

  async function handleSaveRegistro() {
    if (!registro?.item?._taskId) {
      setErr("Não foi possível identificar o ID da tarefa de giro.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      const { error } = await supabase.rpc("mark_giro_done", {
        p_task_id: registro.item._taskId,
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
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-90px)] px-3 py-3 md:px-5 md:py-5 text-slate-900">
      <div className="mx-auto w-full max-w-[1920px] space-y-5">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/60 p-5 md:p-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)]" style={{ background: "linear-gradient(135deg, rgba(30,41,63,.96), rgba(161,28,39,.92) 54%, rgba(181,165,115,.76))" }}>
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-black/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
                <RefreshCcw className="h-3.5 w-3.5" />
                Fonte oficial alinhada com a Início
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
              <div><div className="font-semibold">Erro ao carregar Giro de Carteira</div><div className="mt-1 break-words">{err}</div></div>
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between"><div className="text-sm text-slate-500">Pendências</div><CalendarClock className="h-5 w-5" style={{ color: C.ruby }} /></div><div className="mt-2 text-3xl font-semibold text-slate-950">{dueCount}</div><div className="mt-1 text-xs text-slate-500">Contagem de v_giro_due_count</div></div>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between"><div className="text-sm text-slate-500">Clientes listados</div><UserRound className="h-5 w-5" style={{ color: C.navy }} /></div><div className="mt-2 text-3xl font-semibold text-slate-950">{enriched.length}</div><div className="mt-1 text-xs text-slate-500">Itens em v_giro_due_items</div></div>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between"><div className="text-sm text-slate-500">Atrasados</div><AlertTriangle className="h-5 w-5 text-amber-700" /></div><div className="mt-2 text-3xl font-semibold text-slate-950">{atrasados}</div><div className="mt-1 text-xs text-slate-500">Data prevista anterior a hoje</div></div>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between"><div className="text-sm text-slate-500">Carteira envolvida</div><Wallet className="h-5 w-5" style={{ color: C.gold }} /></div><div className="mt-2 text-2xl font-semibold text-slate-950">{fmtBRL(totalCarteira)}</div><div className="mt-1 text-xs text-slate-500">{hoje} giro(s) para hoje</div></div>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><h2 className="text-lg font-semibold text-slate-950">Lista de giros pendentes</h2><p className="text-sm text-slate-500">Busque por cliente, telefone, e-mail, faixa ou observação.</p></div>
            <div className="relative w-full md:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar giro..." className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400" /></div>
          </div>
        </section>

        {loading ? <LoadingSkeleton /> : filtered.length === 0 ? (
          <div className="rounded-[2rem] border border-white/70 bg-white/80 p-10 text-center shadow-sm backdrop-blur-xl"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><h3 className="mt-3 text-lg font-semibold text-slate-950">Nenhum giro pendente</h3><p className="mt-1 text-sm text-slate-500">Não há tarefas para os filtros atuais.</p></div>
        ) : (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filtered.map((item, idx) => {
              const diff = daysDiffFromToday(item._dueYMD);
              const isLate = diff != null && diff > 0;
              const isToday = diff === 0;
              const wa = waLink(item._telefone, buildWhatsAppMessage(item));

              return (
                <article key={item._taskId || item.id || `${item._nome}-${idx}`} className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
                  <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-red-100 blur-3xl" />
                  <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold text-slate-950">{item._nome}</h3>{isLate ? <Pill tone="danger">{diff} dia(s) atrasado</Pill> : isToday ? <Pill tone="gold">Hoje</Pill> : <Pill>Previsto</Pill>}</div>
                        <div className="mt-2 flex flex-wrap gap-2"><Pill tone="navy">{item._faixa}</Pill><Pill>{fmtBRL(item._carteira)}</Pill>{item.periodicidade_meses ? <Pill>{item.periodicidade_meses} mês(es)</Pill> : null}</div>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right"><div className="text-[11px] uppercase tracking-wide text-slate-400">Data</div><div className="text-sm font-semibold" style={{ color: C.ruby }}>{fmtDateBR(item._dueYMD)}</div></div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2 rounded-2xl border border-slate-100 bg-white/70 p-3"><div className="flex items-center gap-2 text-sm text-slate-700"><Phone className="h-4 w-4 text-slate-400" /><span>{item._telefone || "Sem telefone"}</span></div><div className="flex items-center gap-2 text-sm text-slate-700"><Mail className="h-4 w-4 text-slate-400" /><span className="truncate">{item._email || "Sem e-mail"}</span></div><div className="text-xs text-slate-500">Último giro: {fmtDateBR(item._lastYMD)}</div></div>
                      <div className="rounded-2xl border border-slate-100 bg-white/70 p-3 text-sm text-slate-600"><div className="font-medium text-slate-700">Observações</div><div className="mt-1 line-clamp-3">{item._observacoes || "Sem observações cadastradas."}</div></div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</a> : null}
                      <button type="button" onClick={() => openRegistro(item)} className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: C.ruby }}><CheckCircle2 className="mr-2 h-4 w-4" />Registrar Giro</button>
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
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-semibold text-slate-950">Registrar Giro</h3><p className="mt-1 text-sm text-slate-500">Cliente: <span className="font-medium text-slate-700">{registro.item._nome}</span></p></div><button type="button" onClick={() => setRegistro(null)} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"><X className="h-4 w-4" /></button></div>

            <div className="mt-5 grid gap-4">
              <div><div className="mb-2 text-sm font-medium text-slate-700">Canal do contato</div><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{canalOptions.map((opt) => { const Icon = opt.icon; const active = registro.canal === opt.key; return <button key={opt.key} type="button" onClick={() => setRegistro((prev) => prev ? { ...prev, canal: opt.key } : prev)} className={cx("inline-flex items-center justify-center rounded-2xl border px-3 py-3 text-sm font-semibold transition", active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}><Icon className="mr-2 h-4 w-4" />{opt.label}</button>; })}</div></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700">Resumo do contato</label><textarea value={registro.resumo} onChange={(e) => setRegistro((prev) => prev ? { ...prev, resumo: e.target.value } : prev)} rows={5} placeholder="Ex.: Acompanhei o cliente, atualizei sobre assembleia, tirei dúvidas e pedi indicação." className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-slate-400" /></div>
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"><input type="checkbox" checked={registro.pediuIndicacao} onChange={(e) => setRegistro((prev) => prev ? { ...prev, pediuIndicacao: e.target.checked } : prev)} className="h-4 w-4" />Pedi indicação durante o contato</label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRegistro(null)} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button><button type="button" onClick={handleSaveRegistro} disabled={saving} className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60" style={{ background: C.ruby }}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}Confirmar Registro</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
