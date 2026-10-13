import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, History, MessageCircle, RefreshCw, Search, UsersRound, X } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { supabase } from "@/lib/supabaseClient";
import { useAccess } from "@/access/AccessContext";

type Lead = {
  id: string; nome: string; telefone: string | null; email: string | null;
  origem: string | null; descricao: string | null; created_at: string; owner_id: string;
};
type Opportunity = {
  id: string; lead_id: string; segmento: string | null; estagio: string | null;
  valor_credito: number | null; observacao: string | null;
  created_at: string; last_follow_up_at: string | null;
  won_at: string | null; lost_at: string | null;
};
type Note = { id: string; lead_id: string; note: string; kind: string | null; created_at: string };
type Conversation = { id: string; lead_id: string; last_message: string | null; last_message_at: string | null };
type Sale = { id: string; lead_id: string | null; cliente_lead_id: string | null; status: string | null };
type LeadEntry = Lead & {
  opportunities: Opportunity[]; notes: Note[]; conversations: Conversation[];
  bought: boolean; segment: string; stage: string;
  lastContactAt: string | null; ownerName: string;
};

const PAGE_SIZE = 20;
const CHUNK_SIZE = 75;
const styles = {
  panel: "rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm",
  input: "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#A11C27]/20",
  button: "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
function time(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function daysSince(iso?: string | null) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86400000)) : null;
}
function freshest(...values: Array<string | null | undefined>) {
  return values.filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}
function normalize(value?: string | null) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function whatsAppLink(raw?: string | null) {
  const trimmed = String(raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  // Preserva DDI informado: um número +1 (EUA) jamais recebe o prefixo 55.
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  const candidate = trimmed.startsWith("00") ? "+" + digits.slice(2) : trimmed;
  const brazil = parsePhoneNumberFromString(digits.startsWith("55") && digits.length >= 12 ? "+" + digits : digits, "BR");
  const parsed = international ? parsePhoneNumberFromString(candidate)
    : brazil?.isValid() ? brazil
    : digits.length === 11 && digits.startsWith("1") ? parsePhoneNumberFromString("+" + digits)
    : null;
  return parsed?.isValid() ? "https://wa.me/" + parsed.number.slice(1) : null;
}
function currency(value?: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
function customerStatus(item: LeadEntry) {
  if (item.bought) return "Já comprou";
  if (item.opportunities.some((o) => /ganho/i.test(o.estagio || "") || !!o.won_at)) return "Fechado ganho";
  if (item.opportunities.some((o) => !/perdido|ganho/i.test(o.estagio || "") && !o.lost_at)) return "Oportunidade registrada";
  if (item.opportunities.length) return "Negociação encerrada";
  return "Sem oportunidade";
}

type CascadeUser = { auth_user_id: string; nome: string; unit_id: string | null };

export default function MeusLeads() {
  const { user } = useAccess();
  const authId = user?.auth_user_id;
  const [items, setItems] = useState<LeadEntry[]>([]);
  const [cascadeUsers, setCascadeUsers] = useState<CascadeUser[]>([]);
  const [sellerFilter, setSellerFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [inactivity, setInactivity] = useState("all");
  const [purchase, setPurchase] = useState("all");
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authId) { setLoading(false); return; }
      setLoading(true); setError(""); setPartial(false);
      try {
        // Cascata idêntica ao painel Início: Matriz (todas as unidades),
        // gestor_filial (própria unidade), demais (somente o próprio usuário).
        const { data: unit, error: unitError } = user?.unit_id
          ? await supabase.from("units").select("tipo").eq("id", user.unit_id).maybeSingle()
          : { data: null, error: null };
        if (unitError) throw unitError;
        const matrix = normalize(user?.hierarchy_level) === "matriz" ||
          (normalize(user?.role) === "admin" && normalize(unit?.tipo) === "matriz");
        const branchManager = !matrix && normalize(user?.hierarchy_level) === "gestor_filial" && !!user?.unit_id;
        let usersQuery = supabase.from("users").select("auth_user_id,nome,unit_id").eq("is_active", true).order("nome");
        if (branchManager) usersQuery = usersQuery.eq("unit_id", user!.unit_id!);
        else if (!matrix) usersQuery = usersQuery.eq("auth_user_id", authId);
        const { data: userRows, error: usersError } = await usersQuery;
        if (usersError) throw usersError;
        const team = (userRows || []) as CascadeUser[];
        const scopeIds = Array.from(new Set([authId, ...team.map((person) => person.auth_user_id)].filter(Boolean)));
        const owners = new Map(team.map((person) => [person.auth_user_id, person.nome]));
        const leads: Lead[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error: leadsError } = await supabase.from("leads")
            .select("id,nome,telefone,email,origem,descricao,created_at,owner_id")
            .in("owner_id", scopeIds)
            .order("created_at", { ascending: false })
            .range(offset, offset + 499);
          if (leadsError) throw leadsError;
          const batch = (data || []) as Lead[];
          leads.push(...batch);
          if (batch.length < 500) break;
        }

        const opportunityList: Opportunity[] = [];
        const noteList: Note[] = [];
        const conversationList: Conversation[] = [];
        const saleList: Sale[] = [];
        let missingExtras = false;

        // Consultas relacionadas em lotes: respeitam RLS e evitam o limite de 1.000 registros por requisição.
        for (const ids of chunks(leads.map((lead) => lead.id), CHUNK_SIZE)) {
          const [opp, note, wa, sale, legacySale] = await Promise.all([
            supabase.from("opportunities")
              .select("id,lead_id,segmento,estagio,valor_credito,observacao,created_at,last_follow_up_at,won_at,lost_at")
              .in("vendedor_id", scopeIds).in("lead_id", ids),
            supabase.from("opportunity_notes")
              .select("id,lead_id,note,kind,created_at")
              .in("user_id", scopeIds).in("lead_id", ids),
            supabase.from("whatsapp_conversations")
              .select("id,lead_id,last_message,last_message_at")
              .in("assigned_to", scopeIds).in("lead_id", ids),
            supabase.from("vendas")
              .select("id,lead_id,cliente_lead_id,status")
              .in("vendedor_id", scopeIds).in("lead_id", ids),
            supabase.from("vendas")
              .select("id,lead_id,cliente_lead_id,status")
              .in("vendedor_id", scopeIds).in("cliente_lead_id", ids),
          ]);
          if (opp.error || note.error || wa.error || sale.error || legacySale.error) missingExtras = true;
          opportunityList.push(...((opp.data || []) as Opportunity[]));
          noteList.push(...((note.data || []) as Note[]));
          conversationList.push(...((wa.data || []) as Conversation[]));
          saleList.push(...((sale.data || []) as Sale[]), ...((legacySale.data || []) as Sale[]));
        }

        const byLead = <T extends { lead_id: string | null }>(rows: T[]) => {
          const map = new Map<string, T[]>();
          rows.forEach((row) => {
            if (!row.lead_id) return;
            map.set(row.lead_id, [...(map.get(row.lead_id) || []), row]);
          });
          return map;
        };
        const byOpp = byLead(opportunityList);
        const byNote = byLead(noteList);
        const byWA = byLead(conversationList);
        const bought = new Set(saleList.flatMap((s) => [s.lead_id, s.cliente_lead_id]).filter((v): v is string => Boolean(v)));

        const next: LeadEntry[] = leads.map((lead) => {
          const opportunities = (byOpp.get(lead.id) || []).sort((a, b) => b.created_at.localeCompare(a.created_at));
          const notes = (byNote.get(lead.id) || []).sort((a, b) => b.created_at.localeCompare(a.created_at));
          const conversations = (byWA.get(lead.id) || []).sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
          return {
            ...lead, ownerName: owners.get(lead.owner_id) || "Responsável não identificado", opportunities, notes, conversations,
            bought: bought.has(lead.id),
            segment: opportunities.find((o) => o.segmento)?.segmento || "Não informado",
            stage: opportunities[0]?.estagio || "Sem oportunidade",
            // Cadastro não conta como conversa. Nunca apresentar "último contato" inventado.
            lastContactAt: freshest(
              ...opportunities.map((o) => o.last_follow_up_at),
              ...notes.filter((n) => ["follow_up", "manual", "meeting"].includes(String(n.kind || "").toLowerCase())).map((n) => n.created_at),
              ...conversations.map((w) => w.last_message_at),
            ),
          };
        });
        if (cancelled) return;
        setItems(next);
        setCascadeUsers(team);
        setPartial(missingExtras);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Não foi possível consultar os leads.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authId, user?.unit_id, user?.hierarchy_level, user?.role, reloadKey]);

  useEffect(() => { setPage(1); }, [search, inactivity, purchase, segment, sellerFilter]);
  const segments = useMemo(() => [...new Set(items.map((lead) => lead.segment))].sort(), [items]);
  const filtered = useMemo(() => items.filter((lead) => {
    if (sellerFilter !== "all" && lead.owner_id !== sellerFilter) return false;
    const query = normalize(search.trim());
    if (query && !normalize([lead.nome, lead.telefone, lead.email].join(" ")).includes(query)) return false;
    if (segment !== "all" && lead.segment !== segment) return false;
    if (purchase === "yes" && !lead.bought) return false;
    if (purchase === "no" && lead.bought) return false;
    if (inactivity === "unknown") return !lead.lastContactAt;
    if (inactivity !== "all") {
      const days = daysSince(lead.lastContactAt);
      if (days === null || days < Number(inactivity)) return false;
    }
    return true;
  }).sort((a, b) => {
    const dateA = a.lastContactAt || a.created_at;
    const dateB = b.lastContactAt || b.created_at;
    return dateB.localeCompare(dateA);
  }), [items, search, inactivity, purchase, segment, sellerFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = items.find((lead) => lead.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-3 text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#A11C27]"><UsersRound className="h-4 w-4" /> Vendas</div>
          <h1 className="text-2xl font-black tracking-tight text-[#1E293F] md:text-3xl">Meus Leads</h1>
          <p className="mt-1 text-sm text-slate-500">Reencontre pessoas com quem você já se relacionou e registrou no CRM.</p>
        </div>
        <button type="button" className={styles.button} onClick={() => setReloadKey((v) => v + 1)} disabled={loading}><RefreshCw className="h-4 w-4" /> Atualizar</button>
      </header>

      <section className={styles.panel + " p-4"}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div><span className="text-2xl font-black text-[#1E293F]">{items.length}</span><span className="ml-2 text-sm text-slate-500">leads {cascadeUsers.length > 1 ? "na sua cascata" : "vinculados a você"}</span></div>
          <span className="text-xs text-slate-500">Uma pessoa por cadastro • somente consulta</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cascadeUsers.length > 1 && <select aria-label="Vendedor" className={styles.input} value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}><option value="all">Todos da minha cascata</option>{cascadeUsers.map((u) => <option key={u.auth_user_id} value={u.auth_user_id}>{u.auth_user_id === authId ? "Meus leads" : u.nome}</option>)}</select>}
          <label className="relative xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input aria-label="Buscar lead" className={styles.input + " pl-9"} placeholder="Nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select aria-label="Tempo sem contato" className={styles.input} value={inactivity} onChange={(e) => setInactivity(e.target.value)}>
            <option value="all">Qualquer data de contato</option><option value="30">Sem contato há 30+ dias</option>
            <option value="60">Sem contato há 60+ dias</option><option value="90">Sem contato há 90+ dias</option>
            <option value="180">Sem contato há 180+ dias</option><option value="unknown">Sem contato datado</option>
          </select>
          <select aria-label="Situação de compra" className={styles.input} value={purchase} onChange={(e) => setPurchase(e.target.value)}>
            <option value="all">Todos os clientes</option><option value="no">Nunca comprou</option><option value="yes">Já comprou</option>
          </select>
          <select aria-label="Segmento" className={styles.input} value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all">Todos os segmentos</option>
            {segments.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Erro ao carregar: {error}</div>}
      {partial && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Alguns históricos vinculados não puderam ser consultados. A lista de leads foi mantida, mas o último contato ou a situação de compra podem estar incompletos.</div>}

      <section className={styles.panel + " overflow-hidden"}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <strong>{filtered.length} resultados</strong>
          <span className="text-xs text-slate-500">Ordenados pelo registro mais recente</span>
        </div>
        {loading ? <div className="p-10 text-center text-sm text-slate-500">Consultando seus relacionamentos…</div> : !visible.length ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum lead corresponde aos filtros. Tente ampliar a pesquisa.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((lead) => {
              const elapsed = daysSince(lead.lastContactAt);
              const wa = whatsAppLink(lead.telefone);
              return <div key={lead.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                <button type="button" onClick={() => setSelectedId(lead.id)} className="min-w-[210px] flex-1 text-left">
                  <div className="font-bold text-[#1E293F] hover:text-[#A11C27]">{lead.nome}</div>
                  <div className="mt-1 text-xs text-slate-500">{lead.telefone || lead.email || "Sem telefone cadastrado"} • {lead.segment}{cascadeUsers.length > 1 ? " • " + lead.ownerName : ""}</div>
                </button>
                <div className="min-w-[130px] text-xs">
                  <div className="font-semibold text-slate-700">{lead.lastContactAt ? time(lead.lastContactAt) : "Sem contato datado"}</div>
                  <div className="mt-1 text-slate-500">{elapsed === null ? "Cadastro em " + time(lead.created_at) : "Há " + elapsed + " dia(s)"}</div>
                </div>
                <div className="min-w-[165px] text-xs text-slate-500">{customerStatus(lead)}</div>
                <div className="ml-auto flex gap-2">
                  <button type="button" className={styles.button} onClick={() => setSelectedId(lead.id)}><History className="h-4 w-4" /> Histórico</button>
                  {wa && <a className="inline-flex items-center gap-2 rounded-xl bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#115e59]" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
                </div>
              </div>;
            })}
          </div>
        )}
        {pages > 1 && <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-3 text-sm">
          <button type="button" className={styles.button} disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>Anterior</button>
          <span>{page} / {pages}</span>
          <button type="button" className={styles.button} disabled={page >= pages} onClick={() => setPage((v) => Math.min(pages, v + 1))}>Próxima</button>
        </div>}
      </section>

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
        <section role="dialog" aria-modal="true" aria-label={"Histórico de " + selected.nome} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-7">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#A11C27]">Histórico comercial</p>
              <h2 className="mt-1 text-xl font-black text-[#1E293F]">{selected.nome}</h2>
              <p className="mt-1 text-sm text-slate-500">{selected.telefone || selected.email || "Sem contato cadastrado"} • {selected.ownerName}</p>
            </div>
            <button type="button" aria-label="Fechar histórico" className={styles.button} onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-xs text-slate-500">Interesse</span><div className="font-bold">{selected.segment}</div></div>
            <div><span className="text-xs text-slate-500">Situação</span><div className="font-bold">{customerStatus(selected)}</div></div>
            <div><span className="text-xs text-slate-500">Última interação datada</span><div className="font-bold">{selected.lastContactAt ? time(selected.lastContactAt) : "Não registrada"}</div></div>
            <div><span className="text-xs text-slate-500">Registrado no CRM</span><div className="font-bold">{time(selected.created_at)}</div></div>
          </div>
          {selected.descricao && <div className="mt-5"><h3 className="font-bold">Observações do cadastro</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selected.descricao}</p></div>}
          <div className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 font-bold"><Clock3 className="h-4 w-4" /> Registros de relacionamento</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {[
                ...selected.notes.map((n) => ({ id: n.id, at: n.created_at, title: n.kind || "Anotação", detail: n.note })),
                ...selected.conversations.map((w) => ({ id: w.id, at: w.last_message_at || "", title: "WhatsApp", detail: w.last_message || "Conversa registrada no WhatsApp" })),
                ...selected.opportunities.map((o) => ({ id: o.id, at: o.created_at, title: "Oportunidade • " + (o.estagio || "Sem etapa"), detail: (o.segmento || "Sem segmento") + " • " + currency(o.valor_credito) + (o.observacao ? " • " + o.observacao : "") })),
              ].sort((a, b) => b.at.localeCompare(a.at)).map((event) => <div key={event.title + event.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-700">{event.title}</strong><span className="text-xs text-slate-500">{time(event.at)}</span></div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.detail}</p>
              </div>)}
              {!selected.notes.length && !selected.conversations.length && !selected.opportunities.length &&
                <p className="text-sm text-slate-500">Ainda não existem interações detalhadas vinculadas a este lead.</p>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={styles.button} onClick={() => setSelectedId(null)}><ArrowLeft className="h-4 w-4" /> Voltar à lista</button>
            {whatsAppLink(selected.telefone) && <a className="inline-flex items-center gap-2 rounded-xl bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white" href={whatsAppLink(selected.telefone) || "#"} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Conversar no WhatsApp</a>}
          </div>
        </section>
      </div>}
    </div>
  );
}
