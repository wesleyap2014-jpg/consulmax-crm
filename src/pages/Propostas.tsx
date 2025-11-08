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
  SlidersHorizontal,
  EyeOff,
  Eye,
  Download,
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

  // entradas principais
  credito: number | null;
  prazo_venda: number | null; // <- usar como "Prazo" visível (pedido)
  parcela_contemplacao: number | null;

  // pós-lance
  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;

  // até contemplação
  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;

  // lance
  lance_proprio_valor: number | null;
  lance_ofertado_pct?: number | null;

  // taxas gravadas na simulação
  adm_tax_pct?: number | null;  // fração
  fr_tax_pct?: number | null;   // fração

  // NOVO — quantidade de parcelas antecipadas gravada pelo simulador
  antecip_parcelas?: number | null;
};

type ModelKey =
  | "direcionada"
  | "venda_contemplada";

/* ======================= Helpers ========================= */
const brand = {
  header: "#0F1E36", // azul escuro da capa
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  glassBg: "rgba(255,255,255,0.18)",
  glassBorder: "rgba(255,255,255,0.35)",
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
const startOfDayISO = (d: string) => new Date(`${d}T00:00:00.000`).toISOString();
const endOfDayISO = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

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

/* ============ Percent helpers (humanizado) ============== */
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

/* ============== Finance helpers (PMT etc.) ============== */
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

  // privacidade: mostrar/ocultar resultados
  const [showResults, setShowResults] = useState(true);

  // dados do usuário (vendedor) -> public.user
  const [seller, setSeller] = useState<{
    nome: string;
    phone: string;
    avatar_url?: string | null;
  }>({ nome: "Consultor Consulmax", phone: "" });

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("user")
        .select("nome, phone, avatar_url")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setSeller({
        nome: (data?.nome || "").toString().trim() || "Consultor Consulmax",
        phone: (data?.phone || "").toString(),
        avatar_url: data?.avatar_url || null,
      });
    })();
  }, []);

  // logo p/ PDF
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  useEffect(() => {
    fetchAsDataURL(LOGO_URL).then(setLogoDataUrl);
  }, []);

  // item selecionado para prévia
  const [preview, setPreview] = useState<SimRow | null>(null);

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
          // novo campo que o simulador gravará
          "antecip_parcelas"
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

    const text = `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${segNorm}

${emoji} Crédito: ${brMoney(r.novo_credito)}
💰 ${labelParcelaInicial(r)}: ${brMoney(r.parcela_ate_1_ou_2)} (Em até 3x no cartão)
📆 + ${r.novo_prazo ?? 0}x de ${brMoney(r.parcela_escolhida)}
💵 Lance Próprio: ${brMoney(r.lance_proprio_valor)}
📢 Grupo: ${r.grupo || "—"}

🚨 POUCAS VAGAS DISPONÍVEIS🚨
Assembleia 15/10

📲 Garanta sua vaga agora!
${formatPhoneBR(seller.phone) || "-"}

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
${labelParcelaInicial(r)} (até contemplação): ${brMoney(r.parcela_ate_1_ou_2)}
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
    const { error } = await supabase.from("sim_simulations").delete().eq("code", code);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setRows((prev) => prev.filter((x) => x.code !== code));
    if (preview?.code === code) setPreview(null);
  }

  /* ---------- Parâmetros (apenas indicadores/finanças) ---------- */
  type Params = {
    selic_anual: number;
    cdi_anual: number;
    ipca12m: number;
    igpm12m: number;
    incc12m: number;
    inpc12m: number;

    fin_veic_mensal: number; // a.m.
    fin_imob_anual: number;  // a.a. (composto -> mês)

    reforco_pct: number;     // "Ganho na Venda (%)"
  };
  const DEFAULT_PARAMS: Params = {
    selic_anual: 0.15,
    cdi_anual: 0.149,
    ipca12m: 0.0535,
    igpm12m: 0.0,
    incc12m: 0.0,
    inpc12m: 0.0,
    fin_veic_mensal: 0.021,
    fin_imob_anual: 0.11,
    reforco_pct: 0.05,
  };
  const [params, setParams] = useState<Params>(() => {
    try {
      const raw = localStorage.getItem("proposalParamsV3");
      if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);
  function saveParams(p: Params) {
    setParams(p);
    try {
      localStorage.setItem("proposalParamsV3", JSON.stringify(p));
    } catch {}
    setParamOpen(false);
  }

  const cdiMensal = useMemo(() => annualToMonthlyCompound(params.cdi_anual), [params.cdi_anual]);
  const ipcaMensal = useMemo(() => (params.ipca12m || 0) / 12, [params.ipca12m]);

  /* ========================= PDF infra ========================= */
  const headerBand = (doc: jsPDF, title: string) => {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(brand.header);
    doc.rect(0, 0, w, 140, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 90);
  };
  const addWatermark = (doc: jsPDF) => {
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
  };
  const addFooter = (doc: jsPDF) => {
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
      `Consultor responsável: ${seller.nome}`,
    ];
    let y = yTop + 20;
    lines.forEach((t) => {
      doc.text(t, w - margin, y, { align: "right" as any });
      y += 14;
    });
  };
  const sellerCard = (doc: jsPDF) => {
    const w = doc.internal.pageSize.getWidth();
    const cardW = Math.min(520, w - 80);
    const x = (w - cardW) / 2;
    const y = 150; // abaixo da barra de título
    const h = 118;

    // sombra leve
    doc.setDrawColor(240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, h, 14, 14, "F");

    // avatar (placeholder)
    const pad = 18;
    let xCursor = x + pad;
    const yMid = y + h / 2;

    if (seller.avatar_url) {
      doc.setFillColor(245);
      doc.circle(xCursor + 34, yMid, 34, "F");
      xCursor += 80;
    }

    if (logoDataUrl) {
      const props = (doc as any).getImageProperties(logoDataUrl);
      const ratio = Math.min(80 / props.width, 40 / props.height);
      const lw = props.width * ratio;
      const lh = props.height * ratio;
      doc.addImage(logoDataUrl, "PNG", xCursor, y + pad + 2, lw, lh);
      xCursor += lw + 14;
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text(seller.nome || "Consultor Consulmax", xCursor, y + pad + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80);
    const whats = formatPhoneBR(seller.phone) || "-";
    doc.text(`Whats: ${whats}`, xCursor, y + pad + 36);
    doc.text(`Consulmax • Consultoria Especializada`, xCursor, y + pad + 56);
  };

  function firstName(full?: string | null) {
    const s = (full || "").trim();
    if (!s) return "Cliente";
    return s.split(/\s+/)[0];
  }

  const labelParcelaInicial = (sim: SimRow) => {
    const n = Number(sim.antecip_parcelas ?? 1);
    if (!Number.isFinite(n) || n <= 1) return "Parcela 1";
    if (n === 2) return "Parcelas 1 e 2";
    return `Parcelas 1 a ${n}`;
  };

  /* ==================== PDF: Direcionada ==================== */
  function gerarPDFDirecionada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Capa
    headerBand(doc, "Proposta Direcionada");
    sellerCard(doc);
    addWatermark(doc);
    addFooter(doc);

    // Página de conteúdo
    doc.addPage();
    headerBand(doc, "Proposta Direcionada");
    addWatermark(doc);

    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Intro
    const nome = firstName(sim.lead_nome);
    const introY = 180;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(`Plano estratégico e personalizado para ${nome}`, marginX, introY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    const frase =
      "Ideal para quem busca crédito alto com inteligência financeira, seja para compra do bem, ampliação patrimonial ou alavancagem de investimentos.";
    doc.text(frase, marginX, introY + 18, { maxWidth: pageW - marginX * 2 });

    // Especificações (usa apenas as taxas gravadas)
    const C = sim.credito ?? 0;
    const adm = sim.adm_tax_pct;
    const fr = sim.fr_tax_pct;
    const hasAF = typeof adm === "number" && typeof fr === "number";
    const valorCategoria = hasAF ? C * (1 + (adm as number) + (fr as number)) : null;
    const totalEncargos = hasAF ? C * ((adm as number) + (fr as number)) : null;
    const prazoApos = sim.novo_prazo ?? 0;
    const taxaTotalMensalizada =
      hasAF && prazoApos > 0 ? (((adm as number) + (fr as number)) / prazoApos) : null;

    (doc as any).autoTable({
      startY: 240,
      head: [["Especificações da Proposta", ""]],
      body: [
        ["Crédito Total", brMoney(C)],
        ["Prazo após o lance", prazoApos ? `${prazoApos} meses` : "—"],
        ["Taxa de adm (total)", typeof adm === "number" ? formatPercentFraction(adm) : "—"],
        ["Fundo Reserva", typeof fr === "number" ? formatPercentFraction(fr) : "—"],
        ["Total de Encargos", totalEncargos !== null ? brMoney(totalEncargos) : "—"],
        ["Taxa total mensalizada", taxaTotalMensalizada !== null ? formatPercentFraction(taxaTotalMensalizada) : "—"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Simulação de Parcelas (até a contemplação)
    const y1 = (doc as any).lastAutoTable?.finalY ?? 310;
    (doc as any).autoTable({
      startY: y1 + 18,
      head: [["Simulação de Parcelas", "Valor", "Observações"]],
      body: [
        [labelParcelaInicial(sim), brMoney(sim.parcela_ate_1_ou_2), "1ª parcela em até 3x no cartão"],
        ["Demais", brMoney(sim.parcela_demais), "Até a contemplação"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Estratégia / Custo final consórcio
    const y2 = (doc as any).lastAutoTable?.finalY ?? y1 + 18;
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;
    const lanceOfertadoPct =
      sim.lance_ofertado_pct ?? (C > 0 ? (embutidoValor + lanceProprioValor) / C : 0);
    const lanceOfertadoValor =
      (C * (lanceOfertadoPct || 0)) || (embutidoValor + lanceProprioValor);
    const lancePagoValor = Math.max(0, lanceOfertadoValor - embutidoValor);
    const custoFinalCons = hasAF && valorCategoria !== null ? (valorCategoria - embutidoValor) : null;

    (doc as any).autoTable({
      startY: y2 + 18,
      head: [["Estratégia do Consórcio", "Valor"]],
      body: [
        ["Lance Pago (recursos próprios)", brMoney(lancePagoValor)],
        ["Lance Embutido", brMoney(embutidoValor)],
        ["Parcela após o lance", brMoney(sim.parcela_escolhida)],
        ["Prazo após o lance", sim.novo_prazo ? `${sim.novo_prazo} meses` : "—"],
        ["Crédito Recebido", brMoney(sim.novo_credito)],
        ["Custo Final (Consórcio)", custoFinalCons !== null ? brMoney(custoFinalCons) : "—"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Resumo
    const y3 = (doc as any).lastAutoTable?.finalY ?? y2 + 18;
    (doc as any).autoTable({
      startY: y3 + 18,
      head: [["RESUMO", "Valor"]],
      body: [
        ["Crédito", brMoney(C)],
        [labelParcelaInicial(sim), brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais", `${brMoney(sim.parcela_demais)} (até a contemplação)`],
        [
          "Taxa de adm (total)",
          typeof adm === "number" ? `${formatPercentFraction(adm)} (${brMoney((adm as number) * C)})` : "—",
        ],
        [
          "Fundo de Reserva",
          typeof fr === "number" ? `${formatPercentFraction(fr)} (${brMoney((fr as number) * C)})` : "—",
        ],
        ["Valor de Categoria", valorCategoria !== null ? brMoney(valorCategoria) : "—"],
        ["Custo Final (Consórcio)", custoFinalCons !== null ? brMoney(custoFinalCons) : "—"],
        ["Lance Sugerido", brMoney(lanceOfertadoValor)],
        ["Crédito sem embutido", brMoney(C)],
        ["Crédito com embutido", brMoney(sim.novo_credito)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    const yEnd = (doc as any).lastAutoTable?.finalY ?? y3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const disclaimer =
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.";
    doc.text(disclaimer, marginX, yEnd + 18, { maxWidth: pageW - marginX * 2 });

    addFooter(doc);
    doc.save(`Proposta_Direcionada_${sim.code}.pdf`);
  }

  /* ============== PDF: Venda Contemplada ============== */
  function gerarPDFVendaContemplada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Capa
    headerBand(doc, "Venda Contemplada");
    sellerCard(doc);
    addWatermark(doc);
    addFooter(doc);

    // Página 2 — Proposta + Projeção
    doc.addPage();
    headerBand(doc, "Venda Contemplada");
    addWatermark(doc);

    // Texto topo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const fraseTopo =
      "Ideal para investidores que desejam maximizar ganhos em cotas contempladas, unindo segurança, liquidez e procura consistente.";
    doc.text(fraseTopo, marginX, 170, { maxWidth: pageW - marginX * 2 });

    // ===== Proposta de Contratação =====
    const C = sim.credito ?? 0;
    const seg = normalizeSegment(sim.segmento);
    const labelInicial = labelParcelaInicial(sim);
    const prazoVenda = sim.prazo_venda ?? 0;
    const lancePct = sim.lance_ofertado_pct ?? 0;
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;

    (doc as any).autoTable({
      startY: 190,
      head: [["Proposta de Contratação", ""]],
      body: [
        ["Crédito contratado", brMoney(C)],
        ["Segmento", seg],
        [labelInicial, brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais parcelas até a contemplação", brMoney(sim.parcela_demais)],
        ["Prazo", prazoVenda ? `${prazoVenda} meses` : "—"],
        [
          "Lance",
          `${formatPercentFraction(lancePct)} | ${brMoney(C * (lancePct || 0))}  |  Lance Embutido: ${formatPercentFraction(embutidoValor / C || 0)} | ${brMoney(embutidoValor)}  |  Lance Próprio: ${brMoney(lanceProprioValor)}`,
        ],
        ["Mês da Contemplação", sim.parcela_contemplacao ? `${sim.parcela_contemplacao}º` : "—"],
        [
          "Total Investido (R$)",
          (() => {
            const n = sim.parcela_contemplacao ?? 0;
            const p1 = sim.parcela_ate_1_ou_2 ?? 0;
            const pd = sim.parcela_demais ?? 0;
            const investido = n > 0 ? (p1 + pd * Math.max(0, n - 1) + (sim.lance_proprio_valor ?? 0)) : 0;
            return brMoney(investido);
          })(),
        ],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ===== Projeção na Venda =====
    const yProj = (doc as any).lastAutoTable?.finalY ?? 280;

    const creditoLiberado = Math.max(0, (sim.novo_credito ?? 0));
    const ganhoPct = params.reforco_pct;
    const valorVenda = creditoLiberado * (1 + ganhoPct);
    const n = sim.parcela_contemplacao ?? 0;
    const investido =
      n > 0
        ? ((sim.parcela_ate_1_ou_2 ?? 0) + (sim.parcela_demais ?? 0) * Math.max(0, n - 1) + (sim.lance_proprio_valor ?? 0))
        : 0;
    const lucroLiquido = Math.max(0, valorVenda - investido);
    const roi = investido > 0 ? (lucroLiquido / investido) : 0;

    (doc as any).autoTable({
      startY: yProj + 18,
      head: [["Projeção na Venda", ""]],
      body: [
        ["Crédito Liberado", brMoney(creditoLiberado)],
        ["Ganho na Venda (%)", formatPercentFraction(ganhoPct)],
        ["Valor da Venda", brMoney(valorVenda)],
        ["Total Investido", brMoney(investido)],
        ["Lucro Líquido", brMoney(lucroLiquido)],
        ["ROI", formatPercentFraction(roi)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Disclaimer
    const yEnd = (doc as any).lastAutoTable?.finalY ?? yProj + 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const disclaimer =
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.";
    doc.text(disclaimer, marginX, yEnd + 18, { maxWidth: pageW - marginX * 2 });

    addFooter(doc);
    doc.save(`Venda_Contemplada_${sim.code}.pdf`);
  }

  /* ========================= UI ========================= */

  // --- Drag & Drop helpers ---
  const onDragStartRow = (row: SimRow) => (ev: React.DragEvent<HTMLTableRowElement>) => {
    ev.dataTransfer.setData("text/plain", String(row.code));
    ev.dataTransfer.effectAllowed = "copyMove";
  };
  const onDropPreview = async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const codeStr = ev.dataTransfer.getData("text/plain");
    const code = Number(codeStr);
    if (!code) return;
    const found = rows.find((r) => r.code === code);
    if (found) setPreview(found);
  };
  const allowDrop = (ev: React.DragEvent<HTMLDivElement>) => ev.preventDefault();

  // --- Gráfico inline estilo "liquid glass" ---
  function GlassBar({
    label,
    value,
  }: { label: string; value: string }) {
    return (
      <div
        className="rounded-2xl p-3 mb-3"
        style={{
          background: brand.glassBg,
          border: `1px solid ${brand.glassBorder}`,
          boxShadow: "0 6px 24px rgba(16,24,40,0.15), inset 0 1px 0 rgba(255,255,255,0.3)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="text-xs text-white/80">{label}</div>
        <div className="text-lg font-semibold text-white">{value}</div>
      </div>
    );
  }

  // cálculo para a prévia + gráfico
  const previewCalc = useMemo(() => {
    if (!preview) return null;
    const C = preview.credito ?? 0;
    const creditoLiberado = Math.max(0, (preview.novo_credito ?? 0));
    const valorVenda = creditoLiberado * (1 + params.reforco_pct);
    const n = preview.parcela_contemplacao ?? 0;
    const investido =
      n > 0
        ? ((preview.parcela_ate_1_ou_2 ?? 0) + (preview.parcela_demais ?? 0) * Math.max(0, n - 1) + (preview.lance_proprio_valor ?? 0))
        : 0;
    const lucro = Math.max(0, valorVenda - investido);
    const roi = investido > 0 ? (lucro / investido) : 0;
    return { C, creditoLiberado, valorVenda, investido, lucro, roi };
  }, [preview, params.reforco_pct]);

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

      {/* Layout: Results + Preview */}
      <div className={`grid gap-6 ${showResults ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {/* Resultados (paginado) */}
        {showResults && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Resultados{" "}
                <span className="text-muted-foreground text-sm">({rows.length})</span>
              </CardTitle>

              <div className="flex items-center gap-2">
                {/* Chip: PDF Simplificado (placeholder visual — ícone ao lado) */}
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl h-9 px-3"
                  title="PDF Simplificado"
                >
                  <Download className="h-4 w-4 mr-1" />
                  PDF Simplificado
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl h-9 px-3"
                  onClick={() => setShowResults(false)}
                  title="Ocultar resultados"
                >
                  <EyeOff className="h-4 w-4 mr-1" />
                  Ocultar
                </Button>
              </div>
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
                      <th className="text-center p-2">Op.</th>
                      <th className="text-center p-2">Resumo</th>
                      <th className="text-center p-2">PDF</th>
                      <th className="text-center p-2">Abrir</th>
                      <th className="text-center p-2">Excluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r) => (
                      <tr
                        key={r.code}
                        className="border-t hover:bg-muted/30 cursor-grab"
                        draggable
                        onDragStart={onDragStartRow(r)}
                        onDoubleClick={() => setPreview(r)}
                      >
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
                        <td className="p-2">{r.novo_prazo ?? 0}x</td>

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
                          <div className="relative">
                            <details className="group inline-block">
                              <summary className="list-none">
                                <Button variant="secondary" size="sm" className="rounded-xl h-8">
                                  Gerar PDF <ChevronDown className="h-4 w-4 ml-1" />
                                </Button>
                              </summary>
                              <div className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow z-10 p-1">
                                {[
                                  { k: "direcionada", label: "Direcionada" },
                                  { k: "venda_contemplada", label: "Venda Contemplada" },
                                ].map((opt) => (
                                  <button
                                    key={opt.k}
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/70"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      if (opt.k === "direcionada") gerarPDFDirecionada(r);
                                      else gerarPDFVendaContemplada(r);
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </details>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <button
                            className="h-9 w-9 rounded-full bg-muted inline-flex items-center justify-center text-foreground/70"
                            title="Pré-visualizar"
                            onClick={() => setPreview(r)}
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

              {/* Zona de drop sob a tabela */}
              <div
                onDragOver={allowDrop}
                onDrop={onDropPreview}
                className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground text-center"
              >
                Arraste aqui a proposta da lista acima para demonstrar no gráfico ao lado
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
        )}

        {/* Prévia da Proposta */}
        <Card
          onDragOver={allowDrop}
          onDrop={onDropPreview}
          className={`${showResults ? "" : "lg:col-span-2"} transition-all`}
          style={{
            transition: "all .25s ease",
          }}
        >
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">Prévia da Proposta</CardTitle>

            <div className="flex items-center gap-2">
              {/* Chip Parâmetros com ícone ao lado */}
              <Button
                variant="secondary"
                className="rounded-2xl h-9 px-3"
                onClick={() => setParamOpen(true)}
                title="Parâmetros"
              >
                <SlidersHorizontal className="h-4 w-4 mr-1" />
                Parâmetros
              </Button>

              {/* Mostrar resultados (quando ocultos) */}
              {!showResults && (
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl h-9 px-3"
                  onClick={() => setShowResults(true)}
                  title="Mostrar resultados"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Mostrar
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {!preview && (
              <div className="h-[220px] rounded-xl border border-dashed grid place-items-center text-sm text-muted-foreground">
                Selecione um item da lista ou arraste uma proposta para cá.
              </div>
            )}

            {preview && (
              <div
                className="rounded-2xl p-5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(30,41,63,0.9), rgba(161,28,39,0.85))",
                  color: "white",
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    {emojiBySegment(preview.segmento)} {normalizeSegment(preview.segmento)}
                    <span className="text-white/70 text-sm">• #{preview.code}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-xl"
                      onClick={() => gerarPDFDirecionada(preview)}
                      title="Gerar PDF (Direcionada)"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Direcionada
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-xl"
                      onClick={() => gerarPDFVendaContemplada(preview)}
                      title="Gerar PDF (Venda Contemplada)"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Venda Contemplada
                    </Button>
                  </div>
                </div>

                {/* blocos “glass” com valores chave */}
                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <GlassBar label="Crédito (após lance)" value={brMoney(preview.novo_credito)} />
                  <GlassBar label="Parcela (após lance)" value={brMoney(preview.parcela_escolhida)} />
                  <GlassBar label="Prazo (após lance)" value={`${preview.novo_prazo ?? 0} meses`} />
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Tabela simples (texto) */}
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: brand.glassBg,
                      border: `1px solid ${brand.glassBorder}`,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.35)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <div className="font-semibold mb-3">Simulação de Parcelas (até contemplação)</div>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>{labelParcelaInicial(preview)}</span>
                        <span>{brMoney(preview.parcela_ate_1_ou_2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Demais</span>
                        <span>{brMoney(preview.parcela_demais)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Prazo do pedido</span>
                        <span>{preview.prazo_venda ?? 0} meses</span>
                      </div>
                    </div>
                  </div>

                  {/* Gráfico SVG sempre com valores visíveis */}
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: brand.glassBg,
                      border: `1px solid ${brand.glassBorder}`,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.35)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <div className="font-semibold mb-1">Demonstração Gráfica</div>
                    {previewCalc && (
                      <div className="text-xs text-white/80 mb-2" style={{ transform: "translateY(-6px)" }}>
                        ROI aproximado: <strong className="text-white">{formatPercentFraction(previewCalc.roi)}</strong>
                      </div>
                    )}
                    <svg width="100%" height="180">
                      {(() => {
                        if (!previewCalc) return null;
                        const W = 560; // canvas virtual
                        const H = 160;
                        const pad = 20;
                        const venda = previewCalc.valorVenda;
                        const invest = previewCalc.investido;
                        const lucro = previewCalc.lucro;
                        const max = Math.max(venda, invest + lucro, 1);

                        const scale = (v: number) => (v / max) * (W - pad * 2);

                        // Barra 1 (Venda)
                        const y1 = 20;
                        return (
                          <>
                            {/* Venda */}
                            <rect x={pad} y={y1} rx="14" ry="14" width={scale(venda)} height="26" fill="#7a8593" />
                            <text x={pad + 10} y={y1 + 18} fill="#fff" fontSize="12" fontWeight="700">
                              {`Venda: ${brMoney(venda)}`}
                            </text>

                            {/* Investido + Lucro */}
                            <rect x={pad} y={y1 + 50} rx="14" ry="14" width={scale(invest)} height="26" fill="#162843" />
                            <text x={pad + 10} y={y1 + 68} fill="#fff" fontSize="12" fontWeight="700">
                              {`Investido: ${brMoney(invest)}`}
                            </text>

                            <rect x={pad + scale(invest)} y={y1 + 50} rx="14" ry="14" width={scale(lucro)} height="26" fill="#A11C27" />
                            <text x={pad + scale(invest) + 10} y={y1 + 68} fill="#fff" fontSize="12" fontWeight="700">
                              {`Lucro: ${brMoney(lucro)}`}
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                  CDI Mensal (composto): <strong>{formatPercentFraction(cdiMensal)}</strong>
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
                  IPCA mês (média): <strong>{formatPercentFraction(ipcaMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>IGP-M 12 Meses</Label>
                <Input
                  defaultValue={formatPercentFraction(params.igpm12m)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, igpm12m: v }));
                  }}
                />
              </div>

              <div>
                <Label>INCC 12 Meses</Label>
                <Input
                  defaultValue={formatPercentFraction(params.incc12m)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, incc12m: v }));
                  }}
                />
              </div>

              <div>
                <Label>INPC 12 Meses</Label>
                <Input
                  defaultValue={formatPercentFraction(params.inpc12m)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, inpc12m: v }));
                  }}
                />
              </div>

              <div>
                <Label>Juros Financiamento — Veículos (ao mês)</Label>
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
                <Label>Juros Financiamento — Imobiliário/Rural (ao ano)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.fin_imob_anual)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, fin_imob_anual: v }));
                  }}
                />
              </div>

              <div className="md:col-span-2">
                <Label>Ganho na Venda (%)</Label>
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
