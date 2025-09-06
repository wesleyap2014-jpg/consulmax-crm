// src/pages/Parametros.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ======================== Tipos ======================== */
type SettingsT = {
  id?: string;
  nome_corretora: string;
  slogan: string;
  logo_url?: string | null;
  taxa_padrao?: number | null;
  indice_atualizacao?: string | null;
};

type Administradora = {
  id?: string;
  nome: string;
  ativa: boolean;
  email?: string | null;
};

type Segmento = { id?: string; nome: string; ativo: boolean };

type TabelaProduto = {
  id?: string;
  segmento_id: string;
  nome_tabela: string;
  prazos: number[];
  comissao_gestor?: number | null;
  comissao_vendedor?: number | null;
  fluxo_pagamento?: string | null;
  segmento_nome?: string; // só para UI
};

type RegrasLance = { id?: string; aceita_25: boolean; aceita_50: boolean; usar_mediana: boolean };

type PerfilPolitica = {
  id?: string;
  perfil: string;
  permissoes: Record<string, boolean>;
  comissionamento: { base: "credito" | "lance" | "ambos"; percentual: number };
};

type Integracoes = {
  id?: string;
  whatsapp_api_key?: string | null;
  email_smtp_host?: string | null;
  email_user?: string | null;
  email_from?: string | null;
  loteria_integrado: boolean;
};

/** ======================== Utils ======================== */
const notify = (m: string) => alert(m);
const pct = (n?: number | null) => (typeof n === "number" ? `${n.toFixed(2)}%` : "—");
const prazosStr = (arr: number[]) => (arr?.length ? arr.join(", ") : "—");

/** ======================== Página ======================== */
export default function Parametros() {
  const [tab, setTab] = useState<"gerais" | "admins" | "segmentos" | "lances" | "perfis" | "integracoes">("gerais");
  const [loading, setLoading] = useState(false);

  // Gerais
  const [settings, setSettings] = useState<SettingsT>({
    nome_corretora: "",
    slogan: "",
    logo_url: "",
    taxa_padrao: null,
    indice_atualizacao: "",
  });
  const [logoUploading, setLogoUploading] = useState(false);

  // Administradoras
  const [administradoras, setAdministradoras] = useState<Administradora[]>([]);
  const [adminEdit, setAdminEdit] = useState<Administradora | null>(null);

  // Segmentos / Tabelas
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [segEdit, setSegEdit] = useState<Segmento | null>(null);

  const [tabelas, setTabelas] = useState<TabelaProduto[]>([]);
  const [tabelaEdit, setTabelaEdit] = useState<TabelaProduto | null>(null);

  // Regras
  const [regras, setRegras] = useState<RegrasLance>({ aceita_25: true, aceita_50: true, usar_mediana: true });

  // Perfis
  const [perfis, setPerfis] = useState<PerfilPolitica[]>([]);
  const [perfilEdit, setPerfilEdit] = useState<PerfilPolitica | null>(null);

  // Integrações
  const [integracoes, setIntegracoes] = useState<Integracoes>({
    whatsapp_api_key: "",
    email_smtp_host: "",
    email_user: "",
    email_from: "",
    loteria_integrado: false,
  });

  /** ======================== Load Inicial ======================== */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // settings (single row)
        const { data: s, error: sErr } = await supabase.from("settings").select("*").limit(1).maybeSingle();
        if (sErr && sErr.code !== "PGRST116") throw sErr;
        if (s) setSettings(s);

        // admins
        const { data: a, error: aErr } = await supabase
          .from("admins")
          .select("id, nome, ativa, email")
          .order("nome", { ascending: true });
        if (aErr) throw aErr;
        setAdministradoras(a || []);

        // segmentos
        const { data: segs, error: segErr } = await supabase
          .from("segmentos")
          .select("id, nome, ativo")
          .order("nome", { ascending: true });
        if (segErr) throw segErr;
        setSegmentos(segs || []);

        // tabelas
        const { data: tabs, error: tabsErr } = await supabase.from("tabelas_produto").select("*");
        if (tabsErr) throw tabsErr;
        const segMap = new Map((segs || []).map((x) => [x.id, x.nome]));
        const decorated = (tabs || []).map((t: any) => ({ ...t, segmento_nome: segMap.get(t.segmento_id) || "" }));
        setTabelas(decorated);

        // regras (single row)
        const { data: r, error: rErr } = await supabase.from("regras_lance").select("*").limit(1).maybeSingle();
        if (rErr && rErr.code !== "PGRST116") throw rErr;
        if (r) setRegras(r);

        // perfis
        const { data: pf, error: pfErr } = await supabase.from("perfis_politicas").select("*");
        if (pfErr) throw pfErr;
        setPerfis(pf || []);

        // integracoes (single row)
        const { data: integ, error: iErr } = await supabase.from("integracoes").select("*").limit(1).maybeSingle();
        if (iErr && iErr.code !== "PGRST116") throw iErr;
        if (integ) setIntegracoes(integ);
      } catch (e: any) {
        notify(`Erro ao carregar: ${e.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** ======================== Ações ======================== */
  // Upload de logo
  const handleLogoUpload = async (file: File) => {
    try {
      setLogoUploading(true);
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `logo-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("logos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub, error: pubErr } = supabase.storage.from("logos").getPublicUrl(path);
      if (pubErr) throw pubErr;
      setSettings((s) => ({ ...s, logo_url: pub?.publicUrl || "" }));
      notify("Logo enviada. Clique em Salvar para persistir nas configurações.");
    } catch (e: any) {
      notify(`Falha no upload: ${e.message ?? e}`);
    } finally {
      setLogoUploading(false);
    }
  };

  // Settings
  const saveSettings = async () => {
    try {
      const payload: SettingsT = {
        ...settings,
        logo_url: settings.logo_url || null,
        taxa_padrao: settings.taxa_padrao ?? null,
        indice_atualizacao: settings.indice_atualizacao || null,
      };
      const { error } = await supabase.from("settings").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      notify("Configurações salvas.");
    } catch (e: any) {
      notify(`Erro: ${e.message ?? e}`);
    }
  };

  // Administradoras
  const startNewAdmin = () => setAdminEdit({ nome: "", ativa: true, email: "" });
  const upsertAdministradora = async (adm: Administradora) => {
    try {
      const payload = { ...adm, email: adm.email || null };
      const { error } = await supabase.from("admins").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      const { data } = await supabase.from("admins").select("id, nome, ativa, email").order("nome");
      setAdministradoras(data || []);
      setAdminEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar administradora: ${e.message ?? e}`);
    }
  };
  const toggleAdministradora = async (adm: Administradora) => {
    await upsertAdministradora({ ...(adm as any), ativa: !adm.ativa });
  };
  const deleteAdministradora = async (id?: string) => {
    if (!id || !confirm("Excluir administradora?")) return;
    try {
      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) throw error;
      setAdministradoras((x) => x.filter((y) => y.id !== id));
    } catch (e: any) {
      notify(`Erro ao excluir: ${e.message ?? e}`);
    }
  };

  // Segmentos
  const startNewSegmento = () => setSegEdit({ nome: "", ativo: true });
  const upsertSegmento = async (s: Segmento) => {
    try {
      const { error } = await supabase.from("segmentos").upsert(s, { onConflict: "id" });
      if (error) throw error;
      const { data } = await supabase.from("segmentos").select("id, nome, ativo").order("nome");
      setSegmentos(data || []);
      setSegEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar segmento: ${e.message ?? e}`);
    }
  };
  const toggleSegmento = async (s: Segmento) => upsertSegmento({ ...(s as any), ativo: !s.ativo });
  const deleteSegmento = async (id?: string) => {
    if (!id || !confirm("Excluir segmento?")) return;
    try {
      const { error } = await supabase.from("segmentos").delete().eq("id", id);
      if (error) throw error;
      setSegmentos((x) => x.filter((y) => y.id !== id));
    } catch (e: any) {
      notify(`Erro ao excluir: ${e.message ?? e}`);
    }
  };

  // Tabelas
  const startNewTabela = () =>
    setTabelaEdit({
      segmento_id: "",
      nome_tabela: "",
      prazos: [],
      comissao_gestor: null,
      comissao_vendedor: null,
      fluxo_pagamento: "",
    });
  const upsertTabela = async (t: TabelaProduto) => {
    try {
      const payload = {
        ...t,
        prazos: t.prazos?.length ? t.prazos : [],
        comissao_gestor: t.comissao_gestor ?? null,
        comissao_vendedor: t.comissao_vendedor ?? null,
        fluxo_pagamento: t.fluxo_pagamento || null,
      };
      const { error } = await supabase.from("tabelas_produto").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      const { data: tabs } = await supabase.from("tabelas_produto").select("*");
      const segMap = new Map(segmentos.map((s) => [s.id, s.nome]));
      const decorated = (tabs || []).map((x: any) => ({ ...x, segmento_nome: segMap.get(x.segmento_id) || "" }));
      setTabelas(decorated);
      setTabelaEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar tabela: ${e.message ?? e}`);
    }
  };
  const deleteTabela = async (id?: string) => {
    if (!id || !confirm("Excluir tabela?")) return;
    try {
      const { error } = await supabase.from("tabelas_produto").delete().eq("id", id);
      if (error) throw error;
      setTabelas((x) => x.filter((y) => y.id !== id));
    } catch (e: any) {
      notify(`Erro ao excluir: ${e.message ?? e}`);
    }
  };

  // Regras
  const saveRegras = async () => {
    try {
      const { error } = await supabase.from("regras_lance").upsert(regras, { onConflict: "id" });
      if (error) throw error;
      notify("Regras salvas.");
    } catch (e: any) {
      notify(`Erro: ${e.message ?? e}`);
    }
  };

  // Perfis
  const startNewPerfil = () =>
    setPerfilEdit({
      perfil: "",
      permissoes: {
        Leads: true,
        Vendedores: true,
        Oportunidades: true,
        Carteira: true,
        "Gestão de Grupos": true,
        "Parâmetros/Admin": true,
      },
      comissionamento: { base: "credito", percentual: 2.5 },
    });
  const upsertPerfil = async (p: PerfilPolitica) => {
    try {
      const { error } = await supabase.from("perfis_politicas").upsert(p, { onConflict: "id" });
      if (error) throw error;
      const { data } = await supabase.from("perfis_politicas").select("*");
      setPerfis(data || []);
      setPerfilEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar perfil: ${e.message ?? e}`);
    }
  };
  const deletePerfil = async (id?: string) => {
    if (!id || !confirm("Excluir perfil/política?")) return;
    try {
      const { error } = await supabase.from("perfis_politicas").delete().eq("id", id);
      if (error) throw error;
      setPerfis((x) => x.filter((y) => y.id !== id));
    } catch (e: any) {
      notify(`Erro ao excluir: ${e.message ?? e}`);
    }
  };

  // Integrações
  const saveIntegracoes = async () => {
    try {
      const { error } = await supabase.from("integracoes").upsert(integracoes, { onConflict: "id" });
      if (error) throw error;
      notify("Integrações salvas.");
    } catch (e: any) {
      notify(`Erro: ${e.message ?? e}`);
    }
  };

  /** ======================== UI helpers ======================== */
  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 rounded-xl text-sm ${
        tab === id ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );

  /** ======================== Render ======================== */
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Parâmetros / Admin</h1>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
        >
          Recarregar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabBtn id="gerais" label="Configurações Gerais" />
        <TabBtn id="admins" label="Administradoras" />
        <TabBtn id="segmentos" label="Produtos/Segmentos" />
        <TabBtn id="lances" label="Regras de Lance" />
        <TabBtn id="perfis" label="Usuários & Perfis" />
        <TabBtn id="integracoes" label="Integrações" />
      </div>

      {/* =================== Configurações Gerais =================== */}
      {tab === "gerais" && (
        <section className="border rounded-2xl p-4 space-y-4 bg-white">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm">Nome da Corretora</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={settings.nome_corretora}
                onChange={(e) => setSettings((s) => ({ ...s, nome_corretora: e.target.value }))}
                placeholder="Consulmax Consórcios"
              />
            </div>
            <div>
              <label className="text-sm">Slogan</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={settings.slogan}
                onChange={(e) => setSettings((s) => ({ ...s, slogan: e.target.value }))}
                placeholder="Maximize as suas conquistas."
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm">Logotipo</label>
              <div className="flex gap-2 mt-1">
                <input
                  className="flex-1 border rounded-lg px-3 py-2"
                  value={settings.logo_url ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, logo_url: e.target.value }))}
                  placeholder="https://.../logo.png"
                />
                <input
                  id="logoFile"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoUpload(f);
                  }}
                />
                <label
                  htmlFor="logoFile"
                  className={`px-3 py-2 rounded-xl border cursor-pointer ${
                    logoUploading ? "opacity-60 pointer-events-none" : "hover:bg-gray-50"
                  }`}
                >
                  {logoUploading ? "Enviando..." : "Upload"}
                </label>
              </div>
              {settings.logo_url ? (
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-12 w-12 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <img src={settings.logo_url} className="h-12 w-12 object-contain" />
                  </div>
                  <div className="text-xs text-gray-500 truncate">{settings.logo_url}</div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-500">Nenhuma logo enviada.</div>
              )}
            </div>
            <div>
              <label className="text-sm">Taxa Padrão (%)</label>
              <input
                type="number"
                step="0.01"
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={settings.taxa_padrao ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, taxa_padrao: e.target.value === "" ? null : Number(e.target.value) }))
                }
                placeholder="2.50"
              />
            </div>
          </div>

          <div>
            <label className="text-sm">Índice de Atualização</label>
            <input
              className="w-full mt-1 border rounded-lg px-3 py-2"
              value={settings.indice_atualizacao ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, indice_atualizacao: e.target.value }))}
              placeholder="IPCA, INCC..."
            />
          </div>

          <button onClick={saveSettings} className="px-4 py-2 rounded-xl bg-blue-600 text-white">
            Salvar
          </button>
        </section>
      )}

      {/* =================== Administradoras =================== */}
      {tab === "admins" && (
        <section className="border rounded-2xl p-4 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Cadastre, edite e ative/inative administradoras.</p>
            <button
              className="px-3 py-2 rounded-xl bg-blue-600 text-white"
              onClick={() => setAdminEdit({ nome: "", ativa: true, email: "" })}
            >
              Nova Administradora
            </button>
          </div>

          {adminEdit && (
            <div className="border rounded-xl p-4 bg-gray-50">
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm">Nome</label>
                  <input
                    className="w-full mt-1 border rounded-lg px-3 py-2"
                    value={adminEdit.nome ?? ""}
                    onChange={(e) => setAdminEdit((s) => ({ ...(s as any), nome: e.target.value }))}
                    placeholder="Embracon"
                  />
                </div>
                <div>
                  <label className="text-sm">E-mail (opcional)</label>
                  <input
                    type="email"
                    className="w-full mt-1 border rounded-lg px-3 py-2"
                    value={adminEdit.email ?? ""}
                    onChange={(e) => setAdminEdit((s) => ({ ...(s as any), email: e.target.value }))}
                    placeholder="contato@administradora.com.br"
                  />
                </div>
                <div>
                  <label className="text-sm">Status</label>
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!adminEdit.ativa}
                        onChange={(e) => setAdminEdit((s) => ({ ...(s as any), ativa: e.target.checked }))}
                      />
                      Ativa
                    </label>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-2 rounded-xl border" onClick={() => setAdminEdit(null)}>
                  Cancelar
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white"
                  onClick={() => adminEdit && upsertAdministradora(adminEdit)}
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {administradoras.map((adm) => (
              <div key={adm.id} className="border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{adm.nome}</div>
                    {adm.email && <div className="text-xs text-gray-500">{adm.email}</div>}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${adm.ativa ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
                  >
                    {adm.ativa ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded-xl border" onClick={() => setAdminEdit(adm)}>
                    Editar
                  </button>
                  <button className="px-3 py-1 rounded-xl border" onClick={() => toggleAdministradora(adm)}>
                    {adm.ativa ? "Inativar" : "Ativar"}
                  </button>
                  <button className="px-3 py-1 rounded-xl bg-red-600 text-white" onClick={() => deleteAdministradora(adm.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {!administradoras.length && <p className="text-sm text-gray-500">Nenhuma administradora cadastrada.</p>}
          </div>
        </section>
      )}

      {/* =================== Segmentos + Tabelas =================== */}
      {tab === "segmentos" && (
        <section className="space-y-6">
          {/* Segmentos */}
          <div className="border rounded-2xl p-4 space-y-4 bg-white">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Cadastre segmentos (Imóvel, Automóvel, etc.).</p>
              <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={() => setSegEdit({ nome: "", ativo: true })}>
                Novo Segmento
              </button>
            </div>

            {segEdit && (
              <div className="border rounded-xl p-4 bg-gray-50">
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm">Nome</label>
                    <input
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={segEdit.nome ?? ""}
                      onChange={(e) => setSegEdit((s) => ({ ...(s as any), nome: e.target.value }))}
                      placeholder="Imóvel"
                    />
                  </div>
                  <div>
                    <label className="text-sm">Status</label>
                    <div className="mt-1">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!segEdit.ativo}
                          onChange={(e) => setSegEdit((s) => ({ ...(s as any), ativo: e.target.checked }))}
                        />
                        Ativo
                      </label>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 rounded-xl border" onClick={() => setSegEdit(null)}>
                    Cancelar
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={() => segEdit && upsertSegmento(segEdit)}>
                    Salvar
                  </button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {segmentos.map((s) => (
                <div key={s.id} className="border rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{s.nome}</div>
                    <span className={`text-xs px-2 py-1 rounded ${s.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {s.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded-xl border" onClick={() => setSegEdit(s)}>
                      Editar
                    </button>
                    <button className="px-3 py-1 rounded-xl border" onClick={() => toggleSegmento(s)}>
                      {s.ativo ? "Inativar" : "Ativar"}
                    </button>
                    <button className="px-3 py-1 rounded-xl bg-red-600 text-white" onClick={() => deleteSegmento(s.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {!segmentos.length && <p className="text-sm text-gray-500">Nenhum segmento cadastrado.</p>}
            </div>
          </div>

          {/* Tabelas / Prazos / Comissão */}
          <div className="border rounded-2xl p-4 space-y-4 bg-white">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Vincule tabelas a um Segmento.</p>
              <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={startNewTabela}>
                Nova Tabela
              </button>
            </div>

            {tabelaEdit && (
              <div className="border rounded-xl p-4 bg-gray-50">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm">Segmento</label>
                    <select
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={tabelaEdit.segmento_id ?? ""}
                      onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), segmento_id: e.target.value }))}
                    >
                      <option value="">Selecionar...</option>
                      {segmentos.map((s) => (
                        <option key={s.id} value={s.id as string}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Nome da Tabela</label>
                    <input
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={tabelaEdit.nome_tabela ?? ""}
                      onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), nome_tabela: e.target.value }))}
                      placeholder="Automóvel Select Mais"
                    />
                  </div>
                  <div>
                    <label className="text-sm">Prazos (separados por vírgula)</label>
                    <input
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={(tabelaEdit.prazos || []).join(",")}
                      onChange={(e) => {
                        const arr = e.target.value
                          .split(",")
                          .map((x) => Number(x.trim()))
                          .filter((n) => !Number.isNaN(n));
                        setTabelaEdit((t) => ({ ...(t as any), prazos: arr }));
                      }}
                      placeholder="60, 80, 120"
                    />
                  </div>
                  <div>
                    <label className="text-sm">Fluxo de Pagamento</label>
                    <input
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={tabelaEdit.fluxo_pagamento ?? ""}
                      onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), fluxo_pagamento: e.target.value }))}
                      placeholder="8 Pgto = 10/20/20/..."
                    />
                  </div>
                  <div>
                    <label className="text-sm">Comissão Gestor (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={tabelaEdit.comissao_gestor ?? ""}
                      onChange={(e) =>
                        setTabelaEdit((t) => ({
                          ...(t as any),
                          comissao_gestor: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="1.50"
                    />
                  </div>
                  <div>
                    <label className="text-sm">Comissão Vendedor (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full mt-1 border rounded-lg px-3 py-2"
                      value={tabelaEdit.comissao_vendedor ?? ""}
                      onChange={(e) =>
                        setTabelaEdit((t) => ({
                          ...(t as any),
                          comissao_vendedor: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="2.00"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 rounded-xl border" onClick={() => setTabelaEdit(null)}>
                    Cancelar
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={() => tabelaEdit && upsertTabela(tabelaEdit)}>
                    Salvar
                  </button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tabelas
                .sort((a, b) => (a.segmento_nome || "").localeCompare(b.segmento_nome || ""))
                .map((t) => (
                  <div key={t.id} className="border rounded-xl p-4 space-y-2">
                    <div className="text-xs text-gray-500">{t.segmento_nome}</div>
                    <div className="font-semibold">{t.nome_tabela}</div>
                    <div className="text-sm">
                      <div>
                        <span className="text-gray-500">Prazos:</span> {prazosStr(t.prazos)}
                      </div>
                      <div>
                        <span className="text-gray-500">Gestor:</span> {pct(t.comissao_gestor)}
                      </div>
                      <div>
                        <span className="text-gray-500">Vendedor:</span> {pct(t.comissao_vendedor)}
                      </div>
                      <div className="truncate">
                        <span className="text-gray-500">Fluxo:</span> {t.fluxo_pagamento || "—"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded-xl border" onClick={() => setTabelaEdit(t)}>
                        Editar
                      </button>
                      <button className="px-3 py-1 rounded-xl bg-red-600 text-white" onClick={() => deleteTabela(t.id)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              {!tabelas.length && <p className="text-sm text-gray-500">Nenhuma tabela cadastrada.</p>}
            </div>
          </div>
        </section>
      )}

      {/* =================== Regras de Lance =================== */}
      {tab === "lances" && (
        <section className="border rounded-2xl p-4 space-y-4 bg-white">
          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2">
              <span className="text-sm">Aceitar 25%</span>
              <input type="checkbox" checked={regras.aceita_25} onChange={(e) => setRegras((r) => ({ ...r, aceita_25: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2">
              <span className="text-sm">Aceitar 50%</span>
              <input type="checkbox" checked={regras.aceita_50} onChange={(e) => setRegras((r) => ({ ...r, aceita_50: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2">
              <span className="text-sm">Mediana do Lance Livre</span>
              <input type="checkbox" checked={regras.usar_mediana} onChange={(e) => setRegras((r) => ({ ...r, usar_mediana: e.target.checked }))} />
            </label>
          </div>
          <button onClick={saveRegras} className="px-4 py-2 rounded-xl bg-blue-600 text-white">
            Salvar
          </button>
        </section>
      )}

      {/* =================== Perfis =================== */}
      {tab === "perfis" && (
        <section className="border rounded-2xl p-4 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Permissões por guia e política de comissão.</p>
            <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={startNewPerfil}>
              Novo Perfil/Política
            </button>
          </div>

          {perfilEdit && (
            <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
              <div>
                <label className="text-sm">Perfil</label>
                <input
                  className="w-full mt-1 border rounded-lg px-3 py-2"
                  value={perfilEdit.perfil ?? ""}
                  onChange={(e) => setPerfilEdit((p) => ({ ...(p as any), perfil: e.target.value }))}
                  placeholder="admin, gestor, vendedor..."
                />
              </div>
              <div>
                <div className="text-sm mb-2">Permissões por Guia</div>
                <div className="grid md:grid-cols-3 gap-2">
                  {Object.entries(perfilEdit.permissoes || {}).map(([k, v]) => (
                    <label key={k} className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-sm">
                      <span>{k}</span>
                      <input
                        type="checkbox"
                        checked={!!v}
                        onChange={(e) =>
                          setPerfilEdit((p) => ({
                            ...(p as any),
                            permissoes: { ...(p?.permissoes || {}), [k]: e.target.checked },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Base de Cálculo</label>
                  <select
                    className="w-full mt-1 border rounded-lg px-3 py-2"
                    value={perfilEdit.comissionamento?.base ?? "credito"}
                    onChange={(e) =>
                      setPerfilEdit((p) => ({
                        ...(p as any),
                        comissionamento: { ...(p?.comissionamento || {}), base: e.target.value as any },
                      }))
                    }
                  >
                    <option value="credito">% sobre crédito</option>
                    <option value="lance">% sobre lance</option>
                    <option value="ambos">% sobre ambos</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">Percentual (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full mt-1 border rounded-lg px-3 py-2"
                    value={perfilEdit.comissionamento?.percentual ?? ""}
                    onChange={(e) =>
                      setPerfilEdit((p) => ({
                        ...(p as any),
                        comissionamento: {
                          ...(p?.comissionamento || {}),
                          percentual: e.target.value === "" ? 0 : Number(e.target.value),
                        },
                      }))
                    }
                    placeholder="2.50"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-xl border" onClick={() => setPerfilEdit(null)}>
                  Cancelar
                </button>
                <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={() => perfilEdit && upsertPerfil(perfilEdit)}>
                  Salvar
                </button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {perfis.map((p) => (
              <div key={p.id} className="border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.perfil}</div>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">
                    Comissão: {pct(p.comissionamento?.percentual)}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="text-gray-500 mb-1">Permissões:</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(p.permissoes || {})
                      .filter(([_, v]) => !!v)
                      .map(([k]) => (
                        <span key={k} className="text-xs px-2 py-1 rounded border">
                          {k}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded-xl border" onClick={() => setPerfilEdit(p)}>
                    Editar
                  </button>
                  <button className="px-3 py-1 rounded-xl bg-red-600 text-white" onClick={() => deletePerfil(p.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {!perfis.length && <p className="text-sm text-gray-500">Nenhum perfil cadastrado.</p>}
          </div>
        </section>
      )}

      {/* =================== Integrações =================== */}
      {tab === "integracoes" && (
        <section className="border rounded-2xl p-4 space-y-4 bg-white">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm">WhatsApp API Key</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={integracoes.whatsapp_api_key ?? ""}
                onChange={(e) => setIntegracoes((x) => ({ ...x, whatsapp_api_key: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm">SMTP Host</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={integracoes.email_smtp_host ?? ""}
                onChange={(e) => setIntegracoes((x) => ({ ...x, email_smtp_host: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm">Usuário E-mail</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={integracoes.email_user ?? ""}
                onChange={(e) => setIntegracoes((x) => ({ ...x, email_user: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm">Remetente (From)</label>
              <input
                className="w-full mt-1 border rounded-lg px-3 py-2"
                value={integracoes.email_from ?? ""}
                onChange={(e) => setIntegracoes((x) => ({ ...x, email_from: e.target.value }))}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 border rounded-xl px-3 py-2">
            <div>
              <div className="font-medium text-sm">Integração Loteria Federal</div>
              <div className="text-xs text-gray-500">Estrutura já existe — marque para conectar.</div>
            </div>
            <input
              type="checkbox"
              checked={integracoes.loteria_integrado}
              onChange={(e) => setIntegracoes((i) => ({ ...i, loteria_integrado: e.target.checked }))}
            />
          </label>

          <button onClick={saveIntegracoes} className="px-4 py-2 rounded-xl bg-blue-600 text-white">
            Salvar
          </button>
        </section>
      )}

      {loading && <div className="text-sm text-gray-500">Carregando dados…</div>}
    </div>
  );
}
