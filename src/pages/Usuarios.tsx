import React, { useState } from "react";

/**
 * Tela simples de cadastro de usuário chamando a API admin-only:
 *   POST /api/users/create
 * A API cria o usuário no Auth com senha provisória e grava o perfil em public.users.
 */

type Role = "admin" | "vendedor" | "viewer";
type PixType = "cpf" | "email" | "telefone" | ""; // "" = nenhum

type FormState = {
  nome: string;
  email: string;

  telefone?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;

  pix_type: PixType;
  pix_key?: string;

  role: Role;
};

const defaultForm: FormState = {
  nome: "",
  email: "",
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "",
  pix_type: "",     // nenhum
  pix_key: "",
  role: "viewer",
};

export default function Usuarios() {
  const [form, setForm] = useState<FormState>({ ...defaultForm });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value as any }));
  }

  async function cadastrarUsuarioViaAPI(payload: FormState) {
    setLoading(true);
    try {
      // Normalizações leves
      const pix_type = (payload.pix_type || "").toString().trim().toLowerCase() as PixType;
      const body = {
        ...payload,
        pix_type,                    // "" | cpf | email | telefone
        pix_key: (payload.pix_key || "").trim() || null,
        telefone: (payload.telefone || "").trim() || null,
        cep: (payload.cep || "").trim() || null,
        logradouro: (payload.logradouro || "").trim() || null,
        numero: (payload.numero || "").trim() || null,
        bairro: (payload.bairro || "").trim() || null,
        cidade: (payload.cidade || "").trim() || null,
        uf: (payload.uf || "").trim().toUpperCase() || null,
      };

      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const out = await res.json();
      if (!res.ok) {
        throw new Error(out?.error || "Falha ao criar usuário.");
      }

      alert("Usuário criado com sucesso! O acesso foi enviado por e-mail com senha provisória.");
      setForm({ ...defaultForm });
    } catch (err: any) {
      alert(err?.message || "Erro ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>Novo Usuário (Admin)</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <input
          placeholder="Nome completo"
          value={form.nome}
          onChange={(e) => set("nome", e.target.value)}
        />
        <input
          placeholder="E-mail"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <input
          placeholder="Telefone (xx) 9xxxx-xxxx"
          value={form.telefone}
          onChange={(e) => set("telefone", e.target.value)}
        />

        <input
          placeholder="CEP (xxxxx-xxx)"
          value={form.cep}
          onChange={(e) => set("cep", e.target.value)}
        />
        <input
          placeholder="Logradouro"
          value={form.logradouro}
          onChange={(e) => set("logradouro", e.target.value)}
        />
        <input
          placeholder="Número"
          value={form.numero}
          onChange={(e) => set("numero", e.target.value)}
        />

        <input
          placeholder="Bairro"
          value={form.bairro}
          onChange={(e) => set("bairro", e.target.value)}
        />
        <input
          placeholder="Cidade"
          value={form.cidade}
          onChange={(e) => set("cidade", e.target.value)}
        />
        <input
          placeholder="UF"
          value={form.uf}
          onChange={(e) => set("uf", e.target.value)}
          maxLength={2}
        />

        <select
          value={form.pix_type}
          onChange={(e) => {
            const val = e.target.value as PixType; // "" | cpf | email | telefone
            set("pix_type", val);
            // se não for nenhum, limpamos/ajustamos a chave depois
            if (val === "") set("pix_key", "");
          }}
        >
          <option value="">PIX: nenhum</option>
          <option value="cpf">PIX por CPF</option>
          <option value="email">PIX por E-mail</option>
          <option value="telefone">PIX por Telefone</option>
        </select>
        <input
          placeholder="Chave PIX (preenchida conforme o tipo)"
          value={form.pix_key || ""}
          onChange={(e) => set("pix_key", e.target.value)}
          disabled={form.pix_type === ""}
        />

        <select value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
          <option value="viewer">Viewer</option>
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => cadastrarUsuarioViaAPI(form)}
          disabled={loading}
          style={{ padding: "10px 16px", fontWeight: 700 }}
        >
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
      </div>
    </div>
  );
}
