// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send } from "lucide-react";

type Cliente = {
  id: string;
  nome: string;
  cpf_dig?: string | null;          // vindo da view (só dígitos)
  cpf?: string | null;              // fallback se buscar direto da tabela
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;  // YYYY-MM-DD
  observacoes?: string | null;      // <- nome correto no banco
};

const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");

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

  // form novo cliente
  const [form, setForm] = useState<Partial<Cliente>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      const from = (target - 1) * PAGE;
      const to = from + PAGE - 1;

      // priorizamos a view v_clientes_list (já filtra quem tem CPF)
      let q = supabase
        .from("v_clientes_list")
        .select("*", { count: "exact" })
        .order("nome", { ascending: true });

      if (term) {
        q = q.or(
          `nome.ilike.%${term}%,email.ilike.%${term}%,telefone.ilike.%${onlyDigits(
            term
          )}%`
        );
      }

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;

      setClientes(
        (data || []).map((r: any) => ({
          id: r.id,
          nome: r.nome,
          cpf_dig: r.cpf_dig,
          telefone: r.telefone,
          email: r.email,
          data_nascimento: r.data_nascimento,
          observacoes: r.observacoes, // <- mapeia da view se existir
        }))
      );
      setTotal(count || 0);
      setPage(target);
    } catch (e: any) {
      alert(e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  // criar cliente manual
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

      // cria/atualiza aniversário automático
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
    // endereço (opcional)
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

  // ViaCEP quando CEP completo
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

  async function saveEdit() {
    if (!editing) return;
    try {
      setLoading(true);
      const update: any = {
        nome: editNome.trim() || null,
        email: editEmail.trim() || null,
        telefone: onlyDigits(editPhone) || null,
        data_nascimento: editBirth || null,
        observacoes: editObs.trim() || null, // <- usa coluna correta
      };

      // se já tiver colunas de endereço em clientes, descomente:
      // update.cep        = onlyDigits(editCEP) || null;
      // update.logradouro = editLogr || null;
      // update.numero     = editNumero || null;
      // update.bairro     = editBairro || null;
      // update.cidade     = editCidade || null;
      // update.uf         = editUF || null;

      const { error } = await supabase
        .from("clientes")
        .update(update)
        .eq("id", editing.id);
      if (error) throw error;

      // sincroniza/atualiza aniversário automático
      await supabase.rpc("upsert_birthday_event", { p_cliente: editing.id });

      await load(page);
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
      {/* Novo cliente */}
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
                placeholder="Buscar por nome, telefone ou e-mail"
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
                            await supabase.rpc("upsert_birthday_event", {
                              p_cliente: c.id,
                            });
                            alert("Evento atualizado/gerado na Agenda.");
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
            onClick={() => load(page - 1)}
          >
            ‹ Anterior
          </button>
          <span className="text-xs text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            className="btn"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
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

              {/* Data de nascimento */}
              <input
                type="date"
                className="input"
                value={editBirth}
                onChange={(e) => setEditBirth(e.target.value)}
                placeholder="Data de Nascimento"
              />

              {/* Endereço opcional */}
              <input
                className="input"
                placeholder="CEP"
                value={editCEP}
                onChange={(e) => setEditCEP(e.target.value)}
              />
              <input
                className="input"
                placeholder="Logradouro"
                value={editLogr}
                onChange={(e) => setEditLogr(e.target.value)}
              />
              <input
                className="input"
                placeholder="Número"
                value={editNumero}
                onChange={(e) => setEditNumero(e.target.value)}
              />
              <input
                className="input"
                placeholder="Bairro"
                value={editBairro}
                onChange={(e) => setEditBairro(e.target.value)}
              />
              <input
                className="input"
                placeholder="Cidade"
                value={editCidade}
                onChange={(e) => setEditCidade(e.target.value)}
              />
              <input
                className="input"
                placeholder="UF"
                value={editUF}
                onChange={(e) =>
                  setEditUF(e.target.value.toUpperCase().slice(0, 2))
                }
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
              <button
                className="btn-primary"
                onClick={saveEdit}
                disabled={loading}
              >
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
