// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send } from "lucide-react";

type Cliente = {
  id: string;                       // chave interna da lista (CPF:* ou LEAD:*)
  lead_id?: string | null;          // lead preferencial (de onde veio o nome/contato)
  vendas_ids?: string[];            // vendas do grupo, mais recente primeiro
  nome: string;
  cpf_dig?: string | null;          // dígitos do CPF do grupo
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;  // YYYY-MM-DD (da venda mais recente)
  observacoes?: string | null;      // descrição da venda mais recente
};

const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const normalize = (s?: string | null) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 3);
  const p3 = d.slice(3, 7);
  const p4 = d.slice(7, 11);
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

// nome "mascarado" se não houver lead com nome
const maskCpfName = (cpf?: string | null) => {
  const d = onlyDigits(cpf || "");
  if (d.length !== 11) return "CPF —";
  return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.***-${d.slice(9, 11)}`;
};

export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // modal edição
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState<string>(""); // YYYY-MM-DD
  const [editObs, setEditObs] = useState("");
  const [editCEP, setEditCEP] = useState("");
  const [editLogr, setEditLogr] = useState("");
  const [editNumero, setEditNumero] = useState("");
  const [editBairro, setEditBairro] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editUF, setEditUF] = useState("");

  // form novo cliente (continua, caso você ainda use a tabela clientes manualmente)
  const [form, setForm] = useState<Partial<Cliente>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  /**
   * Carrega SOMENTE de public.vendas + public.leads
   * - Agrupa por CPF (um cliente por CPF)
   * - Nome/telefone/email vêm do lead (preferindo lead com nome)
   * - Nascimento/observações vêm da venda mais recente do grupo
   * - Busca apenas por nome
   */
  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      // trazemos bastante linha e paginamos no client (simples e confiável)
      const [{ data: vendas }, { data: leads }] = await Promise.all([
        supabase
          .from("vendas")
          .select("id, lead_id, cpf, data_nascimento, descricao, created_at")
          .order("created_at", { ascending: false })
          .range(0, 5000),
        supabase
          .from("leads")
          .select("id, nome, telefone, email")
          .order("nome", { ascending: true })
          .range(0, 5000),
      ]);

      const leadMap = new Map<string, { id: string; nome: string; telefone?: string | null; email?: string | null }>(
        (leads || []).map((l: any) => [
          String(l.id),
          { id: String(l.id), nome: l.nome || "", telefone: l.telefone || null, email: l.email || null },
        ])
      );

      // Agrupa por CPF
      type Bucket = {
        cpf: string | null;
        vendas: Array<{ id: string; lead_id: string | null; created_at: string | null; nasc?: string | null; obs?: string | null }>;
        leads: Array<{ id: string; nome: string; telefone?: string | null; email?: string | null }>;
      };

      const buckets = new Map<string, Bucket>();

      (vendas || []).forEach((v: any) => {
        const cpf_dig = v.cpf ? onlyDigits(String(v.cpf)) : "";
        const key = cpf_dig ? `CPF:${cpf_dig}` : `LEAD:${v.lead_id || v.id}`;
        if (!buckets.has(key)) {
          buckets.set(key, { cpf: cpf_dig || null, vendas: [], leads: [] });
        }
        const b = buckets.get(key)!;
        b.vendas.push({
          id: String(v.id),
          lead_id: v.lead_id ? String(v.lead_id) : null,
          created_at: v.created_at ?? null,
          nasc: v.data_nascimento ?? null,
          obs: v.descricao ?? null,
        });
        if (v.lead_id && leadMap.has(String(v.lead_id))) {
          const L = leadMap.get(String(v.lead_id))!;
          if (!b.leads.find((x) => x.id === L.id)) b.leads.push(L);
        }
      });

      // Se há bucket LEAD sem CPF e existir outro bucket CPF
      // com mesmo telefone/e-mail/nome, mescla para o CPF
      const cpfKeys = Array.from(buckets.keys()).filter((k) => k.startsWith("CPF:"));
      const indexByPhone = new Map<string, string>();
      const indexByEmail = new Map<string, string>();
      const indexByName = new Map<string, string>();
      for (const k of cpfKeys) {
        const b = buckets.get(k)!;
        const L = b.leads[0];
        if (L?.telefone) indexByPhone.set(onlyDigits(L.telefone), k);
        if (L?.email) indexByEmail.set((L.email || "").toLowerCase(), k);
        if (L?.nome) indexByName.set(normalize(L.nome), k);
      }

      for (const [k, b] of Array.from(buckets.entries())) {
        if (!k.startsWith("LEAD:")) continue;
        const L = b.leads[0];
        const phone = L?.telefone ? onlyDigits(L.telefone) : "";
        const email = (L?.email || "").toLowerCase();
        const nname = normalize(L?.nome || "");
        const cpfKey = (phone && indexByPhone.get(phone)) || (email && indexByEmail.get(email)) || (nname && indexByName.get(nname));
        if (cpfKey && buckets.has(cpfKey)) {
          const tgt = buckets.get(cpfKey)!;
          tgt.vendas.push(...b.vendas);
          for (const ld of b.leads) if (!tgt.leads.find((x) => x.id === ld.id)) tgt.leads.push(ld);
          buckets.delete(k);
        }
      }

      // Monta view model
      let all: Cliente[] = [];
      for (const [k, b] of buckets.entries()) {
        // ordena vendas por created_at desc
        const ord = b.vendas.slice().sort((a, c) => (c.created_at || "").localeCompare(a.created_at || ""));
        const latest = ord[0];
        // escolhe lead com nome válido
        const prefLead = b.leads.find((x) => (x.nome || "").trim().length > 0) || b.leads[0];
        const nome = (prefLead?.nome || "").trim() || maskCpfName(b.cpf || "");
        all.push({
          id: k,
          lead_id: prefLead?.id ?? (latest?.lead_id ?? null),
          vendas_ids: ord.map((x) => x.id),
          nome,
          cpf_dig: b.cpf,
          telefone: prefLead?.telefone ?? null,
          email: prefLead?.email ?? null,
          data_nascimento: latest?.nasc ?? null,
          observacoes: latest?.obs ?? null,
        });
      }

      // Busca apenas por NOME
      if (term) {
        const t = normalize(term);
        all = all.filter((c) => normalize(c.nome).includes(t));
      }

      // ordena por nome e pagina
      all.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setTotal(all.length);
      setClientes(all.slice(from, to));
      setPage(target);
    } catch (e: any) {
      alert(e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  // criar cliente manual (mantido caso você ainda use a tabela clientes)
  async function createCliente() {
    const payload = {
      nome: (form.nome || "").trim(),
      cpf: onlyDigits((form as any).cpf || ""),
      telefone: onlyDigits(form.telefone || ""),
      email: (form.email || "").trim() || null,
      data_nascimento:
        (form.data_nascimento || "") === "" ? null : form.data_nascimento!,
      observacoes: (form.observacoes || "").trim() || null,
    };
    if (!payload.nome) return alert("Informe o nome.");
    if (!payload.cpf) return alert("Informe o CPF.");

    try {
      setLoading(true);
      const { error, data } = await supabase
        .from("clientes")
        .insert({
          nome: payload.nome,
          cpf: payload.cpf,
          telefone: payload.telefone || null,
          email: payload.email,
          data_nascimento: payload.data_nascimento,
          observacoes: payload.observacoes,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.rpc("upsert_birthday_event", { p_cliente: data!.id });

      setForm({});
      await load(1);
      alert("Cliente criado!");
    } catch (e: any) {
      alert("Não foi possível salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // abrir modal edição
  function openEdit(c: Cliente) {
    setEditing(c);
    setEditNome(c.nome || "");
    setEditEmail(c.email || "");
    setEditPhone(c.telefone ? maskPhone(c.telefone) : "");
    setEditBirth(c.data_nascimento || "");
    setEditObs(c.observacoes || "");
    setEditCEP("");
    setEditLogr("");
    setEditNumero("");
    setEditBairro("");
    setEditCidade("");
    setEditUF("");
  }
  function closeEdit() {
    setEditing(null);
  }

  // ViaCEP quando CEP completo (mantido, opcional)
  useEffect(() => {
    const d = onlyDigits(editCEP);
    if (editing && d.length === 8) {
      (async () => {
        try {
          const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
          const data = await resp.json();
          if (!data?.erro) {
            setEditLogr((v) => v || data.logradouro || "");
            setEditBairro((v) => v || data.bairro || "");
            setEditCidade((v) => v || data.localidade || "");
            setEditUF((v) => v || data.uf || "");
          }
        } catch {
          /* ignore */
        }
      })();
    }
  }, [editCEP, editing]);

  /**
   * Salvar edição
   * - Atualiza LEAD (nome/telefone/email)
   * - Atualiza VENDA mais recente do grupo (nascimento/observações)
   */
  async function saveEdit() {
    if (!editing) return;
    try {
      setLoading(true);

      // Atualiza Lead
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

      // Atualiza venda mais recente do grupo
      const vendaId = editing.vendas_ids?.[0];
      if (vendaId) {
        const { error: eVenda } = await supabase
          .from("vendas")
          .update({
            data_nascimento: editBirth || null,
            descricao: editObs.trim() || null,
          })
          .eq("id", vendaId);
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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE)),
    [total]
  );

  return (
    <div className="space-y-4">
      {/* Novo cliente (manual) */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">Novo Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input
            placeholder="Nome"
            className="input"
            value={form.nome || ""}
            onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
          />
          <input
            placeholder="CPF"
            className="input"
            value={(form as any).cpf || ""}
            onChange={(e) => setForm((s: any) => ({ ...s, cpf: e.target.value }))}
          />
          <input
            placeholder="Telefone"
            className="input"
            value={form.telefone || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, telefone: e.target.value }))
            }
          />
          <input
            placeholder="E-mail"
            className="input"
            value={form.email || ""}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          />
          <input
            type="date"
            className="input"
            value={form.data_nascimento || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, data_nascimento: e.target.value }))
            }
            placeholder="Data de Nascimento"
          />
          <input
            placeholder="Observações"
            className="input md:col-span-2"
            value={form.observacoes || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, observacoes: e.target.value }))
            }
          />
          <button
            className="btn-primary md:col-span-2"
            onClick={createCliente}
            disabled={loading}
          >
            {loading ? "Salvando..." : "Criar Cliente"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="m-0 font-semibold">Lista de Clientes</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                className="input pl-9 w-80"
                placeholder="Buscar por nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
            </div>
            <small className="text-slate-500">
              Mostrando {clientes.length ? (page - 1) * PAGE + 1 : 0}-
              {Math.min(page * PAGE, total)} de {total}
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
                <tr>
                  <td className="p-4 text-slate-500" colSpan={5}>
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && clientes.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={5}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {clientes.map((c, i) => {
                const phone = c.telefone ? maskPhone(c.telefone) : "";
                const wa = c.telefone
                  ? `https://wa.me/55${onlyDigits(c.telefone)}`
                  : "";
                return (
                  <tr
                    key={c.id}
                    className={i % 2 ? "bg-slate-50/60" : "bg-white"}
                  >
                    <td className="p-2">
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-slate-500">
                        CPF: {c.cpf_dig || "—"}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {phone || "—"}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-green-50"
                          >
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
                        <button
                          className="icon-btn"
                          title="Editar"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="icon-btn"
                          title="+ Evento na Agenda"
                          onClick={async () => {
                            // caso você tenha criado clientes manualmente, o RPC funciona só com clientes.id
                            alert("Aniversário é atualizado automaticamente pelas vendas. (RPC mantido apenas para clientes manuais)");
                          }}
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </button>
                        <a className="icon-btn" title="Ver na Agenda" href="/agenda">
                          <Eye className="h-4 w-4" />
                        </a>
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
          <button
            className="btn"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1, debounced)}
          >
            ‹ Anterior
          </button>
          <span className="text-xs text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            className="btn"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1, debounced)}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Modal edição */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeEdit} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold mb-2">Editar Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                className="input"
                placeholder="Nome"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
              />
              <input
                className="input"
                placeholder="E-mail"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
              <input
                className="input"
                placeholder="Telefone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
              <input
                type="date"
                className="input"
                value={editBirth}
                onChange={(e) => setEditBirth(e.target.value)}
                placeholder="Data de Nascimento"
              />
              {/* Endereço opcional */}
              <input className="input" placeholder="CEP" value={editCEP} onChange={(e) => setEditCEP(e.target.value)} />
              <input className="input" placeholder="Logradouro" value={editLogr} onChange={(e) => setEditLogr(e.target.value)} />
              <input className="input" placeholder="Número" value={editNumero} onChange={(e) => setEditNumero(e.target.value)} />
              <input className="input" placeholder="Bairro" value={editBairro} onChange={(e) => setEditBairro(e.target.value)} />
              <input className="input" placeholder="Cidade" value={editCidade} onChange={(e) => setEditCidade(e.target.value)} />
              <input
                className="input"
                placeholder="UF"
                value={editUF}
                onChange={(e) => setEditUF(e.target.value.toUpperCase().slice(0, 2))}
              />
              <input
                className="input md:col-span-3"
                placeholder="Observações"
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
              />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={closeEdit}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveEdit} disabled={loading}>
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* estilos locais */}
      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
        .icon-btn:hover{background:#eef2ff}
      `}</style>
    </div>
  );
}
