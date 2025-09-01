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

  /**
   * Chama a API /api/users/create passando { nome, email, role } e
   * mostra a senha provisória retornada (temp_password) quando existir.
   */
  async function cadastrarUsuarioViaAPI(f: { nome: string; email: string; role: Role }) {
    const payload = {
      nome: (f?.nome || "").trim(),
      email: (f?.email || "").trim(),
      role: f?.role || "viewer",
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

      // Lê como TEXTO para evitar o problema do “Unexpected token ... is not valid JSON”
      const raw = await res.text();

      // Tenta converter para JSON (se não for, seguimos com 'raw')
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* não é JSON -> mantemos 'raw' para a mensagem de erro/sucesso */
      }

      if (!res.ok) {
        const mensagem =
          (data && (data.error || data.message)) ||
          raw || // mensagem crua do servidor
          `HTTP ${res.status}`;
        alert(`Erro ao criar usuário: ${mensagem}`);
        return;
      }

      // Procura a senha provisória retornada pela API
      const tempPassword =
        (data && (data.temp_password || data.password || data.tempPass || data.temp)) ||
        null;

      if (tempPassword) {
        alert(
          `Usuário criado com sucesso!\n\n` +
          `Senha provisória: ${tempPassword}\n\n` +
          `> Peça para o usuário alterar no primeiro acesso.`
        );
      } else {
        alert("Usuário criado com sucesso!");
      }

      // Limpa o formulário
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

        {/* PASSO 2 — botão chamando a função NOVA com o objeto 'form' */}
        <button
          onClick={() => cadastrarUsuarioViaAPI(form)}
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
        Este formulário envia <b>nome</b>, <b>email</b> e <b>role</b> para <code>/api/users/create</code>. 
        Quando a API retornar <code>temp_password</code>, a senha provisória aparecerá no alerta.
      </p>
    </div>
  );
}
