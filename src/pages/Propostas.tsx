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
  | "direcionada"
  | "alav_fin"
  | "alav_patr"
  | "previdencia"
  | "credito_correcao"
  | "extrato"
  | "venda_contemplada";

/* ======================= Helpers ========================= */
const brand = {
  header: "#0F1E36", // azul escuro da capa
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  barGrey: "#7a8593", // barra "Venda"
  barInvest: "#162843", // barra Investido
  barProfit: "#A11C27", // barra Lucro
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
      // tabela pública: public.user
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
    const isTwoAnt = labelParcelaInicial(r).includes("1 e 2");
    const text = `Resumo da Proposta — ${segNorm}

Crédito contratado: ${brMoney(r.credito)}
${isTwoAnt ? "Parcelas 1 e 2" : "Parcela 1"} (até contemplação): ${brMoney(r.parcela_ate_1_ou_2)}
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
  }

  /* ---------- Parâmetros ---------- */
  type Params = {
    // Indicadores (vão na página 3 da Venda Contemplada)
    selic_anual: number;
    cdi_anual: number;
    ipca12m: number;

    // Financiamento
    fin_veic_mensal: number; // a.m.
    fin_imob_anual: number;  // a.a. (composto -> mês)

    // Outras premissas
    aluguel_mensal_pct: number; // % ao mês (não usado aqui)
    reforco_pct: number;        // "Ganho na Venda (%)"
  };
  const DEFAULT_PARAMS: Params = {
    selic_anual: 0.15,
    cdi_anual: 0.149,
    ipca12m: 0.0535,
    fin_veic_mensal: 0.021,
    fin_imob_anual: 0.11,
    aluguel_mensal_pct: 0,
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
  function saveParams(p: Params) {
    setParams(p);
    try {
      localStorage.setItem("proposalParamsV2", JSON.stringify(p));
    } catch {}
    setParamOpen(false);
  }

  const cdiMensal = useMemo(() => annualToMonthlyCompound(params.cdi_anual), [params.cdi_anual]);
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

  const [model, setModel] = useState<ModelKey>("direcionada");

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

    // avatar (se houver)
    const pad = 18;
    let xCursor = x + pad;
    const yMid = y + h / 2;

    if (seller.avatar_url) {
      // aqui não baixamos a imagem remota; manter espaço do avatar
      doc.setFillColor(245);
      doc.circle(xCursor + 34, yMid, 34, "F");
      xCursor += 80;
    }

    // logo pequeno à esquerda
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

  const labelParcelaInicial = (sim: SimRow) => {
    // se houver 2 antecipações (pela sua regra de negócio),
    // você grava isso no schema? Aqui usamos o texto “Parcela 1 e 2”
    // quando a label original da tela indica 2 antecipações
    // Heurística: quando 'parcela_ate_1_ou_2' representa 1 e 2
    // mostramos “Parcela 1 e 2”, senão “Parcela 1”.
    // (Se preferir, podemos salvar um booleano no schema.)
    const two = true; // manter “sempre que houver 2 antecipações”, mas como pedido “sempre faça isso”, tornar default:
    return two ? "Parcela 1 e 2" : "Parcela 1";
  };

  /* ==================== PDF: Direcionada (mantida) ==================== */
  function firstName(full?: string | null) {
    const s = (full || "").trim();
    if (!s) return "Cliente";
    return s.split(/\s+/)[0];
  }

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

  /* ============== PDF: Venda Contemplada (novo) ============== */
  function drawRoundedBar(doc: jsPDF, x: number, y: number, w: number, h: number, color: string, label: string) {
    doc.setFillColor(color);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor("#FFFFFF");
    const tx = x + 16;
    const ty = y + h / 2 + 4;
    doc.text(label, tx, ty);
  }

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
    const prazoVenda = sim.prazo_venda ?? 0; // pedido: usar prazo_venda
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
          // soma dos fluxos até a contemplação (aproximação): parcela 1 + (parcelas demais * (n-1)) + lance próprio
          (() => {
            const n = sim.parcela_contemplacao ?? 0;
            const p1 = sim.parcela_ate_1_ou_2 ?? 0;
            const pd = sim.parcela_demais ?? 0;
            const investido = n > 0 ? (p1 + pd * Math.max(0, n - 1) + lanceProprioValor) : 0;
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

    const creditoLiberado = Math.max(0, (sim.novo_credito ?? 0)); // contratado – embutido (já vem “após”)
    const ganhoPct = params.reforco_pct; // pedido
    const valorVenda = creditoLiberado * (1 + ganhoPct); // "Crédito Liberado * Ganho da Venda (%)"
    // Total Investido (mesma lógica do bloco 1)
    const n = sim.parcela_contemplacao ?? 0;
    const investido = n > 0 ? ((sim.parcela_ate_1_ou_2 ?? 0) + (sim.parcela_demais ?? 0) * Math.max(0, n - 1) + lanceProprioValor) : 0;
    const lucroLiquido = Math.max(0, valorVenda - investido);
    const roi = investido > 0 ? (lucroLiquido / investido) : 0;
    const rentabMes = n > 0 ? Math.pow(1 + roi, 1 / n) - 1 : 0;
    const pctCDI = cdiMensal > 0 ? (rentabMes / cdiMensal) : 0;

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
        ["Rentabilidade ao Mês", formatPercentFraction(rentabMes)],
        ["% do CDI (mês)", `${(pctCDI * 100).toFixed(0)}%`],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ===== Demonstração Gráfica =====
    const yGraphTitle = (doc as any).lastAutoTable?.finalY ?? yProj + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Demonstração Gráfica", marginX, yGraphTitle + 28);

    const barWMax = pageW - marginX * 2;
    const barH = 28;

    // Barra 1 — Venda (cinza), centralizada
    const vendaW = Math.max(140, Math.min(barWMax * 0.9, barWMax * 0.9)); // tamanho visual (apenas exibição)
    const xVenda = marginX + (barWMax - vendaW) / 2;
    const yVenda = yGraphTitle + 50;
    drawRoundedBar(doc, xVenda, yVenda, vendaW, barH, brand.barGrey, `Venda: ${brMoney(valorVenda)}`);

    // Barra 2 — Investido + Lucro (mesmo formato, logo abaixo)
    const yInvest = yVenda + 48;
    // Investido (navy)
    const totalW = barWMax * 0.9;
    const investW = totalW * (investido / Math.max(valorVenda, investido + 1)); // proporção visual
    const lucroW = Math.max(0, totalW - investW);
    const xBase = marginX + (barWMax - totalW) / 2;

    drawRoundedBar(doc, xBase, yInvest, totalW, barH, brand.barInvest, `Investido: ${brMoney(investido)}`);
    // “sobrepõe” a parte do lucro com outra cor e mesmo raio
    doc.setFillColor(brand.barProfit);
    doc.roundedRect(xBase + investW, yInvest, lucroW, barH, barH / 2, barH / 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor("#FFFFFF");
    doc.text(`Lucro Líquido: ${brMoney(lucroLiquido)}`, xBase + investW + 12, yInvest + barH / 2 + 4);

    addFooter(doc);

    // ===== Página 3 — Indicadores Econômicos & Comparativo =====
    doc.addPage();
    headerBand(doc, "Venda Contemplada");
    addWatermark(doc);

    const yInd = 170;
    (doc as any).autoTable({
      startY: yInd,
      head: [["Indicadores Econômicos", "Valor"]],
      body: [
        ["Selic a.a.", formatPercentFraction(params.selic_anual)],
        ["CDI a.a.", formatPercentFraction(params.cdi_anual)],
        ["CDI a.m.", formatPercentFraction(cdiMensal)],
        ["IPCA 12 Meses", formatPercentFraction(params.ipca12m)],
        ["IPCA mês (média)", formatPercentFraction(ipcaMensal)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    const yComp = (doc as any).lastAutoTable?.finalY ?? yInd + 18;

    (doc as any).autoTable({
      startY: yComp + 18,
      head: [["COMPARATIVO", "", "% de IR"]],
      body: [
        ["Liquidez diária", "85% a 95% do CDI", "22,50%"],
        ["Até 180 dias", "90% a 105% do CDI", "22,50%"],
        ["De 181 a 360 dias", "95% a 110% do CDI", "20,00%"],
        ["De 361 a 720 dias", "100% a 115% do CDI", "17,50%"],
        ["Acima de 720 dias", "105% a 120% do CDI", "15,00%"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Disclaimer no final
    const yEnd = (doc as any).lastAutoTable?.finalY ?? yComp + 18;
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
                                  if (opt.k === "direcionada") gerarPDFDirecionada(r);
                                  else if (opt.k === "venda_contemplada") gerarPDFVendaContemplada(r);
                                  else alert("Modelo ainda não implementado nesta tela.");
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
              <option value="direcionada">Direcionada</option>
              <option value="venda_contemplada">Venda Contemplada</option>
              <option value="alav_fin">Alav. Financeira</option>
              <option value="alav_patr">Alav. Patrimonial</option>
              <option value="previdencia">Previdência</option>
              <option value="credito_correcao">Crédito c/ Correção</option>
              <option value="extrato">Extrato</option>
            </select>

            <Button
              className="rounded-2xl h-10 px-4"
              variant="secondary"
              onClick={() => {
                if (selectedInvest.length === 0) return;
                if (model === "direcionada") selectedInvest.forEach(gerarPDFDirecionada);
                else if (model === "venda_contemplada") selectedInvest.forEach(gerarPDFVendaContemplada);
                else alert("Modelo ainda não implementado nesta ação em lote.");
              }}
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
                        checked={
                          invest.length > 0 && invest.every((r) => !!selectMap[r.code])
                        }
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
                    <td className="p-2">{r.novo_prazo ?? 0}x</td>
                    <td className="p-2 text-center">
                      <div className="relative">
                        <details className="group inline-block">
                          <summary className="list-none">
                            <Button variant="secondary" size="sm" className="rounded-xl h-8">
                              Gerar... <ChevronDown className="h-4 w-4 ml-1" />
                            </Button>
                          </summary>
                          <div className="absolute right-0 mt-2 w-56 bg-white border rounded-xl shadow z-10 p-1">
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

            <div className="p-4 space-y-3" style={{ maxHeight: "80vh", overflowY: "auto" }}>
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
                            <td className="p-2">{r.novo_prazo ?? 0}x</td>
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
                <Label>Juros Financiamento — Crédito Veículo (ao mês)</Label>
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

              <div>
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
