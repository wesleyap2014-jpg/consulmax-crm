// src/pages/Parametros.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Building2, Factory, Link2, Pencil, Percent, Plus, RefreshCw, Save, Settings, Trash2, Upload, Users2,
} from "lucide-react";

/** ======================== TIPOS ======================== */
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

type Segmento = {
  id?: string;
  nome: string;
  ativo: boolean;
};

type TabelaProduto = {
  id?: string;
  segmento_id: string;
  nome_tabela: string;
  prazos: number[];
  comissao_gestor?: number | null;
  comissao_vendedor?: number | null;
  fluxo_pagamento?: string | null;
  segmento_nome?: string; // helper UI
};

type RegrasLance = {
  id?: string;
  aceita_25: boolean;
  aceita_50: boolean;
  usar_mediana: boolean;
};

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

/** ======================== HELPERS ======================== */
const notify = (m: string) => alert(m);
const pct = (n?: number | null) => (typeof n === "number" ? `${n.toFixed(2)}%` : "—");
const prazosStr = (arr: number[]) => (arr?.length ? arr.join(", ") : "—");

/** ======================== PÁGINA ======================== */
export default function ParametrosPage() {
  const [loading, setLoading] = useState(false);

  // Gerais
  const [settings, setSettings] = useState<SettingsT>({
    nome_corretora: "", slogan: "", logo_url: "", taxa_padrao: null, indice_atualizacao: "",
  });

  // Administradoras
  const [administradoras, setAdministradoras] = useState<Administradora[]>([]);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEdit, setAdminEdit] = useState<Administradora | null>(null);

  // Segmentos / Tabelas
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [segModalOpen, setSegModalOpen] = useState(false);
  const [segEdit, setSegEdit] = useState<Segmento | null>(null);

  const [tabelas, setTabelas] = useState<TabelaProduto[]>([]);
  const [tabelaModalOpen, setTabelaModalOpen] = useState(false);
  const [tabelaEdit, setTabelaEdit] = useState<TabelaProduto | null>(null);

  // Regras de Lance
  const [regras, setRegras] = useState<RegrasLance>({ aceita_25: true, aceita_50: true, usar_mediana: true });

  // Perfis
  const [perfis, setPerfis] = useState<PerfilPolitica[]>([]);
  const [perfilModalOpen, setPerfilModalOpen] = useState(false);
  const [perfilEdit, setPerfilEdit] = useState<PerfilPolitica | null>(null);

  // Integrações
  const [integracoes, setIntegracoes] = useState<Integracoes>({
    whatsapp_api_key: "", email_smtp_host: "", email_user: "", email_from: "", loteria_integrado: false,
  });

  /** ======================== LOAD INICIAL ======================== */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: s, error: sErr } = await supabase.from("settings").select("*").limit(1).maybeSingle();
        if (sErr && sErr.code !== "PGRST116") throw sErr;
        if (s) setSettings(s);

        const { data: a, error: aErr } = await supabase
          .from("admins").select("id, nome, ativa, email").order("nome", { ascending: true });
        if (aErr) throw aErr;
        setAdministradoras(a || []);

        const { data: segs, error: segErr } = await supabase
          .from("segmentos").select("id, nome, ativo").order("nome", { ascending: true });
        if (segErr) throw segErr;
        setSegmentos(segs || []);

        const { data: tabs, error: tabsErr } = await supabase.from("tabelas_produto").select("*");
        if (tabsErr) throw tabsErr;
        const segMap = new Map((segs || []).map((x) => [x.id, x.nome]));
        const decorated = (tabs || []).map((t: any) => ({ ...t, segmento_nome: segMap.get(t.segmento_id) || "" }));
        setTabelas(decorated);

        const { data: r, error: rErr } = await supabase.from("regras_lance").select("*").limit(1).maybeSingle();
        if (rErr && rErr.code !== "PGRST116") throw rErr;
        if (r) setRegras(r);

        const { data: pf, error: pfErr } = await supabase.from("perfis_politicas").select("*");
        if (pfErr) throw pfErr;
        setPerfis(pf || []);

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

  /** ======================== AÇÕES ======================== */
  // Gerais
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
      setAdminModalOpen(false); setAdminEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar administradora: ${e.message ?? e}`);
    }
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
      setSegModalOpen(false); setSegEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar segmento: ${e.message ?? e}`);
    }
  };
  const deleteSegmento = async (id?: string) => {
    if (!id || !confirm("Excluir segmento? Tabelas vinculadas podem ser afetadas.")) return;
    try {
      const { error } = await supabase.from("segmentos").delete().eq("id", id);
      if (error) throw error;
      setSegmentos((x) => x.filter((y) => y.id !== id));
    } catch (e: any) {
      notify(`Erro ao excluir: ${e.message ?? e}`);
    }
  };

  // Tabelas/Comissão/Fluxo
  const startNewTabela = () =>
    setTabelaEdit({
      segmento_id: "", nome_tabela: "", prazos: [],
      comissao_gestor: null, comissao_vendedor: null, fluxo_pagamento: "",
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
      setTabelaModalOpen(false); setTabelaEdit(null);
    } catch (e: any) {
      notify(`Erro ao salvar tabela: ${e.message ?? e}`);
    }
  };
  const deleteTabela = async (id?: string) => {
    if (!id || !confirm("Excluir tabela de produto?")) return;
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
        Leads: true, Vendedores: true, Oportunidades: true, Carteira: true, "Gestão de Grupos": true, "Parâmetros/Admin": true,
      },
      comissionamento: { base: "credito", percentual: 2.5 },
    });
  const upsertPerfil = async (p: PerfilPolitica) => {
    try {
      const { error } = await supabase.from("perfis_politicas").upsert(p, { onConflict: "id" });
      if (error) throw error;
      const { data } = await supabase.from("perfis_politicas").select("*");
      setPerfis(data || []);
      setPerfilModalOpen(false); setPerfilEdit(null);
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

  /** ======================== UI ======================== */
  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Parâmetros / Admin</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
        </Button>
      </header>

      <Tabs defaultValue="gerais" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <TabsTrigger value="gerais">Configurações Gerais</TabsTrigger>
          <TabsTrigger value="admins">Administradoras</TabsTrigger>
          <TabsTrigger value="segmentos">Produtos/Segmentos</TabsTrigger>
          <TabsTrigger value="lances">Regras de Lance</TabsTrigger>
          <TabsTrigger value="perfis">Usuários & Perfis</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        </TabsList>

        {/* ======== Configurações Gerais ======== */}
        <TabsContent value="gerais">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Configurações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome da Corretora</Label>
                  <Input
                    value={settings.nome_corretora}
                    onChange={(e) => setSettings((s) => ({ ...s, nome_corretora: e.target.value }))}
                    placeholder="Consulmax Consórcios"
                  />
                </div>
                <div>
                  <Label>Slogan</Label>
                  <Input
                    value={settings.slogan}
                    onChange={(e) => setSettings((s) => ({ ...s, slogan: e.target.value }))}
                    placeholder="Maximize as suas conquistas."
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label>Logotipo (URL ou upload futuro)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.logo_url ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, logo_url: e.target.value }))}
                      placeholder="https://.../logo.png"
                    />
                    <Button variant="outline" disabled>
                      <Upload className="h-4 w-4 mr-2" /> Upload
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Taxa Padrão (%)</Label>
                  <Input
                    type="number" step="0.01" placeholder="2.50"
                    value={settings.taxa_padrao ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, taxa_padrao: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Índice de Atualização</Label>
                <Input
                  value={settings.indice_atualizacao ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, indice_atualizacao: e.target.value }))}
                  placeholder="IPCA, INCC..."
                />
              </div>

              <Button onClick={saveSettings}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== Administradoras ======== */}
        <TabsContent value="admins">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" /> Administradoras
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Cadastre, edite e ative/inative administradoras.</p>
                <Dialog open={adminModalOpen} onOpenChange={setAdminModalOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { startNewAdmin(); setAdminModalOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Nova Administradora
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{adminEdit?.id ? "Editar Administradora" : "Nova Administradora"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome</Label>
                        <Input
                          value={adminEdit?.nome ?? ""}
                          onChange={(e) => setAdminEdit((s) => ({ ...(s as any), nome: e.target.value }))}
                          placeholder="Embracon"
                        />
                      </div>
                      <div>
                        <Label>E-mail (opcional)</Label>
                        <Input
                          type="email"
                          value={adminEdit?.email ?? ""}
                          onChange={(e) => setAdminEdit((s) => ({ ...(s as any), email: e.target.value }))}
                          placeholder="contato@administradora.com.br"
                        />
                      </div>
                      <div className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <div className="font-medium">Status</div>
                          <div className="text-xs text-muted-foreground">Ativar/Desativar</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">Inativa</span>
                          <Switch
                            checked={!!adminEdit?.ativa}
                            onCheckedChange={(v) => setAdminEdit((s) => ({ ...(s as any), ativa: v }))}
                          />
                          <span className="text-xs">Ativa</span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAdminModalOpen(false)}>Cancelar</Button>
                      <Button onClick={() => adminEdit && upsertAdministradora(adminEdit)}>
                        <Save className="h-4 w-4 mr-2" /> Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {administradoras.map((adm) => (
                  <div key={adm.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{adm.nome}</h3>
                        {!!adm.email && <div className="text-xs text-muted-foreground">{adm.email}</div>}
                      </div>
                      <Badge variant={adm.ativa ? "default" : "secondary"}>{adm.ativa ? "Ativa" : "Inativa"}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setAdminEdit(adm); setAdminModalOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => upsertAdministradora({ ...(adm as any), ativa: !adm.ativa })}>
                        {adm.ativa ? "Inativar" : "Ativar"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteAdministradora(adm.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}
                {!administradoras.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma administradora cadastrada.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== Segmentos ======== */}
        <TabsContent value="segmentos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" /> Segmentos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Cadastre segmentos base (Imóvel, Automóvel, etc.).</p>
                <Dialog open={segModalOpen} onOpenChange={setSegModalOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { startNewSegmento(); setSegModalOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Novo Segmento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{segEdit?.id ? "Editar Segmento" : "Novo Segmento"}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome</Label>
                        <Input
                          value={segEdit?.nome ?? ""}
                          onChange={(e) => setSegEdit((s) => ({ ...(s as any), nome: e.target.value }))}
                          placeholder="Imóvel"
                        />
                      </div>
                      <div className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <div className="font-medium">Status</div>
                          <div className="text-xs text-muted-foreground">Ativo/Inativo</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">Inativo</span>
                          <Switch
                            checked={!!segEdit?.ativo}
                            onCheckedChange={(v) => setSegEdit((s) => ({ ...(s as any), ativo: v }))}
                          />
                          <span className="text-xs">Ativo</span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSegModalOpen(false)}>Cancelar</Button>
                      <Button onClick={() => segEdit && upsertSegmento(segEdit)}>
                        <Save className="h-4 w-4 mr-2" /> Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {segmentos.map((s) => (
                  <div key={s.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{s.nome}</h3>
                      <Badge variant={s.ativo ? "default" : "secondary"}>{s.ativo ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setSegEdit(s); setSegModalOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => upsertSegmento({ ...(s as any), ativo: !s.ativo })}>
                        {s.ativo ? "Inativar" : "Ativar"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteSegmento(s.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}
                {!segmentos.length && <p className="text-sm text-muted-foreground">Nenhum segmento cadastrado.</p>}
              </div>
            </CardContent>
          </Card>

          {/* ======== Tabelas / Prazos / Comissão ======== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" /> Tabelas / Prazos / Comissão / Fluxo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Vincule tabelas a um Segmento.</p>
                <Dialog open={tabelaModalOpen} onOpenChange={setTabelaModalOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { startNewTabela(); setTabelaModalOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Nova Tabela
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>{tabelaEdit?.id ? "Editar Tabela" : "Nova Tabela"}</DialogTitle></DialogHeader>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Segmento</Label>
                        <Select
                          value={tabelaEdit?.segmento_id ?? ""}
                          onValueChange={(v) => setTabelaEdit((t) => ({ ...(t as any), segmento_id: v }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          <SelectContent>
                            {segmentos.map((s) => <SelectItem key={s.id} value={s.id as string}>{s.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nome da Tabela</Label>
                        <Input
                          value={tabelaEdit?.nome_tabela ?? ""}
                          onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), nome_tabela: e.target.value }))}
                          placeholder="Automóvel Select Mais"
                        />
                      </div>
                      <div>
                        <Label>Prazos (separados por vírgula)</Label>
                        <Input
                          value={(tabelaEdit?.prazos || []).join(",")}
                          onChange={(e) => {
                            const arr = e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n));
                            setTabelaEdit((t) => ({ ...(t as any), prazos: arr }));
                          }}
                          placeholder="60, 80, 120"
                        />
                      </div>
                      <div>
                        <Label>Fluxo de Pagamento</Label>
                        <Input
                          value={tabelaEdit?.fluxo_pagamento ?? ""}
                          onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), fluxo_pagamento: e.target.value }))}
                          placeholder="8 Pgto = 10/20/20/..."
                        />
                      </div>
                      <div>
                        <Label>Comissão Gestor (%)</Label>
                        <Input
                          type="number" step="0.01" placeholder="1.50"
                          value={tabelaEdit?.comissao_gestor ?? ""}
                          onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), comissao_gestor: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <Label>Comissão Vendedor (%)</Label>
                        <Input
                          type="number" step="0.01" placeholder="2.00"
                          value={tabelaEdit?.comissao_vendedor ?? ""}
                          onChange={(e) => setTabelaEdit((t) => ({ ...(t as any), comissao_vendedor: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Observações</Label>
                        <Textarea placeholder="Notas internas (opcional)" disabled />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setTabelaModalOpen(false)}>Cancelar</Button>
                      <Button onClick={() => tabelaEdit && upsertTabela(tabelaEdit)}>
                        <Save className="h-4 w-4 mr-2" /> Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tabelas
                  .sort((a, b) => (a.segmento_nome || "").localeCompare(b.segmento_nome || ""))
                  .map((t) => (
                    <div key={t.id} className="border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">{t.segmento_nome}</div>
                          <h3 className="font-semibold">{t.nome_tabela}</h3>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setTabelaEdit(t); setTabelaModalOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteTabela(t.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm">
                        <div><span className="text-muted-foreground">Prazos:</span> {prazosStr(t.prazos)}</div>
                        <div><span className="text-muted-foreground">Gestor:</span> {pct(t.comissao_gestor)}</div>
                        <div><span className="text-muted-foreground">Vendedor:</span> {pct(t.comissao_vendedor)}</div>
                        <div className="truncate"><span className="text-muted-foreground">Fluxo:</span> {t.fluxo_pagamento || "—"}</div>
                      </div>
                    </div>
                  ))}
                {!tabelas.length && <p className="text-sm text-muted-foreground">Nenhuma tabela cadastrada.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== Regras de Lance ======== */}
        <TabsContent value="lances">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" /> Regras de Lance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div><div className="font-medium">Aceitar 25%</div><div className="text-xs text-muted-foreground">Ativa/desativa lance fixo 25%.</div></div>
                  <Switch checked={regras.aceita_25} onCheckedChange={(v) => setRegras((r) => ({ ...r, aceita_25: v }))} />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div><div className="font-medium">Aceitar 50%</div><div className="text-xs text-muted-foreground">Ativa/desativa lance fixo 50%.</div></div>
                  <Switch checked={regras.aceita_50} onCheckedChange={(v) => setRegras((r) => ({ ...r, aceita_50: v }))} />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div><div className="font-medium">Mediana do Lance Livre</div><div className="text-xs text-muted-foreground">Usa (Maior% + Menor%) ÷ 2.</div></div>
                  <Switch checked={regras.usar_mediana} onCheckedChange={(v) => setRegras((r) => ({ ...r, usar_mediana: v }))} />
                </div>
              </div>
              <Button onClick={saveRegras}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== Usuários & Perfis ======== */}
        <TabsContent value="perfis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users2 className="h-5 w-5" /> Perfis e Políticas de Comissão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Permissões por guia e regra de comissionamento.</p>
                <Dialog open={perfilModalOpen} onOpenChange={setPerfilModalOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { startNewPerfil(); setPerfilModalOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Novo Perfil/Política
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>{perfilEdit?.id ? "Editar Perfil/Política" : "Novo Perfil/Política"}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Perfil</Label>
                        <Input
                          value={perfilEdit?.perfil ?? ""}
                          onChange={(e) => setPerfilEdit((p) => ({ ...(p as any), perfil: e.target.value }))}
                          placeholder="admin, gestor, vendedor..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Permissões por Guia</Label>
                        <div className="grid md:grid-cols-3 gap-3">
                          {Object.entries(perfilEdit?.permissoes || {}).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between border rounded-lg p-3">
                              <div className="text-sm">{k}</div>
                              <Switch
                                checked={!!v}
                                onCheckedChange={(val) =>
                                  setPerfilEdit((p) => ({
                                    ...(p as any),
                                    permissoes: { ...(p?.permissoes || {}), [k]: val },
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>Base de Cálculo</Label>
                          <Select
                            value={perfilEdit?.comissionamento?.base ?? "credito"}
                            onValueChange={(v: "credito" | "lance" | "ambos") =>
                              setPerfilEdit((p) => ({ ...(p as any), comissionamento: { ...(p?.comissionamento || {}), base: v } }))
                            }
                          >
                            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credito">% sobre crédito</SelectItem>
                              <SelectItem value="lance">% sobre lance</SelectItem>
                              <SelectItem value="ambos">% sobre ambos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Percentual (%)</Label>
                          <Input
                            type="number" step="0.01" placeholder="2.50"
                            value={perfilEdit?.comissionamento?.percentual ?? ""}
                            onChange={(e) =>
                              setPerfilEdit((p) => ({
                                ...(p as any),
                                comissionamento: { ...(p?.comissionamento || {}), percentual: e.target.value === "" ? 0 : Number(e.target.value) },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPerfilModalOpen(false)}>Cancelar</Button>
                      <Button onClick={() => perfilEdit && upsertPerfil(perfilEdit)}>
                        <Save className="h-4 w-4 mr-2" /> Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {perfis.map((p) => (
                  <div key={p.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{p.perfil}</h3>
                      <Badge variant="secondary">Comissão: {pct(p.comissionamento?.percentual)}</Badge>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Permissões:</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(p.permissoes || {}).filter(([_, v]) => !!v).map(([k]) => (
                          <Badge key={k} variant="outline">{k}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setPerfilEdit(p); setPerfilModalOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deletePerfil(p.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}
                {!perfis.length && <p className="text-sm text-muted-foreground">Nenhum perfil cadastrado.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== Integrações ======== */}
        <TabsContent value="integracoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" /> Integrações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>WhatsApp API Key</Label>
                  <Input
                    value={integracoes.whatsapp_api_key ?? ""}
                    onChange={(e) => setIntegracoes((x) => ({ ...x, whatsapp_api_key: e.target.value }))}
                    placeholder="(guardar em Vault em produção)"
                  />
                </div>
                <div>
                  <Label>SMTP Host</Label>
                  <Input
                    value={integracoes.email_smtp_host ?? ""}
                    onChange={(e) => setIntegracoes((x) => ({ ...x, email_smtp_host: e.target.value }))}
                    placeholder="smtp.seudominio.com"
                  />
                </div>
                <div>
                  <Label>Usuário E-mail</Label>
                  <Input
                    value={integracoes.email_user ?? ""}
                    onChange={(e) => setIntegracoes((x) => ({ ...x, email_user: e.target.value }))}
                    placeholder="usuario@seudominio.com"
                  />
                </div>
                <div>
                  <Label>Remetente (From)</Label>
                  <Input
                    value={integracoes.email_from ?? ""}
                    onChange={(e) => setIntegracoes((x) => ({ ...x, email_from: e.target.value }))}
                    placeholder="Consulmax <no-reply@consulmax.com.br>"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="font-medium">Integração Loteria Federal</div>
                  <div className="text-xs text-muted-foreground">Estrutura já existe — marque para conectar.</div>
                </div>
                <Switch
                  checked={integracoes.loteria_integrado}
                  onCheckedChange={(v) => setIntegracoes((i) => ({ ...i, loteria_integrado: v }))}
                />
              </div>

              <Button onClick={saveIntegracoes}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && <div className="text-sm text-muted-foreground">Carregando dados…</div>}
    </div>
  );
}
