// src/pages/Propostas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Copy, FileText, ExternalLink, Plus, ChevronDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ============== Helpers ============== */
const brMoney = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "";

const endOfDayISO = (iso: string) => {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

const normalizeSegment = (seg?: string) => {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "Imóvel";
  if (s.includes("auto")) return "Automóvel";
  if (s.includes("moto")) return "Motocicleta";
  if (s.includes("serv")) return "Serviços";
  if (s.includes("pesad")) return "Pesados";
  return seg || "Automóvel";
};

const emojiBySegment = (seg?: string) => {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "🏠";
  if (s.includes("moto")) return "🏍️";
  if (s.includes("serv")) return "✈️";
  if (s.includes("pesad")) return "🚚";
  return "🚗";
};

const formatPhoneBR = (s?: string) => {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
};

/* ============== Tipos usados aqui ============== */
type UUID = string;

type SimRow = {
  id: UUID;
  created_at?: string;
  code?: number;

  admin_id: UUID | null;
  table_id: UUID | null;

  lead_id: UUID | null;
  lead_nome: string | null;
  lead_telefone: string | null;

  grupo: string | null;
  segmento: string;
  nome_tabela: string;

  credito: number;
  prazo_venda: number;
  forma_contratacao: string;
  seguro_prestamista: boolean;

  lance_ofertado_pct: number;
  lance_embutido_pct: number;
  parcela_contemplacao: number;

  valor_categoria: number;
  parcela_ate_1_ou_2: number;
  parcela_demais: number;

  lance_ofertado_valor: number;
  lance_embutido_valor: number;
  lance_proprio_valor: number;
  lance_percebido_pct: number;

  novo_credito: number;
  nova_parcela_sem_limite: number;
  parcela_limitante: number;
  parcela_escolhida: number;
  saldo_devedor_final: number;
  novo_prazo: number;
};

type SimTable = {
  id: UUID;
  segmento: string;
  nome_tabela: string;
  antecip_parcelas: number;
  antecip_pct: number;
  seguro_prest_pct: number;
};

type TemplateKind =
  | "direcionada"
  | "alav_fin"
  | "alav_patr"
  | "previdencia"
  | "correcao"
  | "extrato";

/* ============== Página ============== */
export default function Propostas() {
  /* ===== filtros ===== */
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<string>("");
  const [grupo, setGrupo] = useState<string>("");
  const [dStart, setDStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dEnd, setDEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  /* ===== dados ===== */
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [tablesMap, setTablesMap] = useState<Record<string, SimTable>>({});
  const [userPhone, setUserPhone] = useState<string>("");

  // Propostas de Investimento (lista salva localmente)
  const [piList, setPiList] = useState<SimRow[]>([]);
  const [piSelected, setPiSelected] = useState<Record<string, boolean>>({});
  const [piTemplate, setPiTemplate] = useState<TemplateKind>("direcionada");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (uid) {
        const { data } = await supabase
          .from("users")
          .select("phone")
          .eq("auth_user_id", uid)
          .maybeSingle();
        setUserPhone((data?.phone || "").toString());
      }
    })();
  }, []);

  async function load() {
    setLoading(true);

    let query = supabase
      .from("sim_simulations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (q.trim()) {
      const like = `%${q.trim()}%`;
      query = query.or(`lead_nome.ilike.${like},lead_telefone.ilike.${like}`);
    }
    if (seg) query = query.ilike("segmento", `%${seg}%`);
    if (grupo.trim()) query = query.eq("grupo", grupo.trim());
    if (dStart) query = query.gte("created_at", new Date(dStart).toISOString());
    if (dEnd) query = query.lte("created_at", endOfDayISO(dEnd));

    const { data, error } = await query;
    if (error) {
      setLoading(false);
      alert("Erro ao buscar propostas: " + error.message);
      return;
    }

    setRows((data as any[]) as SimRow[]);

    const ids = Array.from(
      new Set(((data as any[]) || []).map((r) => r.table_id).filter(Boolean))
    ) as string[];

    if (ids.length) {
      const { data: tData } = await supabase
        .from("sim_tables")
        .select("id, segmento, nome_tabela, antecip_parcelas, antecip_pct, seguro_prest_pct")
        .in("id", ids);
      const map: Record<string, SimTable> = {};
      (tData || []).forEach((t) => (map[t.id] = t as any));
      setTablesMap(map);
    } else {
      setTablesMap({});
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, seg, grupo, dStart, dEnd]);

  const segmentosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(normalizeSegment(r.segmento)));
    return Array.from(set);
  }, [rows]);

  /* ===== textos para copiar ===== */
  function textoResumo(sim: SimRow) {
    const segNorm = normalizeSegment(sim.segmento);
    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    const primeiraParcelaLabel =
      (tablesMap[sim.table_id || ""]?.antecip_parcelas ?? 0) === 2
        ? "Parcelas 1 e 2"
        : (tablesMap[sim.table_id || ""]?.antecip_parcelas ?? 0) === 1
        ? "Parcela 1"
        : "Parcela inicial";

    return `🎯 Com a estratégia certa, você conquista seu ${segNorm.toLowerCase()} sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(sim.credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(sim.parcela_ate_1_ou_2)} (Primeira parcela em até 3x sem juros no cartão)

💵 Demais parcelas até a contemplação: ${brMoney(sim.parcela_demais)}

📈 Após a contemplação (prevista em ${sim.parcela_contemplacao} meses):
🏦 Lance próprio: ${brMoney(sim.lance_proprio_valor)}

✅ Crédito líquido liberado: ${brMoney(sim.novo_credito)}

📆 Parcelas restantes (valor): ${brMoney(sim.parcela_escolhida)}

⏳ Prazo restante: ${sim.novo_prazo} meses

👉 Me chama aqui para simular agora:
${wa}`;
  }

  function textoOportunidade(sim: SimRow) {
    const table = sim.table_id ? tablesMap[sim.table_id] : undefined;
    const segNorm = normalizeSegment(sim.segmento);
    const emoji = emojiBySegment(sim.segmento);

    const has2a =
      !!table && table.antecip_parcelas >= 2 && sim.parcela_contemplacao === 1;

    const parc2 = has2a
      ? sim.parcela_escolhida +
        (sim.credito * (table?.antecip_pct || 0)) /
          (table?.antecip_parcelas || 1)
      : null;

    const whatsappFmt = formatPhoneBR(userPhone);
    const whatsappLine = whatsappFmt ? `\nWhatsApp: ${whatsappFmt}` : "";

    return `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${segNorm}

${emoji} Crédito: ${brMoney(sim.novo_credito)}
💰 Parcela 1: ${brMoney(sim.parcela_ate_1_ou_2)} (Em até 3x no cartão)${
      parc2 != null ? `\n💰 Parcela 2: ${brMoney(parc2)} (com antecipação)` : ""
    }
📆 + ${sim.novo_prazo}x de ${brMoney(sim.parcela_escolhida)}
💵 Lance Próprio: ${brMoney(sim.lance_proprio_valor)}
📢 Grupo: ${sim.grupo || "—"}

🚨 POUCAS VAGAS DISPONÍVEIS🚨

📲 Garanta sua vaga agora!${whatsappLine}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`;
  }

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
      alert("Copiado!");
    } catch {
      alert("Não foi possível copiar.");
    }
  }

  /* ===== PDF infra (marca d'água + rodapé / sem logo no topo) ===== */
  async function loadLogoDataURL(): Promise<string | null> {
    try {
      const res = await fetch("/logo-consulmax.png");
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function addWatermarkAndHeader(doc: jsPDF, logo: string | null, title: string) {
    const brand = { r: 30, g: 41, b: 63 };
    const accent = { r: 161, g: 28, b: 39 };
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Marca d'água
    if (logo) {
      const anyDoc = doc as any;
      const supportsOpacity = !!(anyDoc.setGState && anyDoc.GState);
      if (supportsOpacity) {
        anyDoc.setGState(new anyDoc.GState({ opacity: 0.06 }));
      }
      const w = pageW * 0.65;
      const h = w * 0.9;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2 - 6;
      doc.addImage(logo, "PNG", x, y, w, h);
      if (supportsOpacity) {
        anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
      }
    }

    // Cabeçalho sem logo
    doc.setTextColor(brand.r, brand.g, brand.b);
    doc.setFontSize(18);
    doc.text(title, 14, 18);
    doc.setDrawColor(accent.r, accent.g, accent.b);
    doc.setLineWidth(0.8);
    doc.line(14, 22, pageW - 14, 22);
  }

  function addFooter(doc: jsPDF, logo: string | null) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const footerTop = pageH - 36;

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(14, footerTop, pageW - 14, footerTop);

    if (logo) {
      doc.addImage(logo, "PNG", 14, footerTop + 6, 22, 22 * 0.9);
    }

    const lines = [
      "Consulmax Consórcios e Investimentos",
      "CNPJ: 57.942.043/0001-03",
      "Av. Menezes Filho, 3174, Casa Preta, Ji-Paraná/RO",
      "Cel/Whats: (69) 9 9302-9380",
      "consulmaxconsorcios.com.br",
    ];
    doc.setFontSize(9);
    doc.setTextColor(80);
    let y = footerTop + 9;
    for (const line of lines) {
      doc.text(line, pageW - 14, y, { align: "right" as any });
      y += 5;
    }
  }

  async function exportarPDF(sim: SimRow) {
    const doc = new jsPDF();
    const brand = { r: 30, g: 41, b: 63 };
    const accent = { r: 161, g: 28, b: 39 };

    const logo = await loadLogoDataURL();
    addWatermarkAndHeader(doc, logo, "Proposta Embracon - Consulmax");

    // Tabela 1
    const head = [
      ["Código", sim.code ?? "-"],
      ["Criada em", fmtDate(sim.created_at)],
      ["Lead", `${sim.lead_nome || "-"}  ${sim.lead_telefone || ""}`.trim()],
      ["Segmento", normalizeSegment(sim.segmento)],
      ["Grupo", sim.grupo || "-"],
    ];
    autoTable(doc, {
      head: [["Campo", "Valor"]],
      body: head,
      startY: 28,
      styles: { cellPadding: 3 },
      theme: "grid",
      headStyles: { fillColor: [brand.r, brand.g, brand.b] },
    });

    // Tabela 2
    const start2 = (doc as any).lastAutoTable.finalY + 8;
    autoTable(doc, {
      head: [["Detalhe", "Valor"]],
      body: [
        ["Crédito contratado", brMoney(sim.credito)],
        ["Parcela 1", brMoney(sim.parcela_ate_1_ou_2)],
        ["Demais até contemplação", brMoney(sim.parcela_demais)],
        ["Lance próprio", brMoney(sim.lance_proprio_valor)],
        ["Crédito líquido (após)", brMoney(sim.novo_credito)],
        ["Parcela escolhida (após)", brMoney(sim.parcela_escolhida)],
        ["Novo prazo (meses)", String(sim.novo_prazo)],
      ],
      startY: start2,
      styles: { cellPadding: 3 },
      theme: "striped",
      headStyles: { fillColor: [accent.r, accent.g, accent.b] },
    });

    addFooter(doc, logo);
    doc.save(`proposta-${sim.code || sim.id}.pdf`);
  }

  async function excluir(sim: SimRow) {
    if (!confirm("Confirmar exclusão desta proposta?")) return;
    const { error } = await supabase.from("sim_simulations").delete().eq("id", sim.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== sim.id));
  }

  /* ======= Templates PDF (bundle) ======= */
  function renderTemplatePage(
    doc: jsPDF,
    logo: string | null,
    tpl: TemplateKind,
    sim: SimRow
  ) {
    const brand = { r: 30, g: 41, b: 63 };
    const accent = { r: 161, g: 28, b: 39 };

    const titles: Record<TemplateKind, string> = {
      direcionada: "Proposta Direcionada",
      alav_fin: "Alavancagem Financeira",
      alav_patr: "Alavancagem Patrimonial",
      previdencia: "Previdência Aplicada",
      correcao: "Crédito com Correção",
      extrato: "Extrato da Proposta",
    };
    addWatermarkAndHeader(doc, logo, titles[tpl]);

    // Cabeçalho técnico
    const head = [
      ["Código", sim.code ?? "-"],
      ["Criada em", fmtDate(sim.created_at)],
      ["Lead", `${sim.lead_nome || "-"}  ${sim.lead_telefone || ""}`.trim()],
      ["Segmento", normalizeSegment(sim.segmento)],
      ["Grupo", sim.grupo || "-"],
    ];
    autoTable(doc, {
      head: [["Campo", "Valor"]],
      body: head,
      startY: 28,
      styles: { cellPadding: 3 },
      theme: "grid",
      headStyles: { fillColor: [brand.r, brand.g, brand.b] },
    });

    const startY = (doc as any).lastAutoTable.finalY + 8;

    if (tpl === "direcionada") {
      autoTable(doc, {
        head: [["Dado", "Valor"]],
        body: [
          ["Crédito líquido (após)", brMoney(sim.novo_credito)],
          ["Parcela 1 (até a contemplação)", brMoney(sim.parcela_ate_1_ou_2)],
          ["Parcela após contemplação", brMoney(sim.parcela_escolhida)],
          ["Prazo restante (meses)", String(sim.novo_prazo)],
          ["Lance próprio", brMoney(sim.lance_proprio_valor)],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    } else if (tpl === "alav_fin") {
      const fator =
        sim.lance_proprio_valor > 0
          ? sim.novo_credito / sim.lance_proprio_valor
          : 0;
      autoTable(doc, {
        head: [["Métrica", "Valor"]],
        body: [
          ["Lance próprio", brMoney(sim.lance_proprio_valor)],
          ["Crédito líquido (após)", brMoney(sim.novo_credito)],
          ["Fator de alavancagem", fator ? fator.toFixed(2) + "x" : "—"],
          ["Parcela (após)", brMoney(sim.parcela_escolhida)],
          ["Prazo restante", `${sim.novo_prazo} meses`],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    } else if (tpl === "alav_patr") {
      autoTable(doc, {
        head: [["Item", "Valor"]],
        body: [
          ["Crédito líquido (após)", brMoney(sim.novo_credito)],
          ["Parcela (após)", brMoney(sim.parcela_escolhida)],
          ["Prazo restante", `${sim.novo_prazo} meses`],
          ["Observação", "Adicionar aluguel estimado / yield do ativo."],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    } else if (tpl === "previdencia") {
      autoTable(doc, {
        head: [["Aporte / Prazo", "Valor"]],
        body: [
          ["Parcela até a contemplação", brMoney(sim.parcela_demais)],
          ["Parcela após contemplação", brMoney(sim.parcela_escolhida)],
          ["Horizonte", `${sim.novo_prazo} meses (restante)`],
          ["Observação", "Simulação de patrimônio futuro opcional."],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    } else if (tpl === "correcao") {
      autoTable(doc, {
        head: [["Componente", "Valor"]],
        body: [
          ["Crédito líquido (após)", brMoney(sim.novo_credito)],
          ["Parcela (após)", brMoney(sim.parcela_escolhida)],
          ["Observação", "Aplicar índice de correção conforme a tabela."],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    } else if (tpl === "extrato") {
      autoTable(doc, {
        head: [["Detalhe", "Valor"]],
        body: [
          ["Crédito contratado", brMoney(sim.credito)],
          ["Parcela 1", brMoney(sim.parcela_ate_1_ou_2)],
          ["Demais até contemplação", brMoney(sim.parcela_demais)],
          ["Lance próprio", brMoney(sim.lance_proprio_valor)],
          ["Crédito líquido (após)", brMoney(sim.novo_credito)],
          ["Parcela escolhida (após)", brMoney(sim.parcela_escolhida)],
          ["Novo prazo (meses)", String(sim.novo_prazo)],
        ],
        startY,
        theme: "striped",
        styles: { cellPadding: 3 },
      });
    }

    addFooter(doc, logo);
  }

  async function gerarBundlePDF(template: TemplateKind, sims: SimRow[]) {
    if (sims.length === 0) {
      alert("Selecione pelo menos 1 simulação.");
      return;
    }
    const doc = new jsPDF();
    const logo = await loadLogoDataURL();

    // Capa
    addWatermarkAndHeader(doc, logo, "Propostas de Investimento");
    autoTable(doc, {
      head: [["Modelo selecionado", "Quantidade"]],
      body: [[
        {
          content:
            template === "direcionada" ? "Proposta Direcionada" :
            template === "alav_fin" ? "Alavancagem Financeira" :
            template === "alav_patr" ? "Alavancagem Patrimonial" :
            template === "previdencia" ? "Previdência Aplicada" :
            template === "correcao" ? "Crédito com Correção" :
            "Extrato da Proposta",
        },
        String(sims.length),
      ]],
      startY: 40,
      styles: { cellPadding: 4 },
      theme: "grid",
    });
    addFooter(doc, logo);

    // Demais páginas
    sims.forEach((sim, idx) => {
      if (idx > 0 || true) doc.addPage();
      renderTemplatePage(doc, logo, template, sim);
    });

    doc.save(
      `propostas-${template}-${new Date().toISOString().slice(0, 10)}.pdf`
    );
  }

  /* ===== Modal: Adicionar simulações ===== */
  function AddSimsModal({
    onClose,
    onSave,
    alreadyIds,
  }: {
    onClose: () => void;
    onSave: (sims: SimRow[]) => void;
    alreadyIds: Set<string>;
  }) {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<SimRow[]>([]);
    const [picked, setPicked] = useState<Record<string, boolean>>({});

    const max = 5;

    async function buscar() {
      setLoading(true);
      let query = supabase
        .from("sim_simulations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (q.trim()) {
        const like = `%${q.trim()}%`;
        query = query.or(`lead_nome.ilike.${like},lead_telefone.ilike.${like}`);
      }

      const { data, error } = await query;
      setLoading(false);
      if (error) {
        alert("Erro ao buscar: " + error.message);
        return;
      }
      setItems((data as any[]) as SimRow[]);
    }

    useEffect(() => {
      const h = setTimeout(buscar, 250);
      return () => clearTimeout(h);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    const totalSelecionados =
      Object.values(picked).filter(Boolean).length + alreadyIds.size;

    function toggle(id: string) {
      const next = { ...picked };
      const willSelect = !next[id];
      if (willSelect && totalSelecionados >= max) {
        alert(`Limite de ${max} simulações.`);
        return;
      }
      next[id] = willSelect;
      setPicked(next);
    }

    function salvar() {
      const chosen = items.filter((i) => picked[i.id]);
      onSave(chosen);
      onClose();
    }

    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold">Adicionar simulações (até 5)</div>
            <button className="p-1 rounded hover:bg-muted" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label>Buscar por nome ou telefone</Label>
                <Input
                  placeholder="ex.: Maria / 11 9..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={buscar} className="w-full">
                  Buscar
                </Button>
              </div>
            </div>

            <div className="rounded-lg border overflow-auto max-h-[50vh]">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">Sel.</th>
                    <th className="p-2 text-left">Criada</th>
                    <th className="p-2 text-left">Lead</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-right">Crédito (após)</th>
                    <th className="p-2 text-right">Parcela (após)</th>
                    <th className="p-2 text-right">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-4">
                        <Loader2 className="h-4 w-4 animate-spin inline" /> Carregando…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-muted-foreground">
                        Sem resultados.
                      </td>
                    </tr>
                  ) : (
                    items.map((r) => {
                      const disabled = alreadyIds.has(r.id);
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={!!picked[r.id] || disabled}
                              onChange={() => toggle(r.id)}
                            />
                          </td>
                          <td className="p-2">{fmtDate(r.created_at)}</td>
                          <td className="p-2">
                            <div className="font-medium">{r.lead_nome || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.lead_telefone || ""}</div>
                          </td>
                          <td className="p-2">{normalizeSegment(r.segmento)}</td>
                          <td className="p-2 text-right">{brMoney(r.novo_credito)}</td>
                          <td className="p-2 text-right">{brMoney(r.parcela_escolhida)}</td>
                          <td className="p-2 text-right">{r.novo_prazo}x</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Selecionados no total: <strong>{totalSelecionados}</strong> / 5
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={Object.values(picked).filter(Boolean).length === 0}>
                  Salvar na lista
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ===== render ===== */
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Propostas</h1>
        <Button variant="secondary" onClick={load}>
          Recarregar
        </Button>
      </div>

      {/* Filtros automáticos */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Buscar (nome ou telefone)</Label>
            <Input
              placeholder="ex.: Maria / 11 9...."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <Label>Segmento</Label>
            <select
              className="w-full h-10 border rounded-md px-3"
              value={seg}
              onChange={(e) => setSeg(e.target.value)}
            >
              <option value="">Todos</option>
              {segmentosDisponiveis.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Grupo</Label>
            <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} />
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Lista principal */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          {loading ? (
            <div className="p-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Sem resultados.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Criada</th>
                  <th className="text-left p-2">Lead</th>
                  <th className="text-left p-2">Segmento</th>
                  <th className="text-right p-2">Crédito (após)</th>
                  <th className="text-right p-2">Parcela (após)</th>
                  <th className="text-right p-2">Prazo</th>
                  <th className="text-right p-2">
                    <div className="min-w-[320px] grid grid-cols-5 gap-2 justify-items-center text-xs font-medium text-muted-foreground">
                      <span>Oportunidade</span>
                      <span>Resumo</span>
                      <span>PDF</span>
                      <span>Abrir</span>
                      <span>Excluir</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.code || "—"}</td>
                    <td className="p-2">{fmtDate(r.created_at)}</td>
                    <td className="p-2">
                      <div className="font-medium">{r.lead_nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.lead_telefone || ""}</div>
                    </td>
                    <td className="p-2">{normalizeSegment(r.segmento)}</td>
                    <td className="p-2 text-right">{brMoney(r.novo_credito)}</td>
                    <td className="p-2 text-right">{brMoney(r.parcela_escolhida)}</td>
                    <td className="p-2 text-right">{r.novo_prazo}x</td>
                    <td className="p-2">
                      <div className="min-w-[320px] grid grid-cols-5 gap-2 justify-items-center">
                        <Button
                          size="sm"
                          className="h-9 w-9 p-0 rounded-full bg-[#A11C27] text-white hover:bg-[#8f1822]"
                          onClick={() => copiar(textoOportunidade(r))}
                          title="Copiar Oportunidade"
                          aria-label="Copiar Oportunidade"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 w-9 p-0 rounded-full bg-[#1E293F] text-white hover:bg-[#162033]"
                          onClick={() => copiar(textoResumo(r))}
                          title="Copiar Resumo"
                          aria-label="Copiar Resumo"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 w-9 p-0 rounded-full bg-[#1E293F] text-white hover:bg-[#162033]"
                          onClick={() => exportarPDF(r)}
                          title="Exportar PDF"
                          aria-label="Exportar PDF"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <a
                          href="/simuladores"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-full border bg-background hover:bg-muted text-sm"
                          title="Abrir no simulador"
                          aria-label="Abrir no simulador"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => excluir(r)}
                          title="Excluir"
                          aria-label="Excluir"
                          className="h-9 w-9 p-0 rounded-full"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ===== Propostas de Investimento ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Propostas de Investimento</CardTitle>
          <Button onClick={() => setModalOpen(true)} className="rounded-2xl">
            <Plus className="h-4 w-4 mr-1" /> Adicionar simulações
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Barra de ações */}
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm">Modelo:</Label>
            <select
              className="h-10 border rounded-md px-3"
              value={piTemplate}
              onChange={(e) => setPiTemplate(e.target.value as TemplateKind)}
            >
              <option value="direcionada">Direcionada</option>
              <option value="alav_fin">Alav. Financeira</option>
              <option value="alav_patr">Alav. Patrimonial</option>
              <option value="previdencia">Previdência</option>
              <option value="correcao">Crédito c/ Correção</option>
              <option value="extrato">Extrato</option>
            </select>

            <Button
              className="rounded-2xl"
              onClick={() =>
                gerarBundlePDF(
                  piTemplate,
                  piList.filter((s) => piSelected[s.id])
                )
              }
              disabled={Object.values(piSelected).filter(Boolean).length === 0}
            >
              Gerar PDF (selecionados)
            </Button>
          </div>

          {/* Lista */}
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">
                    <input
                      type="checkbox"
                      checked={
                        piList.length > 0 &&
                        piList.every((s) => piSelected[s.id])
                      }
                      onChange={(e) => {
                        const all = { ...piSelected };
                        piList.forEach((s) => (all[s.id] = e.target.checked));
                        setPiSelected(all);
                      }}
                    />
                  </th>
                  <th className="text-left p-2">Criada</th>
                  <th className="text-left p-2">Lead</th>
                  <th className="text-left p-2">Segmento</th>
                  <th className="text-right p-2">Crédito (após)</th>
                  <th className="text-right p-2">Parcela (após)</th>
                  <th className="text-right p-2">Prazo</th>
                  <th className="text-right p-2">Gerar…</th>
                </tr>
              </thead>
              <tbody>
                {piList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-muted-foreground">
                      Ainda não há simulações adicionadas.
                    </td>
                  </tr>
                ) : (
                  piList.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={!!piSelected[r.id]}
                          onChange={(e) =>
                            setPiSelected((prev) => ({
                              ...prev,
                              [r.id]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">{fmtDate(r.created_at)}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.lead_nome || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.lead_telefone || ""}
                        </div>
                      </td>
                      <td className="p-2">{normalizeSegment(r.segmento)}</td>
                      <td className="p-2 text-right">{brMoney(r.novo_credito)}</td>
                      <td className="p-2 text-right">{brMoney(r.parcela_escolhida)}</td>
                      <td className="p-2 text-right">{r.novo_prazo}x</td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-2">
                          <select
                            className="h-9 border rounded-md px-2"
                            onChange={(e) =>
                              gerarBundlePDF(
                                e.target.value as TemplateKind,
                                [r]
                              )
                            }
                            defaultValue=""
                            title="Gerar PDF desta linha"
                          >
                            <option value="" disabled>
                              Escolha o modelo
                            </option>
                            <option value="direcionada">Direcionada</option>
                            <option value="alav_fin">Alav. Financeira</option>
                            <option value="alav_patr">Alav. Patrimonial</option>
                            <option value="previdencia">Previdência</option>
                            <option value="correcao">Crédito c/ Correção</option>
                            <option value="extrato">Extrato</option>
                          </select>
                          <button
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full border bg-background hover:bg-muted"
                            title="Abrir opções"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <AddSimsModal
          onClose={() => setModalOpen(false)}
          onSave={(sims) => {
            // evita duplicatas
            const exists = new Set(piList.map((s) => s.id));
            const merged = [...piList];
            sims.forEach((s) => {
              if (!exists.has(s.id) && merged.length < 5) merged.push(s);
            });
            setPiList(merged);
          }}
          alreadyIds={new Set(piList.map((s) => s.id))}
        />
      )}
    </div>
  );
}
