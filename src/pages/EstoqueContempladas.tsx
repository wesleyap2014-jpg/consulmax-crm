// src/pages/EstoqueContempladas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MaxContempladas from "@/components/contempladas/MaxContempladas";
import { ContempladasHero, ContempladasIndicadores, ContempladasDock, ContempladasCardDialog, ContempladasPropostaDialog } from "@/components/contempladas/ContempladasExperience";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  PlusCircle,
  Loader2,
  PhoneOutgoing,
  Lock,
  CheckCircle2,
  Copy,
  Trash2,
  Pencil,
  Calculator,
  CheckCheck,
  Palette,
  SlidersHorizontal,
  FilterX,
  ChevronDown,
  Search,
  RefreshCw,
  Minus,
  Plus,
  CarFront,
  Home,
  ListFilter,
} from "lucide-react";

type Segmento = "Automóvel" | "Imóvel" | "Pesados" | "Motocicletas" | "Serviços";
type Status = "disponivel" | "reservada" | "transferida";
type SourceMode = "externo" | "crm";

type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  user_role?: string | null;
  role?: string | null;
};

type Partner = { id: string; nome: string; logo_path?: string | null };
type Admin = { id: string; nome: string; logo_path?: string | null };

type CotaRow = {
  id: string;
  codigo: string;
  segmento: Segmento;
  numero_proposta?: string | null;

  credito_contratado: number;
  credito_disponivel: number;

  prazo_restante: number;
  valor_parcela: number;

  comissao_corretora: number;
  valor_pago_ao_cliente: number;

  status: Status;

  comprador_nome?: string | null;
  comprador_cpf?: string | null;

  sinal_comprovante_path?: string | null;

  partner?: Partner | null;
  admin?: Admin | null;

  vendedor_id?: string | null;
  vendedor_pct?: number | null;

  reservado_em?: string | null;

  external?: boolean;
  external_taxa_transferencia?: number | string | null;
  external_fundo?: number;
  external_prox_reajuste?: string | null;
  external_reserva_label?: string | null;
  external_seguro_vida?: number | string | null;
};

type CotaCalc = CotaRow & {
  _calc: {
    pct: number;
    comissaoVendedor: number;
    comissaoConsulmax: number;
    comissaoTotal: number;
    entrada: number;
  };
};

type ReservationRequest = {
  id: string;
  cota_id: string;
  vendor_id: string;
  vendor_pct: number;
  status: "aberta" | "cancelada" | "convertida";
  created_at: string;
  vendor_nome?: string;
};

type ExternalCota = {
  id: number;
  categoria: string;
  valor_credito: string;
  valor_credito_original: string;
  entrada: number | string;
  taxa_transferencia?: number | string | null;
  parcelas: number;
  valor_parcela: string;
  administradora: string;
  reserva: "Reservar" | "Reservado" | string;
  fundo: string;
  prox_reajuste: string | null;
  administradora_img: string;
  entrada_sem_comissao?: number | string | null;
  entrada_sem_comissao_fmt?: string;
  valor_credito_fmt: string;
  valor_credito_original_fmt: string;
  entrada_fmt: string;
  valor_parcela_fmt: string;
  fundo_fmt: string;

  seguro_vida?: number | string | null;
  seg_vida?: number | string | null;
  seguro_de_vida?: number | string | null;
};

const WHATSAPP_RESERVA_NUMBER = "5569993917465";
const NONE = "__none__";
const EXTERNAL_STOCK_URL = "https://fragaebitelloconsorcios.com.br/api/json/contemplados";

const DEFAULT_VENDOR_COMMISSION_PCT = 0.025;
const CONSULMAX_COMMISSION_PCT = 0.025;
const ALLOWED_COMMISSION_PCTS = [0.005, 0.01, 0.015, 0.02, 0.025];

function formatBRL(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBRLNoSymbol(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clampPct(p: number) {
  const n = Number(p || DEFAULT_VENDOR_COMMISSION_PCT);

  return ALLOWED_COMMISSION_PCTS.reduce((closest, current) => {
    return Math.abs(current - n) < Math.abs(closest - n) ? current : closest;
  }, DEFAULT_VENDOR_COMMISSION_PCT);
}

function pctToHuman(p: number) {
  const value = p * 100;
  const txt = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(".", ",");
  return `${txt}%`;
}

function pct2Human(p: number) {
  return `${(p * 100).toFixed(2).replace(".", ",")}%`;
}

function toTelDigits(t: string) {
  return (t || "").replace(/\D/g, "");
}

function parseBRNumber(input: string) {
  const s = (input || "").trim();
  if (!s) return 0;

  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);

  return Number.isFinite(n) ? n : 0;
}

function toNumber(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;

  const s = String(v).trim();
  if (!s) return 0;

  if (s.includes("R$")) {
    return Number(s.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  }

  if (s.includes(",") && s.includes(".")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (s.includes(",") && !s.includes(".")) return Number(s.replace(",", ".")) || 0;

  return Number(s) || 0;
}

function safeInt(n: any) {
  const v = Math.floor(Number(n || 0));
  return Number.isFinite(v) ? v : 0;
}

function calcCompoundRateMonthly(pv: number, fv: number, n: number) {
  const PV = Number(pv || 0);
  const FV = Number(fv || 0);
  const N = Math.max(1, Math.floor(Number(n || 0)));

  if (PV <= 0 || FV <= 0) return 0;

  return Math.pow(FV / PV, 1 / N) - 1;
}

function normalizeText(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function EstoqueContempladas() {
  const [loading, setLoading] = useState(false);
  const [savingCota, setSavingCota] = useState(false);
  const [savingReserve, setSavingReserve] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  const [me, setMe] = useState<UserRow | null>(null);

  const isAdmin = useMemo(() => {
    const r = (me?.user_role || me?.role || "").toString();
    return r === "admin";
  }, [me]);

  const [supportsTransferida, setSupportsTransferida] = useState<boolean>(false);

  function notifyError(title: string, err: any) {
    console.error(title, err);
    const msg = (err?.message || err?.error_description || err?.toString?.() || "Erro desconhecido") as string;
    window.alert(`${title}\n\n${msg}`);
  }

  async function copyToClipboard(text: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      showToast("Resumo copiado ✅");
    } catch (e) {
      console.warn("Falha ao copiar:", e);
      window.alert("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  const [sourceMode, setSourceMode] = useState<SourceMode>("externo");

  const [segFilter, setSegFilter] = useState<"all" | Segmento>("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("disponivel");
  const [adminFilter, setAdminFilter] = useState<string>("all");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"creditoAsc" | "creditoDesc" | "entradaAsc" | "parcelaAsc">("creditoAsc");
  const [maxOpenSignal, setMaxOpenSignal] = useState(0);
  const [openCard, setOpenCard] = useState(false);
  const [openProposta, setOpenProposta] = useState(false);

  const [commissionPct, setCommissionPct] = useState<number>(DEFAULT_VENDOR_COMMISSION_PCT);
  const commissionPctHuman = useMemo(() => pctToHuman(commissionPct), [commissionPct]);

  const [cotas, setCotas] = useState<CotaRow[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [vendedores, setVendedores] = useState<UserRow[]>([]);

  const vendedoresById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const v of vendedores) m.set(v.id, v);
    return m;
  }, [vendedores]);

  const adminFilterOptions = useMemo(() => {
    const m = new Map<string, string>();

    for (const admin of admins) {
      if (admin.id && admin.nome) m.set(admin.id, admin.nome);
    }

    for (const cota of cotas) {
      const id = cota.admin?.id || "";
      const nome = cota.admin?.nome || "";
      if (id && nome) m.set(id, nome);
    }

    return Array.from(m.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [admins, cotas]);

  const [openCreate, setOpenCreate] = useState(false);
  const [openReserve, setOpenReserve] = useState<{ open: boolean; cota: CotaRow | null }>({ open: false, cota: null });

  const [openVendorReserve, setOpenVendorReserve] = useState<{ open: boolean; cota: CotaRow | null }>({
    open: false,
    cota: null,
  });

  const [openSum, setOpenSum] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorRule, setAnchorRule] = useState<{
    partnerId: string | null;
    adminId: string | null;
    segmento: Segmento | null;
  } | null>(null);

  const [openManage, setOpenManage] = useState<{ open: boolean; cota: CotaRow | null }>({ open: false, cota: null });

  const [createTabPartner, setCreateTabPartner] = useState<"select" | "new">("select");
  const [createTabAdmin, setCreateTabAdmin] = useState<"select" | "new">("select");

  const [partnerId, setPartnerId] = useState<string>("");
  const [adminId, setAdminId] = useState<string>("");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerLogo, setNewPartnerLogo] = useState<File | null>(null);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminLogo, setNewAdminLogo] = useState<File | null>(null);

  const [segmento, setSegmento] = useState<Segmento>("Automóvel");
  const [codigoCota, setCodigoCota] = useState("");
  const [numeroProposta, setNumeroProposta] = useState("");
  const [creditoContratado, setCreditoContratado] = useState("");
  const [creditoDisponivel, setCreditoDisponivel] = useState("");
  const [prazoRestante, setPrazoRestante] = useState("");
  const [valorParcela, setValorParcela] = useState("");
  const [comissaoCorretora, setComissaoCorretora] = useState("");
  const [valorPagoCliente, setValorPagoCliente] = useState("");

  const [buyerName, setBuyerName] = useState("");
  const [buyerCpf, setBuyerCpf] = useState("");
  const [sinalFile, setSinalFile] = useState<File | null>(null);

  const [reserveVendorId, setReserveVendorId] = useState<string>(NONE);
  const [reserveVendorPct, setReserveVendorPct] = useState<number>(DEFAULT_VENDOR_COMMISSION_PCT);

  const [reserveRequests, setReserveRequests] = useState<ReservationRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>(NONE);

  const [editPartnerId, setEditPartnerId] = useState<string>("");
  const [editAdminId, setEditAdminId] = useState<string>("");
  const [editSegmento, setEditSegmento] = useState<Segmento>("Automóvel");
  const [editCodigo, setEditCodigo] = useState("");
  const [editNumeroProposta, setEditNumeroProposta] = useState("");
  const [editCreditoContratado, setEditCreditoContratado] = useState("");
  const [editCreditoDisponivel, setEditCreditoDisponivel] = useState("");
  const [editPrazoRestante, setEditPrazoRestante] = useState("");
  const [editValorParcela, setEditValorParcela] = useState("");
  const [editComissaoCorretora, setEditComissaoCorretora] = useState("");
  const [editValorPagoCliente, setEditValorPagoCliente] = useState("");

  function isExternalCota(cota: CotaRow | any) {
    return Boolean(cota?.external) || String(cota?.id || "").startsWith("external-");
  }

  function mapExternalSegmento(categoria: string): Segmento {
    const c = normalizeText(categoria);

    if (c.includes("imovel")) return "Imóvel";
    if (c.includes("moto")) return "Motocicletas";
    if (["caminhao", "pesado", "trator", "maquina", "onibus", "agricol", "implemento"].some((t) => c.includes(t))) return "Pesados";

    return "Automóvel";
  }

  function mapExternalStatus(reserva: string): Status {
    const r = normalizeText(reserva);
    if (r.includes("reservado")) return "reservada";
    return "disponivel";
  }

  function getExternalEntradaSemComissao(item: ExternalCota) {
    const entradaSemComissao = toNumber(item.entrada_sem_comissao);

    if (entradaSemComissao > 0) return entradaSemComissao;

    const entrada = toNumber(item.entrada);
    const creditoDisponivel = toNumber(item.valor_credito);
    const comissaoTotalPadrao = creditoDisponivel * (DEFAULT_VENDOR_COMMISSION_PCT + CONSULMAX_COMMISSION_PCT);

    return Math.max(0, entrada - comissaoTotalPadrao);
  }

  function mapExternalToCotaRow(item: ExternalCota): CotaRow {
    const entradaSemComissao = getExternalEntradaSemComissao(item);
    const seguroVida = item.seguro_vida ?? item.seg_vida ?? item.seguro_de_vida ?? null;

    return {
      id: `external-${item.id}`,
      codigo: String(item.id),
      segmento: mapExternalSegmento(item.categoria),
      numero_proposta: null,

      credito_contratado: toNumber(item.valor_credito_original),
      credito_disponivel: toNumber(item.valor_credito),

      prazo_restante: safeInt(item.parcelas),
      valor_parcela: toNumber(item.valor_parcela),

      comissao_corretora: 0,
      valor_pago_ao_cliente: entradaSemComissao,

      status: mapExternalStatus(item.reserva),

      comprador_nome: null,
      comprador_cpf: null,
      sinal_comprovante_path: null,

      partner: {
        id: "external",
        nome: "Estoque externo",
        logo_path: null,
      },

      admin: {
        id: `external-admin-${normalizeText(item.administradora).replace(/\s+/g, "-")}`,
        nome: item.administradora || "Administradora",
        logo_path: item.administradora_img || null,
      },

      vendedor_id: null,
      vendedor_pct: null,
      reservado_em: null,

      external: true,
      external_taxa_transferencia: item.taxa_transferencia ?? null,
      external_fundo: toNumber(item.fundo),
      external_prox_reajuste: item.prox_reajuste || null,
      external_reserva_label: item.reserva || null,
      external_seguro_vida: seguroVida,
    };
  }

  async function loadMe() {
    const { data: auth } = await supabase.auth.getUser();
    const au = auth?.user?.id;

    if (!au) return;

    const { data, error } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,user_role,role")
      .eq("auth_user_id", au)
      .maybeSingle();

    if (!error && data) setMe(data as any);
  }

  async function detectEnumTransferidaSupport() {
    try {
      const { error } = await supabase.from("stock_cotas").select("id").eq("status", "transferida").limit(1);

      if (error) {
        const msg = (error as any)?.message || "";

        if (msg.toLowerCase().includes("invalid input value for enum")) {
          setSupportsTransferida(false);
          setStatusFilter((prev) => (prev === "transferida" ? "disponivel" : prev));
          return;
        }
      }

      setSupportsTransferida(true);
    } catch {
      setSupportsTransferida(false);
      setStatusFilter((prev) => (prev === "transferida" ? "disponivel" : prev));
    }
  }

  async function loadBaseLists() {
    const [p, a] = await Promise.all([
      supabase.from("stock_partners").select("id,nome,logo_path").order("nome"),
      supabase.from("stock_admins").select("id,nome,logo_path").order("nome"),
    ]);

    if (!p.error) setPartners((p.data || []) as any);
    if (!a.error) setAdmins((a.data || []) as any);

    if (isAdmin) {
      const v = await supabase
        .from("users")
        .select("id,auth_user_id,nome,user_role,role")
        .or("user_role.eq.vendedor,role.eq.vendedor")
        .order("nome");

      if (!v.error) setVendedores((v.data || []) as any);
    }
  }

  async function loadCommissionSetting(userId: string) {
    const { data, error } = await supabase
      .from("stock_vendor_settings")
      .select("commission_pct")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data?.commission_pct !== undefined && data?.commission_pct !== null) {
      setCommissionPct(clampPct(Number(data.commission_pct)));
    } else {
      await supabase.from("stock_vendor_settings").upsert({ user_id: userId, commission_pct: DEFAULT_VENDOR_COMMISSION_PCT });
      setCommissionPct(DEFAULT_VENDOR_COMMISSION_PCT);
    }
  }

  async function saveCommissionSetting(pct: number) {
    const value = clampPct(pct);
    if (!me?.id) { setCommissionPct(value); return; }
    const { error } = await supabase.from("stock_vendor_settings").upsert({ user_id: me.id, commission_pct: value });
    if (error) notifyError("Erro ao salvar comissão do vendedor", error);
    else setCommissionPct(value); // Reflete no MAX após persistência para evitar consulta com percentual antigo.
  }

  async function loadExternalCotas() {
    setLoading(true);

    try {
      const res = await fetch(EXTERNAL_STOCK_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao buscar estoque externo.`);

      const json = (await res.json()) as ExternalCota[];
      if (!Array.isArray(json)) throw new Error("A API externa não retornou uma lista válida.");

      // Keep the full catalog for MAX; table filtering happens in the rows memo.
      const mapped = json.map(mapExternalToCotaRow);

      setCotas(mapped);
    } catch (err: any) {
      setCotas([]);
      notifyError(
        "Erro ao carregar estoque externo",
        err?.message?.includes("Failed to fetch")
          ? new Error("O navegador bloqueou a leitura da API externa. Provável CORS. Será necessário criar uma rota proxy no CRM.")
          : err
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadCotas() {
    setLoading(true);

    try {
      let q = supabase
        .from("stock_cotas")
        .select(
          `
          id,codigo,segmento,numero_proposta,
          credito_contratado,credito_disponivel,
          prazo_restante,valor_parcela,
          comissao_corretora,valor_pago_ao_cliente,
          status,comprador_nome,comprador_cpf,
          sinal_comprovante_path,vendedor_id,vendedor_pct,reservado_em,
          partner:stock_partners(id,nome,logo_path),
          admin:stock_admins(id,nome,logo_path)
        `
        )
        .order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;

      setCotas((data || []) as any);
    } catch (err) {
      notifyError("Erro ao carregar cotas", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveSource() {
    setSelectedIds([]);
    setAnchorRule(null);

    if (sourceMode === "externo") await loadExternalCotas();
    else await loadCotas();
  }

  useEffect(() => {
    (async () => {
      await loadMe();
      await detectEnumTransferidaSupport();
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!me?.id) return;
      await loadCommissionSetting(me.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    (async () => {
      await loadBaseLists();
      if (sourceMode === "externo") await loadExternalCotas();
      else await loadCotas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, supportsTransferida, sourceMode]);

  const maxRows = useMemo<CotaCalc[]>(() => {
    return cotas
      .map((c) => {
        const pct = clampPct(commissionPct);
        const credito = Number(c.credito_disponivel || 0);

        const comissaoVendedor = credito * pct;
        const comissaoConsulmax = credito * CONSULMAX_COMMISSION_PCT;
        const comissaoTotal = comissaoVendedor + comissaoConsulmax;
        const entrada = Number(c.valor_pago_ao_cliente || 0) + comissaoTotal;

        return {
          ...c,
          _calc: {
            pct,
            comissaoVendedor,
            comissaoConsulmax,
            comissaoTotal,
            entrada,
          },
        };
      })
      .sort(
        (a, b) =>
          Number(a.credito_disponivel || 0) - Number(b.credito_disponivel || 0)
      );
  }, [cotas, commissionPct]);

  const rows = useMemo<CotaCalc[]>(() => {
    const min = parseBRNumber(minValue);
    const max = parseBRNumber(maxValue);
    const search = normalizeText(searchText);
    return maxRows.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (segFilter !== "all" && c.segmento !== segFilter) return false;
      if (adminFilter !== "all" && c.admin?.id !== adminFilter) return false;
      if (minValue.trim() !== "" && c.credito_disponivel < min) return false;
      if (maxValue.trim() !== "" && c.credito_disponivel > max) return false;
      if (search && !normalizeText([c.codigo, c.segmento, c.admin?.nome, c.partner?.nome, c.numero_proposta].filter(Boolean).join(" ")).includes(search)) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "creditoDesc") return b.credito_disponivel - a.credito_disponivel;
      if (sortBy === "entradaAsc") return a._calc.entrada - b._calc.entrada;
      if (sortBy === "parcelaAsc") return a.valor_parcela - b.valor_parcela;
      return a.credito_disponivel - b.credito_disponivel;
    });
  }, [maxRows, segFilter, statusFilter, adminFilter, minValue, maxValue, searchText, sortBy]);

  function seguroVidaLabel(c: any) {
    const raw = c?.external_seguro_vida;

    if (raw === null || raw === undefined || raw === "") return "consultar";

    const value = toNumber(raw);
    if (value > 0) return formatBRL(value);

    if (typeof raw === "string" && raw.trim()) return raw;

    return "consultar";
  }

  function buildWhatsAppMessage(c: CotaRow) {
    const calc = rows.find((r) => r.id === c.id)?._calc;
    const entrada = Number(calc?.entrada || 0);

    const adminName = c.admin?.nome || "—";
    const partnerName = c.partner?.nome || "—";
    const parcelaTxt = `${c.prazo_restante}x de ${formatBRL(Number(c.valor_parcela || 0))}`;

    let text =
      `Quero reservar a cota ${c.codigo}.\n\n` +
      `• Administradora: ${adminName}\n` +
      `• Parceiro: ${partnerName}\n` +
      `• Segmento: ${c.segmento}\n` +
      `• Crédito disponível: ${formatBRL(Number(c.credito_disponivel || 0))}\n` +
      `• Parcela: ${parcelaTxt}\n` +
      `• Entrada estimada: ${formatBRL(entrada)}\n` +
      `• Comissão vendedor: ${formatBRL(Number(calc?.comissaoVendedor || 0))} (${commissionPctHuman})\n`;

    if (isExternalCota(c)) {
      text += `• Origem: Estoque externo\n`;
      if (c.external_prox_reajuste) text += `• Índice reajuste: ${c.external_prox_reajuste}\n`;
      if (Number(c.external_fundo || 0) > 0) text += `• Fundo comum: ${formatBRL(Number(c.external_fundo || 0))}\n`;
      text += `• Transferência: ${taxaTransferenciaLabel(c)}\n`;

      const segVida = seguroVidaLabel(c);
      if (segVida !== "consultar") text += `• Seg. de Vida: ${segVida}\n`;
    }

    return text;
  }

  function openWhatsApp(text: string) {
    const digits = toTelDigits(WHATSAPP_RESERVA_NUMBER);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function vendorRequestReserve(c: CotaRow) {
    if (isExternalCota(c)) {
      openWhatsApp(buildWhatsAppMessage(c));
      return;
    }

    if (!me?.id) return;

    try {
      const { error } = await supabase.from("stock_reservation_requests").insert({
        cota_id: c.id,
        vendor_id: me.id,
        vendor_pct: clampPct(commissionPct),
        status: "aberta",
      });

      if (error) console.warn("Falha ao registrar solicitação, mas seguindo para WhatsApp:", error);
    } catch (err) {
      console.warn("Erro ao registrar solicitação, mas seguindo para WhatsApp:", err);
    }

    openWhatsApp(buildWhatsAppMessage(c));
  }

  async function uploadToBucket(bucket: string, path: string, file: File) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (error) throw error;
    return path;
  }

  async function createPartnerIfNeeded(): Promise<string> {
    if (createTabPartner === "select") {
      if (!partnerId) throw new Error("Selecione um parceiro (ou cadastre um novo).");
      return partnerId;
    }

    const nome = newPartnerName.trim();
    if (!nome) throw new Error("Informe o nome do parceiro.");

    const { data, error } = await supabase.from("stock_partners").upsert({ nome }, { onConflict: "nome" }).select("id").single();
    if (error) throw error;

    const id = data.id as string;

    if (newPartnerLogo) {
      const ext = (newPartnerLogo.name.split(".").pop() || "png").toLowerCase();
      const path = `partners/${id}.${ext}`;
      await uploadToBucket("stock_assets", path, newPartnerLogo);
      const { error: e2 } = await supabase.from("stock_partners").update({ logo_path: path }).eq("id", id);
      if (e2) throw e2;
    }

    const p = await supabase.from("stock_partners").select("id,nome,logo_path").order("nome");
    if (!p.error) setPartners((p.data || []) as any);

    return id;
  }

  async function createAdminIfNeeded(): Promise<string> {
    if (createTabAdmin === "select") {
      if (!adminId) throw new Error("Selecione uma administradora (ou cadastre uma nova).");
      return adminId;
    }

    const nome = newAdminName.trim();
    if (!nome) throw new Error("Informe o nome da administradora.");

    const { data, error } = await supabase.from("stock_admins").upsert({ nome }, { onConflict: "nome" }).select("id").single();
    if (error) throw error;

    const id = data.id as string;

    if (newAdminLogo) {
      const ext = (newAdminLogo.name.split(".").pop() || "png").toLowerCase();
      const path = `admins/${id}.${ext}`;
      await uploadToBucket("stock_assets", path, newAdminLogo);
      const { error: e2 } = await supabase.from("stock_admins").update({ logo_path: path }).eq("id", id);
      if (e2) throw e2;
    }

    const a = await supabase.from("stock_admins").select("id,nome,logo_path").order("nome");
    if (!a.error) setAdmins((a.data || []) as any);

    return id;
  }

  async function createCota() {
    if (!isAdmin) return;

    setSavingCota(true);

    try {
      const pid = await createPartnerIfNeeded();
      const aid = await createAdminIfNeeded();

      const cod = codigoCota.trim();
      if (!cod) throw new Error("Informe o código da cota.");

      const payload = {
        codigo: cod,
        partner_id: pid,
        admin_id: aid,
        segmento,
        numero_proposta: numeroProposta.trim() || null,
        credito_contratado: parseBRNumber(creditoContratado),
        credito_disponivel: parseBRNumber(creditoDisponivel),
        prazo_restante: Math.max(0, Math.floor(parseBRNumber(prazoRestante))),
        valor_parcela: parseBRNumber(valorParcela),
        comissao_corretora: parseBRNumber(comissaoCorretora),
        valor_pago_ao_cliente: parseBRNumber(valorPagoCliente),
        status: "disponivel" as const,
      };

      const { error } = await supabase.from("stock_cotas").insert(payload);
      if (error) throw error;

      setOpenCreate(false);
      setPartnerId("");
      setAdminId("");
      setNewPartnerName("");
      setNewPartnerLogo(null);
      setNewAdminName("");
      setNewAdminLogo(null);
      setCreateTabPartner("select");
      setCreateTabAdmin("select");
      setSegmento("Automóvel");
      setCodigoCota("");
      setNumeroProposta("");
      setCreditoContratado("");
      setCreditoDisponivel("");
      setPrazoRestante("");
      setValorParcela("");
      setComissaoCorretora("");
      setValorPagoCliente("");

      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível salvar a cota", err);
    } finally {
      setSavingCota(false);
    }
  }

  function resetReserveForm() {
    setBuyerName("");
    setBuyerCpf("");
    setSinalFile(null);
    setReserveVendorId(NONE);
    setReserveVendorPct(DEFAULT_VENDOR_COMMISSION_PCT);
    setReserveRequests([]);
    setSelectedRequestId(NONE);
  }

  async function loadRequestsForCota(cotaId: string) {
    if (!isAdmin) return;

    const { data, error } = await supabase
      .from("stock_reservation_requests")
      .select("id,cota_id,vendor_id,vendor_pct,status,created_at")
      .eq("cota_id", cotaId)
      .eq("status", "aberta")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Erro ao carregar solicitações abertas:", error);
      setReserveRequests([]);
      return;
    }

    const base = (data || []) as ReservationRequest[];
    const enriched = base.map((r) => ({ ...r, vendor_nome: vendedoresById.get(r.vendor_id)?.nome || "Vendedor" }));

    setReserveRequests(enriched);
  }

  async function reserveCotaAdmin() {
    if (!isAdmin) return;

    const c = openReserve.cota;
    if (!c) return;

    if (isExternalCota(c)) {
      openWhatsApp(buildWhatsAppMessage(c));
      setOpenReserve({ open: false, cota: null });
      resetReserveForm();
      return;
    }

    setSavingReserve(true);

    try {
      const nome = buyerName.trim();
      const cpf = buyerCpf.trim();

      if (!nome) throw new Error("Informe o nome completo do comprador.");
      if (!cpf) throw new Error("Informe o CPF do comprador.");
      if (!sinalFile) throw new Error("Faça upload do comprovante do sinal.");

      const ext = (sinalFile.name.split(".").pop() || "pdf").toLowerCase();
      const path = `sinais/${c.id}/${Date.now()}.${ext}`;
      await uploadToBucket("stock_sinais", path, sinalFile);

      const vendedorIdNormalized = reserveVendorId === NONE ? null : reserveVendorId;
      const vendedorPctNormalized = vendedorIdNormalized ? clampPct(reserveVendorPct) : null;

      const { error } = await supabase
        .from("stock_cotas")
        .update({
          status: "reservada",
          reservado_em: new Date().toISOString(),
          reservado_por: me?.id || null,
          comprador_nome: nome,
          comprador_cpf: cpf,
          sinal_comprovante_path: path,
          vendedor_id: vendedorIdNormalized,
          vendedor_pct: vendedorPctNormalized,
        })
        .eq("id", c.id);

      if (error) throw error;

      if (selectedRequestId !== NONE) {
        await supabase.from("stock_reservation_requests").update({ status: "convertida" }).eq("id", selectedRequestId);
        await supabase
          .from("stock_reservation_requests")
          .update({ status: "cancelada" })
          .eq("cota_id", c.id)
          .eq("status", "aberta")
          .neq("id", selectedRequestId);
      } else {
        await supabase.from("stock_reservation_requests").update({ status: "cancelada" }).eq("cota_id", c.id).eq("status", "aberta");
      }

      setOpenReserve({ open: false, cota: null });
      resetReserveForm();
      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível confirmar a reserva", err);
    } finally {
      setSavingReserve(false);
    }
  }

  function getRuleFromRow(r: any) {
    return {
      partnerId: r.partner?.id || null,
      adminId: r.admin?.id || null,
      segmento: (r.segmento || null) as Segmento | null,
    };
  }

  function matchesRule(r: any, rule: { partnerId: string | null; adminId: string | null; segmento: Segmento | null } | null) {
    if (!rule) return true;
    return (r.partner?.id || null) === rule.partnerId && (r.admin?.id || null) === rule.adminId && (r.segmento as any) === rule.segmento;
  }

  function toggleSelected(r: any, checked: boolean) {
    if (checked && r.status !== "disponivel") { showToast("Somente cotas disponíveis podem ser selecionadas."); return; }
    const id = r.id as string;

    setSelectedIds((prev) => {
      const set = new Set(prev);

      if (checked) {
        if (!anchorRule) {
          setAnchorRule(getRuleFromRow(r));
          set.add(id);
          return Array.from(set);
        }

        if (!matchesRule(r, anchorRule)) {
          showToast("Essa cota não obedece a regra da seleção atual.");
          return prev;
        }

        set.add(id);
        return Array.from(set);
      }

      set.delete(id);
      const next = Array.from(set);
      if (next.length === 0) setAnchorRule(null);
      return next;
    });
  }

  function buildParcelRangesForSelected(selected: any[]) {
    const items = selected
      .map((c) => ({ n: Math.max(0, safeInt(c.prazo_restante)), v: Number(c.valor_parcela || 0) }))
      .filter((x) => x.n > 0 && x.v > 0);

    if (items.length === 0) return ["1 a 0: 0,00"];

    const byN = new Map<number, number>();
    for (const it of items) byN.set(it.n, (byN.get(it.n) || 0) + it.v);

    const uniqueNsAsc = Array.from(byN.keys()).sort((a, b) => a - b);

    let currentTotal = items.reduce((acc, it) => acc + it.v, 0);
    let start = 1;
    const lines: string[] = [];

    for (const n of uniqueNsAsc) {
      const end = n;
      if (end >= start) lines.push(`${start} a ${end}: ${formatBRLNoSymbol(currentTotal)}`);
      currentTotal = currentTotal - (byN.get(n) || 0);
      start = n + 1;
    }

    return lines;
  }

  function taxaTransferenciaValue(c: any) {
    if (isExternalCota(c)) {
      const tx = c.external_taxa_transferencia;

      if (typeof tx === "number") return tx;

      if (typeof tx === "string") {
        const normalized = normalizeText(tx);

        if (normalized.includes("inclusa")) {
          return Number(c.credito_contratado || 0) * 0.01;
        }

        return toNumber(tx);
      }

      return 0;
    }

    return 0.01 * Number(c.credito_contratado || 0);
  }

  function taxaTransferenciaLabel(c: any) {
    const value = taxaTransferenciaValue(c);
    return value > 0 ? formatBRL(value) : "Não informada";
  }

  function taxaTransferenciaResumo(selected: any[]) {
    if (!selected.length) return "Não informada";

    if (selected.length === 1) return taxaTransferenciaLabel(selected[0]);

    const total = selected.reduce((acc, c) => acc + taxaTransferenciaValue(c), 0);

    if (total > 0) return formatBRL(total);

    return "Não informada";
  }

  function segVidaResumo(selected: any[]) {
    if (!selected.length) return "consultar";

    if (selected.length === 1) return seguroVidaLabel(selected[0]);

    const total = selected.reduce((acc, c) => {
      const v = toNumber(c.external_seguro_vida);
      return acc + (v > 0 ? v : 0);
    }, 0);

    return total > 0 ? formatBRL(total) : "consultar";
  }

  function buildResumoText(selected: any[]) {
    if (!selected.length) return "";

    const seg = selected[0].segmento as Segmento;
    const creditTotal = selected.reduce((acc, c) => acc + Number(c.credito_disponivel || 0), 0);
    const entradaTotal = selected.reduce((acc, c) => acc + Number(c._calc?.entrada || 0), 0);
    const parcelasTotal = selected.reduce((acc, c) => acc + Number(c.prazo_restante || 0) * Number(c.valor_parcela || 0), 0);
    const nTaxa = Math.max(1, selected.reduce((acc, c) => acc + Number(c.prazo_restante || 0), 0));
    const codigoLine = selected.length === 1 ? selected[0].codigo : selected.map((c) => c.codigo).filter(Boolean).join(", ");
    const txTransfer = taxaTransferenciaResumo(selected);
    const segVida = segVidaResumo(selected);
    const fv = parcelasTotal + entradaTotal;
    const rm = calcCompoundRateMonthly(creditTotal, fv, nTaxa);
    const ra = Math.pow(1 + rm, 12) - 1;
    const parcelaLines = buildParcelRangesForSelected(selected);

    let text =
      `📄 Carta Contemplada • ${seg} 🎯\n` +
      `💰 Crédito: ${formatBRL(creditTotal)}\n` +
      `💳 Entrada: ${formatBRL(entradaTotal)}\n` +
      `🧾 Parcelas:\n${parcelaLines.join("\n")}\n` +
      `🆔 Código: ${codigoLine}\n` +
      `🔁 Tx. Transferência: ${txTransfer} 💵\n`;

    if (segVida && segVida !== "consultar") {
      text += `🛡️ Seg. de Vida: ${segVida}\n`;
    } else {
      text += `🛡️ Seg. de Vida: consultar\n`;
    }

    const fundoTotal = selected.reduce((acc, c) => acc + Number(c.external_fundo || 0), 0);
    if (fundoTotal > 0) text += `🏦 Fundo Comum: ${formatBRL(fundoTotal)}\n`;

    const reajustes = Array.from(
      new Set(selected.map((c) => String(c.external_prox_reajuste || "").trim()).filter(Boolean))
    );
    if (reajustes.length) text += `📌 Índice Reajuste: ${reajustes.join(", ")}\n`;

    text += `📈 Taxa: ${pct2Human(rm)} a.m. ou ${pct2Human(ra)} a.a. 📊\n`;

    return text;
  }

  const selectedRows = useMemo(() => {
    const set = new Set(selectedIds);
    return maxRows.filter((r) => set.has(r.id));
  }, [maxRows, selectedIds]);

  const sumText = useMemo(() => buildResumoText(selectedRows as any[]), [selectedRows]);

  async function copyRowResumo(r: any) {
    const text = buildResumoText([r]);
    await copyToClipboard(text);
  }

  function openManageDialog(c: any) {
    if (!isAdmin) return;

    if (isExternalCota(c)) {
      showToast("Cota externa é apenas espelhada. Não pode ser editada no CRM.");
      return;
    }

    setEditPartnerId(c.partner?.id || "");
    setEditAdminId(c.admin?.id || "");
    setEditSegmento(c.segmento);
    setEditCodigo(c.codigo || "");
    setEditNumeroProposta(c.numero_proposta || "");
    setEditCreditoContratado(String(c.credito_contratado ?? ""));
    setEditCreditoDisponivel(String(c.credito_disponivel ?? ""));
    setEditPrazoRestante(String(c.prazo_restante ?? ""));
    setEditValorParcela(String(c.valor_parcela ?? ""));
    setEditComissaoCorretora(String(c.comissao_corretora ?? ""));
    setEditValorPagoCliente(String(c.valor_pago_ao_cliente ?? ""));
    setOpenManage({ open: true, cota: c });
  }

  async function saveManageEdits() {
    if (!isAdmin) return;
    const c = openManage.cota;
    if (!c || isExternalCota(c)) return;

    setSavingEdit(true);

    try {
      const cod = editCodigo.trim();
      if (!cod) throw new Error("Informe o código da cota.");
      if (!editPartnerId) throw new Error("Selecione o parceiro.");
      if (!editAdminId) throw new Error("Selecione a administradora.");

      const payload = {
        codigo: cod,
        partner_id: editPartnerId,
        admin_id: editAdminId,
        segmento: editSegmento,
        numero_proposta: editNumeroProposta.trim() || null,
        credito_contratado: parseBRNumber(editCreditoContratado),
        credito_disponivel: parseBRNumber(editCreditoDisponivel),
        prazo_restante: Math.max(0, safeInt(parseBRNumber(editPrazoRestante))),
        valor_parcela: parseBRNumber(editValorParcela),
        comissao_corretora: parseBRNumber(editComissaoCorretora),
        valor_pago_ao_cliente: parseBRNumber(editValorPagoCliente),
      };

      const { error } = await supabase.from("stock_cotas").update(payload).eq("id", c.id);
      if (error) throw error;

      setOpenManage({ open: false, cota: null });
      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível salvar as alterações", err);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteCota() {
    if (!isAdmin) return;
    const c = openManage.cota;
    if (!c || isExternalCota(c)) return;

    const ok = window.confirm(`Excluir a cota "${c.codigo}"?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    setDeleting(true);

    try {
      const { error } = await supabase.from("stock_cotas").delete().eq("id", c.id);
      if (error) throw error;

      setOpenManage({ open: false, cota: null });
      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível excluir a cota", err);
    } finally {
      setDeleting(false);
    }
  }

  async function reopenToSale() {
    if (!isAdmin) return;
    const c = openManage.cota;
    if (!c || isExternalCota(c)) return;

    const ok = window.confirm(`Reabrir a cota "${c.codigo}" para venda?\n\nIsso vai cancelar a reserva e limpar dados do comprador/sinal.`);
    if (!ok) return;

    setSavingEdit(true);

    try {
      if (c.sinal_comprovante_path) {
        try {
          await supabase.storage.from("stock_sinais").remove([c.sinal_comprovante_path]);
        } catch (e) {
          console.warn("Não consegui remover o arquivo do sinal (seguindo mesmo assim):", e);
        }
      }

      await supabase.from("stock_reservation_requests").update({ status: "cancelada" }).eq("cota_id", c.id).eq("status", "aberta");

      const { error } = await supabase
        .from("stock_cotas")
        .update({
          status: "disponivel",
          reservado_em: null,
          reservado_por: null,
          comprador_nome: null,
          comprador_cpf: null,
          sinal_comprovante_path: null,
          vendedor_id: null,
          vendedor_pct: null,
        })
        .eq("id", c.id);

      if (error) throw error;

      showToast("Cota reaberta para venda ✅");
      setOpenManage({ open: false, cota: null });
      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível reabrir a cota", err);
    } finally {
      setSavingEdit(false);
    }
  }

  async function finalizeTransfer() {
    if (!isAdmin) return;
    const c = openManage.cota;
    if (!c || isExternalCota(c)) return;

    if (!supportsTransferida) {
      window.alert(
        `Seu banco ainda NÃO aceita o status "transferida".\n\n` +
          `Rode este SQL no Supabase:\n\n` +
          `ALTER TYPE public.stock_cota_status ADD VALUE 'transferida';\n\n` +
          `Depois recarregue a página e tente novamente.`
      );
      return;
    }

    const ok = window.confirm(`Finalizar o processo de transferência da cota "${c.codigo}"?\n\nIsso vai marcar a cota como TRANSFERIDA.`);
    if (!ok) return;

    setSavingEdit(true);

    try {
      const { error } = await supabase.from("stock_cotas").update({ status: "transferida" }).eq("id", c.id);
      if (error) throw error;

      showToast("Transferência finalizada ✅");
      setOpenManage({ open: false, cota: null });
      await loadCotas();
    } catch (err) {
      notifyError("Não foi possível finalizar a transferência", err);
      await detectEnumTransferidaSupport();
    } finally {
      setSavingEdit(false);
    }
  }

  async function openMaxComposition(ids: string[]) {
    if (!ids.length || new Set(ids).size !== ids.length) { showToast("Seleção de cotas inválida."); return; }
    const external = ids.every((id) => id.startsWith("external-"));
    const internal = ids.every((id) => !id.startsWith("external-"));
    if (!external && !internal) {
      showToast("Uma composição não pode misturar origens diferentes.");
      return;
    }
    const targetSource: SourceMode = external ? "externo" : "crm";
    try {
      let latest: CotaRow[] = [];
      if (external) {
        const response = await fetch(EXTERNAL_STOCK_URL, { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Estoque externo indisponível.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Estoque externo retornou dados inválidos.");
        latest = data.map(mapExternalToCotaRow);
      } else {
        const { data, error } = await supabase.from("stock_cotas")
          .select("id,codigo,segmento,numero_proposta,credito_contratado,credito_disponivel,prazo_restante,valor_parcela,comissao_corretora,valor_pago_ao_cliente,status,comprador_nome,comprador_cpf,sinal_comprovante_path,vendedor_id,vendedor_pct,reservado_em,partner:stock_partners(id,nome,logo_path),admin:stock_admins(id,nome,logo_path)")
          .eq("status", "disponivel");
        if (error) throw error;
        latest = (data || []) as any;
      }
      const selected = latest.filter((row) => ids.includes(row.id) && row.status === "disponivel");
      if (selected.length !== ids.length || !selected.every((row) => matchesRule(row, getRuleFromRow(selected[0])))) {
        showToast("Uma ou mais cotas mudaram de disponibilidade. Atualize o MAX e refaça a análise.");
        return;
      }
      setCotas(latest);
      setSourceMode(targetSource);
      setSelectedIds(ids);
      setAnchorRule(getRuleFromRow(selected[0]));
      setOpenSum(true);
    } catch (error: any) {
      notifyError("Não foi possível validar a composição", error);
    }
  }

  return (
    <div className={"relative mx-auto w-full max-w-[1700px] space-y-4 p-3 sm:p-5 " + (selectedIds.length ? "pb-56 sm:pb-40" : "")}>
      <MaxContempladas
        openSignal={maxOpenSignal}
        suspended={openCard || openProposta || openSum || openCreate || openReserve.open || openVendorReserve.open || openManage.open}
        cotas={maxRows}
        sourceMode={sourceMode}
        commissionPct={commissionPct}
        onOpenCombination={(ids) => { void openMaxComposition(ids); }}
      />
      {toast ? <div className="fixed top-4 right-4 z-50 rounded-lg border bg-background/95 px-4 py-2 text-sm shadow-md">{toast}</div> : null}

      <ContempladasHero busca={searchText} setBusca={setSearchText} origem={sourceMode === "externo" ? "Parceiro externo" : "CRM Consulmax"} onOpenMax={() => setMaxOpenSignal((n) => n + 1)} />
      <ContempladasIndicadores cotas={maxRows} />

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-extrabold text-[#1E293F]">Estoque de cartas contempladas</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Filtre, selecione e combine cotas para gerar anúncios e propostas.</p>
          </div>

          <div className="flex w-full sm:w-auto items-center gap-2">
            <Button variant="outline" onClick={() => loadActiveSource()} disabled={loading} className="flex-1 sm:flex-none">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>

            {isAdmin && sourceMode === "crm" ? (
              <Button
                onClick={async () => {
                  await loadBaseLists();
                  setOpenCreate(true);
                }}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Cadastrar cota
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <section aria-label="Filtros do estoque contemplado" className="overflow-hidden rounded-2xl border border-[#A11C27]/20 bg-gradient-to-br from-[#7E1B21] via-[#861E24] to-[#6E1A23] px-4 py-4 text-white shadow-[0_10px_30px_rgba(113,27,34,0.16)] lg:px-5">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-4 xl:justify-between">
              <div className="flex shrink-0 items-center gap-2 self-center border-white/15 pr-2 xl:border-r xl:pr-5">
                <span className="rounded-xl bg-white/10 p-2.5"><SlidersHorizontal className="h-[18px] w-[18px]"/></span>
                <div>
                  <div className="text-sm font-extrabold tracking-tight">Filtros</div>
                  <div className="text-[10px] text-white/65">Encontre a melhor cota</div>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-2 sm:flex-none">
                <label className="block text-[11px] font-bold text-white/80">Categoria</label>
                <div className="flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-white/20 bg-white p-1 text-[12px] shadow-sm">
                  {([
                    { value: "all", label: "Todos" },
                    { value: "Imóvel", label: "Imóvel" },
                    { value: "Automóvel", label: "Veículo" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={segFilter === option.value}
                      onClick={() => setSegFilter(option.value)}
                      className={"rounded-lg px-3.5 py-2.5 font-semibold transition-colors " + (segFilter === option.value ? "bg-[#871B22] text-white shadow-sm" : "text-[#475569] hover:bg-slate-100")}
                    >
                      {option.label}
                    </button>
                  ))}
                  <Select value={["Pesados", "Motocicletas", "Serviços"].includes(segFilter) ? segFilter : "other"} onValueChange={(value) => setSegFilter(value as Segmento)}>
                    <SelectTrigger aria-label="Outras categorias" title="Outras categorias" className={"h-9 w-[92px] border-0 px-2 text-xs shadow-none focus:ring-0 " + (["Pesados", "Motocicletas", "Serviços"].includes(segFilter) ? "bg-[#871B22] text-white" : "text-slate-600")}>
                      <span className="truncate">{["Pesados", "Motocicletas", "Serviços"].includes(segFilter) ? segFilter : "Outros"}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pesados">Pesados</SelectItem>
                      <SelectItem value="Motocicletas">Motocicletas</SelectItem>
                      <SelectItem value="Serviços">Serviços</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <label className="block text-[11px] font-bold text-white/80">Situação</label>
                <div className="flex flex-wrap gap-0.5 rounded-xl border border-white/20 bg-white p-1 text-xs shadow-sm">
                  {([
                    { value: "all", label: "Todas" },
                    { value: "disponivel", label: "Disponíveis" },
                    { value: "reservada", label: "Reservadas" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={statusFilter === option.value}
                      onClick={() => setStatusFilter(option.value)}
                      className={"rounded-lg px-3 py-2.5 font-semibold transition-colors " + (statusFilter === option.value ? "bg-[#871B22] text-white shadow-sm" : "text-[#475569] hover:bg-slate-100")}
                    >
                      {option.label}
                    </button>
                  ))}
                  {sourceMode === "crm" && supportsTransferida ? (
                    <button type="button" aria-pressed={statusFilter === "transferida"} onClick={() => setStatusFilter("transferida")}
                      className={"rounded-lg px-3 py-2.5 font-semibold " + (statusFilter === "transferida" ? "bg-[#871B22] text-white" : "text-[#475569] hover:bg-slate-100")}>
                      Transferidas
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-w-[172px] flex-1 space-y-2 sm:max-w-[230px]">
                <label className="block text-[11px] font-bold text-white/80">Administradora</label>
                <Select value={adminFilter} onValueChange={setAdminFilter}>
                  <SelectTrigger aria-label="Filtrar administradora" className="h-11 w-full rounded-xl border border-[#E3B9BA]/50 bg-[#A11C27]/45 px-3 text-xs font-semibold text-white shadow-sm focus:ring-[#E0CE8C]">
                    <SelectValue placeholder="Todas as administradoras" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as administradoras</SelectItem>
                    {adminFilterOptions.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>{admin.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[245px] space-y-2 xl:border-l xl:border-white/20 xl:pl-5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-white/85">Comissão do vendedor</label>
                  <span className="text-[10px] text-white/60">{selectedRows.length ? "Cotas selecionadas" : "Primeira cota da lista"}</span>
                </div>
                <div className="flex h-11 items-center gap-1.5">
                  <button type="button" title="Diminuir a comissão" aria-label="Diminuir comissão" disabled={commissionPct <= ALLOWED_COMMISSION_PCTS[0]}
                    onClick={() => {
                      const index = ALLOWED_COMMISSION_PCTS.findIndex((pct) => Math.abs(pct - commissionPct) < 0.00001);
                      void saveCommissionSetting(ALLOWED_COMMISSION_PCTS[Math.max(0, index - 1)]);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-40">
                    <Minus className="h-4 w-4"/>
                  </button>
                  <div className="flex h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/20 px-3 text-sm font-bold">
                    <span className="truncate tabular-nums">{formatBRL(selectedRows.length ? selectedRows.reduce((total, row) => total + row._calc.comissaoVendedor, 0) : Number(rows[0]?._calc.comissaoVendedor || 0))}</span>
                    <Select value={String(commissionPct * 100)} onValueChange={(value) => { void saveCommissionSetting(Number(value) / 100); }}>
                      <SelectTrigger aria-label="Percentual de comissão do vendedor" title="Alterar percentual de comissão" className="h-9 w-[76px] shrink-0 border-0 bg-transparent px-1 text-xs font-extrabold text-white shadow-none focus:ring-0">
                        <SelectValue placeholder="2,5%"/>
                      </SelectTrigger>
                      <SelectContent>
                        {ALLOWED_COMMISSION_PCTS.map((pct) => (
                          <SelectItem key={pct} value={String(pct * 100)}>{pctToHuman(pct)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button type="button" title="Aumentar a comissão" aria-label="Aumentar comissão" disabled={commissionPct >= ALLOWED_COMMISSION_PCTS[ALLOWED_COMMISSION_PCTS.length - 1]}
                    onClick={() => {
                      const index = ALLOWED_COMMISSION_PCTS.findIndex((pct) => Math.abs(pct - commissionPct) < 0.00001);
                      void saveCommissionSetting(ALLOWED_COMMISSION_PCTS[Math.min(ALLOWED_COMMISSION_PCTS.length - 1, index + 1)]);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-40">
                    <Plus className="h-4 w-4"/>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/15 pt-3">
              <div className="flex min-w-[150px] items-center gap-2 text-xs">
                <span className="font-medium text-white/70">Origem</span>
                <Select value={sourceMode} onValueChange={(value: SourceMode) => {
                  setSelectedIds([]);
                  setAnchorRule(null);
                  setCotas([]);
                  setAdminFilter("all");
                  setSourceMode(value);
                }}>
                  <SelectTrigger aria-label="Origem do estoque" className="h-9 min-w-[132px] rounded-lg border-white/25 bg-white/10 text-xs font-semibold text-white focus:ring-[#E0CE8C]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="externo">Estoque externo</SelectItem>
                    <SelectItem value="crm">Estoque CRM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative min-w-[180px] flex-[1_1_200px] sm:max-w-[310px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/60"/>
                <Input aria-label="Buscar cota por código, segmento ou administradora" value={searchText} onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Buscar código, segmento..." className="h-9 rounded-lg border-white/25 bg-white/10 pl-9 text-xs text-white placeholder:text-white/65 focus-visible:ring-[#E0CE8C]"/>
              </div>
              <button type="button" aria-expanded={showAdvancedFilters} onClick={() => setShowAdvancedFilters((value) => !value)}
                className={"inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors " + (showAdvancedFilters || minValue || maxValue ? "border-[#E0CE8C] bg-white/20 text-white" : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20")}>
                <ListFilter className="h-4 w-4"/> Faixa de crédito
                <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (showAdvancedFilters ? "rotate-180" : "")}/>
              </button>
              {(segFilter !== "all" || statusFilter !== "disponivel" || adminFilter !== "all" || minValue || maxValue || searchText) ? (
                <button type="button" onClick={() => {
                  setSegFilter("all");
                  setStatusFilter("disponivel");
                  setAdminFilter("all");
                  setMinValue("");
                  setMaxValue("");
                  setSearchText("");
                }} className="inline-flex h-9 items-center gap-1.5 px-2 text-xs font-medium text-white/75 hover:text-white">
                  <FilterX className="h-4 w-4"/> Limpar filtros
                </button>
              ) : null}
              <span className="ml-auto text-[11px] font-medium text-white/75">{rows.length} {rows.length === 1 ? "cota encontrada" : "cotas encontradas"}</span>
            </div>
            {showAdvancedFilters ? (
              <div className="mt-3 grid gap-3 rounded-xl border border-white/15 bg-black/10 p-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-[11px] font-semibold text-white/85">
                  Crédito mínimo
                  <Input value={minValue} onChange={(event) => setMinValue(event.target.value)}
                    placeholder="Ex.: 100.000" inputMode="decimal" className="h-10 rounded-lg border-white/15 bg-white text-[#1E293F] placeholder:text-slate-400"/>
                </label>
                <label className="space-y-1.5 text-[11px] font-semibold text-white/85">
                  Crédito máximo
                  <Input value={maxValue} onChange={(event) => setMaxValue(event.target.value)}
                    placeholder="Ex.: 300.000" inputMode="decimal" className="h-10 rounded-lg border-white/15 bg-white text-[#1E293F] placeholder:text-slate-400"/>
                </label>
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1E293F]">{rows.length} cotas encontradas <span className="text-xs font-normal text-slate-500">• Selecione as disponíveis para combinar</span></p>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">Ordenar por
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <option value="creditoAsc">Menor crédito</option>
                <option value="creditoDesc">Maior crédito</option>
                <option value="entradaAsc">Menor entrada</option>
                <option value="parcelaAsc">Menor parcela</option>
              </select>
            </label>
          </div>
          <div className="-mx-2 overflow-auto rounded-xl border border-slate-200 shadow-sm md:mx-0">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-[#F1F5F9] text-xs uppercase tracking-wide text-slate-500">
                <tr className="text-left">
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Administradora</th>
                  <th className="p-3">Segmento</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Crédito</th>
                  <th className="p-3">Entrada</th>
                  <th className="p-3">Saldo devedor *</th>
                  <th className="p-3">Comissão</th>
                  <th className="p-3">Parcela</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-muted-foreground" colSpan={11}>
                      Nenhuma cota encontrada.
                    </td>
                  </tr>
                ) : (
                  rows.map((c: CotaCalc) => {
                    const checked = selectedIds.includes(c.id);
                    const allowed = c.status === "disponivel" && matchesRule(c, anchorRule);
                    const dim = anchorRule && !allowed && !checked;
                    const external = isExternalCota(c);

                    return (
                      <tr key={c.id} className={"border-b border-slate-100 transition-colors " + (checked ? "bg-[#1E293F] text-white" : "bg-white hover:bg-slate-50") + (dim ? " opacity-40" : "")}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!allowed && !checked}
                            onChange={(e) => toggleSelected(c, e.target.checked)}
                            title={!allowed && !checked ? (c.status !== "disponivel" ? "Cota indisponível para seleção." : "Essa cota não pode ser somada com a seleção atual.") : "Selecionar para somar"}
                             className="h-4 w-4 accent-[#A11C27]"
                          />
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {external && c.admin?.logo_path ? (
                              <img
                                src={c.admin.logo_path}
                                alt={c.admin?.nome || "Administradora"}
                                className="h-7 w-7 rounded object-contain border bg-white"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}

                            <div>
                              <div className="font-medium">{c.admin?.nome || "—"}</div>
                              <div className={"text-xs " + (checked ? "text-slate-300" : "text-muted-foreground")}>Parceiro: {c.partner?.nome || "—"}</div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3">{c.segmento}</td>

                        <td className="p-3">
                          <button
                            type="button"
                            className={`font-semibold ${isAdmin && !external ? "underline underline-offset-2 hover:opacity-80" : ""}`}
                            onClick={() => (isAdmin && !external ? openManageDialog(c) : undefined)}
                            disabled={!isAdmin || external}
                            title={external ? "Cota externa espelhada" : isAdmin ? "Ver/Editar/Excluir" : undefined}
                          >
                            {c.codigo}
                          </button>
                          {c.numero_proposta ? <div className={"text-xs " + (checked ? "text-slate-300" : "text-muted-foreground")}>Proposta: {c.numero_proposta}</div> : null}
                        </td>

                        <td className="p-3 font-extrabold">{formatBRL(Number(c.credito_disponivel || 0))}</td>
                        <td className="p-3 font-semibold">{formatBRL(c._calc.entrada)}<div className={"text-xs font-normal " + (checked ? "text-slate-300" : "text-slate-400")}>{c.credito_disponivel > 0 ? (c._calc.entrada / c.credito_disponivel * 100).toFixed(1).replace(".", ",") + "% do crédito" : ""}</div></td>
                        <td className="p-3" title="Estimado pela soma das parcelas a vencer; sujeito a reajustes e encargos.">{formatBRL(c.prazo_restante * c.valor_parcela)}</td>
                        <td className="p-3">
                          <div>{formatBRL(c._calc.comissaoVendedor)}</div>
                        </td>

                        <td className="p-3">
                          {c.prazo_restante}x de {formatBRL(Number(c.valor_parcela || 0))}
                          {external && c.external_prox_reajuste ? <div className={"text-xs " + (checked ? "text-slate-300" : "text-muted-foreground")}>Reajuste: {c.external_prox_reajuste}</div> : null}
                          {external && Number(c.external_fundo || 0) > 0 ? <div className={"text-xs " + (checked ? "text-slate-300" : "text-muted-foreground")}>Fundo: {formatBRL(Number(c.external_fundo || 0))}</div> : null}
                        </td>

                        <td className="p-3">
                          {c.status === "disponivel" ? (
                            <Badge className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Disponível
                            </Badge>
                          ) : c.status === "reservada" ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Reservada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <CheckCheck className="h-3 w-3" />
                              Transferida
                            </Badge>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          {c.status === "disponivel" ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="icon" onClick={() => copyRowResumo(c)} title="Copiar resumo">
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="icon" onClick={() => {
                                setSelectedIds([c.id]);
                                setAnchorRule(getRuleFromRow(c));
                                setOpenCard(true);
                              }} title="Gerar anúncio desta cota" aria-label="Gerar anúncio desta cota">
                                <Palette className="h-4 w-4 text-[#A11C27]" />
                              </Button>

                              {isAdmin && !external ? (
                                <Button
                                  onClick={async () => {
                                    resetReserveForm();
                                    setOpenReserve({ open: true, cota: c });
                                    await loadRequestsForCota(c.id);
                                  }}
                                >
                                  Reservar
                                </Button>
                              ) : (
                                <Button onClick={() => setOpenVendorReserve({ open: true, cota: c })}>Reservar</Button>
                              )}
                            </div>
                          ) : (
                            <Button variant="outline" disabled>
                              Indisponível
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">* Saldo nominal estimado pela soma das parcelas a vencer, sujeito a reajustes, seguros e demais encargos. A disponibilidade das cotas deve ser confirmada.</p>
        </CardContent>
      </Card>

      <ContempladasDock cotas={selectedRows} onClear={() => { setSelectedIds([]); setAnchorRule(null); }} onResumo={() => setOpenSum(true)} onGerarCard={() => setOpenCard(true)} onProposta={() => setOpenProposta(true)} />
      <ContempladasCardDialog open={openCard} onOpenChange={setOpenCard} cotas={selectedRows} />
      <ContempladasPropostaDialog open={openProposta} onOpenChange={setOpenProposta} cotas={selectedRows} />

      <Dialog open={openSum} onOpenChange={setOpenSum}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-full max-h-[92vh] overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Resumo</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex justify-center order-2 lg:order-1">
              <div className="w-full max-w-[280px] sm:max-w-sm">
                <div className="relative rounded-2xl border shadow-sm overflow-hidden" style={{ aspectRatio: "9 / 16" as any }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1E293F] via-[#0f172a] to-[#A11C27]" />
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(181,165,115,0.35),transparent_45%)]" />
                  <div className="relative p-5 h-full flex flex-col">
                    <div className="text-white/90 text-sm font-semibold tracking-wide">Consulmax • Estoque</div>
                    <div className="mt-3 text-white text-[11px] sm:text-[13px] leading-relaxed whitespace-pre-wrap">
                      {sumText || "Selecione uma ou mais cotas para ver o resumo"}
                    </div>
                    <div className="mt-auto pt-4 text-white/70 text-xs">Dica: você pode printar este card em formato de story.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 order-1 lg:order-2">
              <Label>Texto</Label>
              <textarea
                className="w-full min-h-[260px] sm:min-h-[340px] rounded-md border bg-background p-3 text-sm"
                readOnly
                value={sumText || ""}
                placeholder="Selecione uma ou mais cotas na lista para ver o resumo."
              />
              <div className="text-xs text-muted-foreground">
                Taxa: juros compostos (PV = crédito; FV = soma das parcelas + entrada; n = quantidade de parcelas).
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpenSum(false)} className="w-full sm:w-auto">
              Fechar
            </Button>
            <Button onClick={() => copyToClipboard(sumText)} disabled={!sumText.trim()} className="w-full sm:w-auto">
              <Copy className="h-4 w-4 mr-2" />
              Copiar texto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cadastrar cota no estoque</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parceiro</Label>
              <Tabs value={createTabPartner} onValueChange={(v: any) => setCreateTabPartner(v)}>
                <TabsList className="w-full">
                  <TabsTrigger value="select" className="flex-1">
                    Selecionar
                  </TabsTrigger>
                  <TabsTrigger value="new" className="flex-1">
                    Cadastrar
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="select" className="space-y-2">
                  <Select value={partnerId} onValueChange={setPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um parceiro" />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="new" className="space-y-2">
                  <Input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Nome do parceiro" />
                  <Input type="file" accept="image/*" onChange={(e) => setNewPartnerLogo(e.target.files?.[0] || null)} />
                  <div className="text-xs text-muted-foreground">
                    Logo vai para bucket <b>stock_assets</b>.
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Administradora</Label>
              <Tabs value={createTabAdmin} onValueChange={(v: any) => setCreateTabAdmin(v)}>
                <TabsList className="w-full">
                  <TabsTrigger value="select" className="flex-1">
                    Selecionar
                  </TabsTrigger>
                  <TabsTrigger value="new" className="flex-1">
                    Cadastrar
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="select" className="space-y-2">
                  <Select value={adminId} onValueChange={setAdminId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a administradora" />
                    </SelectTrigger>
                    <SelectContent>
                      {admins.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="new" className="space-y-2">
                  <Input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="Nome da administradora" />
                  <Input type="file" accept="image/*" onChange={(e) => setNewAdminLogo(e.target.files?.[0] || null)} />
                  <div className="text-xs text-muted-foreground">
                    Logo vai para bucket <b>stock_assets</b>.
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Segmento</Label>
              <Select value={segmento} onValueChange={(v: any) => setSegmento(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Automóvel">Automóvel</SelectItem>
                  <SelectItem value="Imóvel">Imóvel</SelectItem>
                  <SelectItem value="Motocicletas">Motocicletas</SelectItem>
                  <SelectItem value="Serviços">Serviços</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Código da cota</Label>
              <Input value={codigoCota} onChange={(e) => setCodigoCota(e.target.value)} placeholder="Ex: 3798" />
            </div>

            <div className="space-y-2">
              <Label>Nº da proposta</Label>
              <Input value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} placeholder="Ex: 123456" />
            </div>

            <div className="space-y-2">
              <Label>Crédito contratado</Label>
              <Input value={creditoContratado} onChange={(e) => setCreditoContratado(e.target.value)} placeholder="Ex: 250.000" />
            </div>

            <div className="space-y-2">
              <Label>Crédito disponível</Label>
              <Input value={creditoDisponivel} onChange={(e) => setCreditoDisponivel(e.target.value)} placeholder="Ex: 250.000" />
            </div>

            <div className="space-y-2">
              <Label>Prazo restante (meses)</Label>
              <Input value={prazoRestante} onChange={(e) => setPrazoRestante(e.target.value)} placeholder="Ex: 72" />
            </div>

            <div className="space-y-2">
              <Label>Valor da parcela</Label>
              <Input value={valorParcela} onChange={(e) => setValorParcela(e.target.value)} placeholder="Ex: 1.850" />
            </div>

            <div className="space-y-2">
              <Label>Comissão exigida pela corretora</Label>
              <Input value={comissaoCorretora} onChange={(e) => setComissaoCorretora(e.target.value)} placeholder="Ex: 2.500" />
            </div>

            <div className="space-y-2">
              <Label>Valor pago ao cliente (cedente)</Label>
              <Input value={valorPagoCliente} onChange={(e) => setValorPagoCliente(e.target.value)} placeholder="Ex: 15.000" />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenCreate(false)} disabled={savingCota}>
              Cancelar
            </Button>
            <Button onClick={() => createCota()} disabled={savingCota}>
              {savingCota ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar cota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openVendorReserve.open} onOpenChange={(v) => setOpenVendorReserve({ open: v, cota: v ? openVendorReserve.cota : null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar reserva (WhatsApp)</DialogTitle>
          </DialogHeader>

          {openVendorReserve.cota ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="font-semibold">{openVendorReserve.cota.codigo}</div>
                <div className="text-muted-foreground">
                  {openVendorReserve.cota.admin?.nome || "—"} • {openVendorReserve.cota.segmento}
                </div>
              </div>

              <div className="rounded-md bg-muted/40 p-3">
                <div>
                  <b>Mensagem será enviada para:</b> {WHATSAPP_RESERVA_NUMBER}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setOpenVendorReserve({ open: false, cota: null })}>
              Fechar
            </Button>
            <Button
              onClick={async () => {
                if (!openVendorReserve.cota) return;
                await vendorRequestReserve(openVendorReserve.cota);
                setOpenVendorReserve({ open: false, cota: null });
              }}
            >
              <PhoneOutgoing className="h-4 w-4 mr-2" />
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openReserve.open} onOpenChange={(v) => setOpenReserve({ open: v, cota: v ? openReserve.cota : null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservar cota (Admin)</DialogTitle>
          </DialogHeader>

          {openReserve.cota ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="font-semibold">{openReserve.cota.codigo}</div>
                <div className="text-muted-foreground">
                  {openReserve.cota.admin?.nome || "—"} • {openReserve.cota.segmento} • Crédito{" "}
                  {formatBRL(Number(openReserve.cota.credito_disponivel || 0))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Solicitação aberta (opcional, recomendado)</Label>
                <Select
                  value={selectedRequestId}
                  onValueChange={(v) => {
                    setSelectedRequestId(v);
                    const req = reserveRequests.find((r) => r.id === v);
                    if (req) {
                      setReserveVendorId(req.vendor_id);
                      setReserveVendorPct(clampPct(Number(req.vendor_pct)));
                      return;
                    }
                    if (v === NONE) {
                      setReserveVendorId(NONE);
                      setReserveVendorPct(DEFAULT_VENDOR_COMMISSION_PCT);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma solicitação (se houver)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {reserveRequests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.vendor_nome || "Vendedor"} — {pctToHuman(Number(r.vendor_pct))} — {new Date(r.created_at).toLocaleString("pt-BR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome completo do comprador</Label>
                  <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nome completo" />
                </div>

                <div className="space-y-2">
                  <Label>CPF do comprador</Label>
                  <Input value={buyerCpf} onChange={(e) => setBuyerCpf(e.target.value)} placeholder="Somente números ou com máscara" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Comprovante do sinal</Label>
                  <Input type="file" onChange={(e) => setSinalFile(e.target.files?.[0] || null)} />
                  <div className="text-xs text-muted-foreground">
                    Vai para bucket <b>stock_sinais</b>.
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vendedor (opcional)</Label>
                  <Select value={reserveVendorId} onValueChange={setReserveVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um vendedor (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>% comissão do vendedor</Label>
                  <Select value={String(reserveVendorPct * 100)} onValueChange={(v) => setReserveVendorPct(clampPct(Number(v) / 100))} disabled={reserveVendorId === NONE}>
                    <SelectTrigger>
                      <SelectValue placeholder="2,5%" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">0,5%</SelectItem>
                      <SelectItem value="1">1%</SelectItem>
                      <SelectItem value="1.5">1,5%</SelectItem>
                      <SelectItem value="2">2%</SelectItem>
                      <SelectItem value="2.5">2,5%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-3">
            <Button
              variant="outline"
              onClick={() => {
                setOpenReserve({ open: false, cota: null });
                resetReserveForm();
              }}
              disabled={savingReserve}
            >
              Cancelar
            </Button>
            <Button onClick={() => reserveCotaAdmin()} disabled={savingReserve}>
              {savingReserve ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openManage.open} onOpenChange={(v) => setOpenManage({ open: v, cota: v ? openManage.cota : null })}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Gerenciar cota</DialogTitle>
          </DialogHeader>

          {openManage.cota ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{openManage.cota.codigo}</div>
                    <div className="text-muted-foreground">
                      {openManage.cota.admin?.nome || "—"} • {openManage.cota.segmento} •{" "}
                      {openManage.cota.status === "disponivel" ? "Disponível" : openManage.cota.status === "reservada" ? "Reservada" : "Transferida"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {openManage.cota.status === "reservada" ? (
                      <Button variant="default" onClick={finalizeTransfer} disabled={deleting || savingEdit}>
                        <CheckCheck className="h-4 w-4 mr-2" />
                        Finalizar transferência
                      </Button>
                    ) : null}
                    {openManage.cota.status === "reservada" ? (
                      <Button variant="outline" onClick={reopenToSale} disabled={deleting || savingEdit}>
                        Reabrir para venda
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={deleteCota} disabled={deleting || savingEdit}>
                      {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Parceiro</Label>
                  <Select value={editPartnerId} onValueChange={setEditPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um parceiro" />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Administradora</Label>
                  <Select value={editAdminId} onValueChange={setEditAdminId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a administradora" />
                    </SelectTrigger>
                    <SelectContent>
                      {admins.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Select value={editSegmento} onValueChange={(v: any) => setEditSegmento(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Automóvel">Automóvel</SelectItem>
                      <SelectItem value="Imóvel">Imóvel</SelectItem>
                      <SelectItem value="Motocicletas">Motocicletas</SelectItem>
                      <SelectItem value="Serviços">Serviços</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Código da cota</Label>
                  <Input value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Nº da proposta</Label>
                  <Input value={editNumeroProposta} onChange={(e) => setEditNumeroProposta(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Crédito contratado</Label>
                  <Input value={editCreditoContratado} onChange={(e) => setEditCreditoContratado(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Crédito disponível</Label>
                  <Input value={editCreditoDisponivel} onChange={(e) => setEditCreditoDisponivel(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Prazo restante (meses)</Label>
                  <Input value={editPrazoRestante} onChange={(e) => setEditPrazoRestante(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Valor da parcela</Label>
                  <Input value={editValorParcela} onChange={(e) => setEditValorParcela(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Comissão exigida pela corretora</Label>
                  <Input value={editComissaoCorretora} onChange={(e) => setEditComissaoCorretora(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Valor pago ao cliente (cedente)</Label>
                  <Input value={editValorPagoCliente} onChange={(e) => setEditValorPagoCliente(e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenManage({ open: false, cota: null })} disabled={savingEdit || deleting}>
              Fechar
            </Button>
            <Button onClick={saveManageEdits} disabled={savingEdit || deleting}>
              {savingEdit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
