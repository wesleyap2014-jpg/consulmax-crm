// src/pages/Leads.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lead = {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  origem?: string;
  descricao?: string;
  owner_id?: string;
  created_at: string;
};

type UserProfile = {
  auth_user_id: string;
  nome: string;
  role: "admin" | "vendedor" | "viewer" | "operacoes";
};

export default function LeadsPage() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]); // para admin reatribuir
  const [form, setForm] = useState<Partial<Lead>>({ origem: "Site" });

  const isAdmin = me?.role === "admin";

  // 1) pega usuário logado + role do JWT (app_metadata.role)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  // 2) carrega leads (RLS faz o filtro automaticamente)
  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,email,origem,descricao,owner_id,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      alert("Erro ao carregar leads: " + error.message);
      return;
    }
    setLeads(data || []);
  }

  // 3) admins: carrega lista de usuários para reatribuição
  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("auth_user_id,nome,role")
      .order("nome", { ascending: true });
    if (!error && data) setUsers(data as any);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // criar lead (owner_id vem do trigger se omitir)
  async function createLead() {
    const payload = {
      nome: (form.nome || "").trim(),
      telefone: (form.telefone || "").trim() || null,
      email: (form.email || "").trim() || null,
      origem: form.origem || null,
      descricao: (form.descricao || "").trim() || null,
      // owner_id omitido => trigger setará auth.uid()
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
      await loadLeads();
      alert("Lead criado com sucesso!");
    } finally {
      setLoading(false);
    }
  }

  // admin: reatribui owner_id de um lead
  async function reatribuir(leadId: string, newOwnerId: string) {
    if (!newOwnerId) {
      alert("Selecione o novo responsável.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("reassign_lead", {
        p_lead_id: leadId,
        p_new_owner: newOwnerId,
      });
      if (error) {
        alert("Erro ao reatribuir: " + error.message);
        return;
      }
      await loadLeads();
      alert("Lead reatribuído!");
    } finally {
      setLoading(false);
    }
  }

  // UI simples (sem Tailwind)
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
        <h3 style={{ margin: "0 0 12px 0" }}>
          {isAdmin ? "Todos os Leads" : "Meus Leads"}
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Telefone</th>
                <th style={th}>E-mail</th>
                <th style={th}>Origem</th>
                {isAdmin && <th style={th}>Responsável</th>}
                {isAdmin && <th style={th}>Reatribuir</th>}
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
                    <>
                      <td style={td}>
                        {users.find((u) => u.auth_user_id === l.owner_id)?.nome || "—"}
                      </td>
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
                    </>
                  )}
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td style={td} colSpan={isAdmin ? 6 : 4}>
                    Nenhum lead encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// estilos simples
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
