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

  // Schema: frações (0–1)
  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;
  lance_ofertado_pct?: number | null;

  // adicionamos para alguns cálculos/labels
  prazo_venda?: number | null;
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
  | "venda_contemplada"
  | "extrato";

/* ======================= Helpers ========================= */
const brand = {
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  navy: "#162643",
  red: "#9E1B22",
  grayBar: "#6E7A87",
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

/* ============ Percent helpers ============== */
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

/* ============== Finance helpers ============== */
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
  const [userName, setUserName] = useState<string>("Consultor");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;

      // 1) tenta public.user
      let profile: any = null;
      try {
        const { data } = await supabase
          .from("user")
          .select("nome, phone, avatar_url, display_name, full_name, name")
          .eq("auth_user_id", uid)
          .maybeSingle();
        profile = data;
      } catch {
        // tabela pode ser "users" no seu projeto
      }

      // 2) fallback para users
      if (!profile) {
        const { data } = await supabase
          .from("users")
          .select("phone, name, full_name, display_name, avatar_url")
          .eq("auth_user_id", uid)
          .maybeSingle();
        profile = data;
      }

      const phone = (profile?.phone || "").toString();
      const nm =
        (profile?.display_name ||
          profile?.nome ||
          profile?.name ||
          profile?.full_name ||
          "").toString().trim();

      setUserPhone(phone);
      if (nm) setUserName(nm);
      setUserAvatar(profile?.avatar_url || null);
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

    const pLabel =
      (r.parcela_contemplacao ?? 0) >= 2 ? "Parcela 1 e 2" : "Parcela 1";

    const text = `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${segNorm}

${emoji} Crédito: ${brMoney(r.novo_credito)}
💰 ${pLabel}: ${brMoney(r.parcela_ate_1_ou_2)} (Em até 3x no cartão)
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
    const pLabel =
      (r.parcela_contemplacao ?? 0) >= 2 ? "Parcelas 1 e 2" : "Parcela 1";

    const text = `Resumo da Proposta — ${segNorm}

Crédito contratado: ${brMoney(r.credito)}
${pLabel} (até contemplação): ${brMoney(r.parcela_ate_1_ou_2)}
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

  /* ---------- PDF helpers (header, card, watermark, footer) ---------- */
  function addHeaderBand(doc: jsPDF, title: string) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(22, 38, 67); // navy
    doc.rect(0, 0, W, 140, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor("#FFFFFF");
    doc.text(title, 40, 92);
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
      const maxW = 110;
      const maxH = 30;
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

  function drawSellerCard(doc: jsPDF, yTop = 150) {
    const W = doc.internal.pageSize.getWidth();
    const cardW = Math.min(560, W - 80);
    const cardH = 110;
    const x = (W - cardW) / 2;
    const r = 16;

    // card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(230, 230, 230);
    doc.roundedRect(x, yTop, cardW, cardH, r, r, "FD");

    // avatar
    const avatarSize = 56;
    const ax = x + 22;
    const ay = yTop + (cardH - avatarSize) / 2;
    if (userAvatar) {
      // imagem do usuário
      (doc as any).addImage(userAvatar, "JPEG", ax, ay, avatarSize, avatarSize, undefined, "FAST");
    } else if (logoDataUrl) {
      (doc as any).addImage(logoDataUrl, "PNG", ax, ay, avatarSize, avatarSize, undefined, "FAST");
    } else {
      doc.setFillColor(240, 240, 240);
      doc.circle(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, "F");
    }

    // textos
    const nameX = ax + avatarSize + 16;
    const line1Y = yTop + 42;
    const line2Y = line1Y + 20;
    const line3Y = line2Y + 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text(userName || "Consultor", nameX, line1Y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(70, 70, 70);
    doc.text(`Whats: ${formatPhoneBR(userPhone) || "-"}`, nameX, line2Y);

    doc.setFontSize(11);
    doc.text("Consulmax • Consultoria Especializada", nameX, line3Y);
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

    // Reforço Alav. Financeira (para 'Venda Contemplada')
    reforco_pct: number;
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
      const raw = localStorage.getItem("proposalParams.v2");
      if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);
  function saveParams(p: Params) {
    setParams(p);
    try {
      localStorage.setItem("proposalParams.v2", JSON.stringify(p));
    } catch {}
    setParamOpen(false);
  }

  // Derivados
  const cdiMensal = useMemo(() => annualToMonthlyCompound(params.cdi_anual), [params.cdi_anual]);
  const selicMensal = useMemo(() => annualToMonthlyCompound(params.selic_anual), [params.selic_anual]);
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
      .select("code,created_at,lead_nome,lead_telefone,segmento,novo_credito,parcela_escolhida,novo_prazo")
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

  /* ---------- PDF: Direcionada (preservada) ---------- */
  function firstName(full?: string | null) {
    const s = (full || "").trim();
    if (!s) return "Cliente";
    return s.split(/\s+/)[0];
  }

  function gerarPDFDirecionada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Capa
    addHeaderBand(doc, "Proposta Direcionada");
    drawSellerCard(doc, 150);
    addWatermark(doc);
    addFooter(doc);

    // Página 2
    doc.addPage();
    addHeaderBand(doc, `Plano estratégico e personalizado para ${firstName(sim.lead_nome)}`);
    addWatermark(doc);

    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Intro
    const introY = 160;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${firstName(sim.lead_nome)}`, marginX, introY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    if (sim.grupo) {
      doc.text(`Número do Grupo: ${sim.grupo}`, marginX, introY + 18);
    }
    const frase =
      "Ideal para investidores que desejam maximizar ganhos em cotas contempladas, unindo segurança, liquidez e procura consistente.";
    doc.text(frase, marginX, introY + (sim.grupo ? 36 : 18), {
      maxWidth: pageW - marginX * 2,
    });

    // Especificações
    const C = sim.credito ?? 0;
    const adm = sim.adm_tax_pct;
    const fr = sim.fr_tax_pct;
    const hasAF = typeof adm === "number" && typeof fr === "number";
    const valorCategoria = hasAF ? C * (1 + (adm as number) + (fr as number)) : null;
    const totalEncargos = hasAF ? C * ((adm as number) + (fr as number)) : null;
    const prazoRest = sim.novo_prazo ?? 0;
    const taxaTotalMensalizada =
      hasAF && prazoRest > 0 ? (((adm as number) + (fr as number)) / prazoRest) : null;

    (doc as any).autoTable({
      startY: 230,
      head: [["Especificações da Proposta", ""]],
      body: [
        ["Crédito Total", brMoney(C)],
        ["Prazo", prazoRest ? `${prazoRest} meses` : "—"],
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

    // Simulação de Parcelas
    const y1 = (doc as any).lastAutoTable?.finalY ?? 300;
    const pLabel =
      (sim.parcela_contemplacao ?? 0) >= 2 ? "Parcelas 1 e 2" : "Parcela 1";

    (doc as any).autoTable({
      startY: y1 + 18,
      head: [["Simulação de Parcelas", "Valor", "Observações"]],
      body: [
        [pLabel, brMoney(sim.parcela_ate_1_ou_2), "1ª parcela em até 3x sem juros no cartão"],
        ["Demais", brMoney(sim.parcela_demais), "Até a contemplação"],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Estratégia (custo final + comparação)
    const y2 = (doc as any).lastAutoTable?.finalY ?? y1 + 18;
    const embutidoValor = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProprioValor = sim.lance_proprio_valor ?? 0;
    const lanceOfertadoPct =
      sim.lance_ofertado_pct ?? (C > 0 ? (embutidoValor + lanceProprioValor) / C : 0);
    const lanceOfertadoValor = C * (lanceOfertadoPct || 0);
    const custoFinalCons = hasAF && valorCategoria !== null ? (valorCategoria - embutidoValor) : null;

    (doc as any).autoTable({
      startY: y2 + 24,
      head: [["Estratégia do Consórcio", "Valor"]],
      body: [
        ["Lance Pago (Recursos Próprios)", brMoney(Math.max(0, lanceOfertadoValor - embutidoValor))],
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

    // Página 3 — Indicadores + Comparativo
    doc.addPage();
    addHeaderBand(doc, "Indicadores e Comparativo");
    addWatermark(doc);

    const yInd = 160;
    (doc as any).autoTable({
      startY: yInd,
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
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    // Comparativo após indicadores
    const yCompStart = (doc as any).lastAutoTable?.finalY ?? yInd + 140;

    const isImob = normalizeSegment(sim.segmento).toLowerCase().includes("imó");
    const rFinMensal = isImob ? finImobMensal : params.fin_veic_mensal;
    const pvFin = Math.max(0, C - embutidoValor);
    const nFin = sim.novo_prazo || 60;
    const pmtFin = pmtMonthly(rFinMensal, nFin, pvFin);
    const custoFinalFin = pmtFin * nFin;

    (doc as any).autoTable({
      startY: yCompStart + 18,
      head: [["Comparativo", "Consórcio", "Financiamento"]],
      body: [
        ["Taxa mensal (aprox.)",
          (hasAF && sim.novo_prazo) ? formatPercentFraction(((adm || 0) + (fr || 0)) / (sim.novo_prazo || 1)) : "—",
          formatPercentFraction(rFinMensal)
        ],
        ["Prazo considerado", sim.novo_prazo ? `${sim.novo_prazo} meses` : "—", `${nFin} meses`],
        ["Parcela (aprox.)", brMoney(sim.parcela_escolhida), brMoney(pmtFin)],
        ["Crédito base", brMoney(C), brMoney(pvFin)],
        ["Custo Final (desembolso total)",
          custoFinalCons !== null ? brMoney(custoFinalCons) : "—",
          brMoney(custoFinalFin),
        ],
        ["Economia ao optar pelo Consórcio",
          (custoFinalCons !== null) ? brMoney(custoFinalFin - custoFinalCons) : "—",
          "—",
        ],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    // Disclaimer
    const yDisc = (doc as any).lastAutoTable?.finalY ?? yCompStart + 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.",
      40,
      yDisc + 24,
      { maxWidth: pageW - 80 }
    );

    addFooter(doc);
    doc.save(`Proposta_Direcionada_${sim.code}.pdf`);
  }

  /* ---------- PDF: Venda Contemplada ---------- */
  function drawRoundedBar(
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    text?: string,
    textColor: string = "#FFFFFF"
  ) {
    const r = Math.min(h / 2, 16);
    doc.setFillColor(color);
    doc.setDrawColor(color);
    doc.roundedRect(x, y, w, h, r, r, "F");

    if (text) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(textColor);
      const textW = (doc as any).getTextWidth(text);
      const tx = x + (w - textW) / 2;
      const ty = y + h / 2 + 4;
      doc.text(text, Math.max(tx, x + 10), ty);
    }
  }

  function gerarPDFVendaContemplada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();

    // Capa
    addHeaderBand(doc, "Venda Contemplada");
    drawSellerCard(doc, 150);
    addWatermark(doc);
    addFooter(doc);

    // Página 2 — Proposta + Projeção + Demonstração Gráfica
    doc.addPage();
    addHeaderBand(doc, `Plano de Investimento especialmente estudado para ${firstName(sim.lead_nome)}`);
    addWatermark(doc);

    const marginX = 40;
    const textTop = 160;

    // Texto topo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(
      "Ideal para investidores que desejam maximizar ganhos em cotas contempladas, unindo segurança, liquidez e procura consistente.",
      marginX,
      textTop,
      { maxWidth: W - marginX * 2 }
    );

    // ---- Proposta de Contratação
    const pLabel =
      (sim.parcela_contemplacao ?? 0) >= 2 ? "Parcelas 1 e 2" : "Parcela 1";
    const prazoContr = sim.prazo_venda ?? sim.novo_prazo ?? 0;

    const contratado = sim.credito ?? 0;
    const embutido = Math.max(0, (sim.credito ?? 0) - (sim.novo_credito ?? 0));
    const lanceProp = sim.lance_proprio_valor ?? 0;

    const meses = Math.max(0, sim.parcela_contemplacao ?? 0);
    const k = Math.min(2, meses);
    const totalMensal =
      (sim.parcela_ate_1_ou_2 ?? 0) * k +
      (sim.parcela_demais ?? 0) * Math.max(0, meses - k);

    const totalInvestido = totalMensal + (lanceProp || 0);

    (doc as any).autoTable({
      startY: textTop + 24,
      head: [["Proposta de Contratação", "Valor"]],
      body: [
        ["Crédito contratado", brMoney(contratado)],
        ["Segmento", normalizeSegment(sim.segmento)],
        [pLabel, brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais parcelas até a contemplação", brMoney(sim.parcela_demais)],
        // Forma de contratação — removida a pedido
        ["Prazo", prazoContr ? `${prazoContr} meses` : "—"],
        [
          "Lance: % | R$ | Lance Embutido: % | R$ | Lance Próprio: R$",
          `${formatPercentFraction(sim.lance_ofertado_pct || 0)} | ${brMoney(
            (contratado || 0) * (sim.lance_ofertado_pct || 0)
          )} | ${formatPercentFraction(contratado ? embutido / contratado : 0)} | ${brMoney(
            embutido
          )} | ${brMoney(lanceProp)}`,
        ],
        ["Mês da Contemplação", meses ? `${meses}` : "—"],
        ["Total Investido (R$)", brMoney(totalInvestido)],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.primary, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ---- Projeção na Venda
    const yProj = (doc as any).lastAutoTable?.finalY ?? textTop + 24;
    const creditoLiberado = Math.max(0, contratado - embutido);
    const ganhoPct = params.reforco_pct || 0;
    const valorVenda = creditoLiberado * ganhoPct;
    const lucroLiquido = valorVenda - totalInvestido;
    const roi = totalInvestido > 0 ? lucroLiquido / totalInvestido : 0;
    const rentabMes = meses > 0 ? Math.pow(1 + roi, 1 / meses) - 1 : 0;
    const pctDoCDI = cdiMensal > 0 ? rentabMes / cdiMensal : 0;

    (doc as any).autoTable({
      startY: yProj + 18,
      head: [["Projeção na Venda", "Valor"]],
      body: [
        ["Crédito Liberado", brMoney(creditoLiberado)],
        ["Ganho na Venda (%)", formatPercentFraction(ganhoPct)],
        ["Valor da Venda", brMoney(valorVenda)],
        ["Total Investido", brMoney(totalInvestido)],
        ["Lucro Líquido", brMoney(lucroLiquido)],
        ["ROI", formatPercentFraction(roi)],
        ["Rentabilidade ao Mês", formatPercentFraction(rentabMes)],
        ["% do CDI", `${(pctDoCDI * 100).toFixed(2)}%`],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // ---- Demonstração Gráfica
    const yGraphBlock = (doc as any).lastAutoTable?.finalY ?? yProj + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Demonstração Gráfica", marginX, yGraphBlock + 26);

    const gY0 = yGraphBlock + 40;
    const gWMax = W - marginX * 2;
    const gH = 26;
    const space = 24;

    // escala comum
    const baseMax = Math.max(valorVenda, totalInvestido + Math.max(0, lucroLiquido));
    const scale = baseMax > 0 ? (gWMax * 0.9) / baseMax : 1; // 90% p/ centralizar

    // centralização
    const vw = Math.max(40, valorVenda * scale);
    const tw = Math.max(40, (totalInvestido + Math.max(0, lucroLiquido)) * scale);
    const gx = marginX + (gWMax - Math.max(vw, tw)) / 2;

    // barra 1 — Venda (cinza arredondada)
    drawRoundedBar(
      doc,
      gx,
      gY0,
      vw,
      gH,
      brand.grayBar,
      `Venda: ${brMoney(valorVenda)}`
    );

    // barra 2 — Investido + Lucro (iguais arredondamentos)
    const invW = Math.max(0, totalInvestido) * scale;
    const lucW = Math.max(0, lucroLiquido) * scale;

    const y2 = gY0 + gH + space;
    // Investido (navy)
    drawRoundedBar(
      doc,
      gx,
      y2,
      Math.max(40, invW),
      gH,
      brand.navy,
      `Investido: ${brMoney(totalInvestido)}`
    );
    // Lucro (red) colado na direita da barra investida
    if (lucW > 0) {
      drawRoundedBar(
        doc,
        gx + Math.max(40, invW),
        y2,
        Math.max(30, lucW),
        gH,
        brand.red,
        `Lucro Líquido: ${brMoney(lucroLiquido)}`
      );
    }

    // Página 3 — Indicadores + Comparativo + Disclaimer
    doc.addPage();
    addHeaderBand(doc, "Indicadores Econômicos");
    addWatermark(doc);

    (doc as any).autoTable({
      startY: 160,
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
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    const yAfterInd = (doc as any).lastAutoTable?.finalY ?? 260;

    // Comparativo Consórcio x Financiamento (mesma base da Direcionada)
    const adm = sim.adm_tax_pct || 0;
    const fr = sim.fr_tax_pct || 0;
    const hasAF = typeof sim.adm_tax_pct === "number" && typeof sim.fr_tax_pct === "number";
    const valorCategoria = hasAF ? (contratado * (1 + adm + fr)) : null;
    const custoFinalCons = valorCategoria !== null ? (valorCategoria - embutido) : null;

    const isImob = normalizeSegment(sim.segmento).toLowerCase().includes("imó");
    const rFinMensal = isImob ? finImobMensal : params.fin_veic_mensal;
    const pvFin = Math.max(0, contratado - embutido);
    const nFin = sim.novo_prazo || 60;
    const pmtFin = pmtMonthly(rFinMensal, nFin, pvFin);
    const custoFinalFin = pmtFin * nFin;

    (doc as any).autoTable({
      startY: yAfterInd + 18,
      head: [["Comparativo", "Consórcio", "Financiamento"]],
      body: [
        ["Taxa mensal (aprox.)",
          (hasAF && prazoContr) ? formatPercentFraction((adm + fr) / (prazoContr || 1)) : "—",
          formatPercentFraction(rFinMensal)
        ],
        ["Prazo considerado", prazoContr ? `${prazoContr} meses` : "—", `${nFin} meses`],
        ["Parcela (aprox.)", brMoney(sim.parcela_escolhida), brMoney(pmtFin)],
        ["Crédito base", brMoney(contratado), brMoney(pvFin)],
        ["Custo Final (desembolso total)",
          custoFinalCons !== null ? brMoney(custoFinalCons) : "—",
          brMoney(custoFinalFin),
        ],
        ["Economia ao optar pelo Consórcio",
          (custoFinalCons !== null) ? brMoney(custoFinalFin - custoFinalCons) : "—",
          "—",
        ],
      ],
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      headStyles: { fillColor: brand.accent, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    const yDisc = (doc as any).lastAutoTable?.finalY ?? yAfterInd + 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.",
      40,
      yDisc + 24,
      { maxWidth: W - 80 }
    );

    addFooter(doc);
    doc.save(`Venda_Contemplada_${sim.code}.pdf`);
  }

  // Mantém modelos antigos com fallback simples
  async function gerarPDFInvest(modelKey: ModelKey, sims: SimRow[]) {
    if (sims.length === 0) {
      alert("Selecione pelo menos uma simulação.");
      return;
    }
    switch (modelKey) {
      case "direcionada":
        sims.forEach((s) => gerarPDFDirecionada(s));
        return;
      case "venda_contemplada":
        sims.forEach((s) => gerarPDFVendaContemplada(s));
        return;
      default:
        // Capa simples + card replicado
        const titleMap: Record<ModelKey, string> = {
          direcionada: "Proposta Direcionada",
          alav_fin: "Alavancagem Financeira",
          alav_patr: "Alavancagem Patrimonial",
          previdencia: "Previdência Aplicada",
          credito_correcao: "Crédito com Correção",
          venda_contemplada: "Venda Contemplada",
          extrato: "Extrato da Proposta",
        };
        const title = titleMap[modelKey];
        const doc = new jsPDF({ unit: "pt", format: "a4" });

        addHeaderBand(doc, title);
        drawSellerCard(doc, 150);
        addWatermark(doc);
        addFooter(doc);

        sims.forEach((r, idx) => {
          doc.addPage();
          addHeaderBand(doc, title);
          addWatermark(doc);

          (doc as any).autoTable({
            startY: 160,
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
        return;
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
                        onClick={() => gerarPDFDirecionada(r)}
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
              <option value="alav_fin">Alav. Financeira</option>
              <option value="alav_patr">Alav. Patrimonial</option>
              <option value="previdencia">Previdência</option>
              <option value="credito_correcao">Crédito c/ Correção</option>
              <option value="venda_contemplada">Venda Contemplada</option>
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
                              { k: "alav_fin", label: "Alav. Financeira" },
                              { k: "alav_patr", label: "Alav. Patrimonial" },
                              { k: "previdencia", label: "Previdência" },
                              { k: "credito_correcao", label: "Crédito c/ Correção" },
                              { k: "venda_contemplada", label: "Venda Contemplada" },
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
                <Label>SELIC Anual</Label>
                <Input
                  defaultValue={formatPercentFraction(params.selic_anual)}
                  onBlur={(e) => {
                    const v = parsePercentInput(e.target.value);
                    e.currentTarget.value = formatPercentFraction(v);
                    setParams((p) => ({ ...p, selic_anual: v }));
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  SELIC Mensal (composta): <strong>{formatPercentFraction(selicMensal)}</strong>
                </div>
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
                <Label>IPCA (12 meses)</Label>
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
                <Label>Juros Financiamento — Veículo (a.m.)</Label>
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
                  Taxa ao mês (composta): <strong>{formatPercentFraction(finImobMensal)}</strong>
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
