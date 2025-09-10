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

export default function LeadsPage() {
  const PAGE_SIZE = 10;

  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // paginação
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);

  // edição inline do nome
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string>("");

  const isAdmin = me?.role === "admin";
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );
  const showingFrom = useMemo(() => (page - 1) * PAGE_SIZE + 1, [page]);
  const showingTo = useMemo(
    () => Math.min(page * PAGE_SIZE, total || 0),
    [page, total]
  );

  // Usuário logado + role do JWT
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  // Carrega leads com paginação
  async function loadLeads(targetPage = 1) {
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setLoading(true);
    try {
      const { data, error, count } = await supabase
        .from("leads")
        .select(
          "id,nome,telefone,email,origem,descricao,owner_id,created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, to);

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

  useEffect(() => {
    loadLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // Criar lead
  const [form, setForm] = useState<Partial<Lead>>({ origem: "Site" });
  async function createLead() {
    const payload = {
      nome: (form.nome || "").trim(),
      telefone: (form.telefone || "").trim() || null,
      email: (form.email || "").trim() || null,
      origem: form.origem || null,
      descricao: (form.descricao || "").trim() || null,
    };

    if (!payload.nome) {
      alert("Informe o nome do lead.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("leads").insert([payload]);
      if (error) {
        alert("Erro ao criar lead: " + error.message);
        return;
      }
      setForm({ origem: "Site" });
      await loadLeads(1); // volta p/ início
      alert("Lead criado com sucesso!");
    } finally {
      setLoading(false);
    }
  }

  // Reatribuir lead (admin)
  async function reatribuir(leadId: string, newOwnerId: string) {
    if (!newOwnerId) {
      alert("Selecione o novo responsável.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc("reassign_lead", {
        p_lead_id: leadId,
        p_new_owner: newOwnerId,
      });
      if (error) {
        alert("Erro ao reatribuir: " + error.message);
        return;
      }
      await loadLeads(page);
      alert("Lead reatribuído!");
    } finally {
      setLoading(false);
    }
  }

  // ---- EDIÇÃO DO NOME ----
  function startEditName(lead: Lead) {
    setEditingId(lead.id);
    setNameDraft(lead.nome || "");
  }

  function cancelEditName() {
    setEditingId(null);
    setNameDraft("");
  }

  async function saveEditName(leadId: string) {
    const novoNome = nameDraft.trim();
    if (!novoNome) {
      alert("O nome não pode ficar em branco.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ nome: novoNome })
        .eq("id", leadId);

      if (error) {
        // Possíveis causas: RLS (não é owner nem admin)
        alert("Não foi possível salvar: " + error.message);
        return;
      }

      cancelEditName();
      await loadLeads(page);
      alert("Nome atualizado!");
    } finally {
      setLoading(false);
    }
  }

  // UI
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ margin: "16px 0" }}>Leads</h1>

      {/* Formulário de novo lead */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px 0" }}>Novo Lead</h3>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          }}
        >
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
            <option value="Site">Site</option>
            <option value="Redes Sociais">Redes Sociais</option>
            <option value="Indicação">Indicação</option>
            <option value="Whatsapp">Whatsapp</option>
          </select>

          <input
            placeholder="Descrição"
            value={form.descricao || ""}
            onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
            style={{ ...input, gridColumn: "span 2" }}
          />

          <button onClick={createLead} disabled={loading} style={btn}>
            {loading ? "Salvando..." : "Criar Lead"}
          </button>
        </div>
      </div>

      {/* Lista de leads */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{isAdmin ? "Todos os Leads" : "Meus Leads"}</h3>
          <small style={{ color: "#64748b" }}>
            {total > 0
              ? `Mostrando ${showingFrom}-${showingTo} de ${total}`
              : "Nenhum lead"}
          </small>
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
                <th style={th}>Ações</th>
                {isAdmin && <th style={th}>Reatribuir</th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const isEditing = editingId === l.id;
                return (
                  <tr key={l.id}>
                    <td style={td}>
                      {isEditing ? (
                        <input
                          style={{ ...input, width: "100%" }}
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        l.nome
                      )}
                    </td>
                    <td style={td}>{l.telefone || "-"}</td>
                    <td style={td}>{l.email || "-"}</td>
                    <td style={td}>{l.origem || "-"}</td>

                    {isAdmin && (
                      <td style={td}>
                        {users.find((u) => u.auth_user_id === l.owner_id)?.nome || "—"}
                      </td>
                    )}

                    {/* Ações (editar nome) */}
                    <td style={td}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={btn}
                            disabled={loading}
                            onClick={() => saveEditName(l.id)}
                          >
                            Salvar
                          </button>
                          <button
                            style={btnSecondary}
                            disabled={loading}
                            onClick={cancelEditName}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          style={btnSecondary}
                          disabled={loading}
                          onClick={() => startEditName(l)}
                          title="Editar nome"
                        >
                          Editar
                        </button>
                      )}
                    </td>

                    {/* Reatribuir (admin) */}
                    {isAdmin && (
                      <td style={td}>
                        <select
                          defaultValue=""
                          style={input}
                          onChange={(e) => {
                            const newOwner = e.target.value;
                            if (newOwner) reatribuir(l.id, newOwner);
                          }}
                        >
                          <option value="">Selecionar usuário…</option>
                          {users.map((u) => (
                            <option key={u.auth_user_id} value={u.auth_user_id}>
                              {u.nome} ({u.role})
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}

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
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
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
    </div>
  );
}

/** Estilos simples */
const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};

const btn: React.CSSProperties = {
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

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: "8px 8px",
};

const td: React.CSSProperties = {
  padding: "8px 8px",
  borderTop: "1px solid #eee",
};
