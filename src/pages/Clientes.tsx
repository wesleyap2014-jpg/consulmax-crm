// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send, Check, Loader2 } from "lucide-react";

type Cliente = {
  id: string;                 // lead_id (chave visual da linha)
  lead_id: string;
  nome: string;
  cpf_dig?: string | null;    // da venda mais recente (texto)
  telefone?: string | null;   // do lead
  email?: string | null;      // do lead
  data_nascimento?: string | null; // vendas.nascimento (YYYY-MM-DD)
  observacoes?: string | null;     // vendas.descricao
  vendas_ids?: string[];      // ids das vendas do lead (mais recente primeiro)
};

const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
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

export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);       // confirmados (têm linha em clientes)
  const [novos, setNovos] = useState<Cliente[]>([]);             // sem linha em clientes
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // modal edição (para confirmados)
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState<string>(""); // YYYY-MM-DD
  const [editObs, setEditObs] = useState("");

  // form novo cliente manual (mantido)
  const [form, setForm] = useState<Partial<Cliente>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  /**
   * Carrega:
   * - Leads (filtro por nome)
   * - Vendas (para os leads filtrados)
   * - Clientes (para saber quem já está confirmado)
   * Regras:
   *   - Só considera leads com pelo menos 1 venda que tenha cpf (text) OU cpf_cnpj (bytea)
   *   - A venda mais recente abastece nascimento/observações/cpf_dig
   *   - Particiona em "novos" (sem registro em clientes) e "clientes" (com registro em clientes)
   */
  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      // 1) Leads
      let leadsQ = supabase
        .from("leads")
        .select("id,nome,telefone,email")
        .order("nome", { ascending: true });

      if (term) leadsQ = leadsQ.ilike("nome", `%${term}%`);

      const { data: leads, error: eLeads } = await leadsQ.range(0, 5000);
      if (eLeads) throw eLeads;
      const leadIds = (leads || []).map((l: any) => String(l.id));
      if (leadIds.length === 0) {
        setClientes([]); setNovos([]); setTotal(0); setPage(1);
        setLoading(false);
        return;
      }

      // 2) Vendas dos leads
      const { data: vendas, error: eVend } = await supabase
        .from("vendas")
        .select("id,lead_id,cpf,cpf_cnpj,nascimento,descricao,created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .range(0, 20000);
      if (eVend) throw eVend;

      // Agrupa vendas por lead
      type VendaLite = {
        id: string;
        created_at: string | null;
        nasc?: string | null;
        obs?: string | null;
        cpf?: string | null;
        hasCpfCnpj?: boolean;
      };
      const vendasByLead = new Map<string, VendaLite[]>();
      (vendas || []).forEach((v: any) => {
        const lid = v.lead_id ? String(v.lead_id) : "";
        if (!lid) return;
        if (!vendasByLead.has(lid)) vendasByLead.set(lid, []);
        vendasByLead.get(lid)!.push({
          id: String(v.id),
          created_at: v.created_at ?? null,
          nasc: v.nascimento ?? null,
          obs: v.descricao ?? null,
          cpf: v.cpf ? onlyDigits(String(v.cpf)) : null,
          hasCpfCnpj: v.cpf_cnpj != null,
        });
      });

      // 3) Quais leads já possuem linha em clientes
      const { data: cliRows, error: eCli } = await supabase
        .from("clientes")
        .select("id,lead_id");
      if (eCli) throw eCli;
      const confirmedSet = new Set((cliRows || []).map((c: any) => String(c.lead_id)));

      // 4) Monta 1 linha por lead (apenas se tem cpf/cpf_cnpj)
      const base: Cliente[] = [];
      for (const l of leads || []) {
        const lid = String(l.id);
        const arr = (vendasByLead.get(lid) || []).sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        );
        const hasCpfAny = arr.some((x) => (x.cpf && x.cpf.length > 0) || x.hasCpfCnpj);
        if (!hasCpfAny) continue;

        const latest = arr[0];
        base.push({
          id: lid,
          lead_id: lid,
          nome: l.nome || "(Sem nome)",
          telefone: l.telefone || null,
          email: l.email || null,
          data_nascimento: latest?.nasc || null,
          observacoes: latest?.obs || null,
          cpf_dig: latest?.cpf || null,
          vendas_ids: arr.map((x) => x.id),
        });
      }

      // 5) Particiona
      const confirmed = base.filter((x) => confirmedSet.has(x.lead_id));
      const pending = base.filter((x) => !confirmedSet.has(x.lead_id));

      // 6) Ordena/pagina confirmados
      confirmed.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setClientes(confirmed.slice(from, to));
      setTotal(confirmed.length);
      setPage(target);

      // 7) Ordena “novos” por mais recente (fallback: A-Z)
      pending.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      setNovos(pending);
    } catch (e: any) {
      alert(e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  // ===== Novo → Confirmar (move para a lista) =====
  function NovoCard({ c, onDone }: { c: Cliente; onDone: () => void }) {
    const [nome, setNome] = useState(c.nome || "");
    const [email, setEmail] = useState(c.email || "");
    const [telefone, setTelefone] = useState(c.telefone ? maskPhone(c.telefone) : "");
    const [birth, setBirth] = useState<string>(c.data_nascimento || "");
    const [obs, setObs] = useState(c.observacoes || "");
    const [cpf, setCpf] = useState(c.cpf_dig || "");
    const [saving, setSaving] = useState(false);

    const latestVendaId = c.vendas_ids?.[0];

    const confirm = async () => {
      try {
        if (!cpf) return alert("Informe o CPF para confirmar.");
        setSaving(true);

        // 1) Atualiza lead
        const { error: eLead } = await supabase
          .from("leads")
          .update({
            nome: nome.trim() || c.nome,
            telefone: onlyDigits(telefone) || null,
            email: email.trim() || null,
          })
          .eq("id", c.lead_id);
        if (eLead) throw eLead;

        // 2) Atualiza venda mais recente (nascimento/observações)
        if (latestVendaId) {
          const { error: eVenda } = await supabase
            .from("vendas")
            .update({
              nascimento: birth || null,
              descricao: obs.trim() || null,
              cpf: onlyDigits(cpf) || null,
              email: email.trim() || null, // se você criou a coluna email em vendas
            })
            .eq("id", latestVendaId);
          if (eVenda) throw eVenda;
        }

        // 3) Cria linha em clientes (liga por lead_id)
        const { error: eCli } = await supabase.from("clientes").insert({
          nome: nome.trim() || c.nome,
          cpf: onlyDigits(cpf) || null,
          telefone: onlyDigits(telefone) || null,
          email: email.trim() || null,
          data_nascimento: birth || null,
          observacoes: obs.trim() || null,
          lead_id: c.lead_id,
        } as any);
        if (eCli) throw eCli;

        onDone();
      } catch (e: any) {
        alert(e.message ?? "Não foi possível confirmar.");
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="rounded-xl border p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <strong className="truncate">{c.nome}</strong>
          <span className="text-xs text-slate-500">CPF: {cpf || "—"}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="input" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="input" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          <input className="input" placeholder="CPF" value={cpf} onChange={(e) => setCpf(onlyDigits(e.target.value))} />
          <input className="input" type="date" placeholder="Nascimento" value={birth} onChange={(e) => setBirth(e.target.value)} />
          <input className="input md:col-span-2" placeholder="Observações" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={onDone} disabled={saving}>Depois</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={confirm} disabled={saving || !cpf}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar
          </button>
        </div>
      </div>
    );
  }

  // ===== Modal edição (confirmados) =====
  function openEdit(c: Cliente) {
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
      // atualiza lead
      const { error: eLead } = await supabase
        .from("leads")
        .update({
          nome: editNome.trim() || editing.nome,
          telefone: onlyDigits(editPhone) || null,
          email: editEmail.trim() || null,
        })
        .eq("id", editing.lead_id);
      if (eLead) throw eLead;

      // atualiza venda mais recente
      const latestVendaId = editing.vendas_ids?.[0];
      if (latestVendaId) {
        const { error: eVenda } = await supabase
          .from("vendas")
          .update({
            nascimento: editBirth || null,
            descricao: editObs.trim() || null,
            email: editEmail.trim() || null,
          })
          .eq("id", latestVendaId);
        if (eVenda) throw eVenda;
      }

      await load(page, debounced);
      closeEdit();
      alert("Cliente atualizado!");
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // criar cliente manual (tabela clientes) – mantido
  async function createCliente() {
    const payload = {
      nome: (form.nome || "").trim(),
      cpf: onlyDigits((form as any).cpf || ""),
      telefone: onlyDigits(form.telefone || ""),
      email: (form.email || "").trim() || null,
      data_nascimento: (form.data_nascimento || "") === "" ? null : form.data_nascimento!,
      observacoes: (form.observacoes || "").trim() || null,
    };
    if (!payload.nome) return alert("Informe o nome.");
    if (!payload.cpf) return alert("Informe o CPF.");

    try {
      setLoading(true);
      const { error } = await supabase.from("clientes").insert({
        nome: payload.nome,
        cpf: payload.cpf,
        telefone: payload.telefone || null,
        email: payload.email,
        data_nascimento: payload.data_nascimento,
        observacoes: payload.observacoes,
      } as any);
      if (error) throw error;
      setForm({});
      await load(1, debounced);
      alert("Cliente criado!");
    } catch (e: any) {
      alert("Não foi possível salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  return (
    <div className="space-y-4">
      {/* Novo cliente manual */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">Novo Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input className="input" placeholder="Nome" value={form.nome || ""} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} />
          <input className="input" placeholder="CPF" value={(form as any).cpf || ""} onChange={(e) => setForm((s: any) => ({ ...s, cpf: e.target.value }))} />
          <input className="input" placeholder="Telefone" value={form.telefone || ""} onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))} />
          <input className="input" placeholder="E-mail" value={form.email || ""} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
          <input className="input" type="date" value={form.data_nascimento || ""} onChange={(e) => setForm((s) => ({ ...s, data_nascimento: e.target.value }))} placeholder="Data de Nascimento" />
          <input className="input md:col-span-2" placeholder="Observações" value={form.observacoes || ""} onChange={(e) => setForm((s) => ({ ...s, observacoes: e.target.value }))} />
          <button className="btn-primary md:col-span-2" onClick={createCliente} disabled={loading}>{loading ? "Salvando..." : "Criar Cliente"}</button>
        </div>
      </div>

      {/* NOVOS */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="m-0 font-semibold">Novos <span className="text-slate-500 text-sm">({novos.length})</span></h3>
        </div>
        {novos.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhum novo cliente no momento.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {novos.map((c) => (
              <NovoCard key={c.lead_id} c={c} onDone={() => load(page, debounced)} />
            ))}
          </div>
        )}
      </div>

      {/* LISTA (apenas confirmados) */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="m-0 font-semibold">Lista de Clientes</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input className="input pl-9 w-80" placeholder="Buscar por nome" value={search} onChange={(e) => setSearch(e.target.value)} />
              <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
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
              {loading && (
                <tr><td className="p-4 text-slate-500" colSpan={5}>Carregando…</td></tr>
              )}
              {!loading && clientes.length === 0 && (
                <tr><td className="p-4 text-slate-500" colSpan={5}>Nenhum cliente encontrado.</td></tr>
              )}
              {clientes.map((c, i) => {
                const phone = c.telefone ? maskPhone(c.telefone) : "";
                const wa = c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : "";
                return (
                  <tr key={c.id} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2">
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-slate-500">CPF: {c.cpf_dig || "—"}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {phone || "—"}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-green-50">
                            <Send className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{c.email || "—"}</td>
                    <td className="p-2">{formatBRDate(c.data_nascimento)}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-2">
                        <button className="icon-btn" title="Editar" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn" title="+ Evento na Agenda" onClick={() => alert("Aniversário é lido da venda mais recente (campo 'nascimento').")}><CalendarPlus className="h-4 w-4" /></button>
                        <a className="icon-btn" title="Ver na Agenda" href="/agenda"><Eye className="h-4 w-4" /></a>
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
          <button className="btn" disabled={page <= 1 || loading} onClick={() => load(page - 1, debounced)}>‹ Anterior</button>
          <span className="text-xs text-slate-600">Página {page} de {totalPages}</span>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => load(page + 1, debounced)}>Próxima ›</button>
        </div>
      </div>

      {/* Modal edição */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeEdit} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold mb-2">Editar Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="input" placeholder="Nome" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              <input className="input" placeholder="E-mail" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              <input className="input" placeholder="Telefone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              <input type="date" className="input" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} placeholder="Data de Nascimento" />
              <input className="input md:col-span-3" placeholder="Observações" value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={closeEdit}>Cancelar</button>
              <button className="btn-primary" onClick={saveEdit} disabled={loading}>{loading ? "Salvando..." : "Salvar alterações"}</button>
            </div>
          </div>
        </>
      )}

      {/* estilos locais */}
      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px}
        .icon-btn:hover{background:#eef2ff}
      `}</style>
    </div>
  );
}
