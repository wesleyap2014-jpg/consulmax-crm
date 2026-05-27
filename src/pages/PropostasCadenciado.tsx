import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, CheckSquare, Download, FileText, Search, Square, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

type SimRow = {
  code: number;
  created_at: string;
  lead_nome: string | null;
  lead_telefone: string | null;
  segmento: string | null;
  grupo: string | null;
  credito: number | null;
  prazo_venda: number | null;
  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;
  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;
  valor_categoria?: number | null;
  lance_ofertado_valor?: number | null;
  lance_embutido_valor?: number | null;
  lance_proprio_valor: number | null;
  lance_ofertado_pct?: number | null;
  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;
};

const brand = {
  header: "#0F1E36",
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  gold: "#B5A573",
};

const LOGO_URL = "/logo-consulmax.png";

const brMoney = (v?: number | null) =>
  (Number(v ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pct = (v?: number | null) =>
  `${(Number(v ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const safe = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

function toDateInputValue(d: Date) {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const startOfDayISO = (d: string) => new Date(`${d}T00:00:00.000`).toISOString();
const endOfDayISO = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

function calcRow(r: SimRow) {
  const credito = safe(r.credito);
  const adm = safe(r.adm_tax_pct);
  const fr = safe(r.fr_tax_pct);
  const valorCategoria = safe(r.valor_categoria) > 0 ? safe(r.valor_categoria) : credito * (1 + adm + fr);
  const lanceTotal = safe(r.lance_ofertado_valor) > 0
    ? safe(r.lance_ofertado_valor)
    : safe(r.lance_embutido_valor) + safe(r.lance_proprio_valor);
  const lanceEmbutido = safe(r.lance_embutido_valor);
  const lanceProprio = safe(r.lance_proprio_valor);
  const creditoLiquido = safe(r.novo_credito) > 0 ? safe(r.novo_credito) : Math.max(0, credito - lanceEmbutido);
  const parcelaInicial = safe(r.parcela_ate_1_ou_2);
  const parcelaPos = safe(r.parcela_escolhida);
  const alavancagem = Math.max(0, creditoLiquido - lanceProprio);
  const saldoDevedorPos = Math.max(0, valorCategoria - parcelaInicial - lanceTotal);
  return { credito, adm, fr, valorCategoria, prazo: safe(r.prazo_venda), parcelaInicial, lanceTotal, lanceEmbutido, lanceProprio, creditoLiquido, parcelaPos, alavancagem, saldoDevedorPos };
}

function buildCadenciado(rows: SimRow[]) {
  const itens = rows.map((sim, idx) => ({ sim, ordem: idx + 1, c: calcRow(sim) }));
  const sum = (fn: (x: typeof itens[number]) => number) => itens.reduce((acc, x) => acc + fn(x), 0);
  const totals = {
    credito: sum((x) => x.c.credito),
    parcelaInicial: sum((x) => x.c.parcelaInicial),
    lanceTotal: sum((x) => x.c.lanceTotal),
    lanceEmbutido: sum((x) => x.c.lanceEmbutido),
    lanceProprio: sum((x) => x.c.lanceProprio),
    creditoLiquido: sum((x) => x.c.creditoLiquido),
    parcelaPos: sum((x) => x.c.parcelaPos),
    alavancagem: sum((x) => x.c.alavancagem),
    saldoDevedorPos: sum((x) => x.c.saldoDevedorPos),
  };
  const fluxoParcelas = itens.length === 0 ? [] : [
    { label: "Parcela Inicial", valor: totals.parcelaInicial },
    ...Array.from({ length: itens.length }, (_, i) => {
      const contempladas = i + 1;
      const valor = itens.reduce((acc, item, idx) => acc + (idx < contempladas ? item.c.parcelaPos : item.c.parcelaInicial), 0);
      return { label: `Parcela ${i + 2}`, valor };
    }),
  ];
  const fluxoCaixa = itens.map((item, idx) => ({
    mes: `M${idx + 1}`,
    saida: item.c.lanceProprio,
    entrada: item.c.creditoLiquido,
    liquido: item.c.creditoLiquido - item.c.lanceProprio,
  }));
  const saidas = fluxoCaixa.reduce((a, x) => a + x.saida, 0);
  const entradas = fluxoCaixa.reduce((a, x) => a + x.entrada, 0);
  const liquido = entradas - saidas;
  const lanceEfetivo = entradas + saidas > 0 ? saidas / (entradas + saidas) : 0;
  const cetMesAprox = totals.saldoDevedorPos > 0 ? totals.parcelaPos / totals.saldoDevedorPos : 0;
  const cetAnoAprox = Math.pow(1 + cetMesAprox, 12) - 1;
  return { itens, totals, fluxoParcelas, fluxoCaixa, saidas, entradas, liquido, lanceEfetivo, cetMesAprox, cetAnoAprox };
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
  } catch { return null; }
}

export default function PropostasCadenciado() {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return toDateInputValue(d); });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<number[]>([]);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [seller, setSeller] = useState({ nome: "Consultor Consulmax", phone: "" });

  const selectedRows = useMemo(() => selectedCodes.map((code) => rows.find((r) => r.code === code)).filter(Boolean) as SimRow[], [rows, selectedCodes]);
  const calc = useMemo(() => buildCadenciado(selectedRows), [selectedRows]);

  useEffect(() => { fetchAsDataURL(LOGO_URL).then(setLogoDataUrl); }, []);
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("users").select("nome, phone, telefone").eq("auth_user_id", uid).maybeSingle();
      setSeller({ nome: data?.nome || "Consultor Consulmax", phone: data?.phone || data?.telefone || "" });
    })();
  }, []);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("sim_simulations")
      .select("code,created_at,lead_nome,lead_telefone,segmento,grupo,credito,prazo_venda,novo_credito,parcela_escolhida,novo_prazo,parcela_ate_1_ou_2,parcela_demais,valor_categoria,lance_ofertado_valor,lance_embutido_valor,lance_proprio_valor,lance_ofertado_pct,adm_tax_pct,fr_tax_pct")
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
    if (error) { alert("Erro ao carregar simulações: " + error.message); return; }
    setRows((data || []) as SimRow[]);
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, dateFrom, dateTo]);

  function toggle(r: SimRow) {
    setSelectedCodes((prev) => prev.includes(r.code) ? prev.filter((x) => x !== r.code) : [...prev, r.code]);
  }

  function gerarPDF() {
    if (selectedRows.length === 0) { alert("Selecione pelo menos uma simulação."); return; }
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const marginX = 28;
    const lead = selectedRows.find((x) => x.lead_nome)?.lead_nome || "Cliente";

    doc.setFillColor(brand.header as any); doc.rect(0, 0, w, 88, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor("#fff");
    doc.text("Proposta Cadenciada — Junção de Cotas", marginX, 46);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Projeto elaborado para ${lead} • ${selectedRows.length} cota(s) selecionada(s)`, marginX, 65);
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", w - 130, 24, 92, 28); } catch {}
    }

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    doc.text("Estratégia de contemplação em cadência: cada simulação representa uma cota, permitindo visualizar crédito, lance, alavancagem, fluxo de parcelas e fluxo de caixa projetado.", marginX, 114, { maxWidth: w - marginX * 2 });

    (doc as any).autoTable({
      startY: 132,
      head: [["CRÉDITO", "TAXA ADM", "FR", "PRAZO", "PARCELA INICIAL", "LANCE TOTAL", "LANCE EMBUTIDO", "LANCE PRÓPRIO", "CRÉDITO LÍQUIDO", "PARCELA PÓS", "ALAVANCAGEM", "SD PÓS"]],
      body: [
        ...calc.itens.map(({ c }) => [brMoney(c.credito), pct(c.adm), pct(c.fr), `${c.prazo}`, brMoney(c.parcelaInicial), brMoney(c.lanceTotal), brMoney(c.lanceEmbutido), brMoney(c.lanceProprio), brMoney(c.creditoLiquido), brMoney(c.parcelaPos), brMoney(c.alavancagem), brMoney(c.saldoDevedorPos)]),
        [brMoney(calc.totals.credito), "", "", "", brMoney(calc.totals.parcelaInicial), brMoney(calc.totals.lanceTotal), brMoney(calc.totals.lanceEmbutido), brMoney(calc.totals.lanceProprio), brMoney(calc.totals.creditoLiquido), brMoney(calc.totals.parcelaPos), brMoney(calc.totals.alavancagem), brMoney(calc.totals.saldoDevedorPos)],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff", halign: "center" },
      styles: { fontSize: 7.2, cellPadding: 3, overflow: "linebreak" },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
      didParseCell: (data: any) => { if (data.row.index === calc.itens.length) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245,245,245]; } },
    });

    const yLower = (doc as any).lastAutoTable.finalY + 22;
    const flowX = marginX, flowW = 320, cashX = 410, cashW = 275, kpiX = 710;
    (doc as any).autoTable({ startY: yLower, head: [["Fluxo de Parcelas", "Valor"]], body: calc.fluxoParcelas.map((f) => [f.label, brMoney(f.valor)]), headStyles: { fillColor: brand.primary, textColor: "#fff" }, styles: { fontSize: 8, cellPadding: 4 }, theme: "grid", tableWidth: flowW, margin: { left: flowX }, alternateRowStyles: { fillColor: brand.grayRow } });
    const yFlowObs = (doc as any).lastAutoTable.finalY + 12;
    doc.setDrawColor(30,41,63); doc.rect(flowX, yFlowObs, flowW, 74);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(30);
    doc.text("Obs.: O valor das parcelas pode variar conforme prazo ou valor do lance aportado. O fluxo representa a contemplação de 1 cota por assembleia, a partir do mês de contratação.", flowX + 8, yFlowObs + 16, { maxWidth: flowW - 16, align: "center" as any });

    (doc as any).autoTable({ startY: yLower, head: [["FLUXO DE CAIXA PROJETADO", "SAÍDAS", "ENTRADAS", "LÍQUIDO"]], body: [...calc.fluxoCaixa.map((f) => [f.mes, brMoney(f.saida), brMoney(f.entrada), brMoney(f.liquido)]), ["Totais", brMoney(calc.saidas), brMoney(calc.entradas), brMoney(calc.liquido)]], headStyles: { fillColor: brand.accent, textColor: "#fff", halign: "center" }, styles: { fontSize: 8, cellPadding: 4 }, theme: "grid", tableWidth: cashW, margin: { left: cashX }, alternateRowStyles: { fillColor: brand.grayRow }, didParseCell: (data: any) => { if (data.row.index === calc.fluxoCaixa.length) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245,245,245]; } } });

    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(20);
    doc.text("Lance Efetivo", kpiX, yLower + 8); doc.setFont("helvetica", "bold"); doc.text(pct(calc.lanceEfetivo), kpiX + 8, yLower + 22);
    doc.setFont("helvetica", "normal"); doc.text("CET a.m. aprox.", kpiX, yLower + 54); doc.setFont("helvetica", "bold"); doc.text(pct(calc.cetMesAprox), kpiX + 8, yLower + 68);
    doc.setFont("helvetica", "normal"); doc.text("CET a.a. aprox.", kpiX, yLower + 88); doc.setFont("helvetica", "bold"); doc.text(pct(calc.cetAnoAprox), kpiX + 8, yLower + 102);

    const yCashObs = (doc as any).lastAutoTable.finalY + 12;
    doc.setDrawColor(30,41,63); doc.rect(cashX, yCashObs, w - cashX - marginX, 72);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(30);
    doc.text("Obs.: O fluxo de caixa projetado soma todas as entradas e saídas para demonstrar os valores que irão transitar na conta corrente do cliente. A coluna 'Saídas' refere-se somente ao capital utilizado como lance próprio em cada mês.", cashX + 8, yCashObs + 16, { maxWidth: w - cashX - marginX - 16 });

    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text("Atenção: a presente proposta refere-se a uma simulação, não configurando promessa de contemplação. As contemplações podem ocorrer antes ou após o prazo previsto.", marginX, h - 72, { maxWidth: w - marginX * 2 });
    doc.setDrawColor(220,220,220); doc.line(marginX, h - 52, w - marginX, h - 52);
    doc.setFontSize(8); doc.text(`Consulmax Consórcios e Investimentos • Consultor: ${seller.nome}`, w - marginX, h - 36, { align: "right" as any });
    doc.save(`Proposta_Cadenciada_${lead.toString().replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Proposta Cadenciada</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-6"><Label>Buscar por nome ou telefone</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: Erick / telefone" /></div>
          <div className="md:col-span-3"><Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> De</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="md:col-span-3"><Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Até</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card className="border-[#B5A573]">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div><div className="font-semibold text-[#1E293F]">Selecione as cotas para montar a cadência</div><div className="text-sm text-muted-foreground">A ordem de seleção define M1, M2, M3...</div></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setSelectedCodes(rows.map((r) => r.code))}>Selecionar todas</Button><Button variant="secondary" onClick={() => setSelectedCodes([])}>Limpar</Button><Button onClick={gerarPDF}><Download className="h-4 w-4 mr-2" /> Baixar PDF ({selectedRows.length})</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Simulações ({rows.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40"><tr><th className="p-2 text-left">Sel.</th><th className="p-2 text-left">#</th><th className="p-2 text-left">Lead</th><th className="p-2 text-left">Crédito</th><th className="p-2 text-left">Lance Próprio</th><th className="p-2 text-left">Crédito Líq.</th></tr></thead>
                <tbody>
                  {rows.map((r) => { const c = calcRow(r); const checked = selectedCodes.includes(r.code); return <tr key={r.code} className="border-t"><td className="p-2"><button onClick={() => toggle(r)}>{checked ? <CheckSquare className="h-5 w-5 text-[#A11C27]" /> : <Square className="h-5 w-5" />}</button></td><td className="p-2">{r.code}</td><td className="p-2"><div className="font-medium">{r.lead_nome || "—"}</div><div className="text-xs text-muted-foreground">{r.lead_telefone || "—"}</div></td><td className="p-2">{brMoney(c.credito)}</td><td className="p-2">{brMoney(c.lanceProprio)}</td><td className="p-2">{brMoney(c.creditoLiquido)}</td></tr>; })}
                  {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{loading ? "Carregando..." : "Nenhuma simulação encontrada."}</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Prévia Cadenciada</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border p-3"><div className="text-muted-foreground">Crédito líquido total</div><div className="font-semibold">{brMoney(calc.totals.creditoLiquido)}</div></div>
              <div className="rounded-xl border p-3"><div className="text-muted-foreground">Lance próprio total</div><div className="font-semibold">{brMoney(calc.totals.lanceProprio)}</div></div>
              <div className="rounded-xl border p-3"><div className="text-muted-foreground">Alavancagem</div><div className="font-semibold">{brMoney(calc.totals.alavancagem)}</div></div>
              <div className="rounded-xl border p-3"><div className="text-muted-foreground">Líquido do fluxo</div><div className="font-semibold">{brMoney(calc.liquido)}</div></div>
            </div>
            <div className="overflow-auto rounded-lg border"><table className="min-w-full text-xs"><thead className="bg-muted/40"><tr><th className="text-left p-2">Mês</th><th className="text-left p-2">Saídas</th><th className="text-left p-2">Entradas</th><th className="text-left p-2">Líquido</th></tr></thead><tbody>{calc.fluxoCaixa.map((f) => <tr key={f.mes} className="border-t"><td className="p-2">{f.mes}</td><td className="p-2">{brMoney(f.saida)}</td><td className="p-2">{brMoney(f.entrada)}</td><td className="p-2 font-semibold">{brMoney(f.liquido)}</td></tr>)}</tbody></table></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
