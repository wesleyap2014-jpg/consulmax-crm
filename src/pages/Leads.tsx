// src/pages/Leads.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Tipos */
type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  descricao?: string | null;
  owner_id?: string | null;
  created_at: string;
};

type UserProfile = {
  auth_user_id: string;
  nome: string;
  role: "admin" | "vendedor" | "viewer" | "operacoes";
};

const ORIGENS = [
  "Site",
  "Redes Sociais",
  "Indicação",
  "Whatsapp",
  "Parceria",
  "Relacionamento",
] as const;

/** ================= Helpers ================= */
const normalizePhoneBR = (s?: string | null) =>
  (s || "").replace(/\D+/g, "").replace(/^0+/, "");

const waHref = (raw?: string | null, msg?: string) => {
  const d = normalizePhoneBR(raw);
  if (!d) return null;
  const full = d.startsWith("55") ? d : `55${d}`;
  const url = new URL(`https://wa.me/${full}`);
  if (msg) url.searchParams.set("text", msg);
  return url.toString();
};
/** =========================================== */

export default function LeadsPage() {
  const PAGE_SIZE = 10;

  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // paginação
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);

  // busca
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // modal de edição
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // modal de reatribuir
  const [reassigning, setReassigning] = useState<Lead | null>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>("");

  const isAdmin = me?.role === "admin";
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );
  const showingFrom = useMemo(
    () => (total ? (page - 1) * PAGE_SIZE + 1 : 0),
    [page, total]
  );
  const showingTo = useMemo(
    () => Math.min(page * PAGE_SIZE, total || 0),
    [page, total]
  );

  // Usuário atual
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  // Debounce para busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Carrega leads com paginação + busca
  async function loadLeads(targetPage = 1, term = debouncedSearch) {
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setLoading(true);
    try {
      let query = supabase
        .from("leads")
        .select(
          "id,nome,telefone,email,origem,descricao,owner_id,created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // filtro de não-admin (RLS já cobre; aqui é só otimização)
      if (me?.id && me.role !== "admin") query = query.eq("owner_id", me.id);

      if (term) {
        query = query.or(
          `nome.ilike.%${term}%,email.ilike.%${term}%,telefone.ilike.%${term}%`
        );
      }

      const { data, error, count } = await query.range(from, to);

      if (error) {
        alert("Erro ao carregar leads: " + error.message);
        return;
      }
      setLeads(data || []);
      setTotal(count || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  // Carrega usuários (para admin reatribuir)
  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("auth_user_id,nome,role")
      .order("nome", { ascending: true });
    if (!error && data) setUsers(data as any);
  }

  // Entradas
  useEffect(() => {
    loadLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    loadLeads(1, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // Criar lead
  const [form, setForm] = useState<Partial<Lead>>({ origem: "Site" });
  async function createLead() {
    const payload = {
      nome: (form.nome || "").trim(),
      telefone: normalizePhoneBR(form.telefone) || null,
      email: (form.email || "").trim().toLowerCase() || null,
      origem: form.origem || null,
      descricao: (form.descricao || "").trim() || null,
    };

    if (!payload.nome) {
      alert("Informe o nome do lead.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("leads").insert([payload]); // owner_id via trigger
      if (error) {
        alert("Erro ao criar lead: " + error.message);
        return;
      }
      setForm({ origem: "Site" });
      await loadLeads(1);
      alert("Lead criado com sucesso!");
    } finally {
      setLoading(false);
    }
  }

  // Reatribuir lead (admin)
  function openReassignModal(lead: Lead) {
    setReassigning(lead);
    setNewOwnerId("");
  }
  function closeReassignModal() {
    setReassigning(null);
    setNewOwnerId("");
  }
  async function doReassign() {
    if (!reassigning || !newOwnerId) {
      alert("Selecione o novo responsável.");
      return;
    }
    setLoading(true);
    try {
      // 1) Atualiza o dono do LEAD
      const { error: e1 } = await supabase
        .from("leads")
        .update({ owner_id: newOwnerId })
        .eq("id", reassigning.id);
      if (e1) throw e1;

      // 2) Garante a propagação nas OPORTUNIDADES do lead
      const { error: e2 } = await supabase
        .from("opportunities")
        .update({ owner_id: newOwnerId })
        .eq("lead_id", reassigning.id);
      if (e2) throw e2;

      closeReassignModal();
      await loadLeads(page);
      alert("Lead e oportunidades reatribuídos!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao reatribuir: " + (err?.message ?? "desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  // Abrir/fechar modal de edição
  function openEditModal(lead: Lead) {
    setEditing(lead);
    setEditName(lead.nome || "");
    setEditPhone(lead.telefone || "");
    setEditEmail(lead.email || "");
  }
  function closeEditModal() {
    setEditing(null);
    setEditName("");
    setEditPhone("");
    setEditEmail("");
  }

  // Salvar edição (nome, telefone, e-mail)
  async function saveEdit() {
    if (!editing) return;
    const novoNome = editName.trim();
    const novoTelefone = normalizePhoneBR(editPhone) || null;
    const novoEmail = (editEmail || "").trim().toLowerCase() || null;

    if (!novoNome) {
      alert("O nome não pode ficar em branco.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ nome: novoNome, telefone: novoTelefone, email: novoEmail })
        .eq("id", editing.id);
      if (error) {
        alert("Não foi possível salvar: " + error.message);
        return;
      }
      closeEditModal();
      await loadLeads(page);
      alert("Lead atualizado!");
    } finally {
      setLoading(false);
    }
  }

  // UI
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ margin: "16px 0" }}>Leads</h1>

      {/* Card: novo lead */}
      <div style={card}>
        <h3 style={cardTitle}>Novo Lead</h3>
        <div style={grid3}>
          <input
            placeholder="Nome"
            value={form.nome || ""}
            onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
            style={input}
          />

          <input
            placeholder="Telefone"
            value={form.telefone || ""}
            onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))}
            style={input}
          />

          <input
            placeholder="E-mail"
            value={form.email || ""}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            style={input}
          />

          <select
            value={form.origem || "Site"}
            onChange={(e) => setForm((s) => ({ ...s, origem: e.target.value }))}
            style={input}
          >
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          <input
            placeholder="Descrição"
            value={form.descricao || ""}
            onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
            style={{ ...input, gridColumn: "span 2" }}
          />

          <button onClick={createLead} disabled={loading} style={btnPrimary}>
            {loading ? "Salvando..." : "Criar Lead"}
          </button>
        </div>
      </div>

      {/* Card: listagem + busca */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>{isAdmin ? "Todos os Leads" : "Meus Leads"}</h3>

          <div style={rightHeader}>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, paddingLeft: 36, width: 320 }}
                placeholder="Buscar por nome, e-mail ou telefone…"
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
              {total > 0
                ? `Mostrando ${showingFrom}-${showingTo} de ${total}`
                : "Nenhum lead"}
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
                <th style={th}>Origem</th>
                {isAdmin && <th style={th}>Responsável</th>}
                <th style={{ ...th, width: 140 }}>Ações</th>
                {isAdmin && <th style={{ ...th, width: 120, textAlign: "center" }}>Reatribuir</th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{l.nome}</td>
                  <td style={td}>{l.telefone || "-"}</td>
                  <td style={td}>{l.email || "-"}</td>
                  <td style={td}>{l.origem || "-"}</td>

                  {isAdmin && (
                    <td style={td}>
                      {users.find((u) => u.auth_user_id === l.owner_id)?.nome || "—"}
                    </td>
                  )}

                  {/* Ações: Editar + WhatsApp (ícone) */}
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        style={btnSecondary}
                        disabled={loading}
                        onClick={() => openEditModal(l)}
                        title="Editar"
                      >
                        Editar
                      </button>

                      {waHref(l.telefone, `Olá ${l.nome}! Podemos falar?`) && (
                        <a
                          href={waHref(l.telefone, `Olá ${l.nome}! Podemos falar?`) as string}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Abrir WhatsApp"
                          title="Abrir WhatsApp"
                          style={waIconBtn}
                        >
                          {/* Ícone simples em SVG (sem libs) */}
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 3.5A10.5 10.5 0 0 0 3.6 19.2L3 22l2.9-.6A10.5 10.5 0 1 0 20 3.5Zm-8.9 3c.2 0 .5.1.7.7s.9 2.1.9 2.1.1.4-.1.6l-.7.7s-.2.2 0 .5c.3.3 1.1 1.7 2.6 2.3 1.6.6 1.6.4 1.9.1l.7-.8c.2-.2.4-.2.6-.1.2.1 1.9.9 2.1 1 .2.1.3.2.3.4 0 .2.1 1.2-.7 2s-2 1-3.3.6c-1.4-.4-3.1-1.2-4.6-2.7-1.5-1.5-2.3-3.2-2.7-4.6s-.1-2.6.6-3.3c.6-.7 1.4-.7 1.5-.7Z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Reatribuir abre overlay */}
                  {isAdmin && (
                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        style={btnTertiary}
                        disabled={loading}
                        onClick={() => openReassignModal(l)}
                        title="Reatribuir responsável"
                      >
                        Alterar
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {leads.length === 0 && (
                <tr>
                  <td style={td} colSpan={isAdmin ? 7 : 5}>
                    {loading ? "Carregando..." : "Nenhum lead encontrado."}
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
            onClick={() => loadLeads(page - 1)}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Página {page} de {totalPages}
          </span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
            disabled={page >= totalPages || loading}
            onClick={() => loadLeads(page + 1)}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Modal de edição */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEditModal} />
          <div
            role="dialog"
            aria-modal="true"
            style={modal}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeEditModal();
              if (e.key === "Enter") saveEdit();
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Editar Lead</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={label}>
                Nome
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={input}
                  autoFocus
                />
              </label>

              <label style={label}>
                Telefone
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  style={input}
                />
              </label>

              <label style={label}>
                E-mail
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  style={input}
                />
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnSecondary} onClick={closeEditModal} disabled={loading}>
                  Cancelar
                </button>
                <button style={btnPrimary} onClick={saveEdit} disabled={loading}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de reatribuir */}
      {reassigning && (
        <>
          <div style={backdrop} onClick={closeReassignModal} />
          <div role="dialog" aria-modal="true" style={modalSmall}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reatribuir Lead</h3>
            <p style={{ marginTop: 0, marginBottom: 8, color: "#475569" }}>
              <strong>Lead:</strong> {reassigning.nome}
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <select
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                style={input}
              >
                <option value="">Selecionar usuário…</option>
                {users.map((u) => (
                  <option key={u.auth_user_id} value={u.auth_user_id}>
                    {u.nome} ({u.role})
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnSecondary} onClick={closeReassignModal} disabled={loading}>
                  Cancelar
                </button>
                <button style={btnPrimary} onClick={doReassign} disabled={loading || !newOwnerId}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Estilos */
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
  flexWrap: "wrap",
};
const pager: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  marginTop: 12,
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

const btnTertiary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: "#eef2f7",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
};

const waIconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "9999px",
  background: "#e8f5e9",
  border: "1px solid #c8e6c9",
  textDecoration: "none",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: "10px 8px",
};

const td: React.CSSProperties = {
  padding: "12px 8px",
  borderTop: "1px solid #eee",
  verticalAlign: "middle",
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
  width: "min(560px, 92vw)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
};

const modalSmall: React.CSSProperties = {
  ...modal,
  width: "min(460px, 92vw)",
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
};
