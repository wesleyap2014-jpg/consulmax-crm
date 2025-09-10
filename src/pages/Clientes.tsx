// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ===== Helpers (locais, sem dependências externas) ===== */
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

const maskCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return d.slice(0, 5) + "-" + d.slice(5);
};

const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "-" + p4;
  return out;
};

const waURL = (phoneBR: string, text?: string) => {
  const d = onlyDigits(phoneBR);
  if (!d) return null;
  const url = new URL(`https://wa.me/55${d}`);
  if (text && text.trim()) url.searchParams.set("text", text.trim());
  return url.toString();
};

const dateBR = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(+d)) return "-";
  return d.toLocaleDateString("pt-BR");
};

type Cliente = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco_cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  lead_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default function ClientesPage() {
  const PAGE_SIZE = 10;

  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<{ id: string; role?: string } | null>(null);

  // listagem/paginação/busca
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // novo cliente (form)
  const [form, setForm] = useState<Partial<Cliente>>({});

  // edição (modal)
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [edit, setEdit] = useState<Partial<Cliente>>({});

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );
  const showingFrom = useMemo(() => (total ? (page - 1) * PAGE_SIZE + 1 : 0), [page, total]);
  const showingTo = useMemo(() => Math.min(page * PAGE_SIZE, total || 0), [page, total]);

  // usuário atual
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) setMe({ id: data.user.id, role: (data.user.app_metadata as any)?.role });
    })();
  }, []);

  // debounce busca
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // carregar clientes
  async function loadClientes(targetPage = 1, term = debounced) {
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    setLoading(true);
    try {
      let q = supabase
        .from("clientes")
        .select(
          "id,nome,data_nascimento,cpf,telefone,email,endereco_cep,logradouro,numero,bairro,cidade,uf,observacoes,lead_id,created_by,created_at,updated_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (term) {
        // busca simples por nome; se quiser por telefone também, dá pra acrescentar .or()
        q = q.ilike("nome", `%${term}%`);
      }

      const { data, error, count } = await q.range(from, to);
      if (error) {
        alert("Erro ao carregar clientes: " + error.message);
        return;
      }
      setClientes(data || []);
      setTotal(count || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClientes(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    loadClientes(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // CEP → ViaCEP
  useEffect(() => {
    const dig = onlyDigits(form.endereco_cep || "");
    if (dig.length === 8) {
      (async () => {
        try {
          const r = await fetch(`https://viacep.com.br/ws/${dig}/json/`);
          const data = await r.json();
          if (data?.erro) return;
          setForm((s) => ({
            ...s,
            logradouro: data.logradouro || s.logradouro || "",
            bairro: data.bairro || s.bairro || "",
            cidade: data.localidade || s.cidade || "",
            uf: data.uf || s.uf || "",
          }));
        } catch {
          /* ignore */
        }
      })();
    }
  }, [form.endereco_cep]);

  // criar cliente
  async function createCliente() {
    const payload = {
      nome: (form.nome || "").trim(),
      data_nascimento: form.data_nascimento || null,
      cpf: onlyDigits(form.cpf || "") || null,
      telefone: onlyDigits(form.telefone || "") || null, // trigger no DB já cuida, mas mandamos limpo
      email: (form.email || "").trim() || null,
      endereco_cep: onlyDigits(form.endereco_cep || "") || null,
      logradouro: (form.logradouro || "").trim() || null,
      numero: (form.numero || "").trim() || null,
      bairro: (form.bairro || "").trim() || null,
      cidade: (form.cidade || "").trim() || null,
      uf: (form.uf || "").trim().toUpperCase().slice(0, 2) || null,
      observacoes: (form.observacoes || "").trim() || null,
      lead_id: (form.lead_id || null) as string | null,
    };

    if (!payload.nome) {
      alert("Informe o nome.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("clientes").insert([payload]);
      if (error) {
        alert("Erro ao criar cliente: " + error.message);
        return;
      }
      setForm({});
      await loadClientes(1);
      alert("Cliente criado com sucesso!");
    } finally {
      setLoading(false);
    }
  }

  // abrir/fechar edição
  function openEdit(c: Cliente) {
    setEditing(c);
    setEdit({
      ...c,
      telefone: c.telefone ? maskPhone(c.telefone) : "",
      endereco_cep: c.endereco_cep ? maskCEP(c.endereco_cep) : "",
      cpf: c.cpf ? maskCPF(c.cpf) : "",
    });
  }
  function closeEdit() {
    setEditing(null);
    setEdit({});
  }

  // salvar edição
  async function saveEdit() {
    if (!editing) return;
    const upd = {
      nome: (edit.nome || "").trim() || null,
      data_nascimento: edit.data_nascimento || null,
      cpf: edit.cpf ? onlyDigits(edit.cpf) : null,
      telefone: edit.telefone ? onlyDigits(edit.telefone) : null,
      email: edit.email ? String(edit.email).trim() : null,
      endereco_cep: edit.endereco_cep ? onlyDigits(edit.endereco_cep) : null,
      logradouro: edit.logradouro ? String(edit.logradouro).trim() : null,
      numero: edit.numero ? String(edit.numero).trim() : null,
      bairro: edit.bairro ? String(edit.bairro).trim() : null,
      cidade: edit.cidade ? String(edit.cidade).trim() : null,
      uf: edit.uf ? String(edit.uf).toUpperCase().slice(0, 2) : null,
      observacoes: edit.observacoes ? String(edit.observacoes).trim() : null,
      lead_id: (edit.lead_id as string) || null,
    };

    setLoading(true);
    try {
      const { error } = await supabase.from("clientes").update(upd).eq("id", editing.id);
      if (error) {
        alert("Não foi possível salvar: " + error.message);
        return;
      }
      closeEdit();
      await loadClientes(page);
      alert("Cliente atualizado!");
    } finally {
      setLoading(false);
    }
  }

  /** =================== UI =================== */
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ margin: "16px 0" }}>Clientes</h1>

      {/* Novo Cliente */}
      <div style={card}>
        <h3 style={cardTitle}>Novo Cliente</h3>
        <div style={grid3}>
          <input
            placeholder="Nome"
            value={form.nome || ""}
            onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
            style={input}
          />
          <input
            placeholder="Telefone"
            value={form.telefone ? maskPhone(form.telefone) : ""}
            onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))}
            style={input}
            inputMode="tel"
          />
          <input
            placeholder="E-mail"
            value={form.email || ""}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            style={input}
            type="email"
          />

          <input
            placeholder="CPF"
            value={form.cpf ? maskCPF(form.cpf) : ""}
            onChange={(e) => setForm((s) => ({ ...s, cpf: e.target.value }))}
            style={input}
            inputMode="numeric"
          />
          <input
            placeholder="Data de nascimento"
            value={form.data_nascimento || ""}
            onChange={(e) => setForm((s) => ({ ...s, data_nascimento: e.target.value }))}
            style={input}
            type="date"
          />
          <input
            placeholder="CEP"
            value={form.endereco_cep ? maskCEP(form.endereco_cep) : ""}
            onChange={(e) => setForm((s) => ({ ...s, endereco_cep: e.target.value }))}
            style={input}
            inputMode="numeric"
          />

          <input
            placeholder="Logradouro"
            value={form.logradouro || ""}
            onChange={(e) => setForm((s) => ({ ...s, logradouro: e.target.value }))}
            style={input}
          />
          <input
            placeholder="Número"
            value={form.numero || ""}
            onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
            style={input}
          />
          <input
            placeholder="Bairro"
            value={form.bairro || ""}
            onChange={(e) => setForm((s) => ({ ...s, bairro: e.target.value }))}
            style={input}
          />

          <input
            placeholder="Cidade"
            value={form.cidade || ""}
            onChange={(e) => setForm((s) => ({ ...s, cidade: e.target.value }))}
            style={input}
          />
          <input
            placeholder="UF"
            value={form.uf || ""}
            onChange={(e) => setForm((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))}
            style={input}
          />
          <input
            placeholder="Lead (opcional - UUID)"
            value={form.lead_id || ""}
            onChange={(e) => setForm((s) => ({ ...s, lead_id: e.target.value }))}
            style={input}
          />

          <input
            placeholder="Observações"
            value={form.observacoes || ""}
            onChange={(e) => setForm((s) => ({ ...s, observacoes: e.target.value }))}
            style={{ ...input, gridColumn: "1 / span 2" }}
          />

          <button onClick={createCliente} disabled={loading} style={btnPrimary}>
            {loading ? "Salvando..." : "Criar Cliente"}
          </button>
        </div>
      </div>

      {/* Lista + busca */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Meus Clientes</h3>
          <div style={rightHeader}>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, paddingLeft: 36, width: 260 }}
                placeholder="Buscar por nome…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  fontSize: 14,
                  opacity: 0.6,
                }}
              >
                🔎
              </span>
            </div>
            <small style={{ color: "#64748b", marginLeft: 12 }}>
              {total > 0 ? `Mostrando ${showingFrom}-${showingTo} de ${total}` : "Nenhum cliente"}
            </small>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Telefone</th>
                <th style={th}>E-mail</th>
                <th style={th}>Nascimento</th>
                <th style={th}>Lead</th>
                <th style={{ ...th, width: 190 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const telMask = c.telefone ? maskPhone(c.telefone) : "-";
                const wa = c.telefone ? waURL(c.telefone, `Olá, ${c.nome}!`) : null;
                return (
                  <tr key={c.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{c.nome}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Criado em {dateBR(c.created_at)}</div>
                    </td>
                    <td style={td}>{telMask}</td>
                    <td style={td}>{c.email || "-"}</td>
                    <td style={td}>
                      {c.data_nascimento ? dateBR(c.data_nascimento) : "-"}
                    </td>
                    <td style={td}>{c.lead_id ? c.lead_id : "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          style={btnSecondary}
                          disabled={loading}
                          onClick={() => openEdit(c)}
                        >
                          Editar
                        </button>
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" style={btnGhost}>
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {clientes.length === 0 && (
                <tr>
                  <td style={td} colSpan={6}>
                    {loading ? "Carregando..." : "Nenhum cliente encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div style={pager}>
          <button
            style={{ ...btnSecondary, opacity: page <= 1 ? 0.6 : 1 }}
            disabled={page <= 1 || loading}
            onClick={() => loadClientes(page - 1)}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Página {page} de {totalPages}
          </span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
            disabled={page >= totalPages || loading}
            onClick={() => loadClientes(page + 1)}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Modal de edição */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />
          <div role="dialog" aria-modal="true" style={modal}
               onKeyDown={(e) => {
                 if (e.key === "Escape") closeEdit();
                 if (e.key === "Enter") saveEdit();
               }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Editar Cliente</h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              <input
                placeholder="Nome"
                value={edit.nome || ""}
                onChange={(e) => setEdit((s) => ({ ...s, nome: e.target.value }))}
                style={input}
                autoFocus
              />
              <input
                placeholder="Telefone"
                value={edit.telefone || ""}
                onChange={(e) => setEdit((s) => ({ ...s, telefone: maskPhone(e.target.value) }))}
                style={input}
                inputMode="tel"
              />
              <input
                placeholder="E-mail"
                value={edit.email || ""}
                onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                style={input}
                type="email"
              />

              <input
                placeholder="CPF"
                value={edit.cpf || ""}
                onChange={(e) => setEdit((s) => ({ ...s, cpf: maskCPF(e.target.value) }))}
                style={input}
                inputMode="numeric"
              />
              <input
                placeholder="Data de nascimento"
                value={edit.data_nascimento || ""}
                onChange={(e) => setEdit((s) => ({ ...s, data_nascimento: e.target.value }))}
                style={input}
                type="date"
              />
              <input
                placeholder="CEP"
                value={edit.endereco_cep || ""}
                onChange={(e) => setEdit((s) => ({ ...s, endereco_cep: maskCEP(e.target.value) }))}
                style={input}
                inputMode="numeric"
              />

              <input
                placeholder="Logradouro"
                value={edit.logradouro || ""}
                onChange={(e) => setEdit((s) => ({ ...s, logradouro: e.target.value }))}
                style={input}
              />
              <input
                placeholder="Número"
                value={edit.numero || ""}
                onChange={(e) => setEdit((s) => ({ ...s, numero: e.target.value }))}
                style={input}
              />
              <input
                placeholder="Bairro"
                value={edit.bairro || ""}
                onChange={(e) => setEdit((s) => ({ ...s, bairro: e.target.value }))}
                style={input}
              />

              <input
                placeholder="Cidade"
                value={edit.cidade || ""}
                onChange={(e) => setEdit((s) => ({ ...s, cidade: e.target.value }))}
                style={input}
              />
              <input
                placeholder="UF"
                value={edit.uf || ""}
                onChange={(e) => setEdit((s) => ({ ...s, uf: String(e.target.value).toUpperCase().slice(0, 2) }))}
                style={input}
              />
              <input
                placeholder="Lead (UUID)"
                value={edit.lead_id || ""}
                onChange={(e) => setEdit((s) => ({ ...s, lead_id: e.target.value }))}
                style={input}
              />

              <input
                placeholder="Observações"
                value={edit.observacoes || ""}
                onChange={(e) => setEdit((s) => ({ ...s, observacoes: e.target.value }))}
                style={{ ...input, gridColumn: "1 / span 3" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnSecondary} onClick={closeEdit} disabled={loading}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={saveEdit} disabled={loading}>
                Salvar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ===== Estilos inline (compatível com Leads.tsx) ===== */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const cardTitle: React.CSSProperties = { margin: "0 0 12px 0" };
const grid3: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
};
const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: "10px 8px",
};
const td: React.CSSProperties = {
  padding: "10px 8px",
  borderTop: "1px solid #eee",
  verticalAlign: "middle",
};
const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};
const rightHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const pager: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  marginTop: 12,
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  zIndex: 40,
};
const modal: React.CSSProperties = {
  position: "fixed",
  zIndex: 50,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(720px, 92vw)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
};
