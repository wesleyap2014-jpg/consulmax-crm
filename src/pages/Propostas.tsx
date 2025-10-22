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
  parcela_contemplacao: number | null;
  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;

  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;
  lance_proprio_valor: number | null;

  // NOVO: prazo informado para "venda contemplada"
  prazo_venda?: number | null;

  // Schema: frações (0–1)
  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;
  lance_ofertado_pct?: number | null;
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
  | "venda_contemplada"
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

  // dados do usuário (vendedor)
  const [userPhone, setUserPhone] = useState<string>("");
  const [userName, setUserName] = useState<string>("Consultor Consulmax");
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone, name, full_name, display_name, avatar_url")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserPhone((data?.phone || "").toString());
      const nm = (data?.display_name || data?.name || data?.full_name || "").toString().trim();
      if (nm) setUserName(nm);
      setUserPhoto((data?.avatar_url as string) || null);
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
          "prazo_venda",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const { error } = await supabase.from("sim_simulations").delete().eq("code", code);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setRows((prev) => prev.filter((x) => x.code !== code));
  }

  /* ---------- PDF helpers ---------- */
  function addHeaderBand(doc: jsPDF, title: string) {
    doc.setFillColor(30, 41, 63);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 120, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 76);
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

  /* ---------- Parâmetros ---------- */
  type Params = {
    selic_anual: number;       // NOVO
    cdi_anual: number;
    ipca12m: number;
    igpm12m: number;
    incc12m: number;
    fin_veic_mensal: number;
    fin_imob_anual: number;
    aluguel_mensal_pct: number;
    reforco_pct: number;
    cresc_patr_pct: number;
  };
  const DEFAULT_PARAMS: Params = {
    selic_anual: 0.15,
    cdi_anual: 0.149,
    ipca12m: 0.0535,
    igpm12m: 0.03,
    incc12m: 0.05,
    fin_veic_mensal: 0.021,
    fin_imob_anual: 0.11,
    aluguel_mensal_pct: 0.0,
    reforco_pct: 0.05,
    cresc_patr_pct: 0.06,
  };
  const [params, setParams] = useState<Params>(() => {
    try {
      const raw = localStorage.getItem("proposalParams");
      if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);
  function saveParams(p: Params) {
    setParams(p);
    try {
      localStorage.setItem("proposalParams", JSON.stringify(p));
    } catch {}
    setParamOpen(false);
  }

  // Derivados
  const cdiMensal = useMemo(() => annualToMonthlyCompound(params.cdi_anual), [params.cdi_anual]);
  const ipcaMensal = useMemo(() => (params.ipca12m || 0) / 12, [params.ipca12m]);
  const igpmMensal = useMemo(() => (params.igpm12m || 0) / 12, [params.igpm12m]);
  const inccMensal = useMemo(() => (params.incc12m || 0) / 12, [params.incc12m]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        "code,created_at,lead_nome,lead_telefone,segmento,grupo,credito,parcela_contemplacao,novo_credito,parcela_escolhida,novo_prazo,parcela_ate_1_ou_2,parcela_demais,lance_proprio_valor,adm_tax_pct,fr_tax_pct,lance_ofertado_pct,prazo_venda"
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

  /* ---------- PDF: Proposta Direcionada (sem alterações) ---------- */
  function firstName(full?: string | null) {
    const s = (full || "").trim();
    if (!s) return "Cliente";
    return s.split(/\s+/)[0];
  }
  function gerarPDFDirecionada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const nome = firstName(sim.lead_nome);
    addHeaderBand(doc, `Plano estratégico e personalizado para ${nome}`);
    addWatermark(doc);
    addFooter(doc);

    doc.addPage();
    addHeaderBand(doc, "Proposta Direcionada");
    addWatermark(doc);

    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    const introY = 140;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${nome}`, marginX, introY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    if (sim.grupo) {
      doc.text(`Número do Grupo: ${sim.grupo}`, marginX, introY + 18);
    }
    const frase =
      "Essa proposta foi desenhada para quem busca um crédito alto com inteligência financeira, seja para compra de um veículo, ampliação patrimonial ou alavancagem de investimentos, com máxima eficiência.";
    doc.text(frase, marginX, introY + (sim.grupo ? 36 : 18), {
      maxWidth: pageW - marginX * 2,
    });

    const C = sim.credito ?? 0;
    const adm = sim.adm_tax_pct;
    const fr = sim.fr_tax_pct;
    const hasAF = typeof adm === "number" && typeof fr === "number";
    const valorCategoria = hasAF ? C * (1 + (adm as number) + (fr as number)) : null;
    const totalEncargos = hasAF ? C * ((adm as number) + (fr as number)) : null;
    const prazo = sim.novo_prazo ?? 0;
    const taxaTotalMensalizada =
      hasAF && prazo > 0 ? (((adm as number) + (fr as number)) / prazo) : null;

    (doc as any).autoTable({
      startY: 220,
      head: [["Especificações da Proposta", ""]],
      body: [
        ["Crédito Total", brMoney(C)],
        ["Prazo", prazo ? `${prazo} meses` : "—"],
        ["Taxa de adm total", typeof adm === "number" ? formatPercentFraction(adm) : "—"],
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

    const y1 = (doc as any).lastAutoTable?.finalY ?? 290;
    (doc as any).autoTable({
      startY: y1 + 18,
      head: [["Simulação de Parcelas", "Valor", "Observações"]],
      body: [
        ["Parcela 1", brMoney(sim.parcela_ate_1_ou_2), "1ª Parcela em até 3x sem juros no cartão"],
        ["Demais", brMoney(sim.parcela_demais), "Até a contemplação"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    const y3 = (doc as any).lastAutoTable?.finalY ?? y1 + 18;
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;
    const lanceOfertadoPct =
      sim.lance_ofertado_pct ?? (C > 0 ? (embutidoValor + lanceProprioValor) / C : 0);
    const lanceOfertadoValor = (C * (lanceOfertadoPct || 0)) || (embutidoValor + lanceProprioValor);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(
      `Estratégia de Contemplação com lance de ${lanceOfertadoPct ? formatPercentFraction(lanceOfertadoPct) : "—"}`,
      marginX,
      y3 + 28
    );

    (doc as any).autoTable({
      startY: y3 + 46,
      head: [["Estratégia do Consórcio", "Valor"]],
      body: [
        ["Lance Pago (Recursos Próprios)", brMoney(Math.max(0, lanceOfertadoValor - embutidoValor))],
        ["Lance Embutido", brMoney(embutidoValor)],
        ["Parcela após o lance", brMoney(sim.parcela_escolhida)],
        ["Prazo após o lance", sim.novo_prazo ? `${sim.novo_prazo} meses` : "—"],
        ["Crédito Recebido", brMoney(sim.novo_credito)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    addFooter(doc);
    doc.save(`Proposta_Direcionada_${sim.code}.pdf`);
  }

  /* ---------- Helpers do gráfico horizontal ---------- */
  function drawHBar(
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    value: number,
    totalRef: number,
    fillRGB: [number, number, number],
    label: string
  ) {
    const frac = totalRef > 0 ? Math.max(0, Math.min(1, value / totalRef)) : 0;
    const bw = w * frac;

    // base
    doc.setDrawColor(230);
    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x, y, w, h, 6, 6, "FD");

    // valor
    doc.setFillColor(...fillRGB);
    doc.roundedRect(x, y, Math.max(4, bw), h, 6, 6, "F");

    const text = `${label}: ${brMoney(value)}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    const textX = x + 8;
    const textY = y + h / 2 + 3.5;

    // Se a barra for muito pequena, escreve fora à direita
    if (bw < doc.getTextWidth(text) + 16) {
      doc.setTextColor(0, 0, 0);
      doc.text(text, x + w + 8, textY);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.text(text, textX, textY);
    }
    doc.setTextColor(0, 0, 0);
  }

  function drawStackHBar(
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    values: Array<{ v: number; rgb: [number, number, number]; label: string }>,
    totalRef: number
  ) {
    // base
    doc.setDrawColor(230);
    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x, y, w, h, 6, 6, "FD");

    let off = 0;
    values.forEach(({ v, rgb, label }) => {
      const frac = totalRef > 0 ? Math.max(0, Math.min(1, v / totalRef)) : 0;
      const bw = w * frac;
      if (bw <= 0) return;

      doc.setFillColor(...rgb);
      doc.rect(x + off, y, Math.max(4, bw), h, "F");

      const text = `${label}: ${brMoney(v)}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);

      const textFits = bw >= doc.getTextWidth(text) + 12;
      const textX = textFits ? x + off + 6 : x + w + 8;
      const textY = y + h / 2 + 3.5;

      doc.setTextColor(textFits ? 255 : 0, textFits ? 255 : 0, textFits ? 255 : 0);
      doc.text(text, textX, textY);
      doc.setTextColor(0, 0, 0);

      off += bw;
    });
  }

  function drawConsultorCard(doc: jsPDF, x: number, y: number, w: number, h: number) {
    doc.setDrawColor(230);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 10, 10, "FD");

    const photoSize = 64;
    const px = x + 18;
    const py = y + (h - photoSize) / 2;
    doc.setDrawColor(220);
    doc.circle(px + photoSize / 2, py + photoSize / 2, photoSize / 2, "S");
    // (se tiver userPhoto em base64, poderíamos inserir aqui)

    const tx = px + photoSize + 16;
    const ty = y + 24;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(userName, tx, ty);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const wa = formatPhoneBR(userPhone);
    if (wa) doc.text(`WhatsApp: ${wa}`, tx, ty + 18);
  }

  function mesesHuman(n?: number | null) {
    const m = Math.max(0, n || 0);
    return m === 1 ? "1 mês" : `${m} meses`;
  }

  /* ---------- PDF: Venda Contemplada (atualizado) ---------- */
  function gerarPDFVendaContemplada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const nome = firstName(sim.lead_nome);

    // CAPA
    addHeaderBand(doc, `Plano de Investimento especialmente estudado para ${nome}`);
    addWatermark(doc);
    drawConsultorCard(doc, 40, 150, doc.internal.pageSize.getWidth() - 80, 100);
    addFooter(doc);

    // PÁGINA DA PROPOSTA
    doc.addPage();
    addHeaderBand(doc, "Venda Contemplada");
    addWatermark(doc);

    const w = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 140;

    // Texto topo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      "Ideal para investidores que desejam maximizar ganhos em cotas contempladas, unindo segurança, liquidez e procura consistente.",
      margin,
      y,
      { maxWidth: w - margin * 2 }
    );
    y += 24;

    // ===== Proposta de Contratação (sem 'Forma de Contratação') =====
    const mesesCont = sim.parcela_contemplacao ?? 0;

    // Total investido até a contemplação: 1 inicial + (k-1) demais + lance próprio
    const totalAteCont =
      (sim.parcela_ate_1_ou_2 ?? 0) +
      Math.max(0, mesesCont - 1) * (sim.parcela_demais ?? 0);
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;
    const totalInvestido = totalAteCont + lanceProprioValor;

    (doc as any).autoTable({
      startY: y + 6,
      head: [["Proposta de Contratação", ""]],
      body: [
        ["Crédito contratado", brMoney(sim.credito)],
        ["Segmento", normalizeSegment(sim.segmento)],
        ["Parcela(s) iniciais", brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais parcelas até a contemplação", brMoney(sim.parcela_demais)],
        ["Prazo", sim.prazo_venda ? `${sim.prazo_venda} meses` : "—"], // 👈 prazo_venda
        [
          "Lance",
          (() => {
            const C = sim.credito ?? 0;
            const pctOfer =
              typeof sim.lance_ofertado_pct === "number"
                ? ` ${formatPercentFraction(sim.lance_ofertado_pct)}`
                : "";
            const embPct = C > 0 ? formatPercentFraction(embutidoValor / C) : "—";
            return `Ofertado:${pctOfer} | ${brMoney((sim.lance_ofertado_pct || 0) * C)}  •  Embutido: ${embPct} | ${brMoney(
              embutidoValor
            )}  •  Próprio: ${brMoney(lanceProprioValor)}`;
          })(),
        ],
        ["Mês da Contemplação", mesesHuman(mesesCont)],
        ["Total Investido (R$)", brMoney(totalInvestido)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: margin, right: margin },
    });

    // ===== Projeção na Venda =====
    const yB2 = (doc as any).lastAutoTable?.finalY ?? y + 6;

    const creditoLiberado = Math.max(0, sim.novo_credito ?? 0);
    const ganhoPct = params.reforco_pct || 0;

    // >>> Conforme solicitado: Valor da Venda = Crédito Liberado * Ganho da Venda (%)
    const valorVenda = creditoLiberado * ganhoPct;

    const lucroLiquido = Math.max(0, valorVenda - totalInvestido);

    const roi = totalInvestido > 0 ? lucroLiquido / totalInvestido : 0;
    const rentMes =
      mesesCont > 0 ? Math.pow(1 + roi, 1 / mesesCont) - 1 : 0;
    const pctCDI = cdiMensal > 0 ? (rentMes / cdiMensal) * 100 : 0;

    (doc as any).autoTable({
      startY: yB2 + 18,
      head: [["Projeção na Venda", ""]],
      body: [
        ["Crédito Liberado", brMoney(creditoLiberado)],
        ["Ganho na Venda (%)", formatPercentFraction(ganhoPct)],
        ["Valor da Venda", brMoney(valorVenda)],
        ["Total Investido", brMoney(totalInvestido)],
        ["Lucro Líquido", brMoney(lucroLiquido)],
        ["ROI", formatPercentFraction(roi)],
        ["Rentabilidade ao mês", formatPercentFraction(rentMes)],
        ["% do CDI (mês)", `${pctCDI.toFixed(0)}%`],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: margin, right: margin },
    });

    // ===== Gráfico barras horizontais =====
    const yChart = ((doc as any).lastAutoTable?.finalY ?? yB2) + 26;
    const chartX = margin;
    const chartW = w - margin * 2 - 120; // deixa espaço p/ labels longos
    const barH = 22;
    const gap = 18;

    const refTotal = Math.max(valorVenda, totalInvestido + Math.max(lucroLiquido, 0), 1);

    // Barra 1: Venda
    drawHBar(doc, chartX, yChart, chartW, barH, valorVenda, refTotal, [234, 118, 35], "Venda");

    // Barra 2: Investido + Lucro (empilhado)
    drawStackHBar(
      doc,
      chartX,
      yChart + barH + gap,
      chartW,
      barH,
      [
        { v: totalInvestido, rgb: [30, 41, 63], label: "Investido" },
        { v: Math.max(lucroLiquido, 0), rgb: [161, 28, 39], label: "Lucro Líquido" },
      ],
      refTotal
    );

    // ===== Indicadores =====
    const yB3 = yChart + (barH + gap) * 2 + 16;

    (doc as any).autoTable({
      startY: yB3,
      head: [["INDICADORES ECONÔMICOS", "Valor"]],
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
      margin: { left: margin, right: margin },
    });

    const yComp = (doc as any).lastAutoTable?.finalY ?? yB3;
    (doc as any).autoTable({
      startY: yComp + 12,
      head: [["COMPARATIVO", "Remuneração", "% de IR"]],
      body: [
        ["Liquidez diária", "85% a 95% do CDI", "22,50%"],
        ["Até 180 dias", "90% a 105% do CDI", "22,50%"],
        ["De 181 a 360 dias", "95% a 110% do CDI", "20,00%"],
        ["de 361 a 720 dias", "100% a 115% do CDI", "17,50%"],
        ["Acima de 720 dias", "105% a 120% do CDI", "15,00%"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: margin, right: margin },
    });

    // Disclaimer final
    const yEnd = (doc as any).lastAutoTable?.finalY ?? yComp + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.",
      margin,
      yEnd + 18,
      { maxWidth: w - margin * 2 }
    );

    addFooter(doc);
    doc.save(`Venda_Contemplada_${sim.code}.pdf`);
  }

  /* ---------- Multiprodutos: roteamento ---------- */
  async function gerarPDFInvest(modelKey: ModelKey, sims: SimRow[]) {
    if (sims.length === 0) {
      alert("Selecione pelo menos uma simulação.");
      return;
    }
    if (modelKey === "direcionada") {
      sims.forEach((s) => gerarPDFDirecionada(s));
      return;
    }
    if (modelKey === "venda_contemplada") {
      sims.forEach((s) => gerarPDFVendaContemplada(s));
      return;
    }

    const titleMap: Record<ModelKey, string> = {
      direcionada: "Proposta Direcionada",
      venda_contemplada: "Venda Contemplada",
      alav_fin: "Alavancagem Financeira",
      alav_patr: "Alavancagem Patrimonial",
      previdencia: "Previdência Aplicada",
      credito_correcao: "Crédito com Correção",
      extrato: "Extrato da Proposta",
    };
    const title = titleMap[modelKey];
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFillColor(30, 41, 63);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 180, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 120);
    addWatermark(doc);
    addFooter(doc);

    sims.forEach((r, idx) => {
      if (idx > 0) doc.addPage();
      addHeaderBand(doc, title);
      addWatermark(doc);

      (doc as any).autoTable({
        startY: 140,
        head: [["Campo", "Valor"]],
        body: [
          ["Nome", `${firstName(r.lead_nome)}`],
          ["Segmento", normalizeSegment(r.segmento)],
          ["Grupo", r.grupo || "—"],
          ["Crédito líquido (após)", brMoney(r.novo_credito)],
          ["Parcela 1 (até contemplação)", brMoney(r.parcela_ate_1_ou_2)],
          ["Parcela escolhida (após)", brMoney(r.parcela_escolhida)],
          ["Prazo restante (meses)", String(r.novo_prazo ?? 0)],
          ["Lance próprio", brMoney(r.lance_proprio_valor)],
        ],
        styles: { font: "helvetica", fontSize: 10, halign: "left" },
        headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
        alternateRowStyles: { fillColor: brand.grayRow },
        theme: "grid",
        margin: { left: 40, right: 40 },
      });

      addFooter(doc);
    });

    doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
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
                  placeholder="ex.: 15% ou 0,15"
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
                  placeholder="ex.: 14,9% ou 0,149"
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
                  placeholder="ex.: 5,35% ou 0,0535"
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
                  placeholder="ex.: 3% ou 0,03"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, igpm12m: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  IGP-M mês (média): <strong>{formatPercentFraction(igpmMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>INCC 12 Meses</Label>
                <Input
                  defaultValue={formatPercentFraction(params.incc12m)}
                  placeholder="ex.: 5% ou 0,05"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, incc12m: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  INCC mês (média): <strong>{formatPercentFraction(inccMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>Juros Financiamento — Crédito Veículo (ao mês)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.fin_veic_mensal)}
                  placeholder="ex.: 2,1% ou 0,021 a.m."
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
                  placeholder="ex.: 11% ou 0,11 a.a."
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, fin_imob_anual: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Taxa ao mês (composta): <strong>{formatPercentFraction(finImobMensal)}</strong>
                </div>
              </div>

              <div>
                <Label>Aluguel Mensal (%)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.aluguel_mensal_pct)}
                  placeholder="ex.: 0,5% ou 0,005"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, aluguel_mensal_pct: v }));
                  }}
                />
              </div>

              <div>
                <Label>Reforço (Alav. Financeira)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.reforco_pct)}
                  placeholder="ex.: 5% ou 0,05"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, reforco_pct: v }));
                  }}
                />
              </div>

              <div>
                <Label>Crescimento Patrimonial (Alav. Patrimonial)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.cresc_patr_pct)}
                  placeholder="ex.: 6% ou 0,06"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, cresc_patr_pct: v }));
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
