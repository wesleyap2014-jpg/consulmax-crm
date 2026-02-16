// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Loader2, Phone, CalendarDays, Pencil, RefreshCw, MapPin } from "lucide-react";

/** ===== Tipos ===== **/
type Role = "admin" | "vendedor" | "viewer" | "gestor";

type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // auth.users.id
  nome: string | null;
  email: string | null;
  role: Role;
  is_active: boolean | null;
};

type LeadRow = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  descricao: string | null;
  owner_id: string | null; // auth_user_id do vendedor
  created_at?: string | null;
};

type VendaRow = {
  id: string;
  lead_id: string | null;
  cpf: string | null;
  cpf_cnpj: any | null; // bytea/hex no supabase client (depende)
  nascimento: string | null; // date
  descricao: string | null;
  telefone: string | null;
  email: string | null;

  codigo: string | null; // "00" ativa, diferente de "00" cancelada
  vendedor_id: string | null; // auth_user_id (no teu schema)
  produto: string | null;
  created_at?: string | null;
};

type ClienteRow = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco_cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  lead_id: string | null;
  created_at?: string | null;
};

type VClientesGeoRow = {
  uf: string | null;
  cidade: string | null;
  total: number | null;
};

/** ===== Helpers ===== **/
const NONE = "__none__";
const ME = "__me__";

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function maskPhone(v: string) {
  const d = onlyDigits(v);
  if (d.length <= 10) {
    // (##) ####-####
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 14);
  }
  // (##) #####-####
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .slice(0, 15);
}

function formatBRDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function normalizeUF(uf?: string | null) {
  if (!uf) return null;
  const s = String(uf).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
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

// Estima renda puxando um número do texto (observações/descrição) quando existe
function parseRendaFromText(text: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase();

  const rendaBlock = t.match(/renda[^0-9r$]{0,20}(r\$)?\s*([\d\.\,]{3,})/i);
  const m = rendaBlock?.[2] ? rendaBlock[2] : null;

  const rx = m ? m : (text.match(/R\$\s*([\d\.\,]{3,})/i)?.[1] ?? null);
  if (!rx) return null;

  const normalized = rx.replace(/\./g, "").replace(",", ".");
  const val = Number(normalized);
  if (!Number.isFinite(val) || val <= 0) return null;
  if (val < 300) return null;
  return Math.round(val);
}

function humanMoneyBR(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function buildWhatsAppLink(phone: string | null | undefined, text?: string) {
  const d = onlyDigits(phone || "");
  const num = d.length ? (d.startsWith("55") ? d : "55" + d) : "";
  const msg = text ? `&text=${encodeURIComponent(text)}` : "";
  return num ? `https://wa.me/${num}?${msg.replace(/^&/, "")}` : `https://wa.me/?${msg.replace(/^&/, "")}`;
}

/** ===== Integração Mapa (iframe) ===== **/
type ConsulmaxMapAPI = {
  setSelected: (uf: string | null) => void;
  getSelected: () => string | null;
  setActive: (ufs: string[]) => void;
  getActive: () => string[];
  clearActive: () => void;
};

function getMapAPI(iframe: HTMLIFrameElement | null): ConsulmaxMapAPI | null {
  const w = iframe?.contentWindow as any;
  return (w?.consulmaxMap as ConsulmaxMapAPI) ?? null;
}

/** =================================================================== **/
export default function Clientes() {
  /** ===== Auth / RBAC ===== **/
  const [loadingUser, setLoadingUser] = useState(true);
  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const isAdmin = me?.role === "admin";

  // Admin escolhe vendedor (users.id). Vendedor fica travado nele.
  const [selectedSeller, setSelectedSeller] = useState<string>(ME);

  const effectiveAuthSellerId = useMemo(() => {
    if (!me) return null;
    if (!isAdmin) return me.auth_user_id;
    if (selectedSeller === ME) return me.auth_user_id;
    const u = users.find((x) => x.id === selectedSeller);
    return u?.auth_user_id ?? me.auth_user_id;
  }, [me, isAdmin, selectedSeller, users]);

  /** ===== Tabs ===== **/
  const [tab, setTab] = useState<"cadastro" | "demografia">("cadastro");

  /** ===== Cadastro (baseline) ===== **/
  const [loadingCad, setLoadingCad] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [confirmQuery, setConfirmQuery] = useState("");

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [vendasByLead, setVendasByLead] = useState<Map<string, VendaRow[]>>(new Map());

  const [clientesConfirmados, setClientesConfirmados] = useState<ClienteRow[]>([]);
  const [confirmPage, setConfirmPage] = useState(1);
  const CONFIRM_PAGE_SIZE = 10;

  // Novo Cliente manual
  const [manualNome, setManualNome] = useState("");
  const [manualCpf, setManualCpf] = useState("");
  const [manualTelefone, setManualTelefone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualNasc, setManualNasc] = useState<string>(""); // yyyy-mm-dd
  const [manualCidade, setManualCidade] = useState("");
  const [manualUF, setManualUF] = useState("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<ClienteRow | null>(null);

  /** ===== Demografia ===== **/
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [selectedUF, setSelectedUF] = useState<string | null>(null);

  const [vendasAtivas, setVendasAtivas] = useState<VendaRow[]>([]);
  const [geoRows, setGeoRows] = useState<VClientesGeoRow[]>([]);

  // Map iframe
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  /** =========================
   *  LOAD USER
   *  ========================= */
  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;
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

  /** =========================
   *  CADASTRO: carregar leads + vendas + clientes
   *  ========================= */
  async function loadCadastro() {
    if (!effectiveAuthSellerId) return;
    setLoadingCad(true);

    try {
      // 1) Leads (filtra por nome)
      // RBAC: vendedor -> owner_id = auth_user_id; admin -> pode filtrar por vendedor selecionado
      let q = supabase
        .from("leads")
        .select("id, nome, telefone, email, descricao, owner_id, created_at")
        .order("created_at", { ascending: false })
        .limit(250);

      if (!isAdmin) q = q.eq("owner_id", effectiveAuthSellerId);
      else if (effectiveAuthSellerId) q = q.eq("owner_id", effectiveAuthSellerId);

      if (leadQuery.trim()) q = q.ilike("nome", `%${leadQuery.trim()}%`);

      const { data: leadsData, error: lErr } = await q;
      if (lErr) throw lErr;

      const ls = (leadsData as LeadRow[]) ?? [];
      setLeads(ls);

      const leadIds = ls.map((l) => l.id);

      // 2) Vendas desses leads (para puxar cpf/nascimento/descrição)
      if (leadIds.length === 0) {
        setVendasByLead(new Map());
        setClientesConfirmados([]);
        return;
      }

      const { data: vendasData, error: vErr } = await supabase
        .from("vendas")
        .select("id, lead_id, cpf, cpf_cnpj, nascimento, descricao, telefone, email, codigo, vendedor_id, produto, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (vErr) throw vErr;

      const vb = new Map<string, VendaRow[]>();
      for (const v of (vendasData as VendaRow[]) ?? []) {
        const lid = v.lead_id;
        if (!lid) continue;
        if (!vb.has(lid)) vb.set(lid, []);
        vb.get(lid)!.push(v);
      }
      setVendasByLead(vb);

      // 3) Clientes confirmados (para particionar)
      const { data: clientesData, error: cErr } = await supabase
        .from("clientes")
        .select("id, nome, data_nascimento, cpf, telefone, email, cidade, uf, observacoes, lead_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (cErr) throw cErr;

      setClientesConfirmados((clientesData as ClienteRow[]) ?? []);
    } catch (e) {
      console.error("Clientes: loadCadastro error", e);
    } finally {
      setLoadingCad(false);
    }
  }

  useEffect(() => {
    if (!me) return;
    loadCadastro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, selectedSeller]);

  // Particiona: “novos” = leads com venda (cpf/cpf_cnpj) mas ainda não têm registro em clientes
  const confirmedByLeadId = useMemo(() => {
    const m = new Map<string, ClienteRow>();
    for (const c of clientesConfirmados) {
      if (c.lead_id) m.set(c.lead_id, c);
    }
    return m;
  }, [clientesConfirmados]);

  const leadsWithCpfVenda = useMemo(() => {
    // baseline: considera apenas leads com pelo menos 1 venda com cpf text ou cpf_cnpj bytea
    const arr: {
      lead: LeadRow;
      vendaMaisRecente: VendaRow | null;
      cpfDig: string | null;
      nascISO: string | null;
      obs: string | null;
      vendasIds: string[];
    }[] = [];

    for (const l of leads) {
      const vs = vendasByLead.get(l.id) ?? [];
      const vv = vs[0] ?? null; // já vem desc por created_at
      const cpfText = vv?.cpf ? onlyDigits(vv.cpf) : null;

      // cpf_cnpj (bytea/hex) não dá pra parsear com segurança aqui sem regra fixa;
      // então seguimos: se cpf texto existir, ok.
      const hasCpf = !!(cpfText && cpfText.length >= 11);

      if (!hasCpf) continue;

      arr.push({
        lead: l,
        vendaMaisRecente: vv,
        cpfDig: cpfText,
        nascISO: vv?.nascimento ?? null,
        obs: vv?.descricao ?? l.descricao ?? null,
        vendasIds: vs.map((x) => x.id),
      });
    }
    return arr;
  }, [leads, vendasByLead]);

  const novos = useMemo(() => {
    return leadsWithCpfVenda.filter((x) => !confirmedByLeadId.has(x.lead.id));
  }, [leadsWithCpfVenda, confirmedByLeadId]);

  const confirmadosFiltrados = useMemo(() => {
    const q = confirmQuery.trim().toLowerCase();
    const list = clientesConfirmados.filter((c) => {
      if (!q) return true;
      const hay = `${c.nome ?? ""} ${c.telefone ?? ""} ${c.cpf ?? ""} ${c.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    const start = (confirmPage - 1) * CONFIRM_PAGE_SIZE;
    const end = start + CONFIRM_PAGE_SIZE;
    return { total: list.length, pageItems: list.slice(start, end) };
  }, [clientesConfirmados, confirmQuery, confirmPage]);

  /** ===== Cadastro: ações ===== **/
  async function confirmClientFromLead(leadId: string) {
    const item = leadsWithCpfVenda.find((x) => x.lead.id === leadId);
    if (!item || !me) return;

    const nome = item.lead.nome?.trim() || "Cliente";
    const telefone = item.lead.telefone || item.vendaMaisRecente?.telefone || null;
    const email = item.lead.email || item.vendaMaisRecente?.email || null;
    const nascimento = item.nascISO ?? null;
    const observacoes = item.obs ?? null;

    // UF/cidade só se já existirem no cadastro manual anterior; como aqui é "confirmar", deixamos nulo.
    // (Você pode evoluir depois pra puxar do lead se tiver endereço)
    try {
      setLoadingCad(true);

      // 1) atualiza lead (se você quiser marcar algo; aqui só garante campos)
      await supabase
        .from("leads")
        .update({
          telefone: telefone,
          email: email,
          descricao: item.lead.descricao ?? observacoes,
        })
        .eq("id", leadId);

      // 2) atualiza venda mais recente com nascimento/descricao (baseline)
      if (item.vendaMaisRecente?.id) {
        await supabase
          .from("vendas")
          .update({
            nascimento: nascimento,
            descricao: observacoes,
          })
          .eq("id", item.vendaMaisRecente.id);
      }

      // 3) insere em clientes
      const { error: insErr } = await supabase.from("clientes").insert({
        nome,
        data_nascimento: nascimento,
        cpf: item.cpfDig,
        telefone,
        email,
        cidade: null,
        uf: null,
        observacoes,
        lead_id: leadId,
        created_by: me.auth_user_id,
      });

      if (insErr) throw insErr;

      await loadCadastro();
    } catch (e) {
      console.error("confirmClient error", e);
    } finally {
      setLoadingCad(false);
    }
  }

  async function createManualClient() {
    if (!me) return;
    const nome = manualNome.trim();
    const cpf = onlyDigits(manualCpf);
    const tel = manualTelefone ? onlyDigits(manualTelefone) : "";
    const uf = normalizeUF(manualUF);

    if (!nome) return;

    try {
      setLoadingCad(true);

      const { error: insErr } = await supabase.from("clientes").insert({
        nome,
        cpf: cpf || null,
        telefone: tel ? maskPhone(tel) : null,
        email: manualEmail.trim() || null,
        data_nascimento: manualNasc || null,
        cidade: manualCidade.trim() || null,
        uf: uf,
        observacoes: null,
        lead_id: null,
        created_by: me.auth_user_id,
      });

      if (insErr) throw insErr;

      setManualNome("");
      setManualCpf("");
      setManualTelefone("");
      setManualEmail("");
      setManualNasc("");
      setManualCidade("");
      setManualUF("");

      await loadCadastro();
    } catch (e) {
      console.error("createManualClient error", e);
    } finally {
      setLoadingCad(false);
    }
  }

  async function saveEditCliente() {
    if (!editCliente) return;

    try {
      setLoadingCad(true);

      const uf = normalizeUF(editCliente.uf);

      const { error } = await supabase
        .from("clientes")
        .update({
          nome: editCliente.nome,
          cpf: editCliente.cpf ? onlyDigits(editCliente.cpf) : null,
          telefone: editCliente.telefone,
          email: editCliente.email,
          data_nascimento: editCliente.data_nascimento,
          cidade: editCliente.cidade,
          uf: uf,
          observacoes: editCliente.observacoes,
        })
        .eq("id", editCliente.id);

      if (error) throw error;

      setEditOpen(false);
      setEditCliente(null);
      await loadCadastro();
    } catch (e) {
      console.error("saveEditCliente error", e);
    } finally {
      setLoadingCad(false);
    }
  }

  /** =========================
   *  DEMOGRAFIA: carregar vendas ativas + clientes + view geo
   *  ========================= */
  async function loadDemografia() {
    if (!effectiveAuthSellerId) return;

    setLoadingDemo(true);
    try {
      // 1) vendas ativas (codigo='00') com RBAC
      let q = supabase
        .from("vendas")
        .select("id, lead_id, cpf, cpf_cnpj, nascimento, descricao, telefone, email, codigo, vendedor_id, produto, created_at")
        .eq("codigo", "00")
        .order("created_at", { ascending: false })
        .limit(3000);

      if (!isAdmin) q = q.eq("vendedor_id", effectiveAuthSellerId);
      else if (effectiveAuthSellerId) q = q.eq("vendedor_id", effectiveAuthSellerId);

      const { data: vAtivas, error: vErr } = await q;
      if (vErr) throw vErr;

      const vendas = (vAtivas as VendaRow[]) ?? [];
      setVendasAtivas(vendas);

      // 2) geo view (top cidades geral) - se existir
      const { data: geo, error: gErr } = await supabase
        .from("v_clientes_geo")
        .select("uf, cidade, total")
        .order("total", { ascending: false })
        .limit(30);

      if (gErr) {
        setGeoRows([]);
      } else {
        setGeoRows((geo as VClientesGeoRow[]) ?? []);
      }

      // 3) sincroniza seleção UF (se ela não existir mais, limpa)
      setSelectedUF((prev) => {
        if (!prev) return prev;
        const ufStillActive = vendas.some((vv) => {
          const c = confirmedByLeadId.get(vv.lead_id ?? "");
          return normalizeUF(c?.uf) === prev;
        });
        return ufStillActive ? prev : null;
      });
    } catch (e) {
      console.error("loadDemografia error", e);
    } finally {
      setLoadingDemo(false);
    }
  }

  // carrega demografia quando entrar na aba ou quando trocar vendedor
  useEffect(() => {
    if (!me) return;
    if (tab !== "demografia") return;
    loadDemografia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, selectedSeller, tab]);

  // Active UFs = vendas ativas cruzadas com clientes.uf (quando existir)
  const activeUFs = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendasAtivas) {
      const lid = v.lead_id;
      if (!lid) continue;
      const c = confirmedByLeadId.get(lid);
      const uf = normalizeUF(c?.uf);
      if (uf) set.add(uf);
    }
    return Array.from(set).sort();
  }, [vendasAtivas, confirmedByLeadId]);

  // Demografia do estado selecionado
  const demoUF = useMemo(() => {
    const ufx = selectedUF;

    const vendasFiltradas = ufx
      ? vendasAtivas.filter((v) => {
          const c = confirmedByLeadId.get(v.lead_id ?? "");
          return normalizeUF(c?.uf) === ufx;
        })
      : vendasAtivas;

    const leadIds = Array.from(new Set(vendasFiltradas.map((v) => v.lead_id).filter((x): x is string => !!x)));

    const ages: number[] = [];
    const rendas: number[] = [];
    const produtos: string[] = [];
    const cidades: string[] = [];

    for (const lid of leadIds) {
      const c = confirmedByLeadId.get(lid);
      const idade = calcAgeFromISODate(c?.data_nascimento ?? null) ?? calcAgeFromISODate(vendasFiltradas.find((x) => x.lead_id === lid)?.nascimento ?? null);
      if (typeof idade === "number") ages.push(idade);

      const r = parseRendaFromText(c?.observacoes ?? null);
      if (typeof r === "number") rendas.push(r);

      if (c?.cidade) cidades.push(c.cidade);
    }

    for (const v of vendasFiltradas) if (v.produto) produtos.push(v.produto);

    const idadeMedia = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const rendaMedia = rendas.length ? Math.round(rendas.reduce((a, b) => a + b, 0) / rendas.length) : null;

    const prodCount = new Map<string, number>();
    for (const p of produtos.map((x) => x.trim()).filter(Boolean)) prodCount.set(p, (prodCount.get(p) ?? 0) + 1);
    const produtosSorted = Array.from(prodCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([produto, total]) => ({ produto, total }));

    const cityCount = new Map<string, number>();
    for (const c of cidades.map((x) => x.trim()).filter(Boolean)) cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
    const topCidades = Array.from(cityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cidade, total]) => ({ cidade, total }));

    const produtoTop = produtosSorted[0]?.produto ?? null;
    const persona = `Base ativa com ${leadIds.length} clientes${ufx ? ` em ${ufx}` : ""}. ${
      produtoTop ? `Produto mais comum: ${produtoTop}.` : ""
    } Idade média ${idadeMedia ?? "—"} anos.`;

    return {
      totalClientes: leadIds.length,
      idadeMedia,
      rendaMedia,
      rendaBaseSize: rendas.length,
      produtosSorted,
      topCidades,
      persona,
    };
  }, [selectedUF, vendasAtivas, confirmedByLeadId]);

  // Top cidades Brasil (view)
  const topCidadesBrasil = useMemo(() => {
    return geoRows
      .map((r) => ({
        uf: normalizeUF(r.uf),
        cidade: r.cidade?.trim() ?? null,
        total: typeof r.total === "number" ? r.total : 0,
      }))
      .filter((r) => r.uf && r.cidade && r.total > 0)
      .slice(0, 6) as { uf: string; cidade: string; total: number }[];
  }, [geoRows]);

  /** ===== Map events ===== **/
  function handleMapLoad() {
    const iframe = iframeRef.current;
    const w = iframe?.contentWindow;
    if (!w) return;

    const onSelected = (ev: any) => {
      const uf = normalizeUF(ev?.detail?.uf ?? null);
      setSelectedUF(uf);
    };

    try {
      w.addEventListener("consulmax:uf-selected", onSelected as any);
      setMapReady(true);
    } catch (e) {
      console.warn("map listener error", e);
    }

    return () => {
      try {
        w.removeEventListener("consulmax:uf-selected", onSelected as any);
      } catch {}
    };
  }

  // pinta estados ativos
  useEffect(() => {
    if (!mapReady) return;
    const api = getMapAPI(iframeRef.current);
    if (!api) return;
    try {
      api.setActive(activeUFs);
    } catch (e) {
      console.warn("consulmaxMap.setActive error", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeUFs.join("|")]);

  // sincroniza seleção (quando limpar UF pelo painel)
  useEffect(() => {
    if (!mapReady) return;
    const api = getMapAPI(iframeRef.current);
    if (!api) return;
    try {
      api.setSelected(selectedUF);
    } catch {}
  }, [mapReady, selectedUF]);

  /** ===== Loading geral ===== **/
  const loading = loadingUser || loadingCad || loadingDemo;

  /** =================================================================== **/
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm text-muted-foreground">Clientes</div>
          <div className="text-lg font-semibold">Cadastro e Demografia</div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="min-w-[220px]">
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger>
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ME}>Meu painel</SelectItem>
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

          <Button
            onClick={() => {
              if (tab === "cadastro") loadCadastro();
              else loadDemografia();
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="demografia">Demografia</TabsTrigger>
        </TabsList>

        {/* ===================== CADASTRO (baseline preservado) ===================== */}
        <TabsContent value="cadastro" className="space-y-4">
          {/* Novo Cliente manual */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Novo Cliente (manual)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={manualNome} onChange={(e) => setManualNome(e.target.value)} placeholder="Nome do cliente" />
                </div>

                <div>
                  <Label>CPF</Label>
                  <Input value={manualCpf} onChange={(e) => setManualCpf(e.target.value)} placeholder="000.000.000-00" />
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={manualTelefone}
                    onChange={(e) => setManualTelefone(maskPhone(e.target.value))}
                    placeholder="(69) 9xxxx-xxxx"
                  />
                </div>

                <div>
                  <Label>E-mail</Label>
                  <Input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="email@..." />
                </div>

                <div>
                  <Label>Nascimento</Label>
                  <Input type="date" value={manualNasc} onChange={(e) => setManualNasc(e.target.value)} />
                </div>

                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <div>
                    <Label>Cidade</Label>
                    <Input value={manualCidade} onChange={(e) => setManualCidade(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input value={manualUF} onChange={(e) => setManualUF(e.target.value)} placeholder="RO" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={createManualClient} disabled={loadingCad || !manualNome.trim()}>
                  {loadingCad ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Cadastrar
                </Button>
                <div className="text-xs text-muted-foreground">
                  Dica: se preencher UF, isso já ajuda a Demografia/Mapa.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leads com vendas -> Novos */}
          <Card className="glass-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Novos (prontos para confirmar)</CardTitle>
              <div className="w-[260px]">
                <Input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Buscar lead por nome..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadCadastro();
                  }}
                />
              </div>
            </CardHeader>
            <CardContent>
              {novos.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum novo cliente para confirmar.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {novos.slice(0, 20).map((n) => {
                    const l = n.lead;
                    const vv = n.vendaMaisRecente;
                    return (
                      <div key={l.id} className="rounded-xl border bg-white/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{l.nome ?? "—"}</div>
                            <div className="text-sm text-muted-foreground">
                              {l.telefone ? maskPhone(l.telefone) : "—"} {l.email ? `• ${l.email}` : ""}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              CPF: <span className="font-medium">{n.cpfDig ?? "—"}</span>
                              {vv?.nascimento ? (
                                <>
                                  {" "}
                                  • Nasc: <span className="font-medium">{formatBRDate(vv.nascimento)}</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <Button
                            onClick={() => confirmClientFromLead(l.id)}
                            disabled={loadingCad}
                          >
                            {loadingCad ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground">
                Regra: aparece aqui quando existe pelo menos 1 venda com CPF e o cliente ainda não está cadastrado em <code>clientes</code>.
              </div>
            </CardContent>
          </Card>

          {/* Confirmados */}
          <Card className="glass-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Clientes confirmados</CardTitle>
              <div className="w-[260px]">
                <Input
                  value={confirmQuery}
                  onChange={(e) => {
                    setConfirmQuery(e.target.value);
                    setConfirmPage(1);
                  }}
                  placeholder="Buscar por nome/telefone/cpf/email..."
                />
              </div>
            </CardHeader>

            <CardContent>
              {confirmadosFiltrados.total === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum cliente confirmado encontrado.</div>
              ) : (
                <div className="space-y-2">
                  {confirmadosFiltrados.pageItems.map((c) => (
                    <div key={c.id} className="rounded-xl border bg-white/50 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{c.nome}</div>
                          <div className="text-sm text-muted-foreground">
                            {c.telefone ? c.telefone : "—"} {c.email ? `• ${c.email}` : ""}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                            <span>CPF: <span className="font-medium">{c.cpf ?? "—"}</span></span>
                            <span>•</span>
                            <span>Nasc: <span className="font-medium">{formatBRDate(c.data_nascimento)}</span></span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="font-medium">
                                {(c.cidade || "—")}{c.uf ? `/${normalizeUF(c.uf)}` : ""}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const link = buildWhatsAppLink(c.telefone, `Olá ${c.nome}! Wesley da Consulmax por aqui.`);
                              window.open(link, "_blank");
                            }}
                            disabled={!c.telefone}
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            WhatsApp
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => {
                              // atalho simples: você pode trocar para a rota exata do seu CRM
                              // Ex.: /agenda?leadId=... ou /agenda?clienteId=...
                              const url = c.lead_id ? `/agenda?leadId=${c.lead_id}` : `/agenda?clienteId=${c.id}`;
                              window.location.href = url;
                            }}
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            Agenda
                          </Button>

                          <Button
                            onClick={() => {
                              setEditCliente({
                                ...c,
                                uf: normalizeUF(c.uf),
                                telefone: c.telefone ?? null,
                              });
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Paginação */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-muted-foreground">
                      {confirmadosFiltrados.total} clientes • página {confirmPage} de{" "}
                      {Math.max(1, Math.ceil(confirmadosFiltrados.total / CONFIRM_PAGE_SIZE))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmPage((p) => Math.max(1, p - 1))}
                        disabled={confirmPage <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setConfirmPage((p) =>
                            Math.min(Math.ceil(confirmadosFiltrados.total / CONFIRM_PAGE_SIZE), p + 1)
                          )
                        }
                        disabled={confirmPage >= Math.ceil(confirmadosFiltrados.total / CONFIRM_PAGE_SIZE)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== DEMOGRAFIA (bonita e discreta) ===================== */}
        <TabsContent value="demografia" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            {/* MAPA */}
            <Card className="glass-card">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Mapa por UF</CardTitle>
                  <div className="text-xs text-muted-foreground">Estados com vendas ativas (código 00) ficam tingidos</div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setSelectedUF(null)} disabled={!selectedUF}>
                    Limpar UF
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="rounded-xl border bg-white/50 overflow-hidden">
                  <div className="h-[300px] sm:h-[340px] w-full">
                    <iframe
                      ref={iframeRef}
                      title="Mapa por UF • Consulmax"
                      src="/maps/br-estados.html"
                      className="h-full w-full"
                      onLoad={handleMapLoad as any}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>UF selecionada:</span>
                  <span className="rounded-full border bg-white/60 px-2 py-1 font-medium text-foreground">
                    {selectedUF ?? "—"}
                  </span>
                  <span>•</span>
                  <span>UFs ativas: {activeUFs.length ? activeUFs.join(", ") : "—"}</span>
                </div>
              </CardContent>
            </Card>

            {/* PAINEL */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Demografia • {selectedUF ?? "Selecione uma UF"}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {!selectedUF ? (
                  <div className="text-sm text-muted-foreground">
                    Clique em um estado no mapa para ver os números desse estado.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border bg-white/50 p-3">
                        <div className="text-xs text-muted-foreground">Clientes ativos</div>
                        <div className="mt-1 text-xl font-semibold">{demoUF.totalClientes}</div>
                      </div>

                      <div className="rounded-xl border bg-white/50 p-3">
                        <div className="text-xs text-muted-foreground">Idade média</div>
                        <div className="mt-1 text-xl font-semibold">{demoUF.idadeMedia ?? "—"}</div>
                      </div>

                      <div className="rounded-xl border bg-white/50 p-3 col-span-2">
                        <div className="text-xs text-muted-foreground">Renda média (estimada)</div>
                        <div className="mt-1 text-xl font-semibold">
                          {typeof demoUF.rendaMedia === "number" ? humanMoneyBR(demoUF.rendaMedia) : "—"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Base parsável: {demoUF.rendaBaseSize}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white/50 p-3">
                      <div className="text-xs text-muted-foreground">Persona (auto)</div>
                      <div className="mt-2 text-sm text-muted-foreground">{demoUF.persona}</div>
                    </div>

                    <div className="rounded-xl border bg-white/50 p-3">
                      <div className="text-xs text-muted-foreground">Divisão por produto</div>
                      <div className="mt-2 space-y-2">
                        {demoUF.produtosSorted.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Sem produto identificado nas vendas ativas.</div>
                        ) : (
                          demoUF.produtosSorted.slice(0, 8).map((p) => (
                            <div key={p.produto} className="flex items-center justify-between">
                              <div className="text-sm">{p.produto}</div>
                              <div className="text-sm font-semibold">{p.total}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white/50 p-3">
                      <div className="text-xs text-muted-foreground">Top cidades (pela base ativa)</div>
                      <div className="mt-2 space-y-2">
                        {demoUF.topCidades.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Sem dados suficientes.</div>
                        ) : (
                          demoUF.topCidades.map((r) => (
                            <div key={r.cidade} className="flex items-center justify-between">
                              <div className="text-sm">{r.cidade}</div>
                              <div className="text-sm font-semibold">{r.total}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Brasil (quando não tem UF selecionada) - pequeno e bonito */}
                {!selectedUF ? (
                  <div className="rounded-xl border bg-white/50 p-3">
                    <div className="text-xs text-muted-foreground">Top cidades (view)</div>
                    <div className="mt-2 space-y-2">
                      {topCidadesBrasil.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Sem dados da view.</div>
                      ) : (
                        topCidadesBrasil.map((r) => (
                          <div key={`${r.uf}-${r.cidade}`} className="flex items-center justify-between">
                            <div className="text-sm">
                              {r.cidade} <span className="text-xs text-muted-foreground">• {r.uf}</span>
                            </div>
                            <div className="text-sm font-semibold">{r.total}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground">
            Se algum estado não pintar: é porque existem vendas ativas, mas o cliente não tem <code>UF</code> preenchida no cadastro.
          </div>
        </TabsContent>
      </Tabs>

      {/* ===================== EDIT MODAL ===================== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>

          {!editCliente ? null : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Nome</Label>
                <Input
                  value={editCliente.nome}
                  onChange={(e) => setEditCliente({ ...editCliente, nome: e.target.value })}
                />
              </div>

              <div>
                <Label>CPF</Label>
                <Input
                  value={editCliente.cpf ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, cpf: e.target.value })}
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={editCliente.telefone ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, telefone: maskPhone(e.target.value) })}
                />
              </div>

              <div>
                <Label>E-mail</Label>
                <Input
                  value={editCliente.email ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, email: e.target.value })}
                />
              </div>

              <div>
                <Label>Nascimento</Label>
                <Input
                  type="date"
                  value={editCliente.data_nascimento ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, data_nascimento: e.target.value || null })}
                />
              </div>

              <div>
                <Label>Cidade</Label>
                <Input
                  value={editCliente.cidade ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, cidade: e.target.value })}
                />
              </div>

              <div>
                <Label>UF</Label>
                <Input
                  value={editCliente.uf ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, uf: e.target.value })}
                  placeholder="RO"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Input
                  value={editCliente.observacoes ?? ""}
                  onChange={(e) => setEditCliente({ ...editCliente, observacoes: e.target.value })}
                  placeholder="..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEditCliente} disabled={loadingCad || !editCliente}>
              {loadingCad ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
