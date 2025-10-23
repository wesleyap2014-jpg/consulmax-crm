// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, Eye, Send, Filter, SortAsc, SortDesc, Copy } from "lucide-react";

/* ========================= Tipos ========================= */
type Lead = { id: string; nome: string; telefone?: string | null; email?: string | null };

type VendaLite = {
  id: string;
  lead_id: string | null;
  cpf: string | null;
  data_nascimento?: string | null; // na venda!
  descricao?: string | null;
  created_at?: string | null;
};

type ClienteVM = {
  key: string;                 // "CPF:<11>" ou "LEAD:<id>"
  lead_id: string | null;      // lead preferencial do grupo (com melhor nome)
  cpf_dig?: string | null;     // somente dígitos
  nome: string;                // SEMPRE de algum Lead do grupo
  telefone?: string | null;    // do Lead (melhor disponível)
  email?: string | null;       // do Lead (melhor disponível)
  data_nascimento?: string | null; // da venda mais recente
  observacoes?: string | null;     // da venda mais recente
  created_at?: string | null;      // data da venda mais recente
  vendas_ids: string[];            // ordenadas desc por created_at
};

/* ========================= Utils ========================= */
const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const normalize = (s?: string | null) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 2), p2 = d.slice(2, 3), p3 = d.slice(3, 7), p4 = d.slice(7, 11);
  let out = "";
  if (p1) out += `(${p1}) `;
  if (p2) out += p2 + (p3 ? " " : "");
  if (p3) out += p3;
  if (p4) out += "-" + p4;
  return out.trim();
};

const formatBRDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const upcomingBirthdaySortKey = (iso?: string | null) => {
  if (!iso) return 366;
  const ref = new Date();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 366;
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const thisYear = new Date(Date.UTC(ref.getUTCFullYear(), month, day));
  const nextYear = new Date(Date.UTC(ref.getUTCFullYear() + 1, month, day));
  const target = thisYear < ref ? nextYear : thisYear;
  const diffMs = target.getTime() - ref.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const isBirthdayThisMonth = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d.getUTCMonth() === now.getUTCMonth();
};
const isBirthdayThisWeek = (iso?: string | null) => {
  if (!iso) return false;
  const now = new Date();
  const toUTC0 = (x: Date) =>
    new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  const today = toUTC0(now);
  const weekday = today.getUTCDay();
  const offsetToFri = ((weekday - 5 + 7) % 7);
  const start = new Date(today.getTime() - offsetToFri * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const birth = new Date(iso);
  const thisYear = new Date(Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  return thisYear >= start && thisYear <= end;
};

const pickLatest = <T extends { created_at?: string | null }>(arr: T[]): T | undefined =>
  arr.slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];

const copyToClipboard = (text: string) => {
  try { navigator.clipboard?.writeText(text); } catch {}
};

const maskCpfName = (cpf?: string | null) => {
  const d = onlyDigits(cpf || "");
  if (d.length !== 11) return "CPF —";
  return `CPF ${d.slice(0,3)}.${d.slice(3,6)}.***-${d.slice(9,11)}`;
};

/* ========================= Página ========================= */
export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteVM[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // filtros/ordenação
  const [filterWeek, setFilterWeek] = useState(false);
  const [filterMonth, setFilterMonth] = useState(false);
  const [sortBy, setSortBy] = useState<"nomeAsc" | "nomeDesc" | "aniversario">("nomeAsc");

  // edição
  const [editing, setEditing] = useState<ClienteVM | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState<string>("");
  const [editObs, setEditObs] = useState("");

  // incompletos
  const [incompletos, setIncompletos] = useState<ClienteVM[]>([]);

  // toast simples
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const pushToast = (type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3400);
  };

  /* Debounce da busca */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* Load geral */
  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterWeek, filterMonth, sortBy]);

  /* ========================= Load unificado (VENDAS + LEADS) ========================= */
  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      const [{ data: vds }, { data: lds }] = await Promise.all([
        supabase
          .from("vendas")
          .select("id,lead_id,cpf,data_nascimento,descricao,created_at")
          .order("created_at", { ascending: false })
          .range(0, 9999),
        supabase
          .from("leads")
          .select("id,nome,telefone,email")
          .order("nome", { ascending: true })
          .range(0, 9999),
      ]);

      // Maps de leads
      const leadMap = new Map<string, Lead>(
        (lds || []).map((l: any) => [
          String(l.id),
          { id: String(l.id), nome: l.nome ?? "", telefone: l.telefone ?? null, email: l.email ?? null },
        ])
      );

      // Buckets primários
      type Bucket = { vendas: VendaLite[]; leads: Lead[]; cpf?: string | null };
      const mapByKey = new Map<string, Bucket>();
      const keyByCpf = new Map<string, string>();   // cpf -> key (CPF:xxx)
      const keyByLead = new Map<string, string>();  // lead_id -> key (CPF:xxx | LEAD:yyy)

      // cria/resolve chave para (lead, cpf) com MERGE automático lead->cpf
      const ensureKeyFor = (leadId: string | null, rawCpf: string | null): string => {
        const cpf = rawCpf ? onlyDigits(rawCpf) : null;
        const leadKey = leadId ? keyByLead.get(leadId) : undefined;
        const cpfKey = cpf ? keyByCpf.get(cpf) : undefined;

        if (cpfKey) {
          // já existe um bucket de CPF — garanta que o lead aponte pra ele
          if (leadId) keyByLead.set(leadId, cpfKey);
          return cpfKey;
        }

        if (leadKey) {
          // há bucket de LEAD; se chegou um CPF agora, converte para CPF
          if (cpf) {
            const newKey = `CPF:${cpf}`;
            const from = mapByKey.get(leadKey);
            mapByKey.delete(leadKey);
            mapByKey.set(newKey, from || { vendas: [], leads: [] , cpf });
            keyByCpf.set(cpf, newKey);
            if (leadId) keyByLead.set(leadId, newKey);
            return newKey;
          }
          return leadKey;
        }

        // criar novo
        if (cpf) {
          const newKey = `CPF:${cpf}`;
          keyByCpf.set(cpf, newKey);
          if (leadId) keyByLead.set(leadId, newKey);
          mapByKey.set(newKey, { vendas: [], leads: [], cpf });
          return newKey;
        } else if (leadId) {
          const newKey = `LEAD:${leadId}`;
          keyByLead.set(leadId, newKey);
          mapByKey.set(newKey, { vendas: [], leads: [] });
          return newKey;
        } else {
          const newKey = `ROW:${Math.random().toString(36).slice(2)}`;
          mapByKey.set(newKey, { vendas: [], leads: [] });
          return newKey;
        }
      };

      // 1) Alimenta buckets
      (vds || []).forEach((r: any) => {
        const venda: VendaLite = {
          id: String(r.id),
          lead_id: r.lead_id ? String(r.lead_id) : null,
          cpf: r.cpf ? String(r.cpf) : null,
          data_nascimento: r.data_nascimento ?? null,
          descricao: r.descricao ?? null,
          created_at: r.created_at ?? null,
        };
        const key = ensureKeyFor(venda.lead_id, venda.cpf);
        const bucket = mapByKey.get(key)!;
        bucket.vendas.push(venda);
        if (venda.lead_id) {
          const L = leadMap.get(venda.lead_id);
          if (L && !bucket.leads.find((x) => x.id === L.id)) bucket.leads.push(L);
        }
      });

      // 2) ÍNDICES dos buckets por CPF (para casar com buckets SEM CPF)
      const cpfBuckets = Array.from(mapByKey.entries()).filter(([k]) => k.startsWith("CPF:"));
      const indexByPhone = new Map<string, string>(); // phoneDigits -> cpfKey
      const indexByEmail = new Map<string, string>(); // emailLower  -> cpfKey
      const indexByName  = new Map<string, string>(); // normName    -> cpfKey
      for (const [key, b] of cpfBuckets) {
        const lead = b.leads[0];
        if (lead?.telefone) indexByPhone.set(onlyDigits(lead.telefone), key);
        if (lead?.email) indexByEmail.set((lead.email || "").toLowerCase(), key);
        if (lead?.nome) indexByName.set(normalize(lead.nome), key);
      }

      // 3) MESCLA buckets SEM CPF com buckets POR CPF por telefone/e-mail/nome
      for (const [key, bucket] of Array.from(mapByKey.entries())) {
        if (!key.startsWith("LEAD:")) continue; // só sem CPF
        const lead = bucket.leads[0];
        const phone = lead?.telefone ? onlyDigits(lead.telefone) : "";
        const email = (lead?.email || "").toLowerCase();
        const nameN = normalize(lead?.nome || "");

        const cpfKey =
          (phone && indexByPhone.get(phone)) ||
          (email && indexByEmail.get(email)) ||
          (nameN && indexByName.get(nameN));

        if (cpfKey && mapByKey.has(cpfKey)) {
          const target = mapByKey.get(cpfKey)!;
          // mescla vendas
          target.vendas.push(...bucket.vendas);
          // mescla leads (mantendo únicos)
          for (const L of bucket.leads) {
            if (!target.leads.find((x) => x.id === L.id)) target.leads.push(L);
          }
          // remove o antigo
          mapByKey.delete(key);
        }
      }

      // 4) Monta a VM
      let all: ClienteVM[] = [];
      for (const [key, bucket] of mapByKey.entries()) {
        // ordena vendas desc e pega a mais recente p/ nascimento/obs
        const vendasOrd = bucket.vendas
          .slice()
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        const latest = vendasOrd[0];

        // escolhe o melhor lead (com nome válido)
        const leadPref =
          bucket.leads.find((l) => (l.nome || "").trim().length > 0) ||
          bucket.leads[0];

        // monta campos
        const cpfDig = (bucket.cpf && onlyDigits(bucket.cpf)) || (latest?.cpf && onlyDigits(latest.cpf)) || null;
        const nome =
          (leadPref?.nome || "").trim() ||
          (cpfDig ? maskCpfName(cpfDig) : "(Sem nome)");

        all.push({
          key,
          lead_id: leadPref?.id ?? (latest?.lead_id ?? null),
          cpf_dig: cpfDig,
          nome,
          telefone: leadPref?.telefone ?? null,
          email: leadPref?.email ?? null,
          data_nascimento: latest?.data_nascimento ?? null,
          observacoes: latest?.descricao ?? null,
          created_at: latest?.created_at ?? null,
          vendas_ids: vendasOrd.map((v) => v.id),
        });
      }

      // 5) Busca por nome (Lead)
      if (term) {
        const t = normalize(term);
        all = all.filter((r) => normalize(r.nome).includes(t));
      }

      // 6) Filtros aniversário
      if (filterWeek) all = all.filter((r) => isBirthdayThisWeek(r.data_nascimento));
      if (filterMonth) all = all.filter((r) => isBirthdayThisMonth(r.data_nascimento));

      // 7) Ordenação
      if (sortBy === "aniversario") {
        all.sort((a, b) => upcomingBirthdaySortKey(a.data_nascimento) - upcomingBirthdaySortKey(b.data_nascimento));
      } else if (sortBy === "nomeDesc") {
        all.sort((a, b) => (b.nome || "").localeCompare(a.nome || "", "pt-BR"));
      } else {
        all.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      }

      // 8) Paginação (client-side)
      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setTotal(all.length);
      setClientes(all.slice(from, to));
      setPage(target);

      // 9) Incompletos
      const faltantes = all
        .filter((c) => !c.telefone || !c.email || !c.data_nascimento)
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setIncompletos(faltantes.slice(0, 8));
    } catch (e: any) {
      pushToast("error", e.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }

  /* ========================= Edição ========================= */
  function openEdit(c: ClienteVM) {
    setEditing(c);
    setEditNome(c.nome || "");
    setEditEmail(c.email || "");
    setEditPhone(c.telefone ? maskPhone(c.telefone) : "");
    setEditBirth(c.data_nascimento || "");
    setEditObs(c.observacoes || "");
  }
  function closeEdit() { setEditing(null); }

  async function saveEdit() {
    if (!editing) return;
    try {
      setLoading(true);

      // Atualiza o LEAD (contatos + nome)
      if (editing.lead_id) {
        const { error: eLead } = await supabase
          .from("leads")
          .update({
            nome: editNome.trim() || editing.nome,
            telefone: onlyDigits(editPhone) || null,
            email: editEmail.trim() || null,
          })
          .eq("id", editing.lead_id);
        if (eLead) throw eLead;
      }

      // Atualiza a VENDA mais recente do grupo (nascimento + obs)
      const latestVendaId = editing.vendas_ids[0];
      if (latestVendaId) {
        const { error: eVenda } = await supabase
          .from("vendas")
          .update({
            data_nascimento: editBirth || null,
            descricao: editObs.trim() || null,
          })
          .eq("id", latestVendaId);
        if (eVenda) throw eVenda;
      }

      await load(page, debounced);
      closeEdit();
      pushToast("success", "Dados atualizados!");
    } catch (e: any) {
      pushToast("error", "Erro ao salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  /* ========================= UI ========================= */
  return (
    <div className="space-y-4">
      {/* Novos para complementar */}
      {incompletos.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow border">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="m-0 font-semibold">Novos clientes para complementar</h3>
            <button className="btn" onClick={() => load(page, debounced)}>Atualizar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incompletos.map((c) => {
              const phone = c.telefone ? maskPhone(c.telefone) : "";
              const missing: string[] = [];
              if (!c.telefone) missing.push("telefone");
              if (!c.email) missing.push("e-mail");
              if (!c.data_nascimento) missing.push("nascimento");
              return (
                <div key={c.key} className="rounded-xl border p-3">
                  <div className="font-semibold">{c.nome}</div>
                  <div className="text-xs text-slate-500 mb-1">CPF: {c.cpf_dig || "—"}</div>
                  <div className="text-sm mb-1">📞 {phone || "—"}</div>
                  <div className="text-sm mb-2">✉️ {c.email || "—"}</div>
                  {missing.length > 0 && (
                    <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded px-2 py-1 inline-block">
                      Faltando: {missing.join(", ")}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary" onClick={() => openEdit(c)}>Completar</button>
                    {c.telefone && (
                      <a className="btn" href={`https://wa.me/55${onlyDigits(c.telefone)}`} target="_blank" rel="noreferrer">
                        <Send className="h-4 w-4 mr-1" /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <h3 className="m-0 font-semibold">Lista de Clientes</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                className="input pl-9 w-80"
                placeholder="Buscar por nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
            </div>
            <button className={`chip ${filterWeek ? "chip-on" : ""}`} onClick={() => { setFilterWeek((v) => !v); setPage(1); }}>
              <Filter className="h-3.5 w-3.5" /> Semana
            </button>
            <button className={`chip ${filterMonth ? "chip-on" : ""}`} onClick={() => { setFilterMonth((v) => !v); setPage(1); }}>
              <Filter className="h-3.5 w-3.5" /> Mês
            </button>
            <div className="relative">
              <select className="input pr-8" value={sortBy} onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}>
                <option value="nomeAsc">Nome (A→Z)</option>
                <option value="nomeDesc">Nome (Z→A)</option>
                <option value="aniversario">Próximos aniversários</option>
              </select>
              <span className="absolute right-2 top-2.5 opacity-60">
                {sortBy === "nomeDesc" ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
              </span>
            </div>
            <small className="text-slate-500">
              Mostrando {clientes.length ? (page - 1) * PAGE + 1 : 0}-{Math.min(page * PAGE, total)} de {total}
            </small>
          </div>
        </div>

        <div className="rounded-xl border overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Nome</th>
                <th className="p-2 text-left">Telefone</th>
                <th className="p-2 text-left">E-mail</th>
                <th className="p-2 text-left">Nascimento</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="p-4 text-slate-500" colSpan={5}>Carregando…</td></tr>}
              {!loading && clientes.length === 0 && <tr><td className="p-4 text-slate-500" colSpan={5}>Nenhum cliente encontrado.</td></tr>}
              {clientes.map((c, i) => {
                const phone = c.telefone ? maskPhone(c.telefone) : "";
                const wa = c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : "";
                const contatoStr = `${c.nome} | ${phone || "s/ telefone"} | ${c.email || "s/ e-mail"}`;
                return (
                  <tr key={c.key} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2">
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-slate-500">CPF: {c.cpf_dig || "—"}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {phone || "—"}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-green-50">
                            <Send className="h-3.5 w-3.5" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{c.email || "—"}</td>
                    <td className="p-2">{formatBRDate(c.data_nascimento)}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-2">
                        <button className="icon-btn" title="Editar" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn" title="Copiar contato" onClick={() => { copyToClipboard(contatoStr); pushToast("info", "Contato copiado!"); }}>
                          <Copy className="h-4 w-4" />
                        </button>
                        <a className="icon-btn" title="Ver Vendas" href="/carteira"><Eye className="h-4 w-4" /></a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="btn" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>‹ Anterior</button>
          <span className="text-xs text-slate-600">Página {page} de {totalPages}</span>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Próxima ›</button>
        </div>
      </div>

      {/* Modal edição */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeEdit} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold mb-2">Editar Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="input" placeholder="Nome (Lead)" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              <input className="input" placeholder="E-mail (Lead)" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              <input className="input" placeholder="Telefone (Lead)" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              <input type="date" className="input" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} placeholder="Data de Nascimento (Venda)" />
              <input className="input md:col-span-2" placeholder="Observações (Venda)" value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={closeEdit}>Cancelar</button>
              <button className="btn-primary" onClick={saveEdit} disabled={loading}>
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] rounded-xl px-4 py-3 shadow-lg text-sm ${
          toast.type === "success" ? "bg-emerald-600 text-white" :
          toast.type === "error" ? "bg-rose-600 text-white" : "bg-slate-800 text-white"
        }`}>
          {toast.text}
        </div>
      )}

      {/* estilos locais */}
      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none;background:#fff}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
        .icon-btn:hover{background:#eef2ff}
        .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px}
        .chip-on{background:#1E293F;color:#fff;border-color:#1E293F}
      `}</style>
    </div>
  );
}
