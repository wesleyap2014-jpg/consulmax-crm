// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// -------- types (mínimos, focados no que usamos) --------
type Role = "admin" | "vendedor" | "viewer" | "gestor";

type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // auth.users.id
  nome: string | null;
  email: string | null;
  role: Role;
  is_active: boolean | null;
};

type ClienteRow = {
  id: string;
  nome: string;
  data_nascimento: string | null; // date
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  lead_id: string | null;
};

type VendaRow = {
  id: string;
  lead_id: string | null;
  vendedor_id: string | null; // auth_user_id (pelo teu schema)
  codigo: string | null; // "00" = ativa
  produto: string | null; // Automóvel, Imóvel...
  nascimento: string | null; // date (pode ajudar se cliente não tiver)
};

type VClientesGeo = {
  uf: string | null;
  cidade: string | null;
  total: number | null;
};

// -------- helpers --------
function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function normalizeUF(uf?: string | null) {
  if (!uf) return null;
  const s = String(uf).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

function humanMoneyBR(v: number) {
  // formata como R$ 9.413
  const n = Math.round(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function calcAgeFromISODate(dateISO: string | null) {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 0 || age > 120) return null;
  return age;
}

/**
 * "Renda média (estimada)"
 * Base: campo texto quando parsável.
 * - procura padrões com R$ e/ou "renda"
 */
function parseRendaFromText(text: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // tenta achar algo do tipo "renda: 9000", "renda 9.000", "renda R$ 9.000"
  const rendaBlock = t.match(/renda[^0-9r$]{0,20}(r\$)?\s*([\d\.\,]{3,})/i);
  const m = rendaBlock?.[2] ? rendaBlock[2] : null;

  // fallback: pega o primeiro "R$ 9.000" que aparecer
  const rx = m ? m : (text.match(/R\$\s*([\d\.\,]{3,})/i)?.[1] ?? null);
  if (!rx) return null;

  const normalized = rx.replace(/\./g, "").replace(",", ".");
  const val = Number(normalized);
  if (!Number.isFinite(val) || val <= 0) return null;

  // se alguém escreveu 9,5 (sem milhar), evita distorção
  if (val < 300) return null;

  return val;
}

function modeString(items: string[]) {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  let best: { k: string; v: number } | null = null;
  for (const [k, v] of m) {
    if (!best || v > best.v) best = { k, v };
  }
  return best?.k ?? null;
}

// -------- map iframe API typing (do br-estados.html) --------
type ConsulmaxMapAPI = {
  setSelected: (uf: string | null) => void;
  getSelected: () => string | null;
  setActive: (ufs: string[]) => void;
  getActive: () => string[];
  clearActive: () => void;
};

export default function Clientes() {
  const [tab, setTab] = useState<"cadastro" | "demografia">("demografia");

  // auth/profile
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>("__me__"); // users.id (para admin)
  const [loadingUser, setLoadingUser] = useState(true);

  // data
  const [loadingData, setLoadingData] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [vendasAtivas, setVendasAtivas] = useState<VendaRow[]>([]);
  const [geoRows, setGeoRows] = useState<VClientesGeo[]>([]);
  const [selectedUF, setSelectedUF] = useState<string | null>(null);

  // map iframe control
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const isAdmin = me?.role === "admin";
  const effectiveAuthSellerId = useMemo(() => {
    if (!me) return null;
    if (!isAdmin) return me.auth_user_id;
    if (selectedSeller === "__me__") return me.auth_user_id;
    const u = users.find((x) => x.id === selectedSeller);
    return u?.auth_user_id ?? me.auth_user_id;
  }, [me, isAdmin, selectedSeller, users]);

  // -------- load auth/profile/users --------
  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;
        setAuthUserId(uid);

        if (!uid) {
          setMe(null);
          setUsers([]);
          return;
        }

        const { data: meRow, error: meErr } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, email, role, is_active")
          .eq("auth_user_id", uid)
          .maybeSingle();

        if (meErr) throw meErr;
        setMe((meRow as UserRow) ?? null);

        // lista de usuários só para admin (ou para selects)
        const role = (meRow as any)?.role as Role | undefined;
        if (role === "admin") {
          const { data: allUsers, error: uErr } = await supabase
            .from("users")
            .select("id, auth_user_id, nome, email, role, is_active")
            .eq("is_active", true)
            .order("nome", { ascending: true });

          if (uErr) throw uErr;
          setUsers((allUsers as UserRow[]) ?? []);
        } else {
          setUsers([]);
        }
      } catch (e) {
        console.error("Clientes: load user error", e);
      } finally {
        setLoadingUser(false);
      }
    })();
  }, []);

  // -------- load demografia base (ativas) + geo view --------
  async function loadDemografia() {
    if (!effectiveAuthSellerId) return;
    setLoadingData(true);

    try {
      // 1) vendas ativas (codigo = '00') com RBAC
      // vendedor_id no teu schema = auth_user_id do vendedor
      let q = supabase
        .from("vendas")
        .select("id, lead_id, vendedor_id, codigo, produto, nascimento")
        .eq("codigo", "00");

      // RBAC
      if (!isAdmin) {
        q = q.eq("vendedor_id", effectiveAuthSellerId);
      } else {
        // admin: se filtrou vendedor, aplica
        if (effectiveAuthSellerId) q = q.eq("vendedor_id", effectiveAuthSellerId);
      }

      const { data: vAtivas, error: vErr } = await q.limit(2000);
      if (vErr) throw vErr;

      const vendas = (vAtivas as VendaRow[]) ?? [];
      setVendasAtivas(vendas);

      // 2) clientes vinculados (por lead_id) para pegar uf/cidade/nascimento/observacoes
      const leadIds = Array.from(
        new Set(vendas.map((v) => v.lead_id).filter((x): x is string => !!x))
      );

      if (leadIds.length === 0) {
        setClientes([]);
        setGeoRows([]);
        setSelectedUF(null);
        return;
      }

      const { data: cRows, error: cErr } = await supabase
        .from("clientes")
        .select("id, nome, data_nascimento, cpf, telefone, email, cidade, uf, observacoes, lead_id")
        .in("lead_id", leadIds)
        .limit(5000);

      if (cErr) throw cErr;
      setClientes((cRows as ClienteRow[]) ?? []);

      // 3) view geo (top cidades) — já vem pronta no teu banco
      // OBS: se a view não estiver filtrando por vendedor, ela será "Brasil total".
      // Aqui vamos usar só como “Top cidades Brasil”, como está no teu print.
      const { data: geo, error: gErr } = await supabase
        .from("v_clientes_geo")
        .select("uf, cidade, total")
        .order("total", { ascending: false })
        .limit(30);

      if (gErr) {
        console.warn("v_clientes_geo não disponível / erro:", gErr);
        setGeoRows([]);
      } else {
        setGeoRows((geo as VClientesGeo[]) ?? []);
      }

      // Se UF selecionada não existir mais no novo filtro, limpa
      setSelectedUF((prev) => {
        if (!prev) return prev;
        const stillHas = (cRows as ClienteRow[]).some((c) => normalizeUF(c.uf) === prev);
        return stillHas ? prev : null;
      });
    } catch (e) {
      console.error("Clientes: load demografia error", e);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!me) return;
    loadDemografia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, selectedSeller]);

  // -------- derived: index clientes por lead_id (pra casar com venda) --------
  const clienteByLeadId = useMemo(() => {
    const m = new Map<string, ClienteRow>();
    for (const c of clientes) {
      if (!c.lead_id) continue;
      // se houver duplicado, mantém o primeiro (ou você pode trocar por regra "mais completo")
      if (!m.has(c.lead_id)) m.set(c.lead_id, c);
    }
    return m;
  }, [clientes]);

  // -------- active UF set based on vendas ativas + clientes.uf --------
  const activeUFs = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendasAtivas) {
      const lid = v.lead_id;
      if (!lid) continue;
      const c = clienteByLeadId.get(lid);
      const uf = normalizeUF(c?.uf);
      if (uf) set.add(uf);
    }
    return Array.from(set).sort();
  }, [vendasAtivas, clienteByLeadId]);

  // -------- stats builder (Brasil ou UF selecionada) --------
  const demo = useMemo(() => {
    // filtra vendas por UF (quando selecionado)
    const filteredVendas = selectedUF
      ? vendasAtivas.filter((v) => {
          const c = v.lead_id ? clienteByLeadId.get(v.lead_id) : null;
          return normalizeUF(c?.uf) === selectedUF;
        })
      : vendasAtivas;

    // clientes únicos (por lead_id)
    const uniqueLeadIds = Array.from(
      new Set(filteredVendas.map((v) => v.lead_id).filter((x): x is string => !!x))
    );

    // idade média
    const ages: number[] = [];
    // renda estimada
    const rendas: number[] = [];
    // produtos
    const produtos: string[] = [];
    // cidades
    const cidades: string[] = [];

    for (const lid of uniqueLeadIds) {
      const c = clienteByLeadId.get(lid);
      const age =
        calcAgeFromISODate(c?.data_nascimento ?? null) ??
        // fallback: se cliente não tiver, tenta achar alguma venda com nascimento
        (() => {
          const vv = filteredVendas.find((x) => x.lead_id === lid);
          return calcAgeFromISODate(vv?.nascimento ?? null);
        })();

      if (typeof age === "number") ages.push(age);

      const r = parseRendaFromText(c?.observacoes ?? null);
      if (typeof r === "number") rendas.push(r);

      if (c?.cidade) cidades.push(c.cidade);
    }

    for (const v of filteredVendas) {
      if (v.produto) produtos.push(v.produto);
    }

    const idadeMedia = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const rendaMedia = rendas.length ? Math.round(rendas.reduce((a, b) => a + b, 0) / rendas.length) : null;

    // divisão por produto (vendas)
    const prodCount = new Map<string, number>();
    for (const p of produtos.map((x) => x.trim()).filter(Boolean)) {
      prodCount.set(p, (prodCount.get(p) ?? 0) + 1);
    }
    const produtosSorted = Array.from(prodCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ produto: k, total: v }));

    // Top cidades (pelos clientes ativos filtrados)
    const cityCount = new Map<string, number>();
    for (const c of cidades.map((x) => x.trim()).filter(Boolean)) {
      cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
    }
    const topCidadesUF = Array.from(cityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cidade, total]) => ({ cidade, total }));

    // Persona simples (auto) — sem inventar demais
    const produtoTop = produtosSorted[0]?.produto ?? null;
    const persona = `Base ativa com ${uniqueLeadIds.length} clientes${selectedUF ? ` em ${selectedUF}` : ""}. ${
      produtoTop ? `Produto mais comum: ${produtoTop}.` : ""
    } Idade média ${idadeMedia ?? "—"} anos.`;

    return {
      totalClientes: uniqueLeadIds.length,
      idadeMedia,
      rendaMedia,
      persona,
      produtosSorted,
      topCidadesUF,
      rendaBaseSize: rendas.length,
    };
  }, [selectedUF, vendasAtivas, clienteByLeadId]);

  // -------- map integration: attach to iframe window --------
  function getMapWindow() {
    return iframeRef.current?.contentWindow ?? null;
  }
  function getMapAPI(): ConsulmaxMapAPI | null {
    const w = getMapWindow() as any;
    return (w?.consulmaxMap as ConsulmaxMapAPI) ?? null;
  }

  // on iframe load: mark ready + attach listener
  function handleMapLoad() {
    const w = getMapWindow();
    if (!w) return;

    // escuta seleção do mapa (dentro do iframe)
    const onSelected = (ev: any) => {
      const uf = normalizeUF(ev?.detail?.uf ?? null);
      setSelectedUF(uf);
    };

    try {
      w.addEventListener("consulmax:uf-selected", onSelected as any);
      setMapReady(true);
    } catch (e) {
      console.warn("Map iframe listener error", e);
    }

    // cleanup quando trocar iframe (raro)
    return () => {
      try {
        w.removeEventListener("consulmax:uf-selected", onSelected as any);
      } catch {}
    };
  }

  // push active UFs to map whenever data changes
  useEffect(() => {
    if (!mapReady) return;
    const api = getMapAPI();
    if (!api) return;
    try {
      api.setActive(activeUFs);
    } catch (e) {
      console.warn("consulmaxMap.setActive error", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeUFs.join("|")]);

  // keep selected UF synced both ways
  useEffect(() => {
    if (!mapReady) return;
    const api = getMapAPI();
    if (!api) return;
    try {
      api.setSelected(selectedUF);
    } catch (e) {
      console.warn("consulmaxMap.setSelected error", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, selectedUF]);

  // -------- UI lists (Top cidades Brasil via view) --------
  const topCidadesBrasil = useMemo(() => {
    // No print da sua view: uf, cidade, total
    // Vamos mostrar top 6 no card Brasil
    const rows = geoRows
      .map((r) => ({
        uf: normalizeUF(r.uf),
        cidade: r.cidade?.trim() ?? null,
        total: typeof r.total === "number" ? r.total : 0,
      }))
      .filter((r) => r.uf && r.cidade && r.total > 0)
      .slice(0, 6);

    return rows as { uf: string; cidade: string; total: number }[];
  }, [geoRows]);

  const scopeLabel = selectedUF ? selectedUF : "Brasil";

  // -------- render --------
  const loading = loadingUser || loadingData;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="demografia">Demografia</TabsTrigger>
        </TabsList>

        {/* CADASTRO (mantém a aba — aqui você pode plugar seu conteúdo existente) */}
        <TabsContent value="cadastro">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Aba de cadastro não foi alterada aqui. (Só focamos na Demografia/Mapa)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEMOGRAFIA */}
        <TabsContent value="demografia">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm text-muted-foreground">Demografia (Clientes Ativos)</div>
              <div className="text-lg font-semibold">Resumo e mapa por UF</div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="min-w-[220px]">
                  <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                    <SelectTrigger>
                      <SelectValue placeholder="Vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__me__">Meu painel</SelectItem>
                      {users
                        .filter((u) => u.role !== "viewer")
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nome ?? u.email ?? u.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={loadDemografia} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Atualizar
              </Button>
            </div>
          </div>

          {/* GRID PRINCIPAL */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
            {/* COLUNA ESQUERDA */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Clientes ativos ({scopeLabel})</div>
                    <div className="mt-1 text-2xl font-semibold">{demo.totalClientes}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Base: vendas com código <b>00</b> cruzadas com clientes.uf
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Idade média</div>
                    <div className="mt-1 text-2xl font-semibold">{demo.idadeMedia ?? "—"}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {demo.idadeMedia ? `Média calculada por data de nascimento` : "Sem base suficiente"}
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Renda média (estimada)</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {typeof demo.rendaMedia === "number" ? humanMoneyBR(demo.rendaMedia) : "—"}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Base: campo texto quando parsável ({demo.rendaBaseSize})
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Filtro UF</div>
                    <div className="mt-1 text-base font-semibold">{selectedUF ?? "—"}</div>
                    <div className="mt-2 text-xs text-muted-foreground">Clique no mapa para selecionar.</div>
                  </CardContent>
                </Card>
              </div>

              {/* TOP CIDADES */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base">
                    Top cidades ({selectedUF ? selectedUF : "Brasil"})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(selectedUF ? demo.topCidadesUF : topCidadesBrasil).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sem dados suficientes.</div>
                  ) : (
                    (selectedUF ? demo.topCidadesUF : topCidadesBrasil).map((r: any) => (
                      <div key={`${r.cidade}-${r.uf ?? ""}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="text-sm">
                          {r.cidade}{" "}
                          <span className="text-xs text-muted-foreground">
                            • {selectedUF ? selectedUF : r.uf}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">{r.total}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* PERSONA */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base">Persona (auto) • {scopeLabel}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">{demo.persona}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    *A qualidade depende do preenchimento de cadastro (idade/renda/observações).
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* COLUNA DIREITA: MAPA + PAINEL LATERAL */}
            <div className="space-y-4">
              <Card className="glass-card">
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Mapa do Brasil (UF)</CardTitle>
                    <div className="text-xs text-muted-foreground">Clique no estado para filtrar</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedUF(null)}
                      disabled={!selectedUF}
                    >
                      Limpar UF
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* grid: mapa + painel (lado a lado em desktop, empilha no mobile) */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
                    {/* MAPA */}
                    <div className="rounded-xl border bg-white/50 overflow-hidden">
                      <div className="h-[280px] sm:h-[320px] w-full">
                        <iframe
                          ref={iframeRef}
                          title="Mapa por UF • Consulmax"
                          src="/maps/br-estados.html"
                          className="h-full w-full"
                          onLoad={handleMapLoad as any}
                        />
                      </div>
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Se o mapa não aparecer, confirme o arquivo em <code>public/maps/br-estados.html</code>
                      </div>
                    </div>

                    {/* PAINEL UF */}
                    <div className="rounded-xl border bg-white/50">
                      <div className="px-4 py-3 border-b">
                        <div className="text-xs text-muted-foreground">Demografia do estado</div>
                        <div className="text-base font-semibold">{selectedUF ? selectedUF : "Selecione uma UF"}</div>
                      </div>

                      <div className="p-4 space-y-3">
                        {!selectedUF ? (
                          <div className="text-sm text-muted-foreground">
                            Clique em um estado no mapa para ver os dados ao lado.
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-lg border px-3 py-2">
                                <div className="text-xs text-muted-foreground">Clientes ativos</div>
                                <div className="text-lg font-semibold">{demo.totalClientes}</div>
                              </div>
                              <div className="rounded-lg border px-3 py-2">
                                <div className="text-xs text-muted-foreground">Idade média</div>
                                <div className="text-lg font-semibold">{demo.idadeMedia ?? "—"}</div>
                              </div>
                              <div className="rounded-lg border px-3 py-2 col-span-2">
                                <div className="text-xs text-muted-foreground">Renda média (estimada)</div>
                                <div className="text-lg font-semibold">
                                  {typeof demo.rendaMedia === "number" ? humanMoneyBR(demo.rendaMedia) : "—"}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  Base parsável: {demo.rendaBaseSize}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg border px-3 py-2">
                              <div className="text-xs text-muted-foreground">Persona</div>
                              <div className="text-sm text-muted-foreground mt-1">{demo.persona}</div>
                            </div>

                            <div className="rounded-lg border px-3 py-2">
                              <div className="text-xs text-muted-foreground">Divisão por produto (vendas ativas)</div>
                              <div className="mt-2 space-y-2">
                                {demo.produtosSorted.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">Sem vendas com produto identificado.</div>
                                ) : (
                                  demo.produtosSorted.slice(0, 8).map((p) => (
                                    <div key={p.produto} className="flex items-center justify-between">
                                      <div className="text-sm">{p.produto}</div>
                                      <div className="text-sm font-semibold">{p.total}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* DISTRIBUIÇÕES RÁPIDAS (mantive a ideia do teu print, mas com produto) */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base">Distribuições rápidas • {scopeLabel}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground mb-2">Produtos (vendas ativas)</div>
                    <div className="space-y-2">
                      {demo.produtosSorted.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Sem dados.</div>
                      ) : (
                        demo.produtosSorted.slice(0, 10).map((p) => (
                          <div key={p.produto} className="flex items-center justify-between">
                            <div className="text-sm">{p.produto}</div>
                            <div className="text-sm font-semibold">{p.total}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground mb-2">UFs ativas (tingidas no mapa)</div>
                    <div className="text-sm text-muted-foreground">
                      {activeUFs.length ? activeUFs.join(", ") : "Nenhuma UF identificada nas vendas ativas."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* rodapé leve */}
          <div className="text-xs text-muted-foreground">
            Dica: se alguma UF não pintar, é porque o cliente ativo não tem <code>clientes.uf</code> preenchido.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
