// src/pages/EstoqueContempladas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { PlusCircle, Loader2, PhoneOutgoing, Lock, CheckCircle2, Copy, Trash2, Pencil } from "lucide-react";

type Segmento = "Automóvel" | "Imóvel" | "Motocicletas" | "Serviços";
type Status = "disponivel" | "reservada";

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

function formatBRL(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatBRLNoSymbol(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function clampPct(p: number) {
  return Math.min(0.05, Math.max(0.01, p));
}
function pctToHuman(p: number) {
  return `${(p * 100).toFixed(0)}%`;
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

const WHATSAPP_RESERVA_NUMBER = "5569993917465";
const NONE = "__none__";

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
      showToast("Resumo copiado para a área de transferência ✅");
    } catch (e) {
      console.warn("Falha ao copiar:", e);
      window.alert("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  // filtros
  const [segFilter, setSegFilter] = useState<"all" | Segmento>("all");
  const [statusFilter, setStatusFilter] = useState<"disponivel" | "reservada" | "all">("disponivel");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");

  // comissão do vendedor (1% a 5%)
  const [commissionPct, setCommissionPct] = useState<number>(0.05);
  const commissionPctHuman = useMemo(() => pctToHuman(commissionPct), [commissionPct]);

  // dados
  const [cotas, setCotas] = useState<CotaRow[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [vendedores, setVendedores] = useState<UserRow[]>([]);

  const vendedoresById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const v of vendedores) m.set(v.id, v);
    return m;
  }, [vendedores]);

  // dialogs
  const [openCreate, setOpenCreate] = useState(false);
  const [openReserve, setOpenReserve] = useState<{ open: boolean; cota: CotaRow | null }>({ open: false, cota: null });
  const [openVendorReserve, setOpenVendorReserve] = useState<{ open: boolean; cota: CotaRow | null }>({
    open: false,
    cota: null,
  });

  // soma/resumo overlay (somar)
  const [openSum, setOpenSum] = useState(false);

  // seleção (soma inteligente) direto na lista
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorRule, setAnchorRule] = useState<{
    partnerId: string | null;
    adminId: string | null;
    segmento: Segmento | null;
  } | null>(null);

  // manage dialog (admin ver/editar/excluir)
  const [openManage, setOpenManage] = useState<{ open: boolean; cota: CotaRow | null }>({ open: false, cota: null });

  // ====== Form Create ======
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

  // ====== Form Reserve (Admin) ======
  const [buyerName, setBuyerName] = useState("");
  const [buyerCpf, setBuyerCpf] = useState("");
  const [sinalFile, setSinalFile] = useState<File | null>(null);

  const [reserveVendorId, setReserveVendorId] = useState<string>(NONE);
  const [reserveVendorPct, setReserveVendorPct] = useState<number>(0.05);

  // solicitações abertas
  const [reserveRequests, setReserveRequests] = useState<ReservationRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>(NONE);

  // ====== Form Edit (Admin Manage) ======
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

    if (!error && data?.commission_pct) {
      setCommissionPct(clampPct(Number(data.commission_pct)));
    } else {
      await supabase.from("stock_vendor_settings").upsert({ user_id: userId, commission_pct: 0.05 });
      setCommissionPct(0.05);
    }
  }

  async function saveCommissionSetting(pct: number) {
    if (!me?.id) return;
    const value = clampPct(pct);
    setCommissionPct(value);
    const { error } = await supabase.from("stock_vendor_settings").upsert({ user_id: me.id, commission_pct: value });
    if (error) notifyError("Erro ao salvar comissão do vendedor", error);
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

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (segFilter !== "all") q = q.eq("segmento", segFilter);

      const min = parseBRNumber(minValue);
      const max = parseBRNumber(maxValue);
      if (minValue.trim() !== "") q = q.gte("credito_disponivel", min);
      if (maxValue.trim() !== "") q = q.lte("credito_disponivel", max);

      const { data, error } = await q;
      if (error) throw error;

      setCotas((data || []) as any);
    } catch (err) {
      notifyError("Erro ao carregar cotas", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadMe();
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
      await loadCotas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    loadCotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segFilter, statusFilter]);

  const rows = useMemo(() => {
    return cotas.map((c) => {
      const pct = clampPct(commissionPct);
      const comissaoVendedor = Number(c.credito_disponivel || 0) * pct;
      const entrada = Number(c.valor_pago_ao_cliente || 0) + Number(c.comissao_corretora || 0) + comissaoVendedor;

      return {
        ...c,
        _calc: {
          pct,
          comissaoVendedor,
          entrada,
        },
      };
    });
  }, [cotas, commissionPct]);

  function buildWhatsAppMessage(c: CotaRow) {
    const pct = clampPct(commissionPct);
    const comissaoVendedor = Number(c.credito_disponivel || 0) * pct;
    const entrada = Number(c.valor_pago_ao_cliente || 0) + Number(c.comissao_corretora || 0) + comissaoVendedor;

    const adminName = c.admin?.nome || "—";
    const partnerName = c.partner?.nome || "—";
    const parcelaTxt = `${c.prazo_restante}x de ${formatBRL(Number(c.valor_parcela || 0))}`;

    return (
      `Quero reservar a cota ${c.codigo}.\n\n` +
      `• Administradora: ${adminName}\n` +
      `• Parceiro: ${partnerName}\n` +
      `• Segmento: ${c.segmento}\n` +
      `• Crédito disponível: ${formatBRL(Number(c.credito_disponivel || 0))}\n` +
      `• Parcela: ${parcelaTxt}\n` +
      `• Entrada estimada: ${formatBRL(entrada)}\n` +
      `• Comissão vendedor (${pctToHuman(pct)}): ${formatBRL(comissaoVendedor)}\n`
    );
  }

  function openWhatsApp(text: string) {
    const digits = toTelDigits(WHATSAPP_RESERVA_NUMBER);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function vendorRequestReserve(c: CotaRow) {
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
    setReserveVendorPct(0.05);

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
    const enriched = base.map((r) => ({
      ...r,
      vendor_nome: vendedoresById.get(r.vendor_id)?.nome || "Vendedor",
    }));

    setReserveRequests(enriched);
  }

  async function reserveCotaAdmin() {
    if (!isAdmin) return;
    const c = openReserve.cota;
    if (!c) return;

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

      /**
       * CORREÇÃO:
       * - Se escolheu uma solicitação, converte ela e cancela as demais abertas.
       * - Se NÃO escolheu nenhuma, cancela todas as solicitações abertas dessa cota (evita request pendurada).
       */
      if (selectedRequestId !== NONE) {
        await supabase.from("stock_reservation_requests").update({ status: "convertida" }).eq("id", selectedRequestId);

        await supabase
          .from("stock_reservation_requests")
          .update({ status: "cancelada" })
          .eq("cota_id", c.id)
          .eq("status", "aberta")
          .neq("id", selectedRequestId);
      } else {
        await supabase
          .from("stock_reservation_requests")
          .update({ status: "cancelada" })
          .eq("cota_id", c.id)
          .eq("status", "aberta");
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

  // ========= Regra de seleção (mesmo parceiro + admin + segmento) =========
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
    const id = r.id as string;

    setSelectedIds((prev) => {
      const set = new Set(prev);

      // definir âncora ao selecionar o primeiro
      if (checked) {
        if (!anchorRule) {
          setAnchorRule(getRuleFromRow(r));
          set.add(id);
          return Array.from(set);
        }

        // se já existe âncora, só permite se obedecer
        if (!matchesRule(r, anchorRule)) {
          showToast("Essa cota não obedece a regra da seleção atual.");
          return prev;
        }

        set.add(id);
        return Array.from(set);
      }

      // desmarcar
      set.delete(id);
      const next = Array.from(set);

      // se virou vazio, reseta âncora
      if (next.length === 0) setAnchorRule(null);

      return next;
    });
  }

  // ========= Resumo / texto =========
  function buildParcelRangesForSelected(selected: any[]) {
    // Correção: somar VALORES mensais em sobreposição (não somar prazos)
    // Meses 1..minN: soma de todas parcelas; após cada vencimento (n), remove parcela daquela cota
    const items = selected
      .map((c) => ({
        n: Math.max(0, safeInt(c.prazo_restante)),
        v: Number(c.valor_parcela || 0),
      }))
      .filter((x) => x.n > 0 && x.v > 0);

    if (items.length === 0) return ["1 a 0: 0,00"];

    // agrupa por n (pra retirar em bloco)
    const byN = new Map<number, number>(); // n -> soma parcelas com esse n
    for (const it of items) byN.set(it.n, (byN.get(it.n) || 0) + it.v);

    const uniqueNsAsc = Array.from(byN.keys()).sort((a, b) => a - b);

    let currentTotal = items.reduce((acc, it) => acc + it.v, 0);
    let start = 1;
    const lines: string[] = [];

    for (const n of uniqueNsAsc) {
      const end = n;
      if (end >= start) {
        lines.push(`${start} a ${end}: ${formatBRLNoSymbol(currentTotal)}`);
      }
      // após o mês "n", a(s) cota(s) com n acaba(m)
      currentTotal = currentTotal - (byN.get(n) || 0);
      start = n + 1;
    }

    return lines;
  }

  function buildResumoText(selected: any[]) {
    if (!selected.length) return "";

    const seg = selected[0].segmento as Segmento;

    const creditTotal = selected.reduce((acc, c) => acc + Number(c.credito_disponivel || 0), 0);
    const entradaTotal = selected.reduce((acc, c) => acc + Number(c._calc?.entrada || 0), 0);

    const parcelasTotal = selected.reduce((acc, c) => acc + Number(c.prazo_restante || 0) * Number(c.valor_parcela || 0), 0);

    // n para taxa: aqui seguimos sua regra “n = quantidade de parcelas”
    // (para soma, usamos a soma dos prazos, como você pediu originalmente para o cálculo da taxa)
    const nTaxa = Math.max(1, selected.reduce((acc, c) => acc + Number(c.prazo_restante || 0), 0));

    const codigoLine = selected.length === 1 ? selected[0].codigo : selected.map((c) => c.codigo).filter(Boolean).join(", ");

    const txTransfer = selected.reduce((acc, c) => acc + 0.01 * Number(c.credito_contratado || 0), 0);

    const fv = parcelasTotal + entradaTotal;
    const rm = calcCompoundRateMonthly(creditTotal, fv, nTaxa);
    const ra = Math.pow(1 + rm, 12) - 1;

    const parcelaLines = buildParcelRangesForSelected(selected);

    return (
      `📄 Carta Contemplada • ${seg} 🎯\n` +
      `💰 Crédito: ${formatBRL(creditTotal)}\n` +
      `💳 Entrada: ${formatBRL(entradaTotal)}\n` +
      `🧾 Parcelas:\n${parcelaLines.join("\n")}\n` +
      `🆔 Código: ${codigoLine}\n` +
      `🔁 Tx. Transferência: ${formatBRL(txTransfer)} 💵\n` +
      `📈 Taxa: ${pct2Human(rm)} a.m. ou ${pct2Human(ra)} a.a. 📊\n`
    );
  }

  const selectedRows = useMemo(() => {
    const set = new Set(selectedIds);
    return rows.filter((r: any) => set.has(r.id));
  }, [rows, selectedIds]);

  const sumText = useMemo(() => buildResumoText(selectedRows as any[]), [selectedRows]);

  async function copyRowResumo(r: any) {
    const text = buildResumoText([r]);
    await copyToClipboard(text);
  }

  // ========= Admin Manage =========
  function openManageDialog(c: any) {
    if (!isAdmin) return;

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
    if (!c) return;

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
    if (!c) return;

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

  /**
   * CORREÇÃO / MELHORIA:
   * Admin pode "reabrir para venda" uma cota reservada (ex.: transferência falhou).
   * - Volta status para "disponivel"
   * - Limpa dados de reserva (comprador, sinal, vendedor/% etc.)
   * - Cancela quaisquer solicitações abertas pendentes (evita ficar request pendurada)
   * - (Opcional) tenta remover o arquivo do sinal do bucket
   */
  async function reopenToSale() {
    if (!isAdmin) return;
    const c = openManage.cota;
    if (!c) return;

    const ok = window.confirm(
      `Reabrir a cota "${c.codigo}" para venda?\n\nIsso vai cancelar a reserva e limpar dados do comprador/sinal.`
    );
    if (!ok) return;

    setSavingEdit(true);
    try {
      // (Opcional) remover arquivo do sinal do Storage
      if (c.sinal_comprovante_path) {
        try {
          await supabase.storage.from("stock_sinais").remove([c.sinal_comprovante_path]);
        } catch (e) {
          console.warn("Não consegui remover o arquivo do sinal (seguindo mesmo assim):", e);
        }
      }

      // Cancela quaisquer solicitações ainda abertas pra essa cota
      await supabase
        .from("stock_reservation_requests")
        .update({ status: "cancelada" })
        .eq("cota_id", c.id)
        .eq("status", "aberta");

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

  return (
    <div className="p-4 space-y-4 relative">
      {/* toast */}
      {toast ? (
        <div className="fixed top-4 right-4 z-50 rounded-lg border bg-background/95 px-4 py-2 text-sm shadow-md">
          {toast}
        </div>
      ) : null}

      {/* botão Somar (canto inferior esquerdo) */}
      <div className="fixed bottom-4 left-4 z-40">
        <Button onClick={() => setOpenSum(true)} disabled={selectedIds.length < 1}>
          Somar
        </Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Estoque • Cotas Contempladas</CardTitle>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadCotas()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>

            {isAdmin && (
              <Button
                onClick={async () => {
                  await loadBaseLists();
                  setOpenCreate(true);
                }}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Cadastrar cota
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* filtros */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <Label>Segmento</Label>
              <Select value={segFilter} onValueChange={(v: any) => setSegFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Automóvel">Automóvel</SelectItem>
                  <SelectItem value="Imóvel">Imóvel</SelectItem>
                  <SelectItem value="Motocicletas">Motocicletas</SelectItem>
                  <SelectItem value="Serviços">Serviços</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3">
              <Label>Status</Label>
              <div className="flex gap-2">
                <Button variant={statusFilter === "disponivel" ? "default" : "outline"} onClick={() => setStatusFilter("disponivel")}>
                  Disponíveis
                </Button>
                <Button variant={statusFilter === "reservada" ? "default" : "outline"} onClick={() => setStatusFilter("reservada")}>
                  Reservadas
                </Button>
                <Button variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
                  Todas
                </Button>
              </div>
            </div>

            <div className="md:col-span-2">
              <Label>Crédito mín.</Label>
              <Input value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="Ex: 100.000" />
            </div>

            <div className="md:col-span-2">
              <Label>Crédito máx.</Label>
              <Input value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="Ex: 300.000" />
            </div>

            <div className="md:col-span-2">
              <Label>Comissão do vendedor</Label>
              <Select value={String(Math.round(commissionPct * 100))} onValueChange={(v) => saveCommissionSetting(Number(v) / 100)}>
                <SelectTrigger>
                  <SelectValue placeholder="5%" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1%</SelectItem>
                  <SelectItem value="2">2%</SelectItem>
                  <SelectItem value="3">3%</SelectItem>
                  <SelectItem value="4">4%</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-1">
                Atual: <b>{commissionPctHuman}</b>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => loadCotas()}>
              Aplicar filtro de valor
            </Button>
          </div>

          {/* tabela */}
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Administradora</th>
                  <th className="p-3">Segmento</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Crédito</th>
                  <th className="p-3">Entrada</th>
                  <th className="p-3">Comissão</th>
                  <th className="p-3">Parcela</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-muted-foreground" colSpan={10}>
                      Nenhuma cota encontrada.
                    </td>
                  </tr>
                ) : (
                  rows.map((c: any) => {
                    const checked = selectedIds.includes(c.id);
                    const allowed = matchesRule(c, anchorRule);
                    const dim = anchorRule && !allowed && !checked;

                    return (
                      <tr key={c.id} className={`border-t ${dim ? "opacity-40" : ""}`}>
                        {/* seleção */}
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!allowed && !checked}
                            onChange={(e) => toggleSelected(c, e.target.checked)}
                            title={!allowed && !checked ? "Essa cota não pode ser somada com a seleção atual." : "Selecionar para somar"}
                          />
                        </td>

                        <td className="p-3">
                          <div className="font-medium">{c.admin?.nome || "—"}</div>
                          <div className="text-xs text-muted-foreground">Parceiro: {c.partner?.nome || "—"}</div>
                        </td>

                        <td className="p-3">{c.segmento}</td>

                        <td className="p-3">
                          <button
                            type="button"
                            className={`font-semibold ${isAdmin ? "underline underline-offset-2 hover:opacity-80" : ""}`}
                            onClick={() => (isAdmin ? openManageDialog(c) : undefined)}
                            disabled={!isAdmin}
                            title={isAdmin ? "Ver/Editar/Excluir" : undefined}
                          >
                            {c.codigo}
                          </button>
                          {c.numero_proposta ? <div className="text-xs text-muted-foreground">Proposta: {c.numero_proposta}</div> : null}
                        </td>

                        <td className="p-3">{formatBRL(Number(c.credito_disponivel || 0))}</td>
                        <td className="p-3">{formatBRL(c._calc.entrada)}</td>
                        <td className="p-3">{formatBRL(c._calc.comissaoVendedor)}</td>

                        <td className="p-3">
                          {c.prazo_restante}x de {formatBRL(Number(c.valor_parcela || 0))}
                        </td>

                        <td className="p-3">
                          {c.status === "disponivel" ? (
                            <Badge className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Disponível
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Reservada
                            </Badge>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          {c.status === "disponivel" ? (
                            <div className="flex items-center justify-end gap-2">
                              {/* resumo (copiar direto) */}
                              <Button variant="outline" size="icon" onClick={() => copyRowResumo(c)} title="Resumo">
                                <Copy className="h-4 w-4" />
                              </Button>

                              {isAdmin ? (
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
        </CardContent>
      </Card>

      {/* ====== OVERLAY: SOMAR (preview story) ====== */}
      <Dialog open={openSum} onOpenChange={setOpenSum}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Resumo</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* preview story */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <div className="relative rounded-2xl border shadow-sm overflow-hidden" style={{ aspectRatio: "9 / 16" as any }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1E293F] via-[#0f172a] to-[#A11C27]" />
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(181,165,115,0.35),transparent_45%)]" />
                  <div className="relative p-5 h-full flex flex-col">
                    <div className="text-white/90 text-sm font-semibold tracking-wide">Consulmax • Estoque</div>
                    <div className="mt-3 text-white text-[13px] leading-relaxed whitespace-pre-wrap">
                      {sumText || "Selecione uma ou mais cotas para ver o resumo"}
                    </div>
                    <div className="mt-auto pt-4 text-white/70 text-xs">Dica: você pode printar este card em formato de story.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* text */}
            <div className="space-y-2">
              <Label>Texto</Label>
              <textarea
                className="w-full min-h-[340px] rounded-md border bg-background p-3 text-sm"
                readOnly
                value={sumText || ""}
                placeholder="Selecione uma ou mais cotas na lista para ver o resumo."
              />
              <div className="text-xs text-muted-foreground">
                Taxa: juros compostos (PV = crédito; FV = soma das parcelas + entrada; n = quantidade de parcelas).
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenSum(false)}>
              Fechar
            </Button>
            <Button onClick={() => copyToClipboard(sumText)} disabled={!sumText.trim()}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar texto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== DIALOG: CADASTRAR COTA (ADMIN) ====== */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cadastrar cota no estoque</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parceiro */}
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

            {/* Administradora */}
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

      {/* ====== DIALOG: RESERVAR (VENDEDOR) ====== */}
      <Dialog
        open={openVendorReserve.open}
        onOpenChange={(v) => setOpenVendorReserve({ open: v, cota: v ? openVendorReserve.cota : null })}
      >
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
                  <b>Comissão selecionada:</b> {commissionPctHuman}
                </div>
                <div>
                  <b>Mensagem será enviada para:</b> {WHATSAPP_RESERVA_NUMBER}
                </div>
                <div className="text-xs text-muted-foreground mt-1">A solicitação fica registrada no banco para o admin ver.</div>
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

      {/* ====== DIALOG: RESERVAR (ADMIN) ====== */}
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
                      setReserveVendorPct(0.05);
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
                        {r.vendor_nome || "Vendedor"} — {pctToHuman(Number(r.vendor_pct))} —{" "}
                        {new Date(r.created_at).toLocaleString("pt-BR")}
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
                    Vai para bucket <b>stock_sinais</b> (recomendado private).
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
                  <Label>% comissão do vendedor (se selecionou vendedor)</Label>
                  <Select
                    value={String(Math.round(reserveVendorPct * 100))}
                    onValueChange={(v) => setReserveVendorPct(Number(v) / 100)}
                    disabled={reserveVendorId === NONE}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="5%" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1%</SelectItem>
                      <SelectItem value="2">2%</SelectItem>
                      <SelectItem value="3">3%</SelectItem>
                      <SelectItem value="4">4%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
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

      {/* ====== DIALOG: GERENCIAR COTA (ADMIN) ====== */}
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
                      {openManage.cota.status === "disponivel" ? "Disponível" : "Reservada"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
