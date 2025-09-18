// src/pages/Propostas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Copy, FileText, ExternalLink } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** ================= Helpers ================= */
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

/** =============== Tipos de dados usados aqui =============== */
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

export default function Propostas() {
  /** ====== filtros ====== */
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<string>("");
  const [grupo, setGrupo] = useState<string>("");
  const [dStart, setDStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dEnd, setDEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  /** ====== dados ====== */
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [tablesMap, setTablesMap] = useState<Record<string, SimTable>>({});
  const [userPhone, setUserPhone] = useState<string>("");

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

    // base query
    let query = supabase
      .from("sim_simulations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    // filtros
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

    // carregar tabelas relacionadas para calcular possível "Parcela 2"
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

  // primeira carga
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-aplicar filtros com debounce 300ms
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

  /** ====== Textos (copiar) ====== */
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

    // tem 2 parcelas de antecipação E contemplação na 1ª?
    const has2a =
      !!table && table.antecip_parcelas >= 2 && sim.parcela_contemplacao === 1;

    // calcula 2ª parcela: parcela escolhida + (crédito * antecip_pct / antecip_parcelas)
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

  /** ====== PDF (com logo) ====== */
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

  async function exportarPDF(sim: SimRow) {
    const doc = new jsPDF();
    const brand = { r: 30, g: 41, b: 63 }; // #1E293F
    const accent = { r: 161, g: 28, b: 39 }; // #A11C27

    // Logo
    const logo = await loadLogoDataURL();
    if (logo) {
      // centraliza no topo
      const w = 34; // mm
      const x = 105 - w / 2;
      doc.addImage(logo, "PNG", x, 8, w, w * 0.9);
    }

    // Título
    doc.setTextColor(brand.r, brand.g, brand.b);
    doc.setFontSize(18);
    doc.text("Proposta Embracon - Consulmax", 14, 18);

    // Linha
    doc.setDrawColor(accent.r, accent.g, accent.b);
    doc.setLineWidth(0.8);
    doc.line(14, 22, 196, 22);

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
      startY: logo ? 44 : 28,
      styles: { cellPadding: 3 },
      theme: "grid",
      headStyles: { fillColor: [brand.r, brand.g, brand.b] },
    });

    const start2 = (doc as any).lastAutoTable.finalY + 8;
    const body2 = [
      ["Crédito contratado", brMoney(sim.credito)],
      ["Parcela 1", brMoney(sim.parcela_ate_1_ou_2)],
      ["Demais até contemplação", brMoney(sim.parcela_demais)],
      ["Lance próprio", brMoney(sim.lance_proprio_valor)],
      ["Crédito líquido (após)", brMoney(sim.novo_credito)],
      ["Parcela escolhida (após)", brMoney(sim.parcela_escolhida)],
      ["Novo prazo (meses)", String(sim.novo_prazo)],
    ];
    autoTable(doc, {
      head: [["Detalhe", "Valor"]],
      body: body2,
      startY: start2,
      styles: { cellPadding: 3 },
      theme: "striped",
      headStyles: { fillColor: [accent.r, accent.g, accent.b] },
    });

    doc.save(`proposta-${sim.code || sim.id}.pdf`);
  }

  /** ====== excluir ====== */
  async function excluir(sim: SimRow) {
    if (!confirm("Confirmar exclusão desta proposta?")) return;
    const { error } = await supabase.from("sim_simulations").delete().eq("id", sim.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== sim.id));
  }

  /** ====== render ====== */
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Propostas</h1>
        <Button variant="secondary" onClick={load}>
          Recarregar
        </Button>
      </div>

      {/* Filtros (auto-aplicação) */}
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

      {/* Lista */}
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
                  <th className="text-right p-2">Ações</th>
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
                      {/* Toolbar de ações — compacta e responsiva */}
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          className="h-8 rounded-xl px-3 bg-[#A11C27] text-white hover:bg-[#8f1822] min-w-[44px]"
                          onClick={() => copiar(textoOportunidade(r))}
                          title="Copiar Oportunidade"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          <span className="hidden md:inline">Oportunidade</span>
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 rounded-xl px-3 bg-[#1E293F] text-white hover:bg-[#162033] min-w-[44px]"
                          onClick={() => copiar(textoResumo(r))}
                          title="Copiar Resumo"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          <span className="hidden md:inline">Resumo</span>
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 rounded-xl px-3 bg-[#1E293F] text-white hover:bg-[#162033] min-w-[44px]"
                          onClick={() => exportarPDF(r)}
                          title="Exportar PDF"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          <span className="hidden md:inline">PDF</span>
                        </Button>
                        <a
                          href="/simuladores"
                          className="inline-flex items-center h-8 px-3 rounded-xl border bg-background hover:bg-muted text-sm min-w-[44px]"
                          title="Abrir no simulador"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          <span className="hidden md:inline">Abrir</span>
                        </a>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => excluir(r)}
                          title="Excluir"
                          className="h-8 rounded-xl px-3 min-w-[44px]"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          <span className="hidden md:inline">Excluir</span>
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
    </div>
  );
}
