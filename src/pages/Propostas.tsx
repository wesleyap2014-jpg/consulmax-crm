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
  // retorna fração: "7%" -> 0.07, "7" -> 0.07, "0,07" -> 0.07, "0.07" -> 0.07
  const s = (raw || "").toString().trim().replace(/\s+/g, "");
  if (!s) return 0;
  const hasPercent = s.endsWith("%");
  const cleaned = s.replace("%", "").replace(".", "").replace(",", ".");
  const n = Number(cleaned);
  if (isNaN(n)) return 0;
  if (hasPercent) return n / 100;
  // se o usuário digitou 7 queremos 7% (=0.07); se digitou 0.07 queremos 0.07
  return n > 1 ? n / 100 : n;
}
function formatPercentFraction(frac: number, withSymbol = true): string {
  const pct = (frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return withSymbol ? `${pct}%` : pct;
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

  // telefone do usuário (oportunidade)
  const [userPhone, setUserPhone] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserPhone((data?.phone || "").toString());
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
  function addHeaderSimple(doc: jsPDF) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Proposta Embracon - Consulmax", 40, 50);
    doc.setDrawColor(161, 28, 39);
    doc.setLineWidth(2);
    doc.line(40, 60, doc.internal.pageSize.getWidth() - 40, 60);
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
    const areaH = 90;
    const yTop = h - areaH - 40;

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(1);
    doc.line(margin, yTop, w - margin, yTop);

    if (logoDataUrl) {
      const props = (doc as any).getImageProperties(logoDataUrl);
      const maxW = 140;
      const maxH = 40;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const lw = props.width * ratio;
      const lh = props.height * ratio;
      const ly = yTop + (areaH - lh) / 2;
      doc.addImage(logoDataUrl, "PNG", margin, ly, lw, lh);
    }

    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(10);
    const lines = [
      "Consulmax Consórcios e Investimentos",
      "CNPJ: 57.942.043/0001-03",
      "Av. Menezes Filho, 3174, Casa Preta, Ji-Paraná/RO",
      "Cel/Whats: (69) 9 9302-9380",
      "consulmaxconsorcios.com.br",
    ];
    let y = yTop + 26;
    lines.forEach((t) => {
      doc.text(t, w - margin, y, { align: "right" as any });
      y += 14;
    });
  }

  /* ---------- Parâmetros (humanizados) ---------- */
  type InvestParams = {
    percCorrecaoAnual: number; // Crédito c/ Correção
    percRendimentoPrevidencia: number; // Previdência
    percAlavancagemFinanceira: number; // Alav. Financeira
    percAlavancagemPatrimonial: number; // Alav. Patrimonial
  };
  const DEFAULT_PARAMS: InvestParams = {
    percCorrecaoAnual: 0.07,
    percRendimentoPrevidencia: 0.1,
    percAlavancagemFinanceira: 0.05,
    percAlavancagemPatrimonial: 0.06,
  };
  const [params, setParams] = useState<InvestParams>(() => {
    try {
      const raw = localStorage.getItem("investParams");
      if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);

  function saveParams(p: InvestParams) {
    setParams(p);
    try {
      localStorage.setItem("investParams", JSON.stringify(p));
    } catch {}
    setParamOpen(false);
  }

  /* ---------- PDF (Resultados simples) ---------- */
  async function handlePDF(r: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    addHeaderSimple(doc);
    addWatermark(doc);

    (doc as any).autoTable({
      startY: 80,
      head: [["Campo", "Valor"]],
      body: [
        ["Código", String(r.code)],
        ["Criada em", new Date(r.created_at).toLocaleString("pt-BR")],
        ["Lead", `${r.lead_nome || "—"}  ${r.lead_telefone || ""}`.trim()],
        ["Segmento", normalizeSegment(r.segmento)],
        ["Grupo", r.grupo || "—"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    const after1 = (doc as any).lastAutoTable?.finalY ?? 140;
    (doc as any).autoTable({
      startY: after1 + 20,
      head: [["Detalhe", "Valor"]],
      body: [
        ["Crédito contratado", brMoney(r.credito)],
        ["Parcela 1", brMoney(r.parcela_ate_1_ou_2)],
        ["Demais até contemplação", brMoney(r.parcela_demais)],
        ["Lance próprio", brMoney(r.lance_proprio_valor)],
        ["Crédito líquido (após)", brMoney(r.novo_credito)],
        ["Parcela escolhida (após)", brMoney(r.parcela_escolhida)],
        ["Novo prazo (meses)", String(r.novo_prazo ?? 0)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    addFooter(doc);
    doc.save(`Proposta_${r.code}.pdf`);
  }

  /* ---------- Propostas de Investimento ---------- */
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
        "code,created_at,lead_nome,lead_telefone,segmento,grupo,credito,parcela_contemplacao,novo_credito,parcela_escolhida,novo_prazo,parcela_ate_1_ou_2,parcela_demais,lance_proprio_valor"
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

  // Geração de PDF com parâmetros por modelo
  async function gerarPDFInvest(modelKey: ModelKey, sims: SimRow[]) {
    if (sims.length === 0) {
      alert("Selecione pelo menos uma simulação.");
      return;
    }
    const titleMap: Record<ModelKey, string> = {
      direcionada: "Proposta Direcionada",
      alav_fin: "Alavancagem Financeira",
      alav_patr: "Alavancagem Patrimonial",
      previdencia: "Previdência Aplicada",
      credito_correcao: "Crédito com Correção",
      extrato: "Extrato da Proposta",
    };
    const title = titleMap[modelKey];

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // CAPA com faixa + marca d'água
    doc.setFillColor(brand.primary);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 180, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 120);
    addWatermark(doc);
    addFooter(doc);

    sims.forEach((r) => {
      doc.addPage();
      addHeaderSimple(doc);
      addWatermark(doc);

      const segNorm = normalizeSegment(r.segmento);

      // 1) Tabela base
      (doc as any).autoTable({
        startY: 85,
        head: [["Campo", "Valor"]],
        body: [
          ["Lead", `${r.lead_nome || "—"}  ${r.lead_telefone || ""}`.trim()],
          ["Segmento", segNorm],
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

      // 2) Parâmetros do modelo
      const yBase = (doc as any).lastAutoTable?.finalY ?? 300;
      const paramRows: string[][] = [];
      switch (modelKey) {
        case "direcionada":
          paramRows.push(["Parâmetros", "—"]);
          break;
        case "alav_fin":
          paramRows.push([
            "Reforço (alav. financeira)",
            formatPercentFraction(params.percAlavancagemFinanceira),
          ]);
          break;
        case "alav_patr":
          paramRows.push([
            "Crescimento patrimonial",
            formatPercentFraction(params.percAlavancagemPatrimonial),
          ]);
          break;
        case "previdencia":
          paramRows.push([
            "Rendimento anual (previdência)",
            formatPercentFraction(params.percRendimentoPrevidencia),
          ]);
          break;
        case "credito_correcao":
          paramRows.push([
            "Correção anual do crédito",
            formatPercentFraction(params.percCorrecaoAnual),
          ]);
          break;
        case "extrato":
          paramRows.push(["Parâmetros", "—"]);
          break;
      }
      (doc as any).autoTable({
        startY: yBase + 18,
        head: [["Configuração (parâmetros)", "Valor"]],
        body: paramRows.length ? paramRows : [["—", "—"]],
        styles: { font: "helvetica", fontSize: 10, halign: "left" },
        headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
        theme: "grid",
        margin: { left: 40, right: 40 },
      });

      // 3) Observação do modelo
      const yObs = (doc as any).lastAutoTable?.finalY ?? yBase + 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      const msg =
        modelKey === "direcionada"
          ? "Proposta voltada à aquisição direta do bem desejado."
          : modelKey === "alav_fin"
          ? `Estratégia para acelerar a conquista do bem com reforço de ${formatPercentFraction(
              params.percAlavancagemFinanceira
            )} aplicado nos cálculos.`
          : modelKey === "alav_patr"
          ? `Projeção de fortalecimento patrimonial com taxa de ${formatPercentFraction(
              params.percAlavancagemPatrimonial
            )}.`
          : modelKey === "previdencia"
          ? `Planejamento de longo prazo considerando rendimento anual de ${formatPercentFraction(
              params.percRendimentoPrevidencia
            )}.`
          : modelKey === "credito_correcao"
          ? `Hipótese de correção do crédito de ${formatPercentFraction(
              params.percCorrecaoAnual
            )} ao ano.`
          : "Resumo consolidado dos principais números desta proposta.";
      doc.text(msg, 40, yObs + 24, {
        maxWidth: doc.internal.pageSize.getWidth() - 80,
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
                        onClick={() => handlePDF(r)}
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
            {/* Parâmetros (humanizado) */}
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

            {/* Botão sem "+" para não cortar o texto */}
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

      {/* MODAL: Parâmetros (humanizado) */}
      {paramOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Parâmetros das propostas</div>
              <button className="p-1 rounded hover:bg-muted" onClick={() => setParamOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <Label>Correção anual do crédito (Crédito c/ Correção)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.percCorrecaoAnual)}
                  placeholder="ex.: 7% ou 0,07"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, percCorrecaoAnual: v }));
                  }}
                />
              </div>

              <div>
                <Label>Rendimento anual (Previdência)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.percRendimentoPrevidencia)}
                  placeholder="ex.: 10% ou 0,10"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, percRendimentoPrevidencia: v }));
                  }}
                />
              </div>

              <div>
                <Label>Reforço (Alav. Financeira)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.percAlavancagemFinanceira)}
                  placeholder="ex.: 5% ou 0,05"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, percAlavancagemFinanceira: v }));
                  }}
                />
              </div>

              <div>
                <Label>Crescimento patrimonial (Alav. Patrimonial)</Label>
                <Input
                  defaultValue={formatPercentFraction(params.percAlavancagemPatrimonial)}
                  placeholder="ex.: 6% ou 0,06"
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, percAlavancagemPatrimonial: v }));
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
              <Button
                className="rounded-2xl"
                onClick={() => saveParams(params)}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
