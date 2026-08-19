import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Plus, Save, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACCESS_GROUPS,
  ACCESS_GUIDES,
  buildFullPermissionMatrix,
  type PermissionMatrix,
} from "@/access/permissionCatalog";
import { dispatchAccessUpdated, useAccess } from "@/access/AccessContext";

type AccessProfile = {
  id: string;
  name: string;
  description: string | null;
  permissions: PermissionMatrix;
  is_system: boolean;
  is_active: boolean;
};

type PartnerCategory = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  requirements: Record<string, number>;
  is_active: boolean;
};

type CrmUser = {
  id: string;
  auth_user_id: string;
  nome: string;
  email: string;
  role: string;
  unit_id: string | null;
  hierarchy_level: string | null;
  is_active: boolean;
};

type Unit = { id: string; nome: string; tipo: string };

type Assignment = {
  user_id: string;
  access_profile_id: string | null;
  partner_category_id: string | null;
  partner_category_since: string | null;
};

type AssignmentDraft = Assignment;

const EMPTY_MATRIX: PermissionMatrix = {};

const REQUIREMENT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "reunioes_treinamentos_mes", label: "Reuniões/treinamentos por mês" },
  { key: "prospeccoes_mes", label: "Prospecções por mês" },
  { key: "qualificacoes_mes", label: "Qualificações por mês" },
  { key: "simulacoes_mes", label: "Simulações por mês" },
  { key: "vendas_mes", label: "Vendas por mês" },
  { key: "compromisso_semanal_abordagens", label: "Abordagens por semana" },
];

function cloneMatrix(matrix: PermissionMatrix): PermissionMatrix {
  return JSON.parse(JSON.stringify(matrix || {}));
}

function countEnabled(matrix: PermissionMatrix) {
  let guides = 0;
  let infos = 0;
  let actions = 0;
  for (const guide of ACCESS_GUIDES) {
    const current = matrix[guide.key];
    if (current?.view) guides += 1;
    infos += Object.values(current?.information || {}).filter(Boolean).length;
    actions += Object.values(current?.actions || {}).filter(Boolean).length;
  }
  return { guides, infos, actions };
}

function normalizeMatrix(matrix: PermissionMatrix | null | undefined): PermissionMatrix {
  if (!matrix) return {};
  if (matrix["*"]) {
    const wildcard = matrix["*"];
    const expanded: PermissionMatrix = {};
    for (const guide of ACCESS_GUIDES) {
      expanded[guide.key] = {
        view: wildcard.view === true,
        information: Object.fromEntries(
          guide.information.map((item) => [item.key, wildcard.information?.["*"] === true]),
        ),
        actions: Object.fromEntries(
          guide.actions.map((item) => [item.key, wildcard.actions?.["*"] === true]),
        ),
      };
    }
    return expanded;
  }
  return cloneMatrix(matrix);
}

export default function PerfisUsuarios() {
  const navigate = useNavigate();
  const { isAdmin } = useAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [categories, setCategories] = useState<PartnerCategory[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [search, setSearch] = useState("");

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profilePermissions, setProfilePermissions] = useState<PermissionMatrix>(EMPTY_MATRIX);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [categoryOrder, setCategoryOrder] = useState(60);
  const [categoryRequirements, setCategoryRequirements] = useState<Record<string, number>>({});

  async function loadAll() {
    setLoading(true);
    try {
      const [pRes, cRes, uRes, unRes, aRes] = await Promise.all([
        supabase.from("access_profiles").select("id,name,description,permissions,is_system,is_active").order("name"),
        supabase.from("partner_categories").select("id,key,name,description,sort_order,requirements,is_active").order("sort_order"),
        supabase
          .from("users")
          .select("id,auth_user_id,nome,email,role,unit_id,hierarchy_level,is_active")
          .order("nome"),
        supabase.from("units").select("id,nome,tipo").order("nome"),
        supabase
          .from("user_access_assignments")
          .select("user_id,access_profile_id,partner_category_id,partner_category_since"),
      ]);

      if (pRes.error) throw pRes.error;
      if (cRes.error) throw cRes.error;
      if (uRes.error) throw uRes.error;
      if (unRes.error) throw unRes.error;
      if (aRes.error) throw aRes.error;

      setProfiles((pRes.data || []) as AccessProfile[]);
      setCategories((cRes.data || []) as PartnerCategory[]);
      setUsers((uRes.data || []) as CrmUser[]);
      setUnits((unRes.data || []) as Unit[]);
      const rows = (aRes.data || []) as Assignment[];
      setAssignments(rows);
      const byUser = new Map(rows.map((row) => [row.user_id, row]));
      setAssignmentDrafts(
        Object.fromEntries(
          ((uRes.data || []) as CrmUser[]).map((user) => [
            user.id,
            byUser.get(user.id) || {
              user_id: user.id,
              access_profile_id: null,
              partner_category_id: null,
              partner_category_since: null,
            },
          ]),
        ),
      );
    } catch (e: any) {
      console.error("[PerfisUsuarios] load", e);
      alert(e?.message || "Falha ao carregar perfis e usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const unitMap = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => `${user.nome} ${user.email} ${user.role}`.toLowerCase().includes(q));
  }, [search, users]);

  const currentProfile = profiles.find((profile) => profile.id === editingProfileId) || null;
  const profileStats = countEnabled(profilePermissions);

  function startNewProfile() {
    setEditingProfileId(null);
    setProfileName("");
    setProfileDescription("");
    setProfilePermissions({});
  }

  function editProfile(profile: AccessProfile) {
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setProfileDescription(profile.description || "");
    setProfilePermissions(normalizeMatrix(profile.permissions));
  }

  function duplicateProfile(profile: AccessProfile) {
    setEditingProfileId(null);
    setProfileName(`${profile.name} - Cópia`);
    setProfileDescription(profile.description || "");
    setProfilePermissions(normalizeMatrix(profile.permissions));
  }

  function setGuideView(guideKey: string, checked: boolean) {
    setProfilePermissions((current) => {
      const next = cloneMatrix(current);
      const guide = ACCESS_GUIDES.find((item) => item.key === guideKey)!;
      next[guideKey] = next[guideKey] || {};
      next[guideKey].view = checked;
      if (checked) {
        next[guideKey].information = next[guideKey].information || {};
        next[guideKey].actions = next[guideKey].actions || {};
      } else {
        next[guideKey].information = Object.fromEntries(guide.information.map((item) => [item.key, false]));
        next[guideKey].actions = Object.fromEntries(guide.actions.map((item) => [item.key, false]));
      }
      return next;
    });
  }

  function setPermission(guideKey: string, kind: "information" | "actions", key: string, checked: boolean) {
    setProfilePermissions((current) => {
      const next = cloneMatrix(current);
      next[guideKey] = next[guideKey] || { view: true };
      next[guideKey].view = true;
      next[guideKey][kind] = { ...(next[guideKey][kind] || {}), [key]: checked };
      return next;
    });
  }

  function setGuideAll(guideKey: string, kind: "information" | "actions", checked: boolean) {
    const guide = ACCESS_GUIDES.find((item) => item.key === guideKey)!;
    setProfilePermissions((current) => {
      const next = cloneMatrix(current);
      next[guideKey] = next[guideKey] || { view: true };
      next[guideKey].view = true;
      const list = kind === "information" ? guide.information : guide.actions;
      next[guideKey][kind] = Object.fromEntries(list.map((item) => [item.key, checked]));
      return next;
    });
  }

  async function saveProfile() {
    if (!isAdmin) return alert("Somente Administradores podem gerenciar Perfis de Usuário.");
    if (!profileName.trim()) return alert("Informe o nome do perfil.");
    if (currentProfile?.is_system) return alert("Perfis sistêmicos não podem ser alterados. Duplique-o para criar uma versão personalizada.");

    setSaving(true);
    try {
      const payload = {
        name: profileName.trim(),
        description: profileDescription.trim() || null,
        permissions: profilePermissions,
        is_active: true,
      };
      if (editingProfileId) {
        const { error } = await supabase.from("access_profiles").update(payload).eq("id", editingProfileId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("access_profiles").insert(payload);
        if (error) throw error;
      }
      await loadAll();
      dispatchAccessUpdated();
      alert("Perfil salvo com sucesso.");
    } catch (e: any) {
      alert(e?.message || "Falha ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(profile: AccessProfile) {
    if (!isAdmin) return;
    if (profile.is_system) return alert("Perfis sistêmicos não podem ser excluídos.");
    const used = assignments.filter((assignment) => assignment.access_profile_id === profile.id).length;
    const message = used
      ? `Este perfil está atribuído a ${used} usuário(s). Ao excluir, eles voltarão ao acesso legado até receberem outro perfil. Continuar?`
      : `Excluir o perfil “${profile.name}”?`;
    if (!window.confirm(message)) return;
    const { error } = await supabase.from("access_profiles").delete().eq("id", profile.id);
    if (error) return alert(error.message);
    startNewProfile();
    await loadAll();
    dispatchAccessUpdated();
  }

  function startNewCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryDescription("");
    setCategoryKey("");
    setCategoryOrder(60);
    setCategoryRequirements({});
  }

  function editCategory(category: PartnerCategory) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryDescription(category.description || "");
    setCategoryKey(category.key);
    setCategoryOrder(category.sort_order || 0);
    setCategoryRequirements(category.requirements || {});
  }

  async function saveCategory() {
    if (!isAdmin) return alert("Somente Administradores podem gerenciar categorias.");
    if (!categoryName.trim()) return alert("Informe o nome da categoria.");
    const normalizedKey = (categoryKey || categoryName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    setSaving(true);
    try {
      const payload = {
        key: normalizedKey,
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        sort_order: Number(categoryOrder || 0),
        requirements: categoryRequirements,
        is_active: true,
      };
      if (editingCategoryId) {
        const { error } = await supabase.from("partner_categories").update(payload).eq("id", editingCategoryId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_categories").insert(payload);
        if (error) throw error;
      }
      await loadAll();
      alert("Categoria salva com sucesso.");
    } catch (e: any) {
      alert(e?.message || "Falha ao salvar categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: PartnerCategory) {
    if (!isAdmin) return;
    const used = assignments.filter((assignment) => assignment.partner_category_id === category.id).length;
    const message = used
      ? `A categoria “${category.name}” está atribuída a ${used} usuário(s). Ao excluir, a categoria será removida dessas atribuições. Continuar?`
      : `Excluir a categoria “${category.name}”?`;
    if (!window.confirm(message)) return;
    const { error } = await supabase.from("partner_categories").delete().eq("id", category.id);
    if (error) return alert(error.message);
    startNewCategory();
    await loadAll();
  }

  function updateAssignmentDraft(userId: string, patch: Partial<AssignmentDraft>) {
    setAssignmentDrafts((current) => ({
      ...current,
      [userId]: { ...(current[userId] || { user_id: userId }), ...patch } as AssignmentDraft,
    }));
  }

  async function saveAssignment(userId: string) {
    if (!isAdmin) return alert("Somente Administradores podem alterar atribuições.");
    const draft = assignmentDrafts[userId];
    if (!draft) return;
    setSaving(true);
    try {
      const hasAnything = Boolean(draft.access_profile_id || draft.partner_category_id || draft.partner_category_since);
      if (!hasAnything) {
        const { error } = await supabase.from("user_access_assignments").delete().eq("user_id", userId);
        if (error) throw error;
      } else {
        const categoryChanged = assignments.find((item) => item.user_id === userId)?.partner_category_id !== draft.partner_category_id;
        const payload = {
          user_id: userId,
          access_profile_id: draft.access_profile_id || null,
          partner_category_id: draft.partner_category_id || null,
          partner_category_since: draft.partner_category_id
            ? draft.partner_category_since || (categoryChanged ? new Date().toISOString().slice(0, 10) : null)
            : null,
        };
        const { error } = await supabase.from("user_access_assignments").upsert(payload, { onConflict: "user_id" });
        if (error) throw error;
      }
      await loadAll();
      dispatchAccessUpdated();
    } catch (e: any) {
      alert(e?.message || "Falha ao salvar atribuição.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-[55vh] place-items-center text-sm font-semibold text-slate-500">Carregando perfis…</div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-10">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-[#A11C27]">
            <ShieldCheck className="h-4 w-4" /> Usuários e Segurança
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Perfis de Usuário</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Defina quais guias aparecem para cada perfil e, dentro de cada guia, quais informações podem ser vistas e quais ações podem ser executadas.
            A cascata hierárquica continua definindo de quais pessoas o usuário pode enxergar dados.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/usuarios")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Usuários
        </Button>
      </div>

      <Tabs defaultValue="profiles" className="space-y-4">
        <TabsList className="h-auto flex-wrap bg-white/90 p-1 shadow-sm">
          <TabsTrigger value="profiles">Perfis de Acesso</TabsTrigger>
          <TabsTrigger value="categories">Categorias do Parceiro</TabsTrigger>
          <TabsTrigger value="assignments">Atribuições aos Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="bg-white/95">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Perfis cadastrados</CardTitle>
                  <Button size="sm" variant="outline" onClick={startNewProfile}><Plus className="mr-1 h-4 w-4" /> Novo</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => editProfile(profile)}
                    className={`w-full rounded-xl border p-3 text-left transition ${editingProfileId === profile.id ? "border-[#A11C27] bg-[#A11C27]/5" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900">{profile.name}</span>
                      {profile.is_system ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">Sistema</span> : null}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{profile.description || "Sem descrição"}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white/95">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>{editingProfileId ? "Configurar Perfil" : "Novo Perfil"}</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">O acesso à guia é o primeiro nível. As permissões internas só valem quando a guia estiver liberada.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentProfile ? <Button size="sm" variant="outline" onClick={() => duplicateProfile(currentProfile)}><Copy className="mr-1 h-4 w-4" /> Duplicar</Button> : null}
                    {currentProfile && !currentProfile.is_system ? <Button size="sm" variant="outline" onClick={() => deleteProfile(currentProfile)}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button> : null}
                    <Button size="sm" disabled={saving || currentProfile?.is_system} onClick={saveProfile}><Save className="mr-1 h-4 w-4" /> Salvar perfil</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {currentProfile?.is_system ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Este é um perfil sistêmico protegido. Use <strong>Duplicar</strong> para criar uma versão personalizada.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Nome do Perfil</Label><Input className="mt-1" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Ex.: Operações" disabled={currentProfile?.is_system} /></div>
                  <div><Label>Descrição</Label><Input className="mt-1" value={profileDescription} onChange={(e) => setProfileDescription(e.target.value)} placeholder="Quem deve usar este perfil" disabled={currentProfile?.is_system} /></div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-bold text-slate-500">Guias liberadas</div><div className="text-xl font-black">{profileStats.guides}/{ACCESS_GUIDES.length}</div></div>
                  <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-bold text-slate-500">Informações visíveis</div><div className="text-xl font-black">{profileStats.infos}</div></div>
                  <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-bold text-slate-500">Ações permitidas</div><div className="text-xl font-black">{profileStats.actions}</div></div>
                </div>

                {!currentProfile?.is_system ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setProfilePermissions(buildFullPermissionMatrix())}>Liberar tudo</Button>
                    <Button size="sm" variant="outline" onClick={() => setProfilePermissions({})}>Limpar tudo</Button>
                  </div>
                ) : null}

                <div className="space-y-5">
                  {ACCESS_GROUPS.map((group) => (
                    <section key={group.key} className="space-y-2">
                      <div className="text-sm font-black uppercase tracking-wide text-[#1E293F]">{group.label}</div>
                      {ACCESS_GUIDES.filter((guide) => guide.group === group.key).map((guide) => {
                        const permission = profilePermissions[guide.key] || {};
                        const disabled = currentProfile?.is_system === true;
                        return (
                          <details key={guide.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white" open={permission.view === true}>
                            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 hover:bg-slate-50">
                              <Checkbox checked={permission.view === true} disabled={disabled} onCheckedChange={(value) => setGuideView(guide.key, value === true)} onClick={(e) => e.stopPropagation()} />
                              <div className="min-w-0 flex-1">
                                <div className="font-extrabold text-slate-900">{guide.label}</div>
                                <div className="mt-0.5 text-xs text-slate-500">{guide.description}</div>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-[10px] font-black ${permission.view ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{permission.view ? "NO MENU" : "OCULTA"}</span>
                            </summary>
                            {permission.view ? (
                              <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-2">
                                <div>
                                  <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Informações visíveis</span>{guide.information.length ? <button type="button" className="text-xs font-bold text-[#A11C27]" disabled={disabled} onClick={() => setGuideAll(guide.key, "information", true)}>Marcar todas</button> : null}</div>
                                  <div className="space-y-2">
                                    {guide.information.length ? guide.information.map((item) => (
                                      <label key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2.5 text-sm"><Checkbox checked={permission.information?.[item.key] === true} disabled={disabled} onCheckedChange={(value) => setPermission(guide.key, "information", item.key, value === true)} /><span>{item.label}</span></label>
                                    )) : <div className="text-xs text-slate-400">Sem subdivisões de informação.</div>}
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Ações permitidas</span>{guide.actions.length ? <button type="button" className="text-xs font-bold text-[#A11C27]" disabled={disabled} onClick={() => setGuideAll(guide.key, "actions", true)}>Marcar todas</button> : null}</div>
                                  <div className="space-y-2">
                                    {guide.actions.length ? guide.actions.map((item) => (
                                      <label key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2.5 text-sm"><Checkbox checked={permission.actions?.[item.key] === true} disabled={disabled} onCheckedChange={(value) => setPermission(guide.key, "actions", item.key, value === true)} /><span>{item.label}</span></label>
                                    )) : <div className="text-xs text-slate-400">Esta guia é essencialmente consultiva.</div>}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </details>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="bg-white/95">
              <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Categorias do Programa</CardTitle><Button size="sm" variant="outline" onClick={startNewCategory}><Plus className="mr-1 h-4 w-4" /> Nova</Button></div></CardHeader>
              <CardContent className="space-y-2">
                {categories.map((category) => <button key={category.id} type="button" onClick={() => editCategory(category)} className={`w-full rounded-xl border p-3 text-left ${editingCategoryId === category.id ? "border-[#A11C27] bg-[#A11C27]/5" : "border-slate-200 hover:bg-slate-50"}`}><div className="font-extrabold text-slate-900">{category.name}</div><div className="mt-1 text-xs text-slate-500">Nível {category.sort_order} • {category.description || "Sem descrição"}</div></button>)}
              </CardContent>
            </Card>
            <Card className="bg-white/95">
              <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{editingCategoryId ? "Editar categoria" : "Nova categoria"}</CardTitle><p className="mt-1 text-xs text-slate-500">A categoria é comercial e não altera permissões nem a cascata do usuário.</p></div><div className="flex gap-2">{editingCategoryId ? <Button size="sm" variant="outline" onClick={() => { const c = categories.find((x) => x.id === editingCategoryId); if (c) deleteCategory(c); }}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button> : null}<Button size="sm" disabled={saving} onClick={saveCategory}><Save className="mr-1 h-4 w-4" /> Salvar</Button></div></div></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3"><div><Label>Nome</Label><Input className="mt-1" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Ex.: Partner Estratégico" /></div><div><Label>Chave interna</Label><Input className="mt-1" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} placeholder="Gerada pelo nome" /></div><div><Label>Ordem/Nível</Label><Input className="mt-1" type="number" value={categoryOrder} onChange={(e) => setCategoryOrder(Number(e.target.value))} /></div></div>
                <div><Label>Descrição</Label><Input className="mt-1" value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} /></div>
                <div><div className="mb-2 font-extrabold text-slate-900">Critérios mensais/semanais da categoria</div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{REQUIREMENT_FIELDS.map((field) => <div key={field.key}><Label>{field.label}</Label><Input className="mt-1" type="number" min={0} value={categoryRequirements[field.key] ?? ""} onChange={(e) => setCategoryRequirements((current) => ({ ...current, [field.key]: e.target.value === "" ? 0 : Number(e.target.value) }))} /></div>)}</div></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <Card className="bg-white/95">
            <CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" /> Atribuições aos Usuários</CardTitle><p className="mt-1 text-xs text-slate-500">Perfil de acesso define o que pode ver/fazer. Categoria define o nível no Programa de Parceiros. Unidade e hierarquia continuam definindo a cascata.</p></div><Input className="md:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuário…" /></div></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Usuário</th><th className="p-3">Unidade / Cascata</th><th className="p-3">Perfil de acesso</th><th className="p-3">Categoria do parceiro</th><th className="p-3">Na categoria desde</th><th className="p-3 text-right">Ação</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((user) => {
                      const draft = assignmentDrafts[user.id] || { user_id: user.id, access_profile_id: null, partner_category_id: null, partner_category_since: null };
                      const unit = user.unit_id ? unitMap.get(user.unit_id) : null;
                      return <tr key={user.id} className={user.is_active === false ? "opacity-50" : ""}><td className="p-3"><div className="font-extrabold text-slate-900">{user.nome}</div><div className="text-xs text-slate-500">{user.email} • {user.role}</div></td><td className="p-3"><div className="font-semibold">{unit?.nome || "Sem unidade"}</div><div className="text-xs text-slate-500">{user.hierarchy_level || "usuario"}</div></td><td className="p-3"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-2" value={draft.access_profile_id || ""} onChange={(e) => updateAssignmentDraft(user.id, { access_profile_id: e.target.value || null })}><option value="">Acesso legado atual</option>{profiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></td><td className="p-3"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-2" value={draft.partner_category_id || ""} onChange={(e) => updateAssignmentDraft(user.id, { partner_category_id: e.target.value || null })}><option value="">Não se aplica</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td><td className="p-3"><Input type="date" value={draft.partner_category_since || ""} disabled={!draft.partner_category_id} onChange={(e) => updateAssignmentDraft(user.id, { partner_category_since: e.target.value || null })} /></td><td className="p-3 text-right"><Button size="sm" disabled={saving} onClick={() => saveAssignment(user.id)}><Save className="mr-1 h-4 w-4" /> Salvar</Button></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
