// src/pages/Propostas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  ClipboardCopy,
  FileText,
  ExternalLink,
  Trash2,
  Megaphone,
  ChevronDown,
  Search,
  X,
  Loader2,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ========================= Tipos ========================= */
type SimRow = {
  code: number;
  created_at: string;

  lead_nome: string | null;
  lead_telefone: string | null;

  segmento: string | null;
  grupo: string | null;

  credito: number | null;
  prazo_venda?: number | null;
  parcela_contemplacao: number | null;

  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;

  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;

  lance_proprio_valor: number | null;
  lance_ofertado_pct?: number | null;

  // Schema: frações (0–1)
  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;
};

type ModalItem = Pick<
  SimRow,
  | "code"
  | "created_at"
  | "lead_nome"
  | "lead_telefone"
  | "segmento"
  | "novo_credito"
  | "parcela_escolhida"
  | "novo_prazo"
>;

type ModelKey =
  | "venda_contemplada"
  | "direcionada"
  | "alav_fin"
  | "alav_patr"
  | "previdencia"
  | "credito_correcao"
  | "extrato";

/* ======================= Helpers ========================= */
const brand = {
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  navy: "#182A4A",
  red: "#A11C27",
  barGray: "#6B7280",
};

const LOGO_URL = "/logo-consulmax.png";

const brMoney = (v?: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

function toDateInputValue(d: Date) {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const startOfDayISO = (d: string) =>
  new Date(`${d}T00:00:00.000`).toISOString();
const endOfDayISO = (d: string) =>
  new Date(`${d}T23:59:59.999`).toISOString();

function normalizeSegment(seg?: string | null) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "Imóvel";
  if (s.includes("moto")) return "Motocicleta";
  if (s.includes("serv")) return "Serviços";
  if (s.includes("pesad")) return "Pesados";
  if (s.includes("auto")) return "Automóvel";
  return seg || "Automóvel";
}
function emojiBySegment(seg?: string | null) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "🏠";
  if (s.includes("moto")) return "🏍️";
  if (s.includes("serv")) return "✈️";
  if (s.includes("pesad")) return "🚚";
  return "🚗";
}
function formatPhoneBR(s?: string | null) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}
async function fetchAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ============ Percent & Finance helpers ============== */
function parsePercentInput(raw: string): number {
  const s = (raw || "").toString().trim().replace(/\s+/g, "");
  if (!s) return 0;
  const hasPercent = s.endsWith("%");
  const cleaned = s.replace("%", "").replace(".", "").replace(",", ".");
  const n = Number(cleaned);
  if (isNaN(n)) return 0;
  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}
function formatPercentFraction(frac: number, withSymbol = true): string {
  const pct = (frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return withSymbol ? `${pct}%` : pct;
}
function pmtMonthly(rate: number, nper: number, pv: number): number {
  if (!rate || rate <= 0 || !nper || nper <= 0) {
    return nper > 0 ? pv / nper : 0;
  }
  const num = rate * pv;
  const den = 1 - Math.pow(1 + rate, -nper);
  return den === 0 ? pv / nper : num / den;
}
function annualToMonthlyCompound(fracAnnual: number): number {
  return Math.pow(1 + (fracAnnual || 0), 1 / 12) - 1;
}

/* ========================= Página ======================== */
export default function Propostas() {
  /* ---------- Filtros / resultados ---------- */
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);

  // paginação
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page]
  );
  useEffect(() => setPage(1), [rows.length]);

  // dados do usuário (vendedor) — public.user (fallback: users)
  const [userPhone, setUserPhone] = useState<string>("");
  const [userName, setUserName] = useState<string>("Consultor Consulmax");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;

      // tenta public.user
      const { data: u1 } = await supabase
        .from("user")
        .select("nome, phone, avatar_url, email")
        .eq("auth_user_id", uid)
        .maybeSingle();

      if (u1) {
        setUserPhone((u1.phone || "").toString());
        const nm = (u1.nome || "").toString().trim();
        if (nm) setUserName(nm);
        if (u1.avatar_url) {
          const asData = await fetchAsDataURL(String(u1.avatar_url));
          if (asData) setUserAvatar(asData);
        }
        return;
      }

      // fallback: antiga tabela users
      const { data: u2 } = await supabase
        .from("users")
        .select("phone, name, full_name, display_name, avatar_url")
        .eq("auth_user_id", uid)
        .maybeSingle();

      setUserPhone((u2?.phone || "").toString());
      const nm =
        (u2?.display_name || u2?.name || u2?.full_name || "").toString().trim();
      if (nm) setUserName(nm);
      if (u2?.avatar_url) {
        const asData = await fetchAsDataURL(String(u2.avatar_url));
        if (asData) setUserAvatar(asData);
      }
    })();
  }, []);

  // logo p/ PDF
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  useEffect(() => {
    fetchAsDataURL(LOGO_URL).then(setLogoDataUrl);
  }, []);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("sim_simulations")
      .select(
        [
          "code",
          "created_at",
          "lead_nome",
          "lead_telefone",
          "segmento",
          "grupo",
          "credito",
          "prazo_venda",
          "parcela_contemplacao",
          "novo_credito",
          "parcela_escolhida",
          "novo_prazo",
          "parcela_ate_1_ou_2",
          "parcela_demais",
          "lance_proprio_valor",
          "adm_tax_pct",
          "fr_tax_pct",
          "lance_ofertado_pct",
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (dateFrom) query = query.gte("created_at", startOfDayISO(dateFrom));
    if (dateTo) query = query.lte("created_at", endOfDayISO(dateTo));
    if (q.trim()) {
      const like = `%${q.trim()}%`;
      query = query.or(`lead_nome.ilike.${like},lead_telefone.ilike.${like}`);
    }

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      alert("Erro ao carregar simulações: " + error.message);
      return;
    }
    setRows((data || []) as SimRow[]);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
  }, [q, dateFrom, dateTo]);

  /* ---------- Textos de ação ---------- */
  function copyOportunidadeText(r: SimRow) {
    const segNorm = normalizeSegment(r.segmento);
    const emoji = emojiBySegment(r.segmento);
    const phone = formatPhoneBR(userPhone);
    const wLine = phone ? `\n${phone}` : "";

    const text = `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${segNorm}

${emoji} Crédito: ${brMoney(r.novo_credito)}
💰 Parcela 1: ${brMoney(r.parcela_ate_1_ou_2)} (Em até 3x no cartão)
📆 + ${r.novo_prazo ?? 0}x de ${brMoney(r.parcela_escolhida)}
💵 Lance Próprio: ${brMoney(r.lance_proprio_valor)}
📢 Grupo: ${r.grupo || "—"}

🚨 POUCAS VAGAS DISPONÍVEIS🚨

Assembleia 15/10

📲 Garanta sua vaga agora!${wLine}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`;

    navigator.clipboard
      .writeText(text)
      .then(() => alert("Oportunidade copiada!"))
      .catch(() => alert("Não foi possível copiar."));
  }
  function copyResumoText(r: SimRow) {
    const segNorm = normalizeSegment(r.segmento);
    const text = `Resumo da Proposta — ${segNorm}

Crédito contratado: ${brMoney(r.credito)}
Parcela 1 (até contemplação): ${brMoney(r.parcela_ate_1_ou_2)}
Demais até a contemplação: ${brMoney(r.parcela_demais)}
— Após a contemplação —
Crédito líquido: ${brMoney(r.novo_credito)}
Parcela escolhida: ${brMoney(r.parcela_escolhida)}
Prazo restante: ${r.novo_prazo ?? 0} meses
Lance próprio: ${brMoney(r.lance_proprio_valor)}
Grupo: ${r.grupo || "—"}`;

    navigator.clipboard
      .writeText(text)
      .then(() => alert("Resumo copiado!"))
      .catch(() => alert("Não foi possível copiar."));
  }
  async function handleDelete(code: number) {
    if (!confirm(`Excluir a simulação #${code}?`)) return;
    const { error } = await supabase
      .from("sim_simulations")
      .delete()
      .eq("code", code);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setRows((prev) => prev.filter((x) => x.code !== code));
  }

  /* ---------- Parâmetros ---------- */
  type Params = {
    // Indicadores
    selic_anual: number;
    cdi_anual: number;
    ipca12m: number;

    // Financiamento
    fin_veic_mensal: number; // a.m.
    fin_imob_anual: number; // a.a.

    // Estratégias
    reforco_pct: number; // Ganho na venda (%)
  };
  const DEFAULT_PARAMS: Params = {
    selic_anual: 0.15,
    cdi_anual: 0.149,
    ipca12m: 0.0535,
    fin_veic_mensal: 0.021,
    fin_imob_anual: 0.11,
    reforco_pct: 0.05,
  };
  const [params, setParams] = useState<Params>(() => {
    try {
      const raw = localStorage.getItem("proposalParamsV2");
      if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);
  function saveParams(next: Params) {
    setParams(next);
    try {
      localStorage.setItem("proposalParamsV2", JSON.stringify(next));
    } catch {}
    setParamOpen(false);
  }

  const cdiMensal = useMemo(
    () => annualToMonthlyCompound(params.cdi_anual),
    [params.cdi_anual]
  );
  const ipcaMensal = useMemo(() => (params.ipca12m || 0) / 12, [params.ipca12m]);
  const finImobMensal = useMemo(
    () => annualToMonthlyCompound(params.fin_imob_anual),
    [params.fin_imob_anual]
  );

  /* ---------- Propostas de Investimento (lista) ---------- */
  const [addOpen, setAddOpen] = useState(false);
  const [modalQ, setModalQ] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalRows, setModalRows] = useState<ModalItem[]>([]);
  const [modalSel, setModalSel] = useState<Set<number>>(new Set());

  const [invest, setInvest] = useState<SimRow[]>([]);
  const [selectMap, setSelectMap] = useState<Record<number, boolean>>({});
  const selectedCount = useMemo(
    () => Object.values(selectMap).filter(Boolean).length,
    [selectMap]
  );
  const selectedInvest = useMemo(
    () => invest.filter((x) => !!selectMap[x.code]),
    [invest, selectMap]
  );

  const [model, setModel] = useState<ModelKey>("venda_contemplada");

  async function loadModal() {
    setModalLoading(true);
    let q = supabase
      .from("sim_simulations")
      .select(
        "code,created_at,lead_nome,lead_telefone,segmento,novo_credito,parcela_escolhida,novo_prazo"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (modalQ.trim()) {
      const like = `%${modalQ.trim()}%`;
      q = q.or(`lead_nome.ilike.${like},lead_telefone.ilike.${like}`);
    }

    const { data, error } = await q;
    setModalLoading(false);
    if (error) {
      alert("Erro ao buscar simulações: " + error.message);
      return;
    }
    setModalRows((data || []) as ModalItem[]);
  }
  useEffect(() => {
    if (!addOpen) return;
    const t = setTimeout(() => loadModal(), 300);
    return () => clearTimeout(t);
  }, [addOpen, modalQ]);

  function toggleModalSel(code: number) {
    setModalSel((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code);
      else {
        if (s.size >= 5) return s;
        s.add(code);
      }
      return s;
    });
  }
  async function saveFromModal() {
    if (modalSel.size === 0) {
      setAddOpen(false);
      return;
    }
    const ids = Array.from(modalSel);
    const { data, error } = await supabase
      .from("sim_simulations")
      .select(
        "code,created_at,lead_nome,lead_telefone,segmento,grupo,credito,prazo_venda,parcela_contemplacao,novo_credito,parcela_escolhida,novo_prazo,parcela_ate_1_ou_2,parcela_demais,lance_proprio_valor,adm_tax_pct,fr_tax_pct,lance_ofertado_pct"
      )
      .in("code", ids);

    if (error) {
      alert("Erro ao carregar selecionadas: " + error.message);
      return;
    }
    const incoming = (data || []) as SimRow[];
    setInvest((prev) => {
      const map = new Map(prev.map((x) => [x.code, x]));
      incoming.forEach((x) => map.set(x.code, x));
      return Array.from(map.values()).slice(0, 5);
    });
    setSelectMap({});
    setAddOpen(false);
    setModalSel(new Set());
  }
  function toggleSelect(code: number) {
    setSelectMap((prev) => ({ ...prev, [code]: !prev[code] }));
  }
  function selectAllInvest(checked: boolean) {
    const m: Record<number, boolean> = {};
    invest.forEach((r) => (m[r.code] = checked));
    setSelectMap(m);
  }

  /* ==================== PDF SHARED ==================== */
  function firstName(full?: string | null) {
    const s = (full || "").trim();
    if (!s) return "Cliente";
    return s.split(/\s+/)[0];
  }

  function addHeaderBand(doc: jsPDF, title: string) {
    doc.setFillColor(30, 41, 63);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 130, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 84);
  }

  function addWatermark(doc: jsPDF) {
    if (!logoDataUrl) return;
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const props = (doc as any).getImageProperties(logoDataUrl);
    const maxW = w * 0.6;
    const maxH = h * 0.35;
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    const iw = props.width * ratio;
    const ih = props.height * ratio;
    const x = (w - iw) / 2;
    const y = (h - ih) / 2;
    const hasG = (doc as any).GState && (doc as any).setGState;
    if (hasG) {
      const gLow = new (doc as any).GState({ opacity: 0.07 });
      (doc as any).setGState(gLow);
      doc.addImage(logoDataUrl, "PNG", x, y, iw, ih);
      const gFull = new (doc as any).GState({ opacity: 1 });
      (doc as any).setGState(gFull);
    } else {
      doc.addImage(logoDataUrl, "PNG", x, y, iw, ih);
    }
  }

  function addFooter(doc: jsPDF) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const margin = 40;
    const areaH = 80;
    const yTop = h - areaH - 30;

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(1);
    doc.line(margin, yTop, w - margin, yTop);

    if (logoDataUrl) {
      const props = (doc as any).getImageProperties(logoDataUrl);
      const maxW = 120;
      const maxH = 34;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const lw = props.width * ratio;
      const lh = props.height * ratio;
      const ly = yTop + (areaH - lh) / 2;
      doc.addImage(logoDataUrl, "PNG", margin, ly, lw, lh);
    }

    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(10);
    const lines = [
      "Consulmax Consórcios e Investimentos • CNPJ: 57.942.043/0001-03",
      "Av. Menezes Filho, 3174, Casa Preta, Ji-Paraná/RO • Cel/Whats: (69) 9 9302-9380",
      "consulmaxconsorcios.com.br",
      `Consultor responsável: ${userName}`,
    ];
    let y = yTop + 20;
    lines.forEach((t) => {
      doc.text(t, w - margin, y, { align: "right" as any });
      y += 14;
    });
  }

  function drawSellerCard(doc: jsPDF, x: number, y: number) {
    const cardW = 360;
    const cardH = 96;

    // card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(230, 230, 230);
    if ((doc as any).roundedRect) {
      (doc as any).roundedRect(x, y, cardW, cardH, 12, 12, "FD");
    } else {
      doc.rect(x, y, cardW, cardH, "FD");
    }

    // avatar
    const avatarSize = 72;
    if (userAvatar) {
      try {
        doc.addImage(userAvatar, "PNG", x + 12, y + 12, avatarSize, avatarSize);
      } catch {}
    } else if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", x + 12, y + 12, avatarSize, avatarSize);
    }

    // texts
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 63);
    doc.setFontSize(12);
    doc.text(userName, x + 12 + avatarSize + 14, y + 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const wapp = formatPhoneBR(userPhone);
    doc.text(`Whats: ${wapp || "-"}`, x + 12 + avatarSize + 14, y + 50);
    doc.text("Consulmax • Consultoria Especializada", x + 12 + avatarSize + 14, y + 70);
  }

  /* ==================== PDF: VENDA CONTEMPLADA ==================== */
  function gerarPDFVendaContemplada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // CAPA
    addHeaderBand(doc, `Plano de Investimento especialmente estudado para ${firstName(sim.lead_nome)}`);
    addWatermark(doc);
    drawSellerCard(doc, pageW - marginX - 360, 34); // canto superior direito
    addFooter(doc);

    // Página 2 — Proposta + Projeção
    doc.addPage();
    addHeaderBand(doc, "Venda Contemplada");
    addWatermark(doc);

    // Texto intro topo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const introText =
      "Ideal para investidores que desejam maximizar ganhos em cotas contempladas, unindo segurança, liquidez e procura consistente.";
    doc.text(introText, marginX, 150, { maxWidth: pageW - marginX * 2 });

    // ===== Proposta de Contratação =====
    const mesesCont = sim.parcela_contemplacao ?? 0;
    const qtdIniciais = Math.min(2, Math.max(0, mesesCont));
    const somaIniciais = (sim.parcela_ate_1_ou_2 ?? 0) * qtdIniciais;
    const somaDemais = Math.max(0, mesesCont - qtdIniciais) * (sim.parcela_demais ?? 0);
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;
    const totalInvestidoAteCont = somaIniciais + somaDemais + lanceProprioValor;

    const rotuloParcelasIniciais = qtdIniciais >= 2 ? "Parcelas 1 e 2" : "Parcela 1";

    (doc as any).autoTable({
      startY: 180,
      head: [["Proposta de Contratação", ""]],
      body: [
        ["Crédito contratado", brMoney(sim.credito)],
        ["Segmento", normalizeSegment(sim.segmento)],
        [rotuloParcelasIniciais, brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais parcelas até a contemplação", brMoney(sim.parcela_demais)],
        ["Prazo", (sim.prazo_venda ?? sim.novo_prazo ?? 0) ? `${sim.prazo_venda ?? sim.novo_prazo} meses` : "—"],
        [
          "Lance",
          `${formatPercentFraction(sim.lance_ofertado_pct ?? 0)} | ${brMoney(
            (sim.credito ?? 0) * (sim.lance_ofertado_pct ?? 0)
          )} | Lance Embutido: ${formatPercentFraction(
            (sim.credito ?? 0) > 0 ? embutidoValor / (sim.credito ?? 1) : 0
          )} | ${brMoney(embutidoValor)} | Lance Próprio: ${brMoney(lanceProprioValor)}`,
        ],
        ["Mês da Contemplação", mesesCont || "—"],
        ["Total Investido (R$)", brMoney(totalInvestidoAteCont)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ===== Projeção na Venda =====
    const startYProj = (doc as any).lastAutoTable?.finalY ?? 300;

    const creditoLiberado = sim.novo_credito ?? Math.max(0, (sim.credito ?? 0) - embutidoValor);
    const ganhoVendaPct = params.reforco_pct || 0;
    const valorVenda = creditoLiberado * ganhoVendaPct; // conforme solicitado
    const totalInvestido = totalInvestidoAteCont;
    const lucroLiquido = Math.max(0, valorVenda - totalInvestido);
    const roi = totalInvestido > 0 ? lucroLiquido / totalInvestido : 0;
    const rentabMes =
      mesesCont > 0 ? Math.pow(1 + roi, 1 / mesesCont) - 1 : 0;
    const percDoCDI = cdiMensal > 0 ? rentabMes / cdiMensal : 0;

    (doc as any).autoTable({
      startY: startYProj + 18,
      head: [["Projeção na Venda", ""]],
      body: [
        ["Crédito Liberado", brMoney(creditoLiberado)],
        ["Ganho na Venda (%)", formatPercentFraction(ganhoVendaPct)],
        ["Valor da Venda", brMoney(valorVenda)],
        ["Total Investido", brMoney(totalInvestido)],
        ["Lucro Líquido", brMoney(lucroLiquido)],
        ["ROI", formatPercentFraction(roi)],
        ["Rentabilidade ao mês", formatPercentFraction(rentabMes)],
        ["% do CDI (mês)", formatPercentFraction(percDoCDI)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ===== Demonstração Gráfica =====
    const afterProjY = (doc as any).lastAutoTable?.finalY ?? startYProj + 18;

    // título do bloco
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Demonstração Gráfica", marginX, afterProjY + 28);

    // área gráfica centralizada
    const graphYTop = afterProjY + 40;
    const graphAreaW = pageW - marginX * 2;
    const maxVal = Math.max(valorVenda, totalInvestido) || 1;
    const scale = (graphAreaW - 120) / maxVal; // 120 de margem interna p/ labels
    const barH = 26;
    const barRound = 13;
    const gap = 22;

    // barra 1: Venda (cinza)
    const vendaW = valorVenda * scale;
    const vendaX = marginX + (graphAreaW - vendaW) / 2; // centralizada
    if ((doc as any).roundedRect) {
      doc.setFillColor(107, 114, 128); // gray-500
      (doc as any).roundedRect(vendaX, graphYTop, vendaW, barH, barRound, barRound, "F");
    } else {
      doc.setFillColor(107, 114, 128);
      doc.rect(vendaX, graphYTop, vendaW, barH, "F");
    }
    // label dentro da barra
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`Venda: ${brMoney(valorVenda)}`, vendaX + 12, graphYTop + barH - 8);

    // barra 2: Investido (navy) + Lucro (vermelho) empilhado (mesmo formato/rounded)
    const bar2Y = graphYTop + barH + gap;
    const investW = Math.max(0, Math.min(totalInvestido, maxVal)) * scale;
    const lucroW = Math.max(0, Math.min(lucroLiquido, maxVal)) * scale;
    const totalBar2W = investW + lucroW;
    const bar2X = marginX + (graphAreaW - totalBar2W) / 2;

    // Investido
    doc.setFillColor(24, 42, 74);
    if ((doc as any).roundedRect) {
      (doc as any).roundedRect(bar2X, bar2Y, totalBar2W, barH, barRound, barRound, "F");
    } else {
      doc.rect(bar2X, bar2Y, totalBar2W, barH, "F");
    }
    // overlay vermelho (lucro) no final
    doc.setFillColor(161, 28, 39);
    doc.rect(bar2X + investW, bar2Y, lucroW, barH, "F");

    // Labels internos
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`Investido: ${brMoney(totalInvestido)}`, bar2X + 12, bar2Y + barH - 8);
    // lucro label
    const lucroLabel = `Lucro Líquido: ${brMoney(lucroLiquido)}`;
    const textoW = (doc.getTextWidth(lucroLabel) || 0) + 8;
    const labelX = Math.max(bar2X + investW + 6, bar2X + totalBar2W - textoW);
    doc.text(lucroLabel, labelX, bar2Y + barH - 8);

    addFooter(doc);

    // Página 3 — Indicadores Econômicos
    doc.addPage();
    addHeaderBand(doc, "Indicadores Econômicos");
    addWatermark(doc);
    (doc as any).autoTable({
      startY: 160,
      head: [["Indicadores", "Valor"]],
      body: [
        ["Selic a.a.", formatPercentFraction(params.selic_anual)],
        ["CDI a.a.", formatPercentFraction(params.cdi_anual)],
        ["CDI a.m.", formatPercentFraction(cdiMensal)],
        ["IPCA 12 Meses", formatPercentFraction(params.ipca12m)],
        ["IPCA (mês médio)", formatPercentFraction(ipcaMensal)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Disclaimers
    const disc =
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(disc, marginX, (doc as any).lastAutoTable?.finalY + 24, {
      maxWidth: pageW - marginX * 2,
    });

    addFooter(doc);
    doc.save(`Venda_Contemplada_${sim.code}.pdf`);
  }

  /* ---------- Outros modelos (capa com card replicado) ---------- */
  function gerarPDFDirecionada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    addHeaderBand(doc, `Plano estratégico e personalizado para ${firstName(sim.lead_nome)}`);
    addWatermark(doc);
    drawSellerCard(doc, doc.internal.pageSize.getWidth() - 40 - 360, 34);
    addFooter(doc);

    doc.addPage();
    addHeaderBand(doc, "Proposta Direcionada");
    addWatermark(doc);

    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    (doc as any).autoTable({
      startY: 150,
      head: [["Campo", "Valor"]],
      body: [
        ["Cliente", `${firstName(sim.lead_nome)}`],
        ["Segmento", normalizeSegment(sim.segmento)],
        ["Grupo", sim.grupo || "—"],
        ["Crédito líquido (após)", brMoney(sim.novo_credito)],
        ["Parcela 1 (até contemplação)", brMoney(sim.parcela_ate_1_ou_2)],
        ["Parcela escolhida (após)", brMoney(sim.parcela_escolhida)],
        ["Prazo restante (meses)", String(sim.novo_prazo ?? 0)],
        ["Lance próprio", brMoney(sim.lance_proprio_valor)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Disclaimer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.",
      40,
      (doc as any).lastAutoTable?.finalY + 24,
      { maxWidth: pageW - 80 }
    );
    addFooter(doc);
    doc.save(`Proposta_Direcionada_${sim.code}.pdf`);
  }

  async function gerarPDFInvest(modelKey: ModelKey, sims: SimRow[]) {
    if (sims.length === 0) {
      alert("Selecione pelo menos uma simulação.");
      return;
    }
    for (const s of sims) {
      if (modelKey === "venda_contemplada") gerarPDFVendaContemplada(s);
      else if (modelKey === "direcionada") gerarPDFDirecionada(s);
      else gerarPDFDirecionada(s); // fallback até implementar todos
    }
  }

  /* ========================= UI ========================= */
  return (
    <div className="p-6 space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Buscar por nome ou telefone</Label>
            <Input
              placeholder="ex.: Maria / 11 9..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> De
            </Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Até
            </Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Resultados (paginado) */}
      <Card>
        <CardHeader>
          <CardTitle>
            Resultados{" "}
            <span className="text-muted-foreground text-sm">({rows.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-left p-2">Criada</th>
                  <th className="text-left p-2">Lead</th>
                  <th className="text-left p-2">Segmento</th>
                  <th className="text-left p-2">Crédito (após)</th>
                  <th className="text-left p-2">Parcela (após)</th>
                  <th className="text-left p-2">Prazo</th>
                  <th className="text-center p-2">Oportunidade</th>
                  <th className="text-center p-2">Resumo</th>
                  <th className="text-center p-2">PDF</th>
                  <th className="text-center p-2">Abrir</th>
                  <th className="text-center p-2">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.code} className="border-t">
                    <td className="p-2">{r.code}</td>
                    <td className="p-2 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.lead_nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.lead_telefone || "—"}
                      </div>
                    </td>
                    <td className="p-2">{normalizeSegment(r.segmento)}</td>
                    <td className="p-2">{brMoney(r.novo_credito)}</td>
                    <td className="p-2">{brMoney(r.parcela_escolhida)}</td>
                    <td className="p-2">{r.novo_prazo ?? r.prazo_venda ?? 0}x</td>

                    <td className="p-2 text-center">
                      <button
                        className="h-9 w-9 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center hover:opacity-95"
                        title="Copiar Oportunidade"
                        onClick={() => copyOportunidadeText(r)}
                      >
                        <Megaphone className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        className="h-9 w-9 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center hover:opacity-95"
                        title="Copiar Resumo"
                        onClick={() => copyResumoText(r)}
                      >
                        <ClipboardCopy className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        className="h-9 w-9 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center hover:opacity-95"
                        title="Gerar PDF"
                        onClick={() => gerarPDFVendaContemplada(r)}
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        className="h-9 w-9 rounded-full bg-muted inline-flex items-center justify-center text-foreground/70"
                        title="Abrir (em breve)"
                        onClick={() => window.alert("Em breve")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        className="h-9 w-9 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center hover:opacity-95"
                        title="Excluir"
                        onClick={() => handleDelete(r.code)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-muted-foreground">
                      {loading ? "Carregando..." : "Nenhum resultado para os filtros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* paginação */}
          <div className="flex items-center justify-between text-sm">
            <div>
              {rows.length > 0 && (
                <>
                  Mostrando{" "}
                  <strong>
                    {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)}
                  </strong>{" "}
                  de <strong>{rows.length}</strong>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-9 rounded-xl px-3"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <span>
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                className="h-9 rounded-xl px-3"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Propostas de Investimento */}
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>Propostas de Investimento</CardTitle>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              className="rounded-2xl h-10 px-4"
              onClick={() => setParamOpen(true)}
              title="Parâmetros"
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Parâmetros
            </Button>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
              className="h-10 rounded-2xl border px-3"
              title="Modelo"
            >
              <option value="venda_contemplada">Venda Contemplada</option>
              <option value="direcionada">Direcionada</option>
              <option value="alav_fin">Alav. Financeira</option>
              <option value="alav_patr">Alav. Patrimonial</option>
              <option value="previdencia">Previdência</option>
              <option value="credito_correcao">Crédito c/ Correção</option>
              <option value="extrato">Extrato</option>
            </select>

            <Button
              className="rounded-2xl h-10 px-4"
              variant="secondary"
              onClick={() => gerarPDFInvest(model, selectedInvest)}
              disabled={selectedInvest.length === 0}
            >
              Gerar ({selectedInvest.length})
            </Button>

            <Button className="rounded-2xl h-10 px-4" onClick={() => setAddOpen(true)}>
              Adicionar simulações
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-sm text-muted-foreground mb-2">
            Selecionadas: <strong>{selectedCount}</strong> / 5
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 w-10"></th>
                  <th className="text-left p-2">
                    <div className="flex items-center gap-2">
                      Criada
                      <input
                        type="checkbox"
                        title="Selecionar todas"
                        onChange={(e) => selectAllInvest(e.currentTarget.checked)}
                        checked={invest.length > 0 && invest.every((r) => !!selectMap[r.code])}
                      />
                    </div>
                  </th>
                  <th className="text-left p-2">Lead</th>
                  <th className="text-left p-2">Segmento</th>
                  <th className="text-left p-2">Crédito (após)</th>
                  <th className="text-left p-2">Parcela (após)</th>
                  <th className="text-left p-2">Prazo</th>
                  <th className="text-center p-2">Gerar</th>
                </tr>
              </thead>
              <tbody>
                {invest.map((r) => (
                  <tr key={r.code} className="border-t">
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!selectMap[r.code]}
                        onChange={() => toggleSelect(r.code)}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.lead_nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.lead_telefone || "—"}
                      </div>
                    </td>
                    <td className="p-2">{normalizeSegment(r.segmento)}</td>
                    <td className="p-2">{brMoney(r.novo_credito)}</td>
                    <td className="p-2">{brMoney(r.parcela_escolhida)}</td>
                    <td className="p-2">{r.novo_prazo ?? r.prazo_venda ?? 0}x</td>
                    <td className="p-2 text-center">
                      <div className="relative">
                        <details className="group inline-block">
                          <summary className="list-none">
                            <Button variant="secondary" size="sm" className="rounded-xl h-8">
                              Gerar... <ChevronDown className="h-4 w-4 ml-1" />
                            </Button>
                          </summary>
                          <div className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow z-10 p-1">
                            {[
                              { k: "venda_contemplada", label: "Venda Contemplada" },
                              { k: "direcionada", label: "Direcionada" },
                              { k: "alav_fin", label: "Alav. Financeira" },
                              { k: "alav_patr", label: "Alav. Patrimonial" },
                              { k: "previdencia", label: "Previdência" },
                              { k: "credito_correcao", label: "Crédito c/ Correção" },
                              { k: "extrato", label: "Extrato" },
                            ].map((opt) => (
                              <button
                                key={opt.k}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/70"
                                onClick={(e) => {
                                  e.preventDefault();
                                  gerarPDFInvest(opt.k as ModelKey, [r]);
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
                {invest.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      Nenhuma simulação adicionada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: adicionar simulações */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Adicionar simulações (até 5)</div>
              <button className="p-1 rounded hover:bg-muted" onClick={() => setAddOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="md:col-span-3">
                  <Label>Buscar por nome ou telefone</Label>
                  <Input
                    placeholder="ex.: Maria / 11 9..."
                    value={modalQ}
                    onChange={(e) => setModalQ(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full h-10 rounded-2xl"
                    variant="secondary"
                    onClick={() => loadModal()}
                  >
                    {modalLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-1" /> Buscar
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-[50vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="p-2 w-10">Sel.</th>
                        <th className="text-left p-2">Criada</th>
                        <th className="text-left p-2">Lead</th>
                        <th className="text-left p-2">Segmento</th>
                        <th className="text-left p-2">Crédito (após)</th>
                        <th className="text-left p-2">Parcela (após)</th>
                        <th className="text-left p-2">Prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalRows.map((r) => {
                        const checked = modalSel.has(r.code);
                        return (
                          <tr key={r.code} className="border-t">
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleModalSel(r.code)}
                              />
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              {new Date(r.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td className="p-2">
                              <div className="font-medium">{r.lead_nome || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.lead_telefone || "—"}
                              </div>
                            </td>
                            <td className="p-2">{normalizeSegment(r.segmento)}</td>
                            <td className="p-2">{brMoney(r.novo_credito)}</td>
                            <td className="p-2">{brMoney(r.parcela_escolhida)}</td>
                            <td className="p-2">{r.novo_prazo ?? r.prazo_venda ?? 0}x</td>
                          </tr>
                        );
                      })}
                      {modalRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            {modalLoading ? "Carregando..." : "Sem resultados."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div>
                  Selecionados no total: <strong>{modalSel.size}</strong> / 5
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="rounded-2xl"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-2xl"
                    onClick={saveFromModal}
                    disabled={modalSel.size === 0}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Salvar na lista
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Parâmetros */}
      {paramOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Parâmetros das propostas</div>
              <button className="p-1 rounded hover:bg-muted" onClick={() => setParamOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 grid gap-5 md:grid-cols-2 text-sm">
              <div>
                <Label>Selic Anual</Label>
                <Input
                  defaultValue={formatPercentFraction(params.selic_anual)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, selic_anual: v }));
                  }}
                />
              </div>

              <div>
                <Label>CDI Anual</Label>
                <Input
                  defaultValue={formatPercentFraction(params.cdi_anual)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, cdi_anual: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  CDI Mensal: <strong>{formatPercentFraction(cdiMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>IPCA 12 Meses</Label>
                <Input
                  defaultValue={formatPercentFraction(params.ipca12m)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, ipca12m: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  IPCA (mês): <strong>{formatPercentFraction(ipcaMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>Juros Financiamento — Crédito Veículo (a.m.)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.fin_veic_mensal)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, fin_veic_mensal: v }));
                  }}
                />
              </div>

              <div>
                <Label>Juros Financiamento — Imobiliário (a.a.)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.fin_imob_anual)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, fin_imob_anual: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Ao mês (composto): <strong>{formatPercentFraction(finImobMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>Reforço (Alav. Financeira)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.reforco_pct)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, reforco_pct: v }));
                  }}
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                className="rounded-2xl"
                onClick={() => setParamOpen(false)}
              >
                Cancelar
              </Button>
              <Button className="rounded-2xl" onClick={() => saveParams(params)}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
