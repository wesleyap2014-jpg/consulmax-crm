// src/pages/PropostasProMax.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  Link2,
  Loader2,
  Search,
} from "lucide-react";

type SimRow = {
  code: number;
  created_at: string;
  lead_nome: string | null;
  lead_telefone: string | null;
  segmento: string | null;
  grupo: string | null;
  credito: number | null;
  prazo_venda: number | null;
  parcela_contemplacao: number | null;
  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;
  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;
  valor_categoria?: number | null;
  lance_ofertado_valor?: number | null;
  lance_embutido_valor?: number | null;
  lance_proprio_valor?: number | null;
  administradora?: string | null;
  admin?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  unidade_id?: string | null;
  unidade_nome?: string | null;
  [key: string]: unknown;
};

type ProMaxMetadata = {
  simulation_code: number;
  administradora?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  unidade_id?: string | null;
  unidade_nome?: string | null;
  status?: string | null;
  public_token?: string | null;
};

type ProposalEvent = {
  simulation_code: number | null;
  event_type: "generated" | "sent" | "opened" | "downloaded" | string;
  created_at: string;
};

type Proposal = SimRow & {
  promax?: ProMaxMetadata;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brMoney(value: unknown) {
  return onlyNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rowText(row: Proposal, keys: string[], fallback = "Nao informado") {
  for (const key of keys) {
    const value = row.promax?.[key as keyof ProMaxMetadata] ?? row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return fallback;
}

function creditoContratado(row: Proposal) {
  return onlyNumber(row.credito) || onlyNumber(row.valor_categoria) || onlyNumber(row.novo_credito);
}

function parcelaInicial(row: Proposal) {
  return onlyNumber(row.parcela_ate_1_ou_2) || onlyNumber(row.parcela_escolhida) || onlyNumber(row.parcela_contemplacao);
}

function demaisParcelas(row: Proposal) {
  return onlyNumber(row.parcela_demais) || onlyNumber(row.parcela_escolhida) || parcelaInicial(row);
}

function creditoLiquido(row: Proposal) {
  const novoCredito = onlyNumber(row.novo_credito);
  if (novoCredito > 0) return novoCredito;
  const contratado = creditoContratado(row);
  const embutido = onlyNumber(row.lance_embutido_valor);
  return Math.max(0, contratado - embutido);
}

function tipoLance(row: Proposal) {
  const proprio = onlyNumber(row.lance_proprio_valor);
  const embutido = onlyNumber(row.lance_embutido_valor);
  const total = onlyNumber(row.lance_ofertado_valor);
  if (proprio > 0 && embutido > 0) return "Proprio + embutido";
  if (embutido > 0) return "Embutido";
  if (proprio > 0) return "Proprio";
  if (total > 0) return "Lance informado";
  return "Sem lance";
}

function proposalLink(row: Proposal) {
  const token = row.promax?.public_token;
  if (token) return `${window.location.origin}/propostas-pro-max/publica/${token}`;
  return `${window.location.origin}/propostas-pro-max/${row.code}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

function isAfter(value: string | null | undefined, start: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start;
}

function KpiCard({ title, generated, sent, opened }: { title: string; generated: number; sent: number; opened: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-slate-500">
        <CalendarDays className="h-4 w-4" /> {title}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-xs text-slate-500">Geradas</div>
          <div className="text-xl font-black" style={{ color: C.navy }}>{generated}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Enviadas</div>
          <div className="text-xl font-black" style={{ color: C.ruby }}>{sent}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Abertas</div>
          <div className="text-xl font-black" style={{ color: C.gold }}>{opened}</div>
        </div>
      </div>
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <select
        className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="todos">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function PropostasProMax() {
  const navigate = useNavigate();
  const params = useParams();
  const activeCode = params.code ? Number(params.code) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Proposal[]>([]);
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [unitFilter, setUnitFilter] = useState("todos");
  const [sellerFilter, setSellerFilter] = useState("todos");
  const [adminFilter, setAdminFilter] = useState("todos");
  const [segmentFilter, setSegmentFilter] = useState("todos");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      const { data, error: rowsError } = await supabase
        .from("sim_simulations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (rowsError) {
        if (!alive) return;
        setError(rowsError.message);
        setLoading(false);
        return;
      }

      const codes = ((data || []) as SimRow[]).map((row) => row.code).filter(Boolean);
      const metadataByCode = new Map<number, ProMaxMetadata>();
      const eventsList: ProposalEvent[] = [];

      if (codes.length) {
        const metadataRes = await supabase
          .from("proposal_pro_max_metadata")
          .select("*")
          .in("simulation_code", codes);

        if (!metadataRes.error) {
          for (const item of (metadataRes.data || []) as ProMaxMetadata[]) {
            metadataByCode.set(item.simulation_code, item);
          }
        }

        const eventsRes = await supabase
          .from("proposal_pro_max_events")
          .select("simulation_code,event_type,created_at")
          .in("simulation_code", codes);

        if (!eventsRes.error) eventsList.push(...((eventsRes.data || []) as ProposalEvent[]));
      }

      if (!alive) return;

      setRows(((data || []) as SimRow[]).map((row) => ({ ...row, promax: metadataByCode.get(row.code) })));
      setEvents(eventsList);
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const units = new Set<string>();
    const sellers = new Set<string>();
    const admins = new Set<string>();
    const segments = new Set<string>();

    for (const row of rows) {
      units.add(rowText(row, ["unidade_nome", "unidade", "unit_name"], ""));
      sellers.add(rowText(row, ["vendedor_nome", "seller_name", "consultor_nome"], ""));
      admins.add(rowText(row, ["administradora", "admin", "admin_name"], ""));
      segments.add(row.segmento || "");
    }

    const clean = (set: Set<string>) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return {
      units: clean(units),
      sellers: clean(sellers),
      admins: clean(admins),
      segments: clean(segments),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = normalizeText(q);

    return rows.filter((row) => {
      const adminName = rowText(row, ["administradora", "admin", "admin_name"], "");
      const sellerName = rowText(row, ["vendedor_nome", "seller_name", "consultor_nome"], "");
      const unitName = rowText(row, ["unidade_nome", "unidade", "unit_name"], "");

      if (unitFilter !== "todos" && unitName !== unitFilter) return false;
      if (sellerFilter !== "todos" && sellerName !== sellerFilter) return false;
      if (adminFilter !== "todos" && adminName !== adminFilter) return false;
      if (segmentFilter !== "todos" && (row.segmento || "") !== segmentFilter) return false;

      if (!query) return true;

      const searchable = [
        row.code,
        row.lead_nome,
        row.lead_telefone,
        row.segmento,
        row.grupo,
        adminName,
        sellerName,
        unitName,
      ].map(normalizeText).join(" ");

      return searchable.includes(query);
    });
  }, [adminFilter, q, rows, segmentFilter, sellerFilter, unitFilter]);

  const activeRow = useMemo(() => rows.find((row) => row.code === activeCode) || null, [activeCode, rows]);
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.code)), [rows, selected]);
  const totalCredit = useMemo(() => filteredRows.reduce((sum, row) => sum + creditoContratado(row), 0), [filteredRows]);
  const selectedTotalCredit = useMemo(() => selectedRows.reduce((sum, row) => sum + creditoContratado(row), 0), [selectedRows]);

  const kpis = useMemo(() => {
    const ranges = [
      { key: "today", title: "Hoje", start: startOfToday() },
      { key: "week", title: "Semana", start: startOfWeek() },
      { key: "month", title: "Mes", start: startOfMonth() },
    ];

    return ranges.map((range) => ({
      ...range,
      generated: filteredRows.filter((row) => isAfter(row.created_at, range.start)).length,
      sent: events.filter((event) => event.event_type === "sent" && isAfter(event.created_at, range.start)).length,
      opened: events.filter((event) => event.event_type === "opened" && isAfter(event.created_at, range.start)).length,
    }));
  }, [events, filteredRows]);

  function toggleSelected(code: number) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]));
  }

  async function copyLink(row: Proposal) {
    const link = proposalLink(row);
    await navigator.clipboard?.writeText(link);
  }

  async function markSent(row: Proposal) {
    await supabase.from("proposal_pro_max_events").insert({
      simulation_code: row.code,
      event_type: "sent",
      channel: "manual",
    });
    setEvents((prev) => [...prev, { simulation_code: row.code, event_type: "sent", created_at: new Date().toISOString() }]);
  }

  async function generatePdf(targetRows: Proposal[], fileName: string) {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 54;

    doc.setFillColor(30, 41, 63);
    doc.rect(0, 0, pageWidth, 92, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(targetRows.length > 1 ? "Propostas Pro Max - Unificadas" : "Proposta Pro Max", 36, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 36, y + 18);

    y = 128;
    doc.setTextColor(30, 41, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Resumo: ${targetRows.length} proposta(s) | Credito total ${brMoney(targetRows.reduce((sum, row) => sum + creditoContratado(row), 0))}`, 36, y);
    y += 28;

    for (const row of targetRows) {
      if (y > 720) {
        doc.addPage();
        y = 54;
      }

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(36, y, pageWidth - 72, 104, 8, 8, "FD");

      doc.setTextColor(30, 41, 63);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`#${row.code} - ${row.lead_nome || "Lead nao informado"}`, 52, y + 24);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Segmento: ${row.segmento || "-"} | Administradora: ${rowText(row, ["administradora", "admin", "admin_name"])}`, 52, y + 43);
      doc.text(`Credito contratado: ${brMoney(creditoContratado(row))} | Credito liquido: ${brMoney(creditoLiquido(row))}`, 52, y + 62);
      doc.text(`Parcela inicial: ${brMoney(parcelaInicial(row))} | Demais parcelas: ${brMoney(demaisParcelas(row))}`, 52, y + 81);
      doc.text(`Tipo de lance: ${tipoLance(row)}`, 52, y + 100);
      y += 122;
    }

    doc.save(fileName);
  }

  async function generateUnifiedLink() {
    if (selectedRows.length < 2) return;

    const codes = selectedRows.map((row) => row.code);
    const payload = {
      title: `Unificacao ${codes.join(", ")}`,
      simulation_codes: codes,
      total_credito: selectedRows.reduce((sum, row) => sum + creditoContratado(row), 0),
      total_credito_liquido: selectedRows.reduce((sum, row) => sum + creditoLiquido(row), 0),
    };

    const { data, error: insertError } = await supabase
      .from("proposal_pro_max_unifications")
      .insert(payload)
      .select("id")
      .single();

    const link = insertError || !data?.id
      ? `${window.location.origin}/propostas-pro-max/unificar?codes=${codes.join(",")}`
      : `${window.location.origin}/propostas-pro-max/unificadas/${data.id}`;

    await navigator.clipboard?.writeText(link);
  }

  if (activeCode) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Button type="button" variant="outline" className="rounded-lg" onClick={() => navigate("/propostas-pro-max")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para lista
          </Button>

          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Ambiente Pro Max</div>
            <h1 className="mt-2 text-2xl font-black" style={{ color: C.navy }}>
              Proposta #{activeCode}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Este ambiente sera usado para os modelos visuais: resumo do cliente, sorteio x lance,
              estrategia recomendada, fluxo de parcelas, graficos e PDF premium.
            </p>

            {activeRow ? (
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Lead</div>
                  <div className="font-black" style={{ color: C.navy }}>{activeRow.lead_nome || "-"}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Credito contratado</div>
                  <div className="font-black" style={{ color: C.navy }}>{brMoney(creditoContratado(activeRow))}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Credito liquido</div>
                  <div className="font-black" style={{ color: C.ruby }}>{brMoney(creditoLiquido(activeRow))}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Tipo de lance</div>
                  <div className="font-black" style={{ color: C.navy }}>{tipoLance(activeRow)}</div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Proposta nao encontrada na lista carregada.
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[.14em]" style={{ color: C.ruby }}>Consulmax</div>
              <h1 className="mt-1 text-2xl font-black md:text-3xl" style={{ color: C.navy }}>Propostas Pro Max</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Lista inteligente das propostas salvas, com filtros, KPIs, links, PDF e unificacao.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:min-w-[360px]">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Propostas</div>
                <div className="text-xl font-black" style={{ color: C.navy }}>{filteredRows.length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Credito total</div>
                <div className="text-xl font-black" style={{ color: C.ruby }}>{brMoney(totalCredit)}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.key} title={kpi.title} generated={kpi.generated} sent={kpi.sent} opened={kpi.opened} />
          ))}
        </div>

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <Filter className="h-4 w-4" /> Filtros e busca
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <label className="space-y-1 text-xs font-semibold text-slate-600 md:col-span-2">
              <span>Buscar por numero, lead ou celular</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-10 rounded-lg pl-9"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Ex.: 123, Ismael, 699..."
                />
              </div>
            </label>
            <SelectFilter label="Unidade" value={unitFilter} onChange={setUnitFilter} options={options.units} />
            <SelectFilter label="Vendedor" value={sellerFilter} onChange={setSellerFilter} options={options.sellers} />
            <SelectFilter label="Administradora" value={adminFilter} onChange={setAdminFilter} options={options.admins} />
            <SelectFilter label="Segmento" value={segmentFilter} onChange={setSegmentFilter} options={options.segments} />
          </div>
        </section>

        {selectedRows.length > 0 && (
          <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-black" style={{ color: C.navy }}>{selectedRows.length} proposta(s) selecionada(s)</div>
              <div className="text-sm text-slate-600">Credito contratado selecionado: {brMoney(selectedTotalCredit)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-lg" onClick={generateUnifiedLink} disabled={selectedRows.length < 2}>
                <Link2 className="mr-2 h-4 w-4" /> Link unificado
              </Button>
              <Button
                type="button"
                className="rounded-lg text-white"
                style={{ background: C.ruby }}
                disabled={selectedRows.length < 2}
                onClick={() => generatePdf(selectedRows, `Propostas_Pro_Max_Unificadas_${selectedRows.map((row) => row.code).join("_")}.pdf`)}
              >
                <Download className="mr-2 h-4 w-4" /> PDF unificado
              </Button>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando propostas...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-700">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
                  <tr>
                    <th className="w-10 p-3 text-left"></th>
                    <th className="p-3 text-left">Numero</th>
                    <th className="p-3 text-left">Lead</th>
                    <th className="p-3 text-left">Segmento</th>
                    <th className="p-3 text-left">Administradora</th>
                    <th className="p-3 text-right">Credito contratado</th>
                    <th className="p-3 text-right">Parcela inicial</th>
                    <th className="p-3 text-right">Demais parcelas</th>
                    <th className="p-3 text-left">Tipo de lance</th>
                    <th className="p-3 text-right">Credito liquido</th>
                    <th className="p-3 text-center">Link</th>
                    <th className="p-3 text-center">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.code}
                      className="cursor-pointer border-t hover:bg-slate-50"
                      onClick={() => navigate(`/propostas-pro-max/${row.code}`)}
                    >
                      <td className="p-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={selected.includes(row.code)}
                          onChange={() => toggleSelected(row.code)}
                        />
                      </td>
                      <td className="p-3 font-black" style={{ color: C.navy }}>#{row.code}</td>
                      <td className="p-3">
                        <div className="font-semibold" style={{ color: C.navy }}>{row.lead_nome || "-"}</div>
                        <div className="text-xs text-slate-500">{row.lead_telefone || "-"}</div>
                      </td>
                      <td className="p-3">{row.segmento || "-"}</td>
                      <td className="p-3">{rowText(row, ["administradora", "admin", "admin_name"])}</td>
                      <td className="p-3 text-right font-semibold">{brMoney(creditoContratado(row))}</td>
                      <td className="p-3 text-right">{brMoney(parcelaInicial(row))}</td>
                      <td className="p-3 text-right">{brMoney(demaisParcelas(row))}</td>
                      <td className="p-3">{tipoLance(row)}</td>
                      <td className="p-3 text-right font-black" style={{ color: C.ruby }}>{brMoney(creditoLiquido(row))}</td>
                      <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => copyLink(row)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => markSent(row)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => generatePdf([row], `Proposta_Pro_Max_${row.code}.pdf`)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length && (
                    <tr>
                      <td className="p-6 text-center text-sm text-slate-500" colSpan={12}>
                        Nenhuma proposta encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4 text-xs text-slate-500 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-slate-600">
            <BarChart3 className="h-4 w-4" /> Proximas etapas
          </div>
          <p className="mt-2">
            Ao abrir uma linha, a proposta ja entra no ambiente Pro Max. Nas proximas fases, esse ambiente recebe
            os modelos visuais por estrategia, correcao de credito antes/depois da contemplacao e link publico rastreavel.
          </p>
        </section>
      </div>
    </div>
  );
}
