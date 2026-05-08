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

const lower = (v: string) => (v || "").trim().toLowerCase();

const compareText = (a?: string | null, b?: string | null) =>
  String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" });

/* -------------------- tipos -------------------- */
type RoleUI = "admin" | "vendedor" | "operacoes";
type RoleAPI = "admin" | "vendedor" | "viewer";

const mapRoleToAPI = (r: RoleUI): RoleAPI => (r === "operacoes" ? "viewer" : r);

const roleToUI = (r: string | null | undefined): RoleUI => {
  if (r === "admin") return "admin";
  if (r === "vendedor") return "vendedor";
  return "operacoes";
};

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

type HierarchyLevel = "gestor_filial" | "usuario";
type UnitType = "matriz" | "filial";

type Unit = {
  id: string;
  nome: string;
  tipo: UnitType;
  cidade: string | null;
  uf: string | null;
  is_active: boolean;
};

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
  unit_id: string;
  hierarchy_level: HierarchyLevel;
};

type UnitFormState = {
  nome: string;
  tipo: UnitType;
  cidade: string;
  uf: string;
  is_active: boolean;
};

const createDefaultScopes = (): Record<ScopeKey, boolean> =>
  ALL_SCOPES.reduce((acc, k) => ({ ...acc, [k]: false }), {} as Record<ScopeKey, boolean>);

const emptyForm = (): FormState => ({
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
  scopes: createDefaultScopes(),
  pix_type: "",
  pix_key: "",
  fotoFile: null,
  fotoPreview: null,
  unit_id: "",
  hierarchy_level: "usuario",
});

const emptyUnitForm = (): UnitFormState => ({
  nome: "",
  tipo: "filial",
  cidade: "",
  uf: "RO",
  is_active: true,
});

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

  /* -------- unidades -------- */
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [openUnits, setOpenUnits] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitFormState>(emptyUnitForm());

  async function loadUnits() {
    setLoadingUnits(true);
    try {
      const { data, error } = await supabase
        .from("units")
        .select("id,nome,tipo,cidade,uf,is_active")
        .order("tipo", { ascending: true })
        .order("nome", { ascending: true });

      if (error) throw error;

      const sorted = ((data || []) as Unit[]).sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === "matriz" ? -1 : 1;
        return compareText(a.nome, b.nome);
      });

      setUnits(sorted);
    } catch (e: any) {
      alert("Falha ao carregar unidades: " + (e?.message || e));
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadUnits();
  }, [isAdmin]);

  useEffect(() => {
    if (openUnits) loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUnits]);

  function startCreateUnit() {
    setEditingUnitId(null);
    setUnitForm(emptyUnitForm());
  }

  function startEditUnit(unit: Unit) {
    setEditingUnitId(unit.id);
    setUnitForm({
      nome: unit.nome || "",
      tipo: unit.tipo || "filial",
      cidade: unit.cidade || "",
      uf: unit.uf || "RO",
      is_active: unit.is_active !== false,
    });
  }

  async function saveUnit() {
    if (!unitForm.nome.trim()) return alert("Informe o nome da unidade.");
    try {
      setSavingUnit(true);
      const payload = {
        nome: unitForm.nome.trim(),
        tipo: unitForm.tipo,
        cidade: unitForm.cidade.trim() || null,
        uf: unitForm.uf.trim().toUpperCase() || null,
        is_active: unitForm.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingUnitId) {
        const { error } = await supabase.from("units").update(payload).eq("id", editingUnitId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("units").insert(payload);
        if (error) throw error;
      }

      await loadUnits();
      startCreateUnit();
    } catch (e: any) {
      alert("Falha ao salvar unidade: " + (e?.message || e));
    } finally {
      setSavingUnit(false);
    }
  }

  const activeUnits = useMemo(() => units.filter((u) => u.is_active !== false), [units]);
  const unitById = useMemo(() => {
    const map = new Map<string, Unit>();
    units.forEach((u) => map.set(u.id, u));
    return map;
  }, [units]);

  /* -------- listagem -------- */
  const [users, setUsers] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  async function loadUsers() {
    setLoadingList(true);
    try {
      const sanitizedSearch = search.trim();
      const digits = onlyDigits(sanitizedSearch);
      const orSearch = sanitizedSearch
        ? `nome.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%,phone.ilike.%${digits}%`
        : undefined;

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("users")
        .select(
          "id, auth_user_id, nome, email, role, phone, cep, logradouro, numero, bairro, cidade, uf, pix_type, pix_key, avatar_url, scopes, is_active, unit_id, hierarchy_level",
          { count: "exact" }
        )
        .order("nome", { ascending: true, nullsFirst: false })
        .range(from, to);

      if (orSearch) q = q.or(orSearch);

      const { data, error, count } = await q;
      if (error) throw error;

      const sorted = (data || []).sort((a: any, b: any) => compareText(a.nome, b.nome));
      setUsers(sorted);
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
  const [form, setForm] = useState<FormState>(emptyForm());

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
    const path = `avatars/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      alert("Falha ao enviar a foto: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function applyHierarchyByEmail(email: string, unitId: string, hierarchyLevel: HierarchyLevel) {
    const { error } = await supabase
      .from("users")
      .update({
        unit_id: unitId || null,
        hierarchy_level: hierarchyLevel,
        is_active: true,
      })
      .eq("email", lower(email));

    if (error) throw error;
  }

  async function submitCreate() {
    if (!form.nome.trim()) return alert("Informe o nome.");
    if (!form.email.trim()) return alert("Informe o e-mail.");
    if (onlyDigits(form.cpf).length !== 11) return alert("CPF inválido.");
    if (onlyDigits(form.celular).length < 10) return alert("Celular inválido.");
    if (!form.unit_id) return alert("Selecione a unidade do usuário.");

    try {
      setCreating(true);
      const avatar_url = await uploadFotoSeNecessario(form.fotoFile);
      const scopesList = ALL_SCOPES.filter((k) => form.scopes[k]);
      const numeroFinal = form.sn ? "s/n" : form.numero.trim();
      const roleForAPI = mapRoleToAPI(form.role);
      const email = lower(form.email);

      const payload = {
        nome: form.nome.trim(),
        email,
        role: roleForAPI,
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
        is_active: true,
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
        const msg = (data && (data.error || data.message)) || raw || `HTTP ${res.status}`;
        alert("Erro ao criar usuário: " + msg);
        return;
      }

      try {
        await applyHierarchyByEmail(email, form.unit_id, form.hierarchy_level);
      } catch (hierarchyError: any) {
        alert(
          "Usuário criado, mas não consegui vincular a unidade/hierarquia automaticamente: " +
            (hierarchyError?.message || hierarchyError)
        );
      }

      const senha = data?.password || data?.temp_password || data?.tempPass || data?.temp || null;

      alert(
        senha
          ? `Usuário criado!\n\nSenha provisória: ${senha}\n\nPeça para trocar no primeiro acesso.`
          : "Usuário criado com sucesso!"
      );

      setOpenCreate(false);
      setForm(emptyForm());
      setPage(1);
      await Promise.all([loadUnits(), loadUsers()]);
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
      role_ui: roleToUI(u.role),
      cpf: "",
      celular: u.phone ? maskPhone(String(u.phone)) : "",
      cep: u.cep ? maskCEP(String(u.cep)) : "",
      unit_id: u.unit_id || "",
      hierarchy_level: (u.hierarchy_level || "usuario") as HierarchyLevel,
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
    if (!editing.nome?.trim()) return alert("Informe o nome.");
    if (!editing.email?.trim()) return alert("Informe o e-mail.");
    if (!editing.unit_id) return alert("Selecione a unidade do usuário.");

    try {
      setSavingEdit(true);

      let avatar_url: string | undefined = undefined;
      if (editing.fotoFile) {
        const u = await uploadFotoSeNecessario(editing.fotoFile);
        avatar_url = u || undefined;
      }

      const scopesList: ScopeKey[] = Array.isArray(editing.scopes) ? editing.scopes : [];
      const roleForAPI = mapRoleToAPI((editing.role_ui || roleToUI(editing.role)) as RoleUI);

      const update: any = {
        nome: editing.nome?.trim() || null,
        email: lower(editing.email),
        role: roleForAPI,
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
        unit_id: editing.unit_id || null,
        hierarchy_level: (editing.hierarchy_level || "usuario") as HierarchyLevel,
        is_active: editing.is_active !== false,
      };
      if (avatar_url) update.avatar_url = avatar_url;

      const { error } = await supabase.from("users").update(update).eq("id", editing.id).select("id").single();

      if (error) {
        alert("Falha ao salvar: " + error.message);
        return;
      }
      await Promise.all([loadUnits(), loadUsers()]);
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
        <label key={k} style={checkboxCard}>
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

  const activeUsers = useMemo(
    () => users.filter((u) => u.is_active !== false).sort((a, b) => compareText(a.nome, b.nome)),
    [users]
  );

  const inactiveUsers = useMemo(
    () => users.filter((u) => u.is_active === false).sort((a, b) => compareText(a.nome, b.nome)),
    [users]
  );

  function getUserUnit(u: any): Unit | null {
    if (u.unit_id && unitById.has(u.unit_id)) {
      return unitById.get(u.unit_id) || null;
    }
    return null;
  }

  function hierarchyLabel(level: string | null | undefined, unit?: Unit | null) {
    if (unit?.tipo === "matriz") return "Matriz / visão global";
    if (level === "gestor_filial") return "Gestor da filial";
    return "Usuário / vendedor";
  }

  function hierarchyHelp(unitId: string, level: HierarchyLevel) {
    const unit = unitById.get(unitId);
    if (unit?.tipo === "matriz") return "Usuários da Matriz enxergam todas as unidades.";
    if (level === "gestor_filial") return "Gestor de filial enxerga todos os usuários da própria filial.";
    return "Usuário/Vendedor enxerga somente os próprios números.";
  }

  function toggleEditingScope(scope: ScopeKey) {
    setEditing((s: any) => {
      const current = Array.isArray(s.scopes) ? s.scopes : [];
      const next = current.includes(scope) ? current.filter((x: string) => x !== scope) : [...current, scope];
      return { ...s, scopes: next };
    });
  }

  function renderUserRows(list: any[], inactiveSection = false) {
    return list.map((u) => {
      const unit = getUserUnit(u);
      return (
        <tr key={u.id} style={inactiveSection || u.is_active === false ? inactiveRow : undefined}>
          <td style={tdAvatar}>
            {u.avatar_url ? <img src={u.avatar_url} alt="" style={avatar} /> : <div style={avatarFallback} />}
          </td>
          <td style={tdName}>
            <div style={{ fontWeight: 900 }}>{u.nome}</div>
            {u.is_active === false && <span style={inactiveBadge}>Inativo</span>}
          </td>
          <td style={td}>{u.email}</td>
          <td style={td}>
            <span style={roleBadge(u.role)}>{String(u.role || "").toUpperCase()}</span>
          </td>
          <td style={td}>
            {unit ? (
              <div>
                <div style={{ fontWeight: 850 }}>{unit.nome}</div>
                <div style={miniText}>{unit.tipo === "matriz" ? "Matriz" : "Filial"}</div>
              </div>
            ) : (
              <span style={warningText}>Sem unidade</span>
            )}
          </td>
          <td style={td}>
            <span style={hierarchyBadge(u.hierarchy_level, unit)}>{hierarchyLabel(u.hierarchy_level, unit)}</span>
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
          <td style={tdAction}>
            <button onClick={() => openEdit(u)} style={btnPrimary}>
              Editar
            </button>
          </td>
        </tr>
      );
    });
  }

  /* ============================================================
     Render
  ============================================================ */
  if (isAdmin === null) {
    return (
      <PageShell>
        <div style={card}>Verificando permissões…</div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Acesso negado</h2>
          <p>Esta guia é exclusiva para administradores.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header / barra ações */}
      <div style={heroCard}>
        <div>
          <h1 style={title}>Usuários</h1>
          <p style={subtitle}>Cadastre usuários, vincule unidades e defina a hierarquia de acesso.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setOpenUnits(true)} style={btnSecondary}>
            Unidades
          </button>
          <button onClick={() => setOpenCreate(true)} style={chipButton}>
            + Cadastro de Usuário
          </button>
        </div>
      </div>

      <div style={toolbar}>
        <input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          style={{ ...input, width: 520, maxWidth: "100%" }}
        />
        <div style={toolbarStats}>
          <span style={statPill}>Ativos: {activeUsers.length}</span>
          <span style={statPill}>Inativos: {inactiveUsers.length}</span>
          <span style={statPill}>Unidades: {activeUnits.length}</span>
        </div>
      </div>

      {/* Tabela */}
      <div style={cardWide}>
        <div style={sectionHeader}>
          <div>
            <h2 style={{ margin: 0 }}>Usuários ativos</h2>
            <p style={subtitleSmall}>Listagem em ordem alfabética com unidade e nível hierárquico.</p>
          </div>
        </div>

        <UsersTable
          loading={loadingList}
          emptyText="Nenhum usuário ativo encontrado."
          colSpan={9}
          rows={renderUserRows(activeUsers)}
        />

        {inactiveUsers.length > 0 && (
          <div style={inactiveSectionBox}>
            <div style={sectionHeader}>
              <div>
                <h2 style={{ margin: 0 }}>Usuários inativos</h2>
                <p style={subtitleSmall}>Usuários separados para não misturar com a operação ativa.</p>
              </div>
            </div>
            <UsersTable
              loading={false}
              emptyText="Nenhum usuário inativo encontrado."
              colSpan={9}
              rows={renderUserRows(inactiveUsers, true)}
            />
          </div>
        )}

        {/* paginação */}
        <div style={pagination}>
          <button style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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

      {/* Overlay de Unidades */}
      {openUnits && (
        <div style={modalBackdrop}>
          <div style={modalCardWide}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Unidades</h3>
                <p style={subtitleSmall}>Cadastre matriz e filiais usadas na hierarquia do CRM.</p>
              </div>
              <button onClick={() => setOpenUnits(false)} style={btnGhost}>
                Fechar
              </button>
            </div>

            <div style={unitManagerGrid}>
              <div style={softPanel}>
                <div style={panelHeader}>
                  <h4 style={{ margin: 0 }}>{editingUnitId ? "Editar unidade" : "Nova unidade"}</h4>
                  <span style={panelHint}>Matriz vê tudo; filial respeita gestor/vendedor.</span>
                </div>

                <div style={formGrid2}>
                  <Field label="Nome da unidade">
                    <input
                      placeholder="Ex.: Consulmax Ji-Paraná"
                      value={unitForm.nome}
                      onChange={(e) => setUnitForm((s) => ({ ...s, nome: e.target.value }))}
                      style={input}
                    />
                  </Field>

                  <Field label="Tipo">
                    <select
                      value={unitForm.tipo}
                      onChange={(e) => setUnitForm((s) => ({ ...s, tipo: e.target.value as UnitType }))}
                      style={input}
                    >
                      <option value="matriz">Matriz</option>
                      <option value="filial">Filial</option>
                    </select>
                  </Field>

                  <Field label="Cidade">
                    <input
                      placeholder="Cidade"
                      value={unitForm.cidade}
                      onChange={(e) => setUnitForm((s) => ({ ...s, cidade: e.target.value }))}
                      style={input}
                    />
                  </Field>

                  <Field label="UF">
                    <input
                      placeholder="UF"
                      value={unitForm.uf}
                      onChange={(e) => setUnitForm((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                      style={input}
                    />
                  </Field>

                  <label style={checkboxCard}>
                    <input
                      type="checkbox"
                      checked={unitForm.is_active}
                      onChange={(e) => setUnitForm((s) => ({ ...s, is_active: e.target.checked }))}
                    />
                    Unidade ativa
                  </label>
                </div>

                <div style={modalActions}>
                  <button onClick={saveUnit} disabled={savingUnit} style={btnPrimary}>
                    {savingUnit ? "Salvando..." : editingUnitId ? "Salvar unidade" : "Cadastrar unidade"}
                  </button>
                  {editingUnitId && (
                    <button onClick={startCreateUnit} style={btnGhost}>
                      Cancelar edição
                    </button>
                  )}
                </div>
              </div>

              <div style={softPanel}>
                <div style={panelHeader}>
                  <h4 style={{ margin: 0 }}>Unidades cadastradas</h4>
                  <span style={panelHint}>{units.length} unidade(s)</span>
                </div>

                {loadingUnits && <div style={hint}>Carregando unidades…</div>}
                {!loadingUnits && units.length === 0 && <div style={hint}>Nenhuma unidade cadastrada.</div>}

                <div style={unitList}>
                  {units.map((u) => (
                    <div key={u.id} style={unitRow}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{u.nome}</div>
                        <div style={miniText}>
                          {u.tipo === "matriz" ? "Matriz" : "Filial"} • {u.cidade || "Cidade não informada"}
                          {u.uf ? `/${u.uf}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {u.is_active === false && <span style={inactiveBadge}>Inativa</span>}
                        <button onClick={() => startEditUnit(u)} style={btnGhost}>
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de cadastro */}
      {openCreate && (
        <div style={modalBackdrop}>
          <div style={modalCardLarge}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Novo usuário</h3>
                <p style={subtitleSmall}>Dados pessoais, unidade, hierarquia e acessos em uma tela mais organizada.</p>
              </div>
              <button onClick={() => setOpenCreate(false)} style={btnGhost}>
                Fechar
              </button>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Dados principais</h4>
              <div style={formGrid3}>
                <Field label="Nome completo">
                  <input
                    placeholder="Nome completo"
                    value={form.nome}
                    onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="CPF">
                  <input
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(e) => setForm((s) => ({ ...s, cpf: maskCPF(e.target.value) }))}
                    style={input}
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Celular">
                  <input
                    placeholder="(00) 0 0000-0000"
                    value={form.celular}
                    onChange={(e) => setForm((s) => ({ ...s, celular: maskPhone(e.target.value) }))}
                    style={input}
                    inputMode="tel"
                  />
                </Field>

                <Field label="E-mail">
                  <input
                    placeholder="email@exemplo.com"
                    value={form.email}
                    type="email"
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Perfil">
                  <select
                    value={form.role}
                    onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as RoleUI }))}
                    style={input}
                  >
                    <option value="admin">Admin</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="operacoes">Operações</option>
                  </select>
                </Field>

                <Field label="Foto">
                  <div style={fileRow}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setForm((s) => ({ ...s, fotoFile: f, fotoPreview: f ? URL.createObjectURL(f) : null }));
                      }}
                    />
                    {form.fotoPreview && <img src={form.fotoPreview} alt="preview" style={avatarLg} />}
                  </div>
                </Field>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Endereço</h4>
              <div style={formGrid4}>
                <Field label="CEP">
                  <input
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(e) => setForm((s) => ({ ...s, cep: maskCEP(e.target.value) }))}
                    style={input}
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Logradouro">
                  <input
                    placeholder="Rua, avenida..."
                    value={form.logradouro}
                    onChange={(e) => setForm((s) => ({ ...s, logradouro: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Número">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      placeholder="Número"
                      value={form.sn ? "s/n" : form.numero}
                      disabled={form.sn}
                      onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
                      style={input}
                    />
                    <label style={checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={form.sn}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, sn: e.target.checked, numero: e.target.checked ? "" : s.numero }))
                        }
                      />
                      s/n
                    </label>
                  </div>
                </Field>

                <Field label="Bairro">
                  <input
                    placeholder="Bairro"
                    value={form.bairro}
                    onChange={(e) => setForm((s) => ({ ...s, bairro: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Cidade">
                  <input
                    placeholder="Cidade"
                    value={form.cidade}
                    onChange={(e) => setForm((s) => ({ ...s, cidade: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="UF">
                  <input
                    placeholder="UF"
                    value={form.uf}
                    onChange={(e) => setForm((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                    style={input}
                  />
                </Field>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Unidade e hierarquia</h4>
              <div style={formGrid3}>
                <Field label="Unidade">
                  <select
                    value={form.unit_id}
                    onChange={(e) => setForm((s) => ({ ...s, unit_id: e.target.value }))}
                    style={input}
                  >
                    <option value="">Selecione a unidade</option>
                    {activeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} — {u.tipo === "matriz" ? "Matriz" : "Filial"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Nível">
                  <select
                    value={form.hierarchy_level}
                    onChange={(e) => setForm((s) => ({ ...s, hierarchy_level: e.target.value as HierarchyLevel }))}
                    style={input}
                  >
                    <option value="usuario">Usuário / Vendedor</option>
                    <option value="gestor_filial">Gestor da Filial</option>
                  </select>
                </Field>

                <div style={infoBox}>{hierarchyHelp(form.unit_id, form.hierarchy_level)}</div>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>PIX e acessos</h4>
              <div style={formGrid3}>
                <Field label="Tipo da chave PIX">
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
                </Field>

                <Field label="Chave PIX">
                  <input
                    placeholder="Chave PIX"
                    value={form.pix_key}
                    onChange={(e) => setForm((s) => ({ ...s, pix_key: e.target.value }))}
                    style={input}
                  />
                </Field>
              </div>

              <div style={scopesBox}>
                <div style={{ fontWeight: 900, marginBottom: 4, gridColumn: "1 / -1" }}>Guias com acesso:</div>
                {scopeCheckboxes}
              </div>
            </div>

            <div style={modalActionsSticky}>
              <button onClick={() => setOpenCreate(false)} style={btnGhost}>
                Cancelar
              </button>
              <button onClick={submitCreate} disabled={creating} style={btnPrimary}>
                {creating ? "Cadastrando..." : "Cadastrar usuário"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCardLarge}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Editar usuário {editing.is_active === false ? "(INATIVO)" : ""}</h3>
                <p style={subtitleSmall}>Atualize dados, unidade, nível de acesso e escopos.</p>
              </div>
              <button onClick={closeEdit} style={btnGhost}>
                Fechar
              </button>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Dados principais</h4>
              <div style={formGrid3}>
                <Field label="Nome">
                  <input
                    placeholder="Nome"
                    value={editing.nome || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, nome: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="E-mail">
                  <input
                    placeholder="E-mail"
                    value={editing.email || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, email: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Perfil">
                  <select
                    value={editing.role_ui || roleToUI(editing.role)}
                    onChange={(e) => setEditing((s: any) => ({ ...s, role_ui: e.target.value as RoleUI }))}
                    style={input}
                  >
                    <option value="operacoes">Operações</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>

                <Field label="Celular">
                  <input
                    placeholder="Celular"
                    value={editing.celular || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, celular: maskPhone(e.target.value) }))}
                    style={input}
                  />
                </Field>

                <Field label="Foto">
                  <div style={fileRow}>
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
                    {(editing.fotoPreview || editing.avatar_url) && (
                      <img src={editing.fotoPreview || editing.avatar_url} alt="preview" style={avatarLg} />
                    )}
                  </div>
                </Field>

                <label style={checkboxCard}>
                  <input
                    type="checkbox"
                    checked={editing.is_active !== false}
                    onChange={(e) => setEditing((s: any) => ({ ...s, is_active: e.target.checked }))}
                  />
                  Usuário ativo
                </label>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Unidade e hierarquia</h4>
              <div style={formGrid3}>
                <Field label="Unidade">
                  <select
                    value={editing.unit_id || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, unit_id: e.target.value }))}
                    style={input}
                  >
                    <option value="">Selecione a unidade</option>
                    {activeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} — {u.tipo === "matriz" ? "Matriz" : "Filial"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Nível">
                  <select
                    value={editing.hierarchy_level || "usuario"}
                    onChange={(e) =>
                      setEditing((s: any) => ({ ...s, hierarchy_level: e.target.value as HierarchyLevel }))
                    }
                    style={input}
                  >
                    <option value="usuario">Usuário / Vendedor</option>
                    <option value="gestor_filial">Gestor da Filial</option>
                  </select>
                </Field>

                <div style={infoBox}>{hierarchyHelp(editing.unit_id || "", editing.hierarchy_level || "usuario")}</div>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>Endereço</h4>
              <div style={formGrid4}>
                <Field label="CEP">
                  <input
                    placeholder="CEP"
                    value={editing.cep || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, cep: maskCEP(e.target.value) }))}
                    style={input}
                  />
                </Field>

                <Field label="Logradouro">
                  <input
                    placeholder="Logradouro"
                    value={editing.logradouro || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, logradouro: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Número">
                  <input
                    placeholder="Número"
                    value={editing.numero || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, numero: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Bairro">
                  <input
                    placeholder="Bairro"
                    value={editing.bairro || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, bairro: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="Cidade">
                  <input
                    placeholder="Cidade"
                    value={editing.cidade || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, cidade: e.target.value }))}
                    style={input}
                  />
                </Field>

                <Field label="UF">
                  <input
                    placeholder="UF"
                    value={editing.uf || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                    style={input}
                  />
                </Field>
              </div>
            </div>

            <div style={formSection}>
              <h4 style={formSectionTitle}>PIX e acessos</h4>
              <div style={formGrid3}>
                <Field label="Tipo da chave PIX">
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
                </Field>

                <Field label="Chave PIX">
                  <input
                    placeholder="Chave PIX"
                    value={editing.pix_key || ""}
                    onChange={(e) => setEditing((s: any) => ({ ...s, pix_key: e.target.value }))}
                    style={input}
                  />
                </Field>
              </div>

              <div style={scopesBox}>
                <div style={{ fontWeight: 900, marginBottom: 4, gridColumn: "1 / -1" }}>Guias com acesso:</div>
                {ALL_SCOPES.map((k) => {
                  const checked = Array.isArray(editing.scopes) && editing.scopes.includes(k);
                  return (
                    <label key={k} style={checkboxCard}>
                      <input type="checkbox" checked={checked} onChange={() => toggleEditingScope(k)} />
                      <span style={{ textTransform: "capitalize" }}>{k.replace("_", " ")}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={modalActionsSticky}>
              <button onClick={closeEdit} style={btnGhost}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={savingEdit} style={btnPrimary}>
                {savingEdit ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div style={pageShell}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function UsersTable({
  loading,
  emptyText,
  colSpan,
  rows,
}: {
  loading: boolean;
  emptyText: string;
  colSpan: number;
  rows: React.ReactNode;
}) {
  const rowArray = React.Children.toArray(rows);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Foto</th>
            <th style={th}>Nome</th>
            <th style={th}>E-mail</th>
            <th style={th}>Perfil</th>
            <th style={th}>Unidade</th>
            <th style={th}>Nível</th>
            <th style={th}>Celular</th>
            <th style={th}>PIX</th>
            <th style={{ ...th, textAlign: "right" }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td style={td} colSpan={colSpan}>
                Carregando…
              </td>
            </tr>
          )}
          {!loading && rowArray.length > 0 && rowArray}
          {!loading && rowArray.length === 0 && (
            <tr>
              <td style={td} colSpan={colSpan}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------- estilos -------------------- */
const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  off: "#F5F5F5",
  ink: "#0F172A",
  muted: "#64748B",
  border: "#E5E7EB",
  bg: "#F8FAFC",
};

const pageShell: React.CSSProperties = {
  width: "min(1680px, calc(100vw - 52px))",
  margin: "32px auto",
  padding: "0 26px 48px",
  fontFamily: "Inter, system-ui, Arial",
  color: C.ink,
};

const heroCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  marginBottom: 16,
  padding: "18px 20px",
  borderRadius: 26,
  background: "rgba(255,255,255,.76)",
  border: `1px solid ${C.border}`,
  boxShadow: "0 22px 70px rgba(15, 23, 42, .06)",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.1,
  color: C.navy,
  letterSpacing: -0.6,
};

const subtitle: React.CSSProperties = {
  margin: "7px 0 0",
  color: C.muted,
  fontSize: 13,
};

const subtitleSmall: React.CSSProperties = {
  margin: "5px 0 0",
  color: C.muted,
  fontSize: 12,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  marginBottom: 14,
};

const toolbarStats: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const statPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "8px 11px",
  background: "#fff",
  border: `1px solid ${C.border}`,
  color: C.navy,
  fontWeight: 850,
  fontSize: 12,
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.92)",
  border: `1px solid ${C.border}`,
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 22px 70px rgba(15, 23, 42, .08)",
};

const cardWide: React.CSSProperties = {
  ...card,
  padding: 20,
};

const softPanel: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: 22,
  padding: 18,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const inactiveSectionBox: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 18,
  borderTop: `1px dashed ${C.border}`,
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1080,
  borderCollapse: "separate",
  borderSpacing: 0,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: `1px solid ${C.border}`,
  color: C.navy,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.04,
  background: "#F8FAFC",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "13px 14px",
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "middle",
  fontSize: 13,
  lineHeight: 1.25,
};

const tdAvatar: React.CSSProperties = {
  ...td,
  width: 58,
};

const tdName: React.CSSProperties = {
  ...td,
  minWidth: 210,
};

const tdAction: React.CSSProperties = {
  ...td,
  textAlign: "right",
  width: 96,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  borderRadius: 15,
  padding: "12px 13px",
  outline: "none",
  background: "#fff",
  color: C.ink,
  fontSize: 13,
};

const chipButton: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "12px 17px",
  color: "#fff",
  background: `linear-gradient(135deg, ${C.ruby}, ${C.navy})`,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 16px 34px rgba(161, 28, 39, .25)",
};

const btnPrimary: React.CSSProperties = {
  border: 0,
  borderRadius: 13,
  padding: "10px 13px",
  color: "#fff",
  background: C.navy,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnSecondary: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 999,
  padding: "11px 16px",
  color: C.navy,
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 13,
  padding: "9px 12px",
  color: C.navy,
  background: "#fff",
  fontWeight: 850,
  cursor: "pointer",
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(15,23,42,.45)",
  backdropFilter: "blur(8px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: "24px 18px",
  overflow: "auto",
};

const modalCardWide: React.CSSProperties = {
  width: "min(1240px, 100%)",
  background: "#fff",
  borderRadius: 28,
  padding: 22,
  boxShadow: "0 30px 90px rgba(0,0,0,.24)",
};

const modalCardLarge: React.CSSProperties = {
  width: "min(1360px, 100%)",
  background: "#fff",
  borderRadius: 28,
  padding: 22,
  boxShadow: "0 30px 90px rgba(0,0,0,.24)",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 16,
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  color: C.navy,
  fontSize: 22,
  letterSpacing: -0.3,
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const panelHint: React.CSSProperties = {
  color: C.muted,
  fontSize: 11,
  fontWeight: 700,
};

const formSection: React.CSSProperties = {
  padding: 16,
  border: `1px solid ${C.border}`,
  borderRadius: 22,
  background: "#fff",
  marginBottom: 14,
};

const formSectionTitle: React.CSSProperties = {
  margin: "0 0 13px",
  color: C.navy,
  fontSize: 15,
};

const formGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const formGrid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const formGrid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 2fr 1fr 1.3fr",
  gap: 12,
};

const unitManagerGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(360px, 450px) minmax(0, 1fr)",
  gap: 16,
};

const scopesBox: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 9,
  marginTop: 12,
  padding: 13,
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  background: C.bg,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: C.muted,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: 0.03,
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 13,
  color: C.ink,
  whiteSpace: "nowrap",
};

const checkboxCard: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 13,
  color: C.ink,
  padding: "9px 10px",
  border: `1px solid ${C.border}`,
  borderRadius: 13,
  background: "#fff",
};

const fileRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 46,
};

const modalActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 14,
  flexWrap: "wrap",
};

const modalActionsSticky: React.CSSProperties = {
  position: "sticky",
  bottom: -22,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  margin: "16px -22px -22px",
  padding: "14px 22px",
  background: "rgba(255,255,255,.92)",
  borderTop: `1px solid ${C.border}`,
  backdropFilter: "blur(10px)",
  borderRadius: "0 0 28px 28px",
};

const pagination: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 14,
  flexWrap: "wrap",
};

const avatar: React.CSSProperties = {
  width: 46,
  height: 46,
  objectFit: "cover",
  borderRadius: 16,
  border: `1px solid ${C.border}`,
};

const avatarLg: React.CSSProperties = {
  width: 58,
  height: 58,
  objectFit: "cover",
  borderRadius: 14,
  border: `1px solid ${C.border}`,
};

const avatarFallback: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 16,
  background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
  border: `1px solid ${C.border}`,
};

const inactiveRow: React.CSSProperties = {
  opacity: 0.58,
  backgroundColor: "#F9FAFB",
};

const inactiveBadge: React.CSSProperties = {
  display: "inline-flex",
  marginTop: 4,
  fontSize: 11,
  padding: "2px 7px",
  borderRadius: 999,
  border: `1px solid ${C.border}`,
  textTransform: "uppercase",
  letterSpacing: 0.02,
  color: C.muted,
};

const miniText: React.CSSProperties = {
  fontSize: 11,
  color: C.muted,
  marginTop: 2,
};

const hint: React.CSSProperties = {
  color: C.muted,
  fontSize: 12,
};

const warningText: React.CSSProperties = {
  color: C.ruby,
  fontSize: 12,
  fontWeight: 900,
};

const infoBox: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 15,
  padding: "11px 13px",
  background: "#FFF7ED",
  color: "#7C2D12",
  fontSize: 12,
  lineHeight: 1.35,
  minHeight: 42,
  display: "flex",
  alignItems: "center",
};

const unitList: React.CSSProperties = {
  display: "grid",
  gap: 9,
  maxHeight: 460,
  overflow: "auto",
  paddingRight: 4,
};

const unitRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 12,
  background: "#fff",
};

function roleBadge(role: string | null | undefined): React.CSSProperties {
  const r = String(role || "").toLowerCase();
  const isAdmin = r === "admin";
  const isVendedor = r === "vendedor";
  return {
    display: "inline-flex",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 950,
    color: isAdmin ? "#fff" : isVendedor ? C.navy : C.muted,
    background: isAdmin ? C.ruby : isVendedor ? "#E0E7FF" : "#F1F5F9",
    border: `1px solid ${isAdmin ? C.ruby : C.border}`,
    whiteSpace: "nowrap",
  };
}

function hierarchyBadge(level: string | null | undefined, unit?: Unit | null): React.CSSProperties {
  const isMatriz = unit?.tipo === "matriz";
  const isGestor = level === "gestor_filial";
  return {
    display: "inline-flex",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 950,
    color: isMatriz ? "#fff" : isGestor ? C.navy : C.muted,
    background: isMatriz ? C.navy : isGestor ? "#FEF3C7" : "#F1F5F9",
    border: `1px solid ${isMatriz ? C.navy : isGestor ? C.goldLight : C.border}`,
    whiteSpace: "nowrap",
  };
}
