// src/pages/Usuarios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RoleUI = "admin" | "vendedor" | "operacoes";
// no backend, seguimos usando 'admin' | 'vendedor' | 'viewer'
function mapRoleToAPI(r: RoleUI): "admin" | "vendedor" | "viewer" {
  return r === "operacoes" ? "viewer" : r;
}

type ScopeKey =
  | "leads"
  | "oportunidades"
  | "usuarios"
  | "lgpd"
  | "carteira"
  | "gestao_grupos"
  | "comissoes"
  | "suporte";

const ALL_SCOPES: ScopeKey[] = [
  "leads",
  "oportunidades",
  "usuarios",
  "lgpd",
  "carteira",
  "gestao_grupos",
  "comissoes",
  "suporte",
];

// ----------------- máscaras simples (sem libs) -----------------
function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}
function maskCPF(v: string) {
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
}
function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11); // (99) 9 9999-9999
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
}
function maskCEP(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return d.slice(0, 5) + "-" + d.slice(5);
}

// ----------------- tipos de formulário -----------------
type FormState = {
  nome: string;
  cpf: string;
  cep: string;
  logradouro: string;
  numero: string;
  sn: boolean; // sem número
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  celular: string;
  role: RoleUI;
  scopes: Record<ScopeKey, boolean>;
  fotoFile: File | null;
  fotoPreview: string | null;
};

const defaultScopes: Record<ScopeKey, boolean> = ALL_SCOPES.reduce(
  (acc, k) => ({ ...acc, [k]: false }),
  {} as Record<ScopeKey, boolean>
);

// ----------------- Componente -----------------
export default function Usuarios() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    nome: "",
    cpf: "",
    cep: "",
    logradouro: "",
    numero: "",
    sn: false,
    bairro: "",
    cidade: "",
    uf: "",
    email: "",
    celular: "",
    role: "viewer" as any, // apenas para não quebrar antes de setar; já trocamos abaixo
    scopes: defaultScopes,
    fotoFile: null,
    fotoPreview: null,
  });

  // corrige role inicial para "viewer" -> "operacoes" como opção do UI
  useEffect(() => {
    setForm((s) => ({ ...s, role: "operacoes" }));
  }, []);

  // CEP -> ViaCEP auto-preencher
  useEffect(() => {
    const dig = onlyDigits(form.cep);
    if (dig.length === 8) {
      (async () => {
        try {
          const resp = await fetch(`https://viacep.com.br/ws/${dig}/json/`);
          const data = await resp.json();
          if (data?.erro) return; // CEP inválido
          setForm((s) => ({
            ...s,
            logradouro: data.logradouro || s.logradouro,
            bairro: data.bairro || s.bairro,
            cidade: data.localidade || s.cidade,
            uf: data.uf || s.uf,
          }));
        } catch {
          // ignora erros silenciosamente
        }
      })();
    }
  }, [form.cep]);

  // helper: atualizar scope
  function toggleScope(k: ScopeKey) {
    setForm((s) => ({ ...s, scopes: { ...s.scopes, [k]: !s.scopes[k] } }));
  }

  // helper: upload de foto no bucket "avatars"
  async function uploadFotoSeNecessario(): Promise<string | null> {
    if (!form.fotoFile) return null;

    const ext = form.fotoFile.name.split(".").pop() || "jpg";
    const path = `avatars/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, form.fotoFile, { upsert: true });

    if (upErr) {
      alert("Falha ao enviar a foto: " + upErr.message);
      return null;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function onSubmit() {
    // validações simples
    if (!form.nome.trim()) return alert("Informe o nome.");
    if (!form.email.trim()) return alert("Informe o e-mail.");
    const cpfDigits = onlyDigits(form.cpf);
    if (cpfDigits.length !== 11) return alert("CPF inválido.");
    if (onlyDigits(form.celular).length < 10)
      return alert("Celular inválido.");

    try {
      setLoading(true);

      const avatar_url = await uploadFotoSeNecessario();

      // converte scopes marcados em lista
      const scopesList = ALL_SCOPES.filter((k) => form.scopes[k]);

      // número: "s/n" se marcado sem número
      const numeroFinal = form.sn ? "s/n" : form.numero.trim();

      // role p/ API (operacoes -> viewer)
      const roleForAPI = mapRoleToAPI(form.role);

      // payload enviado para o backend
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        role: roleForAPI, // 'admin' | 'vendedor' | 'viewer'
        cpf: cpfDigits, // backend pode criptografar/mascarar
        phone: onlyDigits(form.celular),
        cep: onlyDigits(form.cep),
        logradouro: form.logradouro.trim(),
        numero: numeroFinal,
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        uf: form.uf.trim().toUpperCase(),
        scopes: scopesList, // ['leads','oportunidades', ...]
        avatar_url,
      };

      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* resposta não-JSON */
      }

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || raw || `HTTP ${res.status}`;
        alert("Erro ao criar usuário: " + msg);
        return;
      }

      const senha =
        data?.password ||
        data?.temp_password ||
        data?.tempPass ||
        data?.temp ||
        null;

      alert(
        senha
          ? `Usuário criado!\n\nSenha provisória: ${senha}\n\nPeça para trocar no primeiro acesso.`
          : "Usuário criado com sucesso!"
      );

      // limpa form
      setForm({
        nome: "",
        cpf: "",
        cep: "",
        logradouro: "",
        numero: "",
        sn: false,
        bairro: "",
        cidade: "",
        uf: "",
        email: "",
        celular: "",
        role: "operacoes",
        scopes: defaultScopes,
        fotoFile: null,
        fotoPreview: null,
      });
    } catch (e: any) {
      alert("Falha inesperada: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  const scopeEntries = useMemo(
    () =>
      ALL_SCOPES.map((k) => (
        <label key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!form.scopes[k]}
            onChange={() => toggleScope(k)}
          />
          <span style={{ textTransform: "capitalize" }}>{k.replace("_", " ")}</span>
        </label>
      )),
    [form.scopes]
  );

  return (
    <div style={{ maxWidth: 940, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" }}>
      <h1 style={{ marginBottom: 16 }}>Cadastro de Usuário</h1>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          alignItems: "center",
          background: "#fff",
          padding: 16,
          borderRadius: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        {/* coluna 1 */}
        <input
          placeholder="Nome completo"
          value={form.nome}
          onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
          style={styles.input}
        />

        <input
          placeholder="CPF"
          value={form.cpf}
          onChange={(e) => setForm((s) => ({ ...s, cpf: maskCPF(e.target.value) }))}
          style={styles.input}
          inputMode="numeric"
        />

        <input
          placeholder="Celular"
          value={form.celular}
          onChange={(e) => setForm((s) => ({ ...s, celular: maskPhone(e.target.value) }))}
          style={styles.input}
          inputMode="tel"
        />

        <input
          placeholder="CEP"
          value={form.cep}
          onChange={(e) => setForm((s) => ({ ...s, cep: maskCEP(e.target.value) }))}
          style={styles.input}
          inputMode="numeric"
        />

        <input
          placeholder="Logradouro"
          value={form.logradouro}
          onChange={(e) => setForm((s) => ({ ...s, logradouro: e.target.value }))}
          style={styles.input}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Número"
            value={form.sn ? "s/n" : form.numero}
            disabled={form.sn}
            onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
            style={styles.input}
          />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.sn}
              onChange={(e) => setForm((s) => ({ ...s, sn: e.target.checked, numero: e.target.checked ? "" : s.numero }))}
            />
            s/n
          </label>
        </div>

        <input
          placeholder="Bairro"
          value={form.bairro}
          onChange={(e) => setForm((s) => ({ ...s, bairro: e.target.value }))}
          style={styles.input}
        />

        <input
          placeholder="Cidade"
          value={form.cidade}
          onChange={(e) => setForm((s) => ({ ...s, cidade: e.target.value }))}
          style={styles.input}
        />

        <input
          placeholder="UF"
          value={form.uf}
          onChange={(e) => setForm((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))}
          style={styles.input}
        />

        <input
          placeholder="E-mail"
          value={form.email}
          type="email"
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          style={styles.input}
        />

        <select
          value={form.role}
          onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as RoleUI }))}
          style={styles.input}
        >
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
          <option value="operacoes">Operações</option>
        </select>

        {/* foto */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setForm((s) => ({
                ...s,
                fotoFile: f,
                fotoPreview: f ? URL.createObjectURL(f) : null,
              }));
            }}
          />
          {form.fotoPreview && (
            <img
              src={form.fotoPreview}
              alt="preview"
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 12, border: "1px solid #eee" }}
            />
          )}
        </div>

        {/* scopes (marca guias) */}
        <div style={{ gridColumn: "1 / span 3", display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Guias com acesso:</div>
          {scopeEntries}
        </div>

        <button
          onClick={onSubmit}
          disabled={loading}
          style={{
            gridColumn: "1 / span 3",
            padding: "12px 16px",
            borderRadius: 14,
            background: "#A11C27",
            color: "#fff",
            border: 0,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  input: { padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", outline: "none" },
};
