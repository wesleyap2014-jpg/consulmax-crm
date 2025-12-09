// src/pages/Usuarios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* -------------------- helpers de máscara -------------------- */
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

/* -------------------- tipos -------------------- */
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

/* ============================================================
   Página
============================================================ */
export default function Usuarios() {
  /* -------- guard admin -------- */
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) {
        setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase.rpc("is_admin", { uid });
      if (error) {
        console.error(error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data);
      }
    })();
  }, []);

  /* -------- listagem -------- */
  const [users, setUsers] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const pageSize = 15;
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  async function loadUsers() {
    setLoadingList(true);
    try {
      const orSearch =
        search.trim().length > 0
          ? `nome.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${onlyDigits(
              search
            )}%`
          : undefined;

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("users")
        .select(
          "id, auth_user_id, nome, email, role, phone, cep, logradouro, numero, bairro, cidade, uf, pix_type, pix_key, avatar_url, scopes, is_active",
          { count: "exact" }
        )
        .order("id", { ascending: false })
        .range(from, to);

      if (orSearch) q = q.or(orSearch);

      const { data, error, count } = await q;
      if (error) throw error;
      setUsers(data || []);
      setTotalRows(count || 0);
    } catch (e: any) {
      alert("Falha ao carregar usuários: " + (e?.message || e));
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, search]);

  /* -------- form cadastro (overlay) -------- */
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
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

  // ViaCEP no cadastro
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
        } catch {}
      })();
    }
  }, [form.cep]);

  // PIX auto
  useEffect(() => {
    let key = form.pix_key;
    if (form.pix_type === "cpf") key = onlyDigits(form.cpf);
    if (form.pix_type === "email") key = form.email.trim();
    if (form.pix_type === "telefone") key = onlyDigits(form.celular);
    setForm((s) => ({ ...s, pix_key: key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pix_type, form.cpf, form.email, form.celular]);

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

  async function submitCreate() {
    if (!form.nome.trim()) return alert("Informe o nome.");
    if (!form.email.trim()) return alert("Informe o e-mail.");
    if (onlyDigits(form.cpf).length !== 11) return alert("CPF inválido.");
    if (onlyDigits(form.celular).length < 10) return alert("Celular inválido.");

    try {
      setCreating(true);
      const avatar_url = await uploadFotoSeNecessario(form.fotoFile);
      const scopesList = ALL_SCOPES.filter((k) => form.scopes[k]);
      const numeroFinal = form.sn ? "s/n" : form.numero.trim();
      const roleForAPI = mapRoleToAPI(form.role);

      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        role: roleForAPI, // admin | vendedor | viewer
        cpf: onlyDigits(form.cpf),
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
        is_active: true, // novo usuário já nasce ativo
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

      setOpenCreate(false);
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
      setPage(1);
      await loadUsers();
    } catch (e: any) {
      alert("Falha inesperada: " + (e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  /* -------- edição -------- */
  const [editing, setEditing] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function openEdit(u: any) {
    setEditing({
      ...u,
      cpf: "",
      celular: u.phone ? maskPhone(String(u.phone)) : "",
      cep: u.cep ? maskCEP(String(u.cep)) : "",
      fotoFile: null as File | null,
      fotoPreview: null as string | null,
    });
  }
  function closeEdit() {
    setEditing(null);
  }

  // ViaCEP na edição
  useEffect(() => {
    if (!editing) return;
    const dig = onlyDigits(editing.cep || "");
    if (dig.length === 8) {
      (async () => {
        try {
          const resp = await fetch(`https://viacep.com.br/ws/${dig}/json/`);
          const data = await resp.json();
          if (data?.erro) return;
          setEditing((s: any) => ({
            ...s,
            logradouro: data.logradouro || s.logradouro,
            bairro: data.bairro || s.bairro,
            cidade: data.localidade || s.cidade,
            uf: data.uf || s.uf,
          }));
        } catch {}
      })();
    }
  }, [editing?.cep]);

  async function saveEdit() {
    if (!editing) return;
    try {
      setSavingEdit(true);

      let avatar_url: string | undefined = undefined;
      if (editing.fotoFile) {
        const u = await uploadFotoSeNecessario(editing.fotoFile);
        avatar_url = u || undefined;
      }

      const scopesList: ScopeKey[] =
        Array.isArray(editing.scopes) && editing.scopes.length
          ? editing.scopes
          : [];

      const update: any = {
        nome: editing.nome?.trim() || null,
        email: editing.email?.trim().toLowerCase() || null,
        role: editing.role || null, // admin | vendedor | viewer
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
        is_active: editing.is_active !== false, // se não for false, considera ativo
      };
      if (avatar_url) update.avatar_url = avatar_url;

      const { error } = await supabase
        .from("users")
        .update(update)
        .eq("id", editing.id)
        .select("id")
        .single();

      if (error) {
        alert("Falha ao salvar: " + error.message);
        return;
      }
      await loadUsers();
      closeEdit();
    } catch (e: any) {
      alert("Erro inesperado: " + (e?.message || e));
    } finally {
      setSavingEdit(false);
    }
  }

  /* -------- UI helpers -------- */
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

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  /* ============================================================
     Render
  ============================================================ */
  if (isAdmin === null) {
    return (
      <div style={{ maxWidth: 1280, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" }}>
        <div style={card}>Verificando permissões…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1280, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" }}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Acesso negado</h2>
          <p>Esta guia é exclusiva para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" }}>
      {/* Header / barra ações */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          style={{ ...input, width: 420 }}
        />
        <button onClick={() => setOpenCreate(true)} style={chipButton}>
          + Cadastro de Usuário
        </button>
      </div>

      {/* Tabela */}
      <div style={card}>
        <h2 style={{ margin: "0 0 12px" }}>Usuários Cadastrados</h2>
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
              {loadingList && (
                <tr>
                  <td style={td} colSpan={7}>Carregando…</td>
                </tr>
              )}
              {!loadingList &&
                users.map((u) => (
                  <tr
                    key={u.id}
                    style={
                      u.is_active === false
                        ? { opacity: 0.45, backgroundColor: "#F9FAFB" }
                        : undefined
                    }
                  >
                    <td style={td}>
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 12,
                            border: "1px solid #eee",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: "#eee",
                          }}
                        />
                      )}
                    </td>
                    <td style={td}>
                      {u.nome}
                      {u.is_active === false && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            textTransform: "uppercase",
                            letterSpacing: 0.02,
                          }}
                        >
                          Inativo
                        </span>
                      )}
                    </td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>
                      <span style={roleBadge(u.role)}>{String(u.role || "").toUpperCase()}</span>
                    </td>
                    <td style={td}>{u.phone ? maskPhone(String(u.phone)) : "-"}</td>
                    <td style={td}>
                      {u.pix_type
                        ? u.pix_type === "cpf"
                          ? maskCPF(String(u.pix_key || ""))
                          : u.pix_type === "telefone"
                          ? maskPhone(String(u.pix_key || ""))
                          : String(u.pix_key || "")
                        : "-"}
                    </td>
                    <td style={td}>
                      <button onClick={() => openEdit(u)} style={btnPrimary}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              {!loadingList && users.length === 0 && (
                <tr>
                  <td style={td} colSpan={7}>
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button
            style={btnGhost}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ◀ Anterior
          </button>
          <div style={{ fontSize: 12, color: "#475569" }}>
            Página {page} de {totalPages} • {totalRows} registros
          </div>
          <button
            style={btnGhost}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima ▶
          </button>
        </div>
      </div>

      {/* Overlay de cadastro */}
      {openCreate && (
        <div style={modalBackdrop}>
          <div style={modalCardWide}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Novo usuário</h3>
              <button onClick={() => setOpenCreate(false)} style={btnGhost}>Fechar</button>
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

              <div
                style={{
                  gridColumn: "1 / span 3",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Guias com acesso:</div>
                {scopeCheckboxes}
              </div>

              <button onClick={submitCreate} disabled={creating} style={btnPrimaryFull}>
                {creating ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCardWide}>
            <h3 style={{ marginTop: 0 }}>
              Editar usuário {editing.is_active === false ? "(INATIVO)" : ""}
            </h3>
            <div style={grid3}>
              <input
                placeholder="Nome"
                value={editing.nome || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, nome: e.target.value }))}
                style={input}
              />
              <input
                placeholder="E-mail"
                value={editing.email || ""}
                onChange={(e) => setEditing((s: any) => ({ ...s, email: e.target.value }))}
                style={input}
              />
              <select
                value={editing.role || "viewer"}
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
                onChange={(e) =>
                  setEditing((s: any) => ({ ...s, cep: maskCEP(e.target.value) }))
                }
                style={input}
              />
              <input
                placeholder="Logradouro"
                value={editing.logradouro || ""}
                onChange={(e) =>
                  setEditing((s: any) => ({ ...s, logradouro: e.target.value }))
                }
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

              {/* upload foto (opcional na edição) */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setEditing((s: any) => ({
                      ...s,
                      fotoFile: f,
                      fotoPreview: f ? URL.createObjectURL(f) : null,
                    }));
                  }}
                />
                {editing.fotoPreview && (
                  <img
                    src={editing.fotoPreview}
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

              {/* Ativo / inativo */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={editing.is_active !== false}
                  onChange={(e) =>
                    setEditing((s: any) => ({
                      ...s,
                      is_active: e.target.checked,
                    }))
                  }
                />
                <span>Usuário ativo</span>
              </label>

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
                    <label
                      key={k}
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const listNow = new Set(list);
                          if (checked) listNow.delete(k);
                          else listNow.add(k);
                          setEditing((s: any) => ({
                            ...s,
                            scopes: Array.from(listNow),
                          }));
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

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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

/* -------------------- estilos -------------------- */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  padding: 16,
  marginBottom: 16,
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
  border: "1px solid "#e5e7eb",
  outline: "none",
};

const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };

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
  padding: "10px 14px",
  borderRadius: 999,
  background: "#fff",
  color: "#A11C27",
  border: "1px solid #A11C27",
  cursor: "pointer",
  fontWeight: 800,
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};

const modalCardWide: React.CSSProperties = {
  width: "min(1080px, 95vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};

const roleBadge = (role: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background:
    String(role).toLowerCase() === "admin"
      ? "#1E293F"
      : String(role).toLowerCase() === "vendedor"
      ? "#B5A573"
      : "#E0CE8C",
  color: "#fff",
});
