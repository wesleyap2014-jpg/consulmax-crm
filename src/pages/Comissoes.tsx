// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// icons
import {
  Loader2,
  Filter as FilterIcon,
  Settings,
  Save,
  DollarSign,
  FileText,
  PlusCircle,
  RotateCcw,
  Pencil,
  Trash2,
} from "lucide-react";

// recibo
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;
type UserRow = {
  id: UUID;
  auth_user_id?: UUID | null;
  nome: string | null;
  email: string | null;
  phone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  pix_key?: string | null;
  pix_kind?: string | null;
  role?: "admin" | "vendedor" | null;
};
type SimTable = { id: UUID; segmento: string; nome_tabela: string };
type Venda = {
  id: UUID;
  data_venda: string;
  vendedor_id: UUID;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  numero_proposta?: string | null;
  cliente_lead_id?: string | null;
  lead_id?: string | null;
};
type Commission = {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  sim_table_id: UUID | null;
  data_venda: string | null;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  base_calculo: number | null;
  percent_aplicado: number | null;
  valor_total: number | null;
  status: "a_pagar" | "pago" | "estorno";
  data_pagamento: string | null;
  recibo_url: string | null;
  comprovante_url: string | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
};
type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number | null;
  valor_recebido_admin: number | null;
  data_recebimento_admin: string | null;
  valor_pago_vendedor: number | null;
  data_pagamento_vendedor: string | null;
  recibo_vendedor_url: string | null;
  comprovante_pagto_url: string | null;
};
type CommissionRule = {
  vendedor_id: string;
  sim_table_id: string;
  percent_padrao: number; // fração
  fluxo_meses: number;
  fluxo_percentuais: number[]; // frações que somam 1
  obs: string | null;
};

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b ?? 0), 0);

const clamp0 = (n: number) => (n < 0 ? 0 : n);

const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function valorPorExtenso(n: number) {
  const u = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ext = (n0: number): string =>
    n0 < 20 ? u[n0] :
    n0 < 100 ? d[Math.floor(n0 / 10)] + (n0 % 10 ? " e " + u[n0 % 10] : "") :
    n0 === 100 ? "cem" :
    c[Math.floor(n0 / 100)] + (n0 % 100 ? " e " + ext(n0 % 100) : "");
  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);
  return `${ext(i)} ${i === 1 ? "real" : "reais"}${ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""}`;
}

/* ====== Estágio de pagamento (2 etapas) ====== */
function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  return flow.some(
    (f) => (Number(f.percentual) || 0) > 0 && !!f.data_pagamento_vendedor && (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

/* ============== Datas-base ============== */
const now = new Date();

/* Novos helpers de datas (gráficos semanais por quintas-feiras) */
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function getThursdaysOfMonth(year: number, month: number): Date[] {
  const lastDay = endOfMonth(new Date(year, month, 1));
  const thursdays: Date[] = [];
  let d = new Date(year, month, 1);
  while (d.getDay() !== 4) d = new Date(year, month, d.getDate() + 1);
  while (d <= lastDay) {
    thursdays.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    d = new Date(year, month, d.getDate() + 7);
  }
  return thursdays;
}
function getWeeklyIntervalsByThursdays(year: number, month: number): Array<{ start: Date; end: Date }> {
  const thursdays = getThursdaysOfMonth(year, month);
  const eom = endOfMonth(new Date(year, month, 1));
  if (thursdays.length === 0) return [{ start: new Date(year, month, 1), end: eom }];
  const intervals: Array<{ start: Date; end: Date }> = [];
  for (let i = 0; i < thursdays.length; i++) {
    const start = thursdays[i];
    const end =
      i < thursdays.length - 1
        ? new Date(thursdays[i + 1].getFullYear(), thursdays[i + 1].getMonth(), thursdays[i + 1].getDate() - 1)
        : eom;
    intervals.push({
      start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
    });
  }
  return intervals;
}
function addMonths(dateISO?: string | null, months?: number | null): Date | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  if (!isFinite(d.getTime())) return null;
  const m = Math.max(0, months ?? 0);
  return new Date(d.getFullYear(), d.getMonth() + m, d.getDate());
}

/* ============== Projeções (Previsto x Pago) ============== */
type ProjSeries = { labels: string[]; previstoBruto: number[]; pagoBruto: number[] };

function projectMonthlyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries {
  const year = new Date().getFullYear();
  const months: string[] = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const previsto: number[] = Array(12).fill(0);
  const pagos: number[] = Array(12).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda ?? undefined, (f.mes || 1) - 1);
      const expectedVal = f.valor_previsto ?? total * (f.percentual ?? 0);

      if (expectedDate && expectedDate.getFullYear() === year) {
        previsto[expectedDate.getMonth()] += expectedVal;
      }
      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getFullYear() === year) {
          pagos[pd.getMonth()] += f.valor_pago_vendedor ?? 0;
        }
      }
    }
  }
  return { labels: months, previstoBruto: previsto, pagoBruto: pagos };
}

function projectWeeklyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries & {
  intervals: Array<{ start: Date; end: Date }>;
} {
  const year = now.getFullYear();
  const month = now.getMonth();
  const intervals = getWeeklyIntervalsByThursdays(year, month);

  const labels: string[] = intervals.map(({ start, end }, i) => {
    const s = `${String(start.getDate()).padStart(2,"0")}/${String(start.getMonth()+1).padStart(2,"0")}`;
    const e = `${String(end.getDate()).padStart(2,"0")}/${String(end.getMonth()+1).padStart(2,"0")}`;
    return `S${i+1} (${s}–${e})`;
  });

  const previsto: number[] = Array(intervals.length).fill(0);
  const pagos: number[] = Array(intervals.length).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda ?? undefined, (f.mes || 1) - 1);
      const expectedVal = f.valor_previsto ?? total * (f.percentual ?? 0);

      if (expectedDate && expectedDate.getFullYear() === year && expectedDate.getMonth() === month) {
        const idx = intervals.findIndex(iv => expectedDate.getTime() >= iv.start.getTime() && expectedDate.getTime() <= iv.end.getTime());
        if (idx >= 0) previsto[idx] += expectedVal;
      }
      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getFullYear() === year && pd.getMonth() === month) {
          const idx2 = intervals.findIndex(iv => pd.getTime() >= iv.start.getTime() && pd.getTime() <= iv.end.getTime());
          if (idx2 >= 0) pagos[idx2] += f.valor_pago_vendedor ?? 0;
        }
      }
    }
  }
  return { labels, previstoBruto: previsto, pagoBruto: pagos, intervals };
}

function projectAnnualFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries {
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i);
  const labels = years.map(y => String(y));
  const previsto: number[] = Array(years.length).fill(0);
  const pagos: number[] = Array(years.length).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda ?? undefined, (f.mes || 1) - 1);
      const expectedVal = f.valor_previsto ?? total * (f.percentual ?? 0);

      if (expectedDate) {
        const yi = years.indexOf(expectedDate.getFullYear());
        if (yi >= 0) previsto[yi] += expectedVal;
      }
      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        const yi2 = years.indexOf(pd.getFullYear());
        if (yi2 >= 0) pagos[yi2] += f.valor_pago_vendedor ?? 0;
      }
    }
  }
  return { labels, previstoBruto: previsto, pagoBruto: pagos };
}

/* ============== KPI & Totais (pago/previsto) ============== */
const impostoFrac = 0.05; // 5% default para KPI (pode ajustar se quiser)

function totalsInRangePaidOnly(rows: Array<Commission & { flow?: CommissionFlow[] }>, s: Date, e: Date) {
  const flowsPaidInRange: Array<{ brutoDaParcela: number; pagoBruto: number }> = [];
  for (const r of rows) {
    const totalComissao = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const dataPgISO = f.data_pagamento_vendedor || null;
      if (!dataPgISO) continue;
      const dataPg = new Date(dataPgISO + "T00:00:00");
      if (dataPg.getTime() < s.getTime() || dataPg.getTime() > e.getTime()) continue;
      const brutoParcelaPrev = f.valor_previsto ?? totalComissao * (f.percentual ?? 0);
      const pagoBruto = f.valor_pago_vendedor ?? 0;
      flowsPaidInRange.push({ brutoDaParcela: brutoParcelaPrev, pagoBruto });
    }
  }
  const totalBruta = sum(flowsPaidInRange.map((x) => x.brutoDaParcela));
  const totalLiquida = totalBruta * (1 - impostoFrac);
  const pagoLiquido = sum(flowsPaidInRange.map((x) => x.pagoBruto)) * (1 - impostoFrac);
  const pendente = clamp0(totalLiquida - pagoLiquido);
  const pct = totalLiquida > 0 ? (pagoLiquido / totalLiquida) * 100 : 0;
  return { totalBruta, totalLiquida, pagoLiquido, pendente, pct };
}

function totalsInRangePaidAndProjected(rows: Array<Commission & { flow?: CommissionFlow[] }>, s: Date, e: Date) {
  let totalPrevistoBruto = 0;
  let totalPagoBruto = 0;
  for (const r of rows) {
    const totalComissao = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda ?? undefined, (f.mes || 1) - 1);
      const previstoBruto = f.valor_previsto ?? totalComissao * (f.percentual ?? 0);
      if (expectedDate && expectedDate.getTime() >= s.getTime() && expectedDate.getTime() <= e.getTime()) {
        totalPrevistoBruto += previstoBruto;
      }
      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getTime() >= s.getTime() && pd.getTime() <= e.getTime()) {
          totalPagoBruto += f.valor_pago_vendedor ?? 0;
        }
      }
    }
  }
  const totalLiquida = totalPrevistoBruto * (1 - impostoFrac);
  const pagoLiquido = totalPagoBruto * (1 - impostoFrac);
  const pendente = clamp0(totalLiquida - pagoLiquido);
  const pct = totalLiquida > 0 ? (pagoLiquido / totalLiquida) * 100 : 0;
  return { totalBruta: totalPrevistoBruto, totalLiquida, pagoLiquido, pendente, pct };
}

/* ========================= Componentes de UI ========================= */
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Donut({
  paid,
  pending,
  label,
  hoverPaidText,
  hoverPendText,
}: {
  paid: number;
  pending: number;
  label: string;
  hoverPaidText?: string;
  hoverPendText?: string;
}) {
  const total = Math.max(0.0001, paid + pending);
  const paidFrac = paid / total;
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const paidLen = c * paidFrac;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2}
          cy={size/2}
          r={r}
          stroke="#1E293F"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${paidLen} ${c - paidLen}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="16" fill="#111827">
          {(paidFrac * 100).toFixed(0)}%
        </text>
      </svg>
      <div className="text-xs space-y-1">
        <div><span className="inline-block w-3 h-3 mr-2 rounded-sm" style={{background:"#1E293F"}}></span>{hoverPaidText || `Pago ${BRL(paid)}`}</div>
        <div><span className="inline-block w-3 h-3 mr-2 rounded-sm" style={{background:"#A11C27"}}></span>{hoverPendText || `A pagar ${BRL(pending)}`}</div>
        <div className="text-gray-500 mt-1">{label}</div>
      </div>
    </div>
  );
}

function LineChart({
  labels,
  series,
  height = 220,
  formatY = (v: number) => BRL(v),
}: {
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const [hover, setHover] = useState<{ si: number; pi: number } | null>(null);
  const palette = ["#1E293F", "#A11C27", "#B5A573", "#1E40AF", "#047857"];
  const width = 760;
  const pad = { top: 12, right: 16, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxY = useMemo(() => {
    const all = series.flatMap((s) => s.data);
    const m = Math.max(1, ...all);
    const pow = Math.pow(10, String(Math.floor(m)).length - 1);
    return Math.ceil(m / pow) * pow;
  }, [series]);

  const xStep = innerW / Math.max(1, labels.length - 1);
  const yScale = (v: number) => innerH - (v / maxY) * innerH;

  const pointsFor = (s: number[]) =>
    s.map((v, i) => [pad.left + i * xStep, pad.top + yScale(v)] as const);

  const nearestPoint = (mx: number) => {
    const xi = Math.round((mx - pad.left) / xStep);
    return Math.min(Math.max(xi, 0), labels.length - 1);
  };

  const hovered = hover
    ? { label: labels[hover.pi], items: series.map((s) => s.data[hover.pi] ?? 0) }
    : null;

  return (
    <div className="relative rounded-xl border bg-white p-3">
      <svg
        width={width}
        height={height}
        className="block"
        onMouseLeave={() => setHover(null)}
      >
        {/* grid */}
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = pad.top + innerH * (1 - t);
            const val = maxY * t;
            return (
              <g key={i}>
                <line x1={pad.left} x2={pad.left + innerW} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                <text x={pad.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="#6b7280">
                  {formatY(val)}
                </text>
              </g>
            );
          })}
          <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#e5e7eb" />
          {labels.map((lb, i) => {
            const x = pad.left + i * xStep;
            return (
              <text key={i} x={x} y={pad.top + innerH + 18} fontSize="11" textAnchor="middle" fill="#6b7280">
                {lb}
              </text>
            );
          })}
        </g>

        {/* series */}
        {series.map((s, si) => {
          const pts = pointsFor(s.data);
          const d = pts.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(" ");
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={palette[si % palette.length]} strokeWidth={2} />
              {pts.map(([x, y], pi) => (
                <circle key={pi} cx={x} cy={y} r={hover && hover.si === si && hover.pi === pi ? 4 : 2.5} fill="#fff" stroke={palette[si % palette.length]} strokeWidth={2} />
              ))}
            </g>
          );
        })}

        {/* hover col */}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            const mx = e.clientX - box.left;
            const pi = nearestPoint(mx);
            setHover({ si: 0, pi });
          }}
        />
        {hover && (
          <line
            x1={pad.left + hover.pi * xStep}
            x2={pad.left + hover.pi * xStep}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="#9ca3af"
            strokeDasharray="4 4"
          />
        )}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s, si) => (
          <div className="flex items-center gap-2 text-sm" key={si}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ["#1E293F","#A11C27","#B5A573","#1E40AF","#047857"][si % 5] }} />
            <span className="text-gray-700">{s.name}</span>
          </div>
        ))}
      </div>

      {hover && hovered && (
        <div
          className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow"
          style={{
            left: Math.min(width - 180, Math.max(8, 56 + hover.pi * xStep - 60)),
            top: 8,
          }}
        >
          <div className="mb-1 font-semibold text-gray-800">{hovered.label}</div>
          <div className="space-y-1">
            {hovered.items.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1 text-gray-600">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ["#1E293F","#A11C27","#B5A573","#1E40AF","#047857"][i % 5] }} />
                  {series[i]?.name ?? `Série ${i + 1}`}
                </span>
                <span className="tabular-nums">{formatY(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
  /* Filtros */
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  /* Bases */
  const [users, setUsers] = useState<UserRow[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

  /* Memos */
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const usersByAuth = useMemo(() => {
    const m: Record<string, UserRow> = {};
    users.forEach((u) => { if (u.auth_user_id) m[u.auth_user_id] = u; });
    return m;
  }, [users]);

  /* Dados */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* Regras */
  const [openRules, setOpenRules] = useState(false);
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20"); // UI em pontos percentuais
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [rulePercentuais, setRulePercentuais] = useState<string[]>(["100,00"]);
  const [ruleObs, setRuleObs] = useState<string>("");

  const [ruleRows, setRuleRows] = useState<Array<CommissionRule & { segmento?: string; nome_tabela?: string; administradora?: string }>>([]);

  /* Pagamento */
  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string | null>(null);
  const [payFlow, setPayFlow] = useState<CommissionFlow[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");
  const [payDefaultTab, setPayDefaultTab] = useState<"pendentes" | "pagas" | "selecionar" | "arquivos">("selecionar");

  /* Recibo */
  const [reciboDate, setReciboDate] = useState<string>(toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("5");
  const [reciboVendorId, setReciboVendorId] = useState<string>("all");

  /* Expand/Collapse */
  const [showPaid, setShowPaid] = useState(true);
  const [showUnpaid, setShowUnpaid] = useState(true);
  const [showVendasSem, setShowVendasSem] = useState(false);

  /* Busca/paginação - Comissões Pagas */
  const [paidSearch, setPaidSearch] = useState<string>("");
  const [paidPage, setPaidPage] = useState<number>(1);
  const pageSize = 10;

  /* ================== Auth & Permissões ================== */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "vendedor">("vendedor");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user || null;
        setAuthUserId(u?.id ?? null);

        // tenta descobrir via tabela public.users
        if (u?.id) {
          const { data: urows } = await supabase.from("users").select("id,auth_user_id,role").eq("auth_user_id", u.id).limit(1);
          const role = (urows?.[0]?.role as any) || "vendedor";
          setUserRole(role === "admin" ? "admin" : "vendedor");
        }
      } catch (e) {
        console.warn("[auth] getUser falhou:", e);
      }
    })();
  }, []);

  const currentUserId = useMemo(() => {
    if (!authUserId) return null;
    return usersByAuth[authUserId]?.id ?? null;
  }, [authUserId, usersByAuth]);

  function isOwnerByVenda(v: Venda) {
    const vend = v.vendedor_id || null;
    return !!currentUserId && !!vend && currentUserId === vend;
  }
  function isOwnerByCommission(c: Commission) {
    const vend = c.vendedor_id || null;
    return !!currentUserId && !!vend && currentUserId === vend;
  }

  const can = {
    viewAll: userRole === "admin",
    manageRules: userRole === "admin",
    generateForVenda: (v: Venda) => userRole === "admin" || isOwnerByVenda(v),
    payCommission: (c: Commission) => userRole === "admin",
    returnCommission: (c: Commission) => userRole === "admin",
    showRowVenda: (v: Venda) => userRole === "admin" || isOwnerByVenda(v),
    showRowCommission: (c: Commission) => userRole === "admin" || isOwnerByCommission(c),
  };

  /* ================== Bases ================== */
  useEffect(() => {
    async function loadBases() {
      setLoading(true);
      try {
        const { data: usersData } = await supabase.from("users").select("*").order("nome", { ascending: true });
        setUsers(usersData || []);

        const { data: simData } = await supabase.from("sim_tables").select("*").order("nome_tabela", { ascending: true });
        setSimTables(simData || []);

        // Montar clientesMap (lead_id -> nome)
        const { data: leads } = await supabase.from("leads").select("id, nome");
        const m: Record<string, string> = {};
        (leads || []).forEach((l: any) => { m[l.id] = l.nome; });
        setClientesMap(m);
      } catch (e) {
        console.error("Erro ao carregar bases:", e);
      } finally {
        setLoading(false);
      }
    }
    loadBases();
  }, []);

  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id];
    return u?.nome?.trim() || u?.email?.trim() || id;
  };

  /* ================== Fetch principal ================== */
  async function fetchData() {
    setLoading(true);
    try {
      let qb = supabase.from("commissions").select("*");
      if (status !== "all") qb = qb.eq("status", status);
      if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
      if (segmento !== "all") qb = qb.eq("segmento", segmento);
      if (tabela !== "all") qb = qb.eq("tabela", tabela);
      const { data: comms } = await qb.order("data_venda", { ascending: false });

      const ids = (comms || []).map((c) => c.id);
      const { data: flows } = await supabase
        .from("commission_flow")
        .select("*")
        .in("commission_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .order("mes", { ascending: true });

      const flowBy: Record<string, CommissionFlow[]> = {};
      (flows || []).forEach((f) => {
        if (!flowBy[f.commission_id]) flowBy[f.commission_id] = [];
        if (!flowBy[f.commission_id].some((x) => x.mes === f.mes)) flowBy[f.commission_id].push(f as CommissionFlow);
      });

      // clientes extras
      let vendasExtras: Record<string, { clienteId?: string; numero_proposta?: string | null; cliente_nome?: string | null }> = {};
      if (comms && comms.length) {
        const { data: vendas } = await supabase
          .from("vendas")
          .select("id, numero_proposta, cliente_lead_id, lead_id")
          .in("id", comms.map((c: any) => c.venda_id));
        const cliIds = Array.from(new Set((vendas || []).map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
        let nomes: Record<string, string> = {};
        if (cliIds.length) {
          const { data: cli } = await supabase.from("leads").select("id, nome").in("id", cliIds);
          (cli || []).forEach((c: any) => { nomes[c.id] = c.nome || ""; });
        }
        (vendas || []).forEach((v) => {
          const cid = v.lead_id || v.cliente_lead_id || undefined;
          vendasExtras[v.id] = { clienteId: cid, numero_proposta: v.numero_proposta || null, cliente_nome: cid ? (nomes[cid] || null) : null };
        });
      }

      setRows(
        (comms || []).map((c: any) => ({
          ...(c as Commission),
          flow: flowBy[c.id] || [],
          cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
          numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
        })),
      );

      // vendas sem comissão
      const { data: vendasPeriodo } = await supabase
        .from("vendas")
        .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
        .order("data_venda", { ascending: false });
      const { data: commVendaIds } = await supabase.from("commissions").select("venda_id");
      const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
      const vendasFiltered = (vendasPeriodo || []).filter((v) => !hasComm.has(v.id));
      const vendasFiltered2 = vendasFiltered.filter((v) => {
        const vendCanon = v.vendedor_id;
        return (
          (vendedorId === "all" || vendCanon === vendedorId) &&
          (segmento === "all" || v.segmento === segmento) &&
          (tabela === "all" || (v.tabela || "") === tabela)
        );
      });
      // filtro de permissão para vendedor
      const vendasPerm = vendasFiltered2.filter((v) => can.showRowVenda(v));
      setVendasSemCom(vendasPerm as Venda[]);

      // reconcile status por parcelas (auto)
      setRows((prev) => {
        const withFix = prev.map((r) => {
          const relevant = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
          const allPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);
          if (allPaid && r.status !== "pago") {
            const lastDate = r.data_pagamento || (relevant[relevant.length - 1]?.data_pagamento_vendedor ?? null);
            supabase
              .from("commissions")
              .update({ status: "pago", data_pagamento: lastDate })
              .eq("id", r.id)
              .then(({ error }) => {
                if (error) console.warn("[reconcile] commissions.update falhou:", error.message);
              });
            return { ...r, status: "pago", data_pagamento: lastDate };
          }
          return r;
        });
        return withFix;
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchData(); // eslint-disable-next-line
  }, [vendedorId, status, segmento, tabela, userRole, currentUserId]);

 /* ======== Regras ======== */
<Dialog open={openRules} onOpenChange={setOpenRules}>
  <DialogContent className="max-w-6xl">
    <DialogHeader>
      <DialogTitle>Regras de Comissão</DialogTitle>
    </DialogHeader>

    {/* Cabeçalho do formulário */}
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div>
        <Label>Vendedor</Label>
        <Select value={ruleVendorId ?? ""} onValueChange={(v) => setRuleVendorId(v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nome?.trim() || u.email?.trim() || u.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Tabela (SimTables)</Label>
        <Select value={ruleSimTableId ?? ""} onValueChange={(v) => setRuleSimTableId(v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {simTables.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.segmento} — {t.nome_tabela}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>% Padrão (ex.: 1,20 = 1,20%)</Label>
        <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" />
      </div>
      <div>
        <Label>Nº de meses do fluxo</Label>
        <Input
          type="number"
          min={1}
          max={36}
          value={String(ruleMeses)}
          onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))}
        />
      </div>
    </div>

    <hr className="my-4" />

    {/* Fluxo */}
    <div className="space-y-2">
      <Label>
        Fluxo do pagamento (M1..Mn) — digite 100% no total <b>ou</b> uma soma igual ao % Padrão
      </Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3 border rounded-md bg-white">
        {Array.from({ length: Math.max(1, ruleMeses || 1) }).map((_, i) => (
          <Input
            key={i}
            value={rulePercentuais[i] ?? "0,00"}
            onChange={(e) => {
              const arr = [...rulePercentuais];
              arr[i] = e.target.value;
              setRulePercentuais(arr);
            }}
            placeholder="0,33"
          />
        ))}
      </div>
      <div className="text-xs text-gray-600 mt-1">
        Soma do fluxo:{" "}
        <b>
          {(() => {
            const soma = (rulePercentuais || []).reduce((a, b) => {
              const v = parseFloat(String(b || "0").replace(",", ".")) || 0;
              return a + v;
            }, 0);
            return soma.toFixed(2).replace(".", ",");
          })()}{" "}
          (aceitas: 100,00 ou % padrão {String(rulePercent || "0,00")})
        </b>
      </div>
    </div>

    <hr className="my-4" />

    {/* Observações + Ações */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
      <div className="lg:col-span-2">
        <Label>Observações</Label>
        <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
      </div>
      <div className="flex gap-2">
        <Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button>
        <Button
          variant="outline"
          onClick={() => {
            setRuleSimTableId("");
            setRulePercent("1,20");
            onChangeMeses(1);
            setRulePercentuais(["100,00"]);
            setRuleObs("");
          }}
        >
          Limpar
        </Button>
      </div>
    </div>

    <hr className="my-4" />

    {/* Lista de regras */}
    <div className="border rounded-md max-h-[45vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="p-2 text-left">Segmento</th>
            <th className="p-2 text-left">Administradora</th>
            <th className="p-2 text-left">Tabela</th>
            <th className="p-2 text-right">% Padrão</th>
            <th className="p-2 text-left">Fluxo</th>
            <th className="p-2 text-left">Ação</th>
          </tr>
        </thead>
        <tbody>
          {(!ruleRows || ruleRows.length === 0) && (
            <tr>
              <td colSpan={6} className="p-3 text-gray-500">
                Nenhuma regra cadastrada para o vendedor selecionado.
              </td>
            </tr>
          )}
          {ruleRows.map((r) => (
            <tr key={`${r.vendedor_id}-${r.sim_table_id}`} className="border-b">
              <td className="p-2">{r.segmento || "—"}</td>
              <td className="p-2">{r.administradora || "—"}</td>
              <td className="p-2">{r.nome_tabela || "—"}</td>
              <td className="p-2 text-right">
                {(((r.percent_padrao ?? 0) * 100).toFixed(2)).replace(".", ",")}%
              </td>
              <td className="p-2">
                {(r.fluxo_percentuais || [])
                  .map((p, i) => `M${i + 1}: ${((p || 0) * 100).toFixed(2).replace(".", ",")}%`)
                  .join(" · ")}
              </td>
              <td className="p-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => loadRuleToForm(r)}>
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteRule(r.vendedor_id, r.sim_table_id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Excluir
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <DialogFooter className="mt-4">
      <div className="text-xs text-gray-500">
        Dica: a soma do fluxo pode ser 100% <i>ou</i> igual ao % Padrão para facilitar cadastros em parcelas.
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>
{/* ======== /Regras ======== */}
</div> {/* <- fecha o container principal da página */}

  /* ================== Garantir Fluxo ================== */
  async function ensureFlowForCommission(c: Commission): Promise<CommissionFlow[]> {
    const { data: existing } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    if (existing && existing.length > 0) return existing as CommissionFlow[];

    let meses = 1;
    let percentuais: number[] = [1];
    if (c.vendedor_id && c.sim_table_id) {
      const { data: rule } = await supabase
        .from("commission_rules")
        .select("fluxo_meses, fluxo_percentuais")
        .eq("vendedor_id", c.vendedor_id)
        .eq("sim_table_id", c.sim_table_id)
        .limit(1);
      if (rule && rule[0]) {
        const soma = (rule[0].fluxo_percentuais || []).reduce((a: number, b: number) => a + (b || 0), 0);
        if (rule[0].fluxo_meses > 0 && Math.abs(soma - 1) < 1e-6) {
          meses = rule[0].fluxo_meses;
          percentuais = rule[0].fluxo_percentuais;
        }
      }
    }

    const valorTotal = c.valor_total ?? ((c.base_calculo ?? 0) * (c.percent_aplicado ?? 0));
    const inserts = percentuais.map((p, idx) => ({
      commission_id: c.id,
      mes: idx + 1,
      percentual: p,
      valor_previsto: Math.round((valorTotal * p) * 100) / 100,
      valor_recebido_admin: null,
      data_recebimento_admin: null,
      valor_pago_vendedor: 0,
      data_pagamento_vendedor: null,
      recibo_vendedor_url: null,
      comprovante_pagto_url: null,
    }));

    const { error } = await supabase.from("commission_flow").insert(inserts as any[]);
    if (error) console.warn("[ensureFlowForCommission] erro:", error.message);

    const { data: created } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    return (created || []) as CommissionFlow[];
  }

  /* ================== Pagamento ================== */
  async function openPaymentFor(c: Commission) {
    setPayCommissionId(c.id);

    let { data } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    if (!data || data.length === 0) data = await ensureFlowForCommission(c) as any;

    const arr = (data || []).map((f: any) => ({ ...f, _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0) }));
    const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
    arr.forEach((f: any) => uniq.set(f.mes, f));
    const finalArr = Array.from(uniq.values());

    setPayFlow(finalArr as any);

    const pre = Object.fromEntries(finalArr.filter((f) => (Number(f.percentual) || 0) > 0 && (Number(f.valor_pago_vendedor) || 0) === 0).map((f) => [String(f.id), true]));
    setPaySelected(pre);

    const registered = hasRegisteredButUnpaid(finalArr as any);
    setPayDefaultTab(registered ? "arquivos" : "selecionar");

    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  async function uploadToBucket(file: File, commissionId: string) {
    const path = `${commissionId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
    if (error) { alert("Falha ao enviar arquivo: " + error.message); return null; }
    return data?.path || null;
  }
  async function getSignedUrl(path: string | null | undefined) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("comissoes").createSignedUrl(path, 60 * 10);
    if (error) { console.warn("Signed URL error:", error.message); return null; }
    return (data as any)?.signedUrl || null;
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    // uploads
    let reciboPath: string | null = null, compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId || "misc");
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId || "misc");

    const candidates = (payFlow || []).filter((f) => (Number(f.percentual) || 0) > 0);
    let selected = candidates.filter((f) => paySelected[String(f.id)]);

    if (!selected.length && payload.data_pagamento_vendedor) {
      selected = candidates.filter((f) => (f.data_pagamento_vendedor || "") === payload.data_pagamento_vendedor);
    }
    if (!selected.length) {
      const unpaid = candidates.filter((f) => (Number(f.valor_pago_vendedor) || 0) === 0);
      if (unpaid.length === 1) selected = unpaid;
      else if (unpaid.length > 0) selected = [unpaid[0]];
    }
    if (!selected.length) { alert("Selecione pelo menos uma parcela (ou informe a data/arquivos)."); return; }

    for (const f of selected) {
      const { error } = await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor: payload.data_pagamento_vendedor || f.data_pagamento_vendedor || toDateInput(new Date()),
          valor_pago_vendedor: payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : (f.valor_pago_vendedor ?? 0),
          recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
          comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
        })
        .eq("id", f.id);
      if (error) { alert("Falha ao atualizar parcela: " + error.message); return; }
    }

    // Recalcular status da comissão
    const { data: fresh } = await supabase.from("commission_flow").select("*").eq("commission_id", payCommissionId).order("mes", { ascending: true });
    const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
    const isAllPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

    const { error: updErr } = await supabase.from("commissions").update({
      status: isAllPaid ? "pago" : "a_pagar",
      data_pagamento: isAllPaid ? (payload.data_pagamento_vendedor || toDateInput(new Date())) : null,
    }).eq("id", payCommissionId);
    if (updErr) {
      console.warn("[commissions.update] falhou:", updErr.message);
      alert("A comissão foi paga, mas não consegui atualizar o status no banco.");
    }

    const uniq = new Map<number, CommissionFlow>();
    (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
    const freshArr = Array.from(uniq.values()) as CommissionFlow[];
    setPayFlow(freshArr);
    setRows((prev) =>
      prev.map((r) =>
        r.id === payCommissionId
          ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" }
          : r
      )
    );

    if (isAllPaid) {
      setShowPaid(true);
      setStatus("pago");
    }

    setOpenPay(false);
    fetchData();
  }

  /* ============== Recibo: numeração NNN-AAAA (tabela public.receipt_counters) ============== */
  async function getNextReceiptNumber(): Promise<{ code: string; seq: number; year: number }> {
    const year = new Date(reciboDate || new Date()).getFullYear();

    // pega maior seq global (qualquer ano)
    const { data: rows } = await supabase
      .from("receipt_counters")
      .select("year,seq")
      .order("seq", { ascending: false })
      .limit(1);

    const lastSeq = rows?.[0]?.seq ?? 0;
    const nextSeq = lastSeq + 1;

    // upsert na linha do ano atual com a nova seq (sem reset)
    await supabase
      .from("receipt_counters")
      .upsert({ year, seq: nextSeq }, { onConflict: "year" });

    const code = `${String(nextSeq).padStart(3, "0")}-${year}`;
    return { code, seq: nextSeq, year };
  }

  async function downloadReceiptPDFPorData() {
    const impostoPct = (parseFloat(String(reciboImpostoPct).replace(",", ".")) / 100) || 0;
    const dataRecibo = reciboDate;
    const vendedorSel = reciboVendorId === "all" ? null : reciboVendorId;

    const { data: flows } = await supabase.from("commission_flow").select("*").eq("data_pagamento_vendedor", dataRecibo);
    if (!flows || !flows.length) return alert("Não há parcelas pagas na data selecionada.");

    const byCommission: Record<string, CommissionFlow[]> = {};
    flows.forEach((f: any) => {
      if (!byCommission[f.commission_id]) byCommission[f.commission_id] = [];
      if (!byCommission[f.commission_id].some((x) => x.mes === f.mes)) byCommission[f.commission_id].push(f);
    });

    const commIds = Object.keys(byCommission);
    const { data: comms } = await supabase.from("commissions").select("*").in("id", commIds);
    const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id)));
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, valor_venda, numero_proposta, cliente_lead_id, lead_id, vendedor_id")
      .in("id", vendaIds);
    const commsFiltradas = (comms || []).filter((c: any) => !vendedorSel || c.vendedor_id === vendedorSel);
    if (!commsFiltradas.length) return alert("Sem parcelas para o vendedor selecionado nessa data.");

    const clienteIds = Array.from(new Set((vendas || []).map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
    const nomesCli: Record<string, string> = {};
    if (clienteIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
      (cli || []).forEach((c: any) => { nomesCli[c.id] = c.nome || ""; });
    }

    const vendedorUsado = vendedorSel ?? commsFiltradas[0].vendedor_id;
    const vendInfo = usersById[vendedorUsado] || ({} as any);

    // numeração ininterrupta
    const next = await getNextReceiptNumber();
    const numeroRecibo = next.code;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("RECIBO DE COMISSÃO", 297, 40, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Recibo Nº: ${numeroRecibo}`, 40, 60);
    doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 40, 74);

    let y = 92;
    [
      "Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03",
      "Endereço: Av. Menezes Filho, 3171, Casa Preta, Ji-Paraná/RO. CEP: 76907-532",
    ].forEach((l) => { doc.text(l, 40, y); y += 14; });

    const recebedor = [
      `Nome do Recebedor: ${userLabel(vendedorUsado)}`,
      `CPF/CNPJ: —`,
      `Endereço: ${[vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`].filter(Boolean).join(", ") || "—"}`,
    ];
    y += 10; recebedor.forEach((l) => { doc.text(l, 40, y); y += 14; });
    y += 6; doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, y); y += 16;

    const head = [["CLIENTE","PROPOSTA","PARCELA","R$ VENDA","COM. BRUTA","IMPOSTOS","COM. LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    commsFiltradas.forEach((c: any) => {
      const v = (vendas || []).find((x) => x.id === c.venda_id);
      const clienteId = v?.lead_id || v?.cliente_lead_id || "";
      const clienteNome = clienteId ? nomesCli[clienteId] || "—" : "—";
      const vendaValor = v?.valor_venda || 0;
      const parcelas = Array.from(new Map((byCommission[c.id] || []).map((p) => [p.mes, p])).values());
      parcelas.forEach((p) => {
        const comBruta = (c.percent_aplicado || 0) * (p.percentual || 0) * vendaValor;
        const impostos = comBruta * impostoPct;
        const liquida = comBruta - impostos; totalLiquido += liquida;
        body.push([clienteNome, v?.numero_proposta || "—", `M${p.mes}`, BRL(vendaValor), BRL(comBruta), BRL(impostos), BRL(liquida)]);
      });
    });

    autoTable(doc, { startY: y, head, body, styles: { font: "helvetica", fontSize: 10 }, headStyles: { fillColor: [30, 41, 63] } });
    const endY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`, 40, endY);
    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
    doc.text(`Chave PIX do pagamento: ${vendInfo?.pix_key || "—"}`, 40, endY + 34);
    const signY = endY + 100;
    doc.line(40, signY, 320, signY);
    doc.text(`${userLabel(vendedorUsado)}`, 40, signY + 14);
    doc.save(`recibo_${dataRecibo}_${userLabel(vendedorUsado)}.pdf`);
  }

  /* ============== Listas auxiliares (pagos) ============== */
  const rowsAPagar = useMemo(() => rows.filter((r) => r.status === "a_pagar" && can.showRowCommission(r)), [rows, userRole, currentUserId]);

  const pagosFlat = useMemo(() => {
    const list: Array<{ flow: CommissionFlow; comm: Commission }> = [];
    rows.forEach((r) =>
      (r.flow || []).forEach((f) => {
        if ((f.valor_pago_vendedor ?? 0) > 0 && can.showRowCommission(r)) list.push({ flow: f, comm: r });
      })
    );
    return list.sort((a, b) =>
      (b.flow.data_pagamento_vendedor || "") > (a.flow.data_pagamento_vendedor || "") ? 1 : -1
    );
  }, [rows, userRole, currentUserId]);

  const pagosFiltered = useMemo(() => {
    const q = normalize(paidSearch);
    if (!q) return pagosFlat;
    return pagosFlat.filter(({ comm }) => {
      const cliente = normalize(comm.cliente_nome || "");
      const prop = normalize(comm.numero_proposta || "");
      return cliente.includes(q) || prop.includes(q);
    });
  }, [pagosFlat, paidSearch]);

  const totalPages = Math.max(1, Math.ceil(pagosFiltered.length / pageSize));
  const pageStart = (Math.min(Math.max(paidPage, 1), totalPages) - 1) * pageSize;
  const pagosPage = pagosFiltered.slice(pageStart, pageStart + pageSize);

  /* ========================= Render ========================= */
  return (
    <div className="p-4 space-y-4">
      {/* Filtros topo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="w-5 h-5" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Segmento</Label>
            <Select value={segmento} onValueChange={setSegmento}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.segmento))).filter(Boolean).map((seg) => (
                  <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.nome_tabela))).filter(Boolean).map((tab) => (
                  <SelectItem key={tab} value={tab}>{tab}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_pagar">A pagar</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="estorno">Estorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setOpenRules(true)}><Settings className="w-4 h-4 mr-1" /> Regras de Comissão</Button>
            <Button onClick={fetchData}><Loader2 className="w-4 h-4 mr-1" /> Atualizar</Button>
          </div>
        </CardContent>
      </Card>

      {/* ======= Relógios (Donuts) na ordem pedida ======= */}
      {(() => {
        // períodos
        const fiveYearsStart = new Date(now.getFullYear() - 4, 0, 1);
        const fiveYearsEnd = new Date(now.getFullYear(), 11, 31);
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = endOfMonth(monthStart);

        const range5y = totalsInRangePaidAndProjected(rows, fiveYearsStart, fiveYearsEnd);
        const rangeLY = totalsInRangePaidAndProjected(rows, lastYearStart, lastYearEnd);
        const rangeY = totalsInRangePaidAndProjected(rows, yearStart, yearEnd);
        const rangeM = totalsInRangePaidAndProjected(rows, monthStart, monthEnd);

        const vendedorAtual = vendedorId === "all" ? "Todos" : userLabel(vendedorId);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Últimos anos — {vendedorAtual}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Metric title="Total Bruto" value={BRL(range5y.totalBruta)} />
                  <Metric title="Recebido Líquido" value={BRL(range5y.pagoLiquido)} />
                  <Metric title="Pendente Líquido" value={BRL(range5y.pendente)} />
                </div>
                <Donut
                  paid={range5y.pagoLiquido}
                  pending={range5y.pendente}
                  label="Últimos anos"
                  hoverPaidText={`Pago no período: ${BRL(range5y.pagoLiquido)} — ${(range5y.pct || 0).toFixed(2).replace(".", ",")}%`}
                  hoverPendText={`A pagar no período: ${BRL(range5y.pendente)}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle>Ano anterior — {vendedorAtual}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Metric title="Total Bruto" value={BRL(rangeLY.totalBruta)} />
                  <Metric title="Recebido Líquido" value={BRL(rangeLY.pagoLiquido)} />
                  <Metric title="Pendente Líquido" value={BRL(rangeLY.pendente)} />
                </div>
                <Donut
                  paid={rangeLY.pagoLiquido}
                  pending={rangeLY.pendente}
                  label="Ano anterior"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle>No ano — {vendedorAtual}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Metric title="Total Bruto" value={BRL(rangeY.totalBruta)} />
                  <Metric title="Recebido Líquido" value={BRL(rangeY.pagoLiquido)} />
                  <Metric title="Pendente Líquido" value={BRL(rangeY.pendente)} />
                </div>
                <Donut paid={rangeY.pagoLiquido} pending={rangeY.pendente} label="Ano" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle>No mês — {vendedorAtual}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Metric title="Total Bruto" value={BRL(rangeM.totalBruta)} />
                  <Metric title="Recebido Líquido" value={BRL(rangeM.pagoLiquido)} />
                  <Metric title="Pendente Líquido" value={BRL(rangeM.pendente)} />
                </div>
                <Donut paid={rangeM.pagoLiquido} pending={rangeM.pendente} label="Mês" />
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ======= Gráficos de Linhas (na mesma ordem) ======= */}
      {(() => {
        const ann = projectAnnualFlows(rows);
        const mon = projectMonthlyFlows(rows);
        const wk = projectWeeklyFlows(rows);
        const lastYear = now.getFullYear() - 1;
        const labelsLY = mon.labels; // vamos usar mon para LY também mudando series (no preview não quebramos)
        return (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Últimos anos — Previsto × Pago (bruto)</CardTitle></CardHeader>
              <CardContent>
                <LineChart labels={ann.labels} series={[{ name: "Previsto", data: ann.previstoBruto }, { name: "Pago", data: ann.pagoBruto }]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle>Ano anterior — Previsto × Pago (bruto)</CardTitle></CardHeader>
              <CardContent>
                {/* Reaproveitamos mon.labels; em uma versão futura poderíamos calcular "mon do ano anterior" */}
                <LineChart labels={labelsLY} series={[{ name: `Previsto ${lastYear}`, data: mon.previstoBruto }, { name: `Pago ${lastYear}`, data: mon.pagoBruto }]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle>Ano atual — Previsto × Pago (bruto)</CardTitle></CardHeader>
              <CardContent>
                <LineChart labels={mon.labels} series={[{ name: "Previsto", data: mon.previstoBruto }, { name: "Pago", data: mon.pagoBruto }]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle>Mês atual (semanas por quinta) — Previsto × Pago (bruto)</CardTitle></CardHeader>
              <CardContent>
                <LineChart labels={wk.labels} series={[{ name: "Previsto", data: wk.previstoBruto }, { name: "Pago", data: wk.pagoBruto }]} />
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ======= KPIs resumão ======= */}
      {(() => {
        const vendasTotal = sum(rows.map((r) => r.valor_venda ?? r.base_calculo ?? 0));
        const comBruta = sum(rows.map((r) => r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0))));
        const comPagaBruta = sum(rows.flatMap((r) => (r.flow || []).map((f) => f.valor_pago_vendedor ?? 0)));
        const comLiquida = comBruta * (1 - impostoFrac);
        const comPaga = comPagaBruta * (1 - impostoFrac);
        const comPendente = clamp0(comLiquida - comPaga);
        return (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Card><CardHeader className="pb-1"><CardTitle>💰 Vendas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(vendasTotal)}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(comBruta)}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(comLiquida)}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle>📤 Comissão Paga (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(comPaga)}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle>⏳ Pendente (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(comPendente)}</CardContent></Card>
          </div>
        );
      })()}

      {/* ======= Vendas sem comissão ======= */}
      {can.viewAll && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Vendas sem comissão (todos os registros + filtros)</span>
              <div className="flex items-center gap-2">
                {/* Exportar CSV REMOVIDO por pedido */}
                <Button size="sm" variant="outline" onClick={() => setShowVendasSem((v) => !v)}>
                  {showVendasSem ? "Ocultar" : "Expandir"}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          {showVendasSem && (
            <CardContent className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Nº Proposta</th>
                    <th className="p-2 text-left">Administradora</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasSemCom.length === 0 && <tr><td colSpan={9} className="p-3 text-gray-500">Sem pendências 🎉</td></tr>}
                  {vendasSemCom.map((v) => {
                    const clienteId = v.lead_id || v.cliente_lead_id || "";
                    return (
                      <tr key={v.id} className="border-b">
                        <td className="p-2">{formatISODateBR(v.data_venda)}</td>
                        <td className="p-2">{userLabel(v.vendedor_id)}</td>
                        <td className="p-2">{(clienteId && (clientesMap[clienteId]?.trim() as any)) || "—"}</td>
                        <td className="p-2">{v.numero_proposta || "—"}</td>
                        <td className="p-2">{v.administradora || "—"}</td>
                        <td className="p-2">{v.segmento || "—"}</td>
                        <td className="p-2">{v.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                        <td className="p-2">
                          <Button size="sm" onClick={() => {/* gerar comissão dessa venda (handler pode ser plugado aqui) */}} disabled={genBusy === v.id}>
                            {genBusy === v.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />}
                            Gerar Comissão
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>
      )}

      {/* ======= Detalhamento de Comissões (a pagar) ======= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões (a pagar)</span>
            <div className="flex items-center gap-3">
              {/* ORDEM PEDIDA: Vendedor > Data do Recibo > Imposto (%) Recibo > Ocultar */}
              <div>
                <Label>Vendedor</Label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do Recibo</Label>
                <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} className="w-[170px]" />
              </div>
              <div>
                <Label>Imposto (%) Recibo</Label>
                <Input value={reciboImpostoPct} onChange={(e) => setReciboImpostoPct(e.target.value)} className="w-24" />
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="outline" onClick={() => setShowUnpaid((v) => !v)}>
                  {showUnpaid ? "Ocultar" : "Expandir"}
                </Button>
              </div>
              <Button onClick={downloadReceiptPDFPorData}><FileText className="w-4 h-4 mr-1" /> Recibo</Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showUnpaid && (
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data</th><th className="p-2 text-left">Vendedor</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Nº Proposta</th><th className="p-2 text-left">Segmento</th><th className="p-2 text-left">Tabela</th><th className="p-2 text-right">Crédito</th><th className="p-2 text-right">% Comissão</th><th className="p-2 text-right">Valor Comissão</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Pagamento</th><th className="p-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={12} className="p-4"><Loader2 className="animate-spin inline mr-2" /> Carregando...</td></tr>}
                {!loading && rowsAPagar.length === 0 && <tr><td colSpan={12} className="p-4 text-gray-500">Sem registros.</td></tr>}
                {!loading && rowsAPagar.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{r.data_venda ? formatISODateBR(r.data_venda) : "—"}</td>
                    <td className="p-2">{userLabel(r.vendedor_id)}</td>
                    <td className="p-2">{r.cliente_nome || "—"}</td>
                    <td className="p-2">{r.numero_proposta || "—"}</td>
                    <td className="p-2">{r.segmento || "—"}</td>
                    <td className="p-2">{r.tabela || "—"}</td>
                    <td className="p-2 text-right">{BRL(r.valor_venda ?? r.base_calculo)}</td>
                    <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                    <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2">{r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—"}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        {can.payCommission(r) && (
                          <Button size="sm" variant="secondary" onClick={() => openPaymentFor(r)}>
                            <DollarSign className="w-4 h-4 mr-1" />
                            {hasRegisteredButUnpaid(r.flow) ? "Confirmar Pagamento" : "Registrar pagamento"}
                          </Button>
                        )}
                        {!can.payCommission(r) && (
                          <Button size="sm" variant="secondary" disabled className="opacity-60">
                            <DollarSign className="w-4 h-4 mr-1" /> Registrar pagamento
                          </Button>
                        )}
                        {can.returnCommission(r) ? (
                          <Button size="sm" variant="outline" onClick={() => {/* retornarComissao handler aqui */}}>
                            <RotateCcw className="w-4 h-4 mr-1" /> Retornar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled className="opacity-60">
                            <RotateCcw className="w-4 h-4 mr-1" /> Retornar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* ======= Comissões pagas ======= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Comissões pagas</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar por cliente ou nº proposta"
                value={paidSearch}
                onChange={(e) => { setPaidSearch(e.target.value); setPaidPage(1); }}
                className="w-[280px]"
              />
              <Button size="sm" variant="outline" onClick={() => setShowPaid((v) => !v)}>{showPaid ? "Ocultar" : "Expandir"}</Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showPaid && (
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data Pagto</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Nº Proposta</th>
                  <th className="p-2 text-left">Parcela</th>
                  <th className="p-2 text-right">Valor Pago (Bruto)</th>
                  <th className="p-2 text-left">Arquivos</th>
                  <th className="p-2 text-left">Estorno</th>
                </tr>
              </thead>
              <tbody>
                {pagosPage.length === 0 && <tr><td colSpan={8} className="p-4 text-gray-500">Nenhum pagamento encontrado.</td></tr>}
                {pagosPage.map(({ flow, comm }) => (
                  <tr key={flow.id} className="border-b">
                    <td className="p-2">{flow.data_pagamento_vendedor ? formatISODateBR(flow.data_pagamento_vendedor) : "—"}</td>
                    <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                    <td className="p-2">{comm.cliente_nome || "—"}</td>
                    <td className="p-2">{comm.numero_proposta || "—"}</td>
                    <td className="p-2">M{flow.mes}</td>
                    <td className="p-2 text-right">{BRL(flow.valor_pago_vendedor)}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        {flow.recibo_vendedor_url && (
                          <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.recibo_vendedor_url); if (u) window.open(u, "_blank"); }}>Recibo</a>
                        )}
                        {flow.comprovante_pagto_url && (
                          <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.comprovante_pagto_url); if (u) window.open(u, "_blank"); }}>Comprovante</a>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      {can.viewAll ? (
                        <Button size="sm" variant="outline">Estornar</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled className="opacity-60">Estornar</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-3 pt-3">
              <div className="text-sm text-gray-600">
                Mostrando {pagosPage.length ? pageStart + 1 : 0}–{Math.min(pageStart + pageSize, pagosFiltered.length)} de {pagosFiltered.length}
              </div>
              <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.max(1, p - 1))} disabled={paidPage <= 1}>Anterior</Button>
              <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.min(totalPages, p + 1))} disabled={paidPage >= totalPages}>Próxima</Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ======== Regras ======== */}
      <Dialog open={openRules} onOpenChange={setOpenRules}>
        <DialogContent className="max-w-6xl">
          <DialogHeader><DialogTitle>Regras de Comissão</DialogTitle></DialogHeader>

          {/* Cabeçalho do formulário */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <Label>Vendedor</Label>
              <Select value={ruleVendorId ?? ""} onValueChange={(v) => setRuleVendorId(v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tabela (SimTables)</Label>
              <Select value={ruleSimTableId ?? ""} onValueChange={(v) => setRuleSimTableId(v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {simTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.segmento} — {t.nome_tabela}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>% Padrão (ex.: 1,20 = 1,20%)</Label>
              <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" />
            </div>
            <div>
              <Label>Nº de meses do fluxo</Label>
              <Input type="number" min={1} max={36} value={String(ruleMeses)} onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))} />
            </div>
          </div>

          <hr className="my-4" />

          {/* Fluxo */}
          <div className="space-y-2">
            <Label>Fluxo do pagamento (M1..Mn) — você pode digitar 100% no total <b>ou</b> a soma igual ao % Padrão</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3 border rounded-md bg-white">
              {Array.from({ length: Math.max(1, ruleMeses || 1) }).map((_, i) => (
                <Input
                  key={i}
                  value={rulePercentuais[i] ?? "0,00"}
                  onChange={(e) => { const arr = [...rulePercentuais]; arr[i] = e.target.value; setRulePercentuais(arr); }}
                  placeholder="0,33"
                />
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Soma do fluxo:{" "}
              <b>
                {(() => {
                  const soma = (rulePercentuais || []).reduce((a, b) => {
                    const v = parseFloat(String(b || "0").replace(",", ".")) || 0;
                    return a + v;
                  }, 0);
                  return soma.toFixed(2).replace(".", ",");
                })()}{" "}
                (aceitas: 100,00 ou % padrão {String(rulePercent || "0,00")})
              </b>
            </div>
          </div>

          <hr className="my-4" />

          {/* Observações + Ações */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
            <div className="lg:col-span-2">
              <Label>Observações</Label>
              <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button>
              <Button variant="outline" onClick={() => { setRuleSimTableId(""); setRulePercent("1,20"); onChangeMeses(1); setRulePercentuais(["100,00"]); setRuleObs(""); }}>Limpar</Button>
            </div>
          </div>

          <hr className="my-4" />

          {/* Lista de regras */}
          <div className="border rounded-md max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">% Padrão</th>
                  <th className="p-2 text-left">Fluxo</th>
                  <th className="p-2 text-left">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(!ruleRows || ruleRows.length === 0) && <tr><td colSpan={6} className="p-3 text-gray-500">Nenhuma regra cadastrada para o vendedor selecionado.</td></tr>}
                {ruleRows.map((r) => (
                  <tr key={`${r.vendedor_id}-${r.sim_table_id}`} className
