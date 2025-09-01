// src/pages/Usuarios.tsx
import React, { useState } from "react";

type Role = "admin" | "vendedor" | "viewer";

export default function Usuarios() {
  const [form, setForm] = useState<{ nome: string; email: string; role: Role }>({
    nome: "",
    email: "",
    role: "viewer",
  });
  const [loading, setLoading] = useState(false);

  async function cadastrarUsuarioViaAPI() {
    const payload = {
      nome: (form?.nome || "").trim(),
      email: (form?.email || "").trim(),
      role: form?.role || "viewer",
    };

    if (!payload.nome) {
      alert("Informe o nome.");
      return;
    }
    if (!payload.email) {
      alert("Informe o e-mail.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Lê como TEXTO para evitar "Unexpected token ... is not valid JSON"
      const raw = await res.text();

      // Tenta converter para JSON apenas se for JSON de verdade
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* ignora — não é JSON, manteremos o texto cru */
      }

      if (!res.ok) {
        const mensagem =
          (data && (data.error || data.message)) ||
          raw || // mensagem crua vinda do servidor (HTML/stacktrace, etc.)
          `HTTP ${res.status}`;
        alert(`Erro ao criar usuário: ${mensagem}`);
        return;
      }

      alert("Usuário criado com sucesso!");
      setForm({ nome: "", email: "", role: "viewer" });
    } catch (e: any) {
      alert(`Falha de rede: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" }}>
      <h1 style={{ marginBottom: 16 }}>Usuários</h1>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr 200px",
          alignItems: "center",
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <input
          placeholder="Nome"
          value={form.nome}
          onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          placeholder="E-mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <select
          value={form.role}
          onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as Role }))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option value="viewer">Viewer</option>
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </select>

        <button
          onClick={cadastrarUsuarioViaAPI}
          disabled={loading}
          style={{
            gridColumn: "1 / span 3",
            padding: "12px 16px",
            borderRadius: 12,
            background: "#A11C27",
            color: "#fff",
            border: 0,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
      </div>

      <p style={{ color: "#64748b", fontSize: 14 }}>
        Dica: se aparecer erro, a mensagem agora virá “limpa” do servidor (JSON ou texto), sem o problema de
        “Unexpected token … is not valid JSON”.
      </p>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Este formulário envia apenas <b>nome</b>, <b>email</b> e <b>role</b> para <code>/api/users/create</code>.
      </p>
    </div>
  );
}
