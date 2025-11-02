// src/pages/Usuarios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// --------- helpers de máscara ---------
const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");

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

// --------- tipos ---------
type RoleUI = "admin" | "vendedor" | "operacoes";
const mapRoleToAPI = (r: RoleUI): "admin" | "vendedor" | "viewer" =>
  r === "operacoes" ? "viewer" : r;

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

type FormState = {
  nome: string;
  cpf: string;
  cep: string;
  logradouro: string;
  numero: string;
  sn: boolean;
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  celular: string;
  role: RoleUI;
  scopes: Record<ScopeKey, boolean>;
  pix_type: "" | "cpf" | "email" | "telefone";
  pix_key: string;
  fotoFile: File | null;
  fotoPreview: string | null;
};

const defaultScopes: Record<ScopeKey, boolean> = ALL_SCOPES.reduce(
  (acc, k) => ({ ...acc, [k]: false }),
  {} as Record<ScopeKey, boolean>
);

// --------- paginação ---------
const PAGE_SIZE = 15;

// --------- componente ---------
export default function Usuarios() {
  // Guard de admin (robusto)
  const [checkingRole, setCheckingRole] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const uid = authData?.user?.id || null;
        const email = authData?.user?.email || null;

        // 1) tenta por auth_user_id
        let { data: row } = await supabase
          .from("users")
          .select("id, role, user_role, email")
          .eq("auth_user_id", uid as any)
          .maybeSingle();

        // 2) fallback por e-mail (cadastros antigos sem auth_user_id)
        if (!row && email) {
          const q2 = await supabase
            .from("users")
            .select("id, role, user_role, email")
            .ilike("email", email)
            .maybeSingle();
          row = q2.data || null;
        }

        // 3) decide admin: role ou user_role, case-insensitive
        const roleStr = String(row?.role || row?.user_role || "").toLowerCase();
        setIsAdmin(roleStr === "admin");
      } catch {
        setIsAdmin(false);
      } finally {
        setCheckingRole(false);
      }
    })();
  }, []);

  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false); // overlay do cadastro

  // busca + paginação
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

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
    role: "operacoes",
    scopes: defaultScopes,
    pix_type: "",
    pix_key: "",
    fotoFile: null,
    fotoPreview: null,
  });

  // lista de usuários (tabela public.users)
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  // carregar lista (apenas se admin)
  useEffect(() => {
    if (isAdmin) void loadUsers(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page]);

  async function loadUsers(p: number = 0, term: string = "") {
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("users")
      .select(
        "id, auth_user_id, nome, email, role, user_role, phone, cep, logradouro, numero, bairro, cidade, uf, pix_type, pix_key, pix_kind, avatar_url, photo_url, scopes",
        { count: "exact" }
      )
      .order("nome", { ascending: true });

    const t = term.trim();
    if (t) {
      const digits = onlyDigits(t);
      const or = [
        `nome.ilike.%${t}%`,
        `email.ilike.%${t}%`,
        digits ? `phone.ilike.%${digits}%` : null,
      ]
        .filter(Boolean)
        .join(",");
      q = q.or(or);
    }

    q = q.range(from, to);

    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      alert("Falha ao carregar usuários: " + error.message);
      return;
    }
    setUsers(data || []);
    setTotal(count || 0);
  }

  // CEP -> ViaCEP (cadastro)
  useEffect(() => {
    const dig = onlyDigits(form.cep);
    if (dig.length === 8) {
      (async () => {
        try {
          const resp = await fetch(`https://viacep.com.br/ws/${dig}/json/`);
          const data = await resp.json();
          if (data?.erro) return;
          setForm((s) => ({
            ...s,
            logradouro: data.logradouro || s.logradouro,
            bairro: data.bairro || s.bairro,
            cidade: data.localidade || s.cidade,
            uf: data.uf || s.uf,
          }));
        } catch {
          /* ignora */
        }
      })();
    }
  }, [form.cep]);

  // PIX auto-preencher (cadastro)
  useEffect(() => {
    let key = form.pix_key;
    if (form.pix_type === "cpf") key = onlyDigits(form.cpf);
    if (form.pix_type === "email") key = form.email.trim();
    if (form.pix_type === "telefone") key = onlyDigits(form.celular);
    setForm((s) => ({ ...s, pix_key: key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pix_type, form.cpf, form.email, form.celular]);

  // upload de foto
  async function uploadFotoSeNecessario(file: File | null): Promise<string | null> {
    if (!file) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `avatars/${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (error) {
      alert("Falha ao enviar a foto: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function onSubmit() {
    if (!form.nome.trim()) return alert("Informe o nome.");
    if (!form.email.trim()) return alert("Informe o e-mail.");
    const cpfDigits = onlyDigits(form.cpf);
    if (cpfDigits && cpfDigits.length !== 11) return alert("CPF inválido.");
    if (onlyDigits(form.celular).length < 10) return alert("Celular inválido.");
    if (form.pix_type && !form.pix_key.trim())
      return alert("Informe a chave PIX correspondente.");

    try {
      setLoading(true);
      const avatar_url = await uploadFotoSeNecessario(form.fotoFile);
      const scopesList = ALL_SCOPES.filter((k) => form.scopes[k]);
      const numeroFinal = form.sn ? "s/n" : form.numero.trim();
      const roleForAPI = mapRoleToAPI(form.role);

      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        role: roleForAPI,
        cpf: cpfDigits || null, // backend opcional
        phone: onlyDigits(form.celular),
        telefone: onlyDigits(form.celular),
        cep: onlyDigits(form.cep),
        logradouro: form.logradouro.trim(),
        numero: numeroFinal,
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        uf: form.uf.trim().toUpperCase(),
        scopes: scopesList,
        avatar_url,
        pix_type: form.pix_type || null,
        pix_key: form.pix_type ? form.pix_key.trim() : null,
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
      } catch {}

      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) || raw || `HTTP ${res.status}`;
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

      await loadUsers(0, search);
      setPage(0);

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
        pix_type: "",
        pix_key: "",
        fotoFile: null,
        fotoPreview: null,
      });
      setShowCreate(false);
    } catch (e: any) {
      alert("Falha inesperada: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // edição
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);
  const [editFotoPreview, setEditFotoPreview] = useState<string | null>(null);

  function openEdit(u: any) {
    setEditing({
      ...u,
      cpf: "",
      celular: u.phone ? maskPhone(String(u.phone)) : "",
      cep: u.cep ? maskCEP(String(u.cep)) : "",
    });
    setEditFotoFile(null);
    setEditFotoPreview(null);
  }
  function closeEdit() {
    setEditing(null);
    setEditFotoFile(null);
    setEditFotoPreview(null);
  }

  async function saveEdit() {
    if (!editing || !editing.id) {
      alert("Registro inválido (sem ID). Reabra o modal e tente novamente.");
      return;
    }
    try {
      setSavingEdit(true);

      let avatar_url: string | null = null;
      if (editFotoFile) avatar_url = await uploadFotoSeNecessario(editFotoFile);

      const scopesList: ScopeKey[] =
        Array.isArray(editing.scopes) && editing.scopes.length
          ? editing.scopes
          : [];

      const update: any = {
        nome: editing.nome?.trim() || null,
        email: editing.email?.trim().toLowerCase() || null,
        role: editing.role || editing.user_role || null,
        phone: editing.celular ? onlyDigits(editing.celular) : null,
        telefone: editing.celular ? onlyDigits(editing.celular) : null,
        cep: editing.cep ? onlyDigits(editing.cep) : null,
        logradouro: editing.logradouro || null,
        numero: editing.numero || null,
        bairro: editing.bairro || null,
        cidade: editing.cidade || null,
        uf: editing.uf || null,
        pix_type: editing.pix_type || null,
        pix_key: editing.pix_key || null,
        scopes: scopesList,
      };
      if (avatar_url) update.avatar_url = avatar_url;

      const { data, error } = await supabase
        .from("users")
        .update(update)
        .eq("id", editing.id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error(error);
        alert("Falha ao salvar: " + error.message);
        return;
      }
      if (!data) {
        alert("Nada foi atualizado. Verifique permissões (RLS) ou o ID do registro.");
        return;
      }

      // Atualização opcional do CPF via API própria
      if (editing.cpf) {
        try {
          const resCpf = await fetch(`/api/users/set-cpf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: editing.id,
              cpf: onlyDigits(editing.cpf),
            }),
          });
          if (!resCpf.ok) console.warn("API /api/users/set-cpf falhou/indisponível.");
        } catch (e) {
          console.warn("Falha ao atualizar CPF via API opcional:", e);
        }
      }

      await loadUsers(page, search);
      closeEdit();
    } catch (e: any) {
      alert("Erro inesperado: " + (e?.message || e));
    } finally {
      setSavingEdit(false);
    }
  }

  // helpers UI
  const scopeCheckboxes = useMemo(
    () =>
      ALL_SCOPES.map((k) => (
        <label key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!form.scopes[k]}
            onChange={() =>
              setForm((s) => ({
                ...s,
                scopes: { ...s.scopes, [k]: !s.scopes[k] },
              }))
            }
          />
          <span style={{ textTransform: "capitalize" }}>{k.replace("_", " ")}</span>
        </label>
      )),
    [form.scopes]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  function renderUsersTable() {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={th}>Foto</th>
              <th style={th}>Nome</th>
              <th style={th}>E-mail</th>
              <th style={th}>Perfil</th>
              <th style={th}>Celular</th>
              <th style={th}>PIX</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ transition: "background .15s" }}>
                <td style={td}>
                  {u.avatar_url || u.photo_url ? (
                    <img
                      src={u.avatar_url || u.photo_url}
                      alt=""
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "1px solid #eee",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "#eee",
                      }}
                    />
                  )}
                </td>
                <td style={td}>{u.nome}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>
                  <span style={rolePill}>
                    {String(u.role || u.user_role || "").toUpperCase() || "-"}
                  </span>
                </td>
                <td style={td}>{u.phone ? maskPhone(String(u.phone)) : "-"}</td>
                <td style={td}>
                  {(u.pix_type || u.pix_kind)
                    ? (u.pix_type || u.pix_kind) === "cpf"
                      ? maskCPF(String(u.pix_key || ""))
                      : (u.pix_type || u.pix_kind) === "telefone"
                      ? maskPhone(String(u.pix_key || ""))
                      : String(u.pix_key || "")
                    : "-"}
                </td>
                <td style={td}>
                  <button onClick={() => openEdit(u)} style={btnPrimarySmall}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td style={td} colSpan={7}>
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Paginação */}
        <div style={paginationWrap}>
          <button
            style={{ ...btnGhost, opacity: canPrev ? 1 : 0.5 }}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            ◀ Anterior
          </button>
          <div style={{ fontSize: 13 }}>
            Página <b>{page + 1}</b> de <b>{totalPages}</b> · <b>{total}</b> registros
          </div>
          <button
            style={{ ...btnGhost, opacity: canNext ? 1 : 0.5 }}
            onClick={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
          >
            Próxima ▶
          </button>
        </div>
      </div>
    );
  }

  if (checkingRole) return <div style={pageWrap}>Carregando…</div>;
  if (!isAdmin)
    return (
      <div style={pageWrap}>
        <div style={{ ...card, textAlign: "center", padding: 32 }}>
          <h2 style={{ margin: 0 }}>Acesso negado</h2>
          <p style={{ marginTop: 8 }}>Esta guia é exclusiva para administradores.</p>
        </div>
      </div>
    );

  return (
    <div style={pageWrap}>
      {/* Cabeçalho com busca + chip de cadastro */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Buscar por nome, e-mail ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(0);
                loadUsers(0, search);
              }
            }}
            style={{ ...input, width: 420 }}
          />
          <button
            style={btnGhost}
            onClick={() => {
              setPage(0);
              loadUsers(0, search);
            }}
          >
            Buscar
          </button>
          {search && (
            <button
              style={btnGhost}
              onClick={() => {
                setSearch("");
                setPage(0);
                loadUsers(0, "");
              }}
            >
              Limpar
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowCreate(true)} style={chipButton}>
            + Cadastro de Usuário
          </button>
        </div>
      </div>

      {/* TABELA DE USUÁRIOS */}
      <div style={{ ...card, padding: 0 }}>
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid #eef2f7",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 700 }}>Usuários Cadastrados</span>
        </div>
        <div style={{ padding: 12 }}>{renderUsersTable()}</div>
      </div>

      {/* OVERLAY: CADASTRO */}
      {showCreate && (
        <div style={modalBackdrop}>
          <div style={modalCardWide}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0 }}>Novo usuário</h2>
              <button onClick={() => setShowCreate(false)} style={btnGhost}>
                Fechar
              </button>
            </div>

            <div style={grid3}>
              <input
                placeholder="Nome completo"
                value={form.nome}
                onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                style={input}
              />

              <input
                placeholder="CPF"
                value={form.cpf}
                onChange={(e) => setForm((s) => ({ ...s, cpf: maskCPF(e.target.value) }))}
                style={input}
                inputMode="numeric"
              />

              <input
                placeholder="Celular"
                value={form.celular}
                onChange={(e) => setForm((s) => ({ ...s, celular: maskPhone(e.target.value) }))}
                style={input}
                inputMode="tel"
              />

              <input
                placeholder="CEP"
                value={form.cep}
                onChange={(e) => setForm((s) => ({ ...s, cep: maskCEP(e.target.value) }))}
                style={input}
                inputMode="numeric"
              />

              <input
                placeholder="Logradouro"
                value={form.logradouro}
                onChange={(e) => setForm((s) => ({ ...s, logradouro: e.target.value }))}
                style={input}
              />

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Número"
                  value={form.sn ? "s/n" : form.numero}
                  disabled={form.sn}
                  onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
                  style={input}
                />
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={form.sn}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        sn: e.target.checked,
                        numero: e.target.checked ? "" : s.numero,
                      }))
                    }
                  />
                  s/n
                </label>
              </div>

              <input
                placeholder="Bairro"
                value={form.bairro}
                onChange={(e) => setForm((s) => ({ ...s, bairro: e.target.value }))}
                style={input}
              />

              <input
                placeholder="Cidade"
                value={form.cidade}
                onChange={(e) => setForm((s) => ({ ...s, cidade: e.target.value }))}
                style={input}
              />

              <input
                placeholder="UF"
                value={form.uf}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    uf: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                style={input}
              />

              <input
                placeholder="E-mail"
                value={form.email}
                type="email"
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                style={input}
              />

              <select
                value={form.role}
                onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as RoleUI }))}
                style={input}
              >
                <option value="admin">Admin</option>
                <option value="vendedor">Vendedor</option>
                <option value="operacoes">Operações</option>
              </select>

              {/* PIX */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={form.pix_type}
                  onChange={(e) => setForm((s) => ({ ...s, pix_type: e.target.value as any }))}
                  style={input}
                >
                  <option value="">Tipo da chave PIX</option>
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                </select>
                <input
                  placeholder="Chave PIX"
                  value={form.pix_key}
                  onChange={(e) => setForm((s) => ({ ...s, pix_key: e.target.value }))}
                  style={input}
                />
              </div>

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
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid #eee",
                    }}
                  />
                )}
              </div>

              {/* scopes */}
              <div
                style={{
                  gridColumn: "1 / span 3",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Guias com acesso:</div>
                {scopeCheckboxes}
              </div>

              <button onClick={onSubmit} disabled={loading} style={btnPrimaryFull}>
                {loading ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCardWide}>
            <h3 style={{ marginTop: 0 }}>Editar usuário</h3>
            <div style={grid3}>
              <input
                placeholder="Nome"
                value={editing.nome || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, nome: e.target.value }))}
                style={input}
              />

              <input
                placeholder="CPF (não exibimos o atual por segurança)"
                value={editing.cpf || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, cpf: maskCPF(e.target.value) }))}
                style={input}
                inputMode="numeric"
              />

              <select
                value={editing.role || editing.user_role || "viewer"}
                onChange={(e) => setEditing((s: any) => ({ ...s, role: e.target.value }))}
                style={input}
              >
                <option value="viewer">Operações</option>
                <option value="vendedor">Vendedor</option>
                <option value="admin">Admin</option>
              </select>

              <input
                placeholder="Celular"
                value={editing.celular || ""}
                onChange={(e) =>
                  setEditing((s: any) => ({ ...s, celular: maskPhone(e.target.value) }))
                }
                style={input}
              />
              <input
                placeholder="CEP"
                value={editing.cep || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, cep: maskCEP(e.target.value) }))}
                style={input}
              />
              <input
                placeholder="Logradouro"
                value={editing.logradouro || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, logradouro: e.target.value }))}
                style={input}
              />
              <input
                placeholder="Número"
                value={editing.numero || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, numero: e.target.value }))}
                style={input}
              />
              <input
                placeholder="Bairro"
                value={editing.bairro || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, bairro: e.target.value }))}
                style={input}
              />
              <input
                placeholder="Cidade"
                value={editing.cidade || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, cidade: e.target.value }))}
                style={input}
              />
              <input
                placeholder="UF"
                value={editing.uf || ""}
                onChange={(e) =>
                  setEditing((s: any) => ({
                    ...s,
                    uf: String(e.target.value).toUpperCase().slice(0, 2),
                  }))
                }
                style={input}
              />

              {/* PIX na edição */}
              <select
                value={editing.pix_type || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, pix_type: e.target.value }))}
                style={input}
              >
                <option value="">Tipo da chave PIX</option>
                <option value="cpf">CPF</option>
                <option value="email">E-mail</option>
                <option value="telefone">Telefone</option>
              </select>
              <input
                placeholder="Chave PIX"
                value={editing.pix_key || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, pix_key: e.target.value }))}
                style={input}
              />

              {/* Foto na edição */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setEditFotoFile(f);
                    setEditFotoPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
                {(editFotoPreview || editing.avatar_url || editing.photo_url) && (
                  <img
                    src={editFotoPreview || editing.avatar_url || editing.photo_url}
                    alt="preview"
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid #eee",
                    }}
                  />
                )}
              </div>

              {/* scopes na edição */}
              <div
                style={{
                  gridColumn: "1 / span 3",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Guias com acesso:</div>
                {ALL_SCOPES.map((k) => {
                  const list: ScopeKey[] = Array.isArray(editing.scopes) ? editing.scopes : [];
                  const checked = list.includes(k);
                  return (
                    <label key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const listNow = new Set(list);
                          if (checked) listNow.delete(k);
                          else listNow.add(k);
                          setEditing((s: any) => ({ ...s, scopes: Array.from(listNow) }));
                        }}
                      />
                      <span style={{ textTransform: "capitalize" }}>
                        {k.replace("_", " ")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}
            >
              <button onClick={saveEdit} disabled={savingEdit} style={btnPrimary}>
                {savingEdit ? "Salvando..." : "Salvar alterações"}
              </button>
              <button onClick={closeEdit} style={btnGhost}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------- estilos ----------
const pageWrap: React.CSSProperties = {
  maxWidth: 1280,
  margin: "40px auto",
  fontFamily: "Inter, system-ui, Arial",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 4px 18px rgba(0,0,0,0.08)",
  padding: 16,
  marginBottom: 24,
  border: "1px solid #eef2f7",
};

const grid3: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
  alignItems: "center",
};

const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: 10,
  background: "#fafbfc",
  borderBottom: "1px solid #eef2f7",
};
const td: React.CSSProperties = {
  padding: 10,
  borderTop: "1px solid #f1f5f9",
};

const btnPrimaryFull: React.CSSProperties = {
  gridColumn: "1 / span 3",
  padding: "12px 16px",
  borderRadius: 14,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 800,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};

const btnPrimarySmall: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 700,
};

const chipButton: React.CSSProperties = {
  border: "1px solid #E0CE8C",
  background: "#fff",
  color: "#1E293F",
  padding: "8px 12px",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 700,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.25)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
  padding: 16,
};

const modalCardWide: React.CSSProperties = {
  width: "min(1280px, 96vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
  border: "1px solid #eef2f7",
};

const paginationWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 12,
};

const rolePill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#F5F5F5",
  border: "1px solid #EEE",
  fontSize: 11,
  letterSpacing: 0.4,
};
