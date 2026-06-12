// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  Eye,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;

type User = {
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
  pix_type?: string | null;
  login?: string | null;
  role?: "admin" | "vendedor" | string | null;
  scopes?: string[] | null;
  avatar_url?: string | null;
  pix_kind?: string | null;
  is_active?: boolean | null;
  unit_id?: UUID | null;
  hierarchy_level?: "usuario" | "gestor_filial" | string | null;
};

type UserSecure = {
  id: UUID;
  nome: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  pix_key: string | null;
  cpf: string | null;
  cpf_mascarado: string | null;
};

type SimTable = {
  id: UUID;
  segmento: string;
  nome_tabela: string;
  admin_id?: UUID | null;
};

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
  encarteirada_em?: string | null;
  codigo?: string | null;
  cancelada_em?: string | null;
  grupo?: string | null;
  cota?: string | null;
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
  venda_cancelada?: boolean;
  venda_codigo?: string | null;
  venda_cancelada_em?: string | null;
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

type CommissionWithFlow = Commission & {
  flow?: CommissionFlow[];
};

type CommissionRule = {
  vendedor_id: string;
  sim_table_id: string;
  percent_padrao: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  obs: string | null;
};

type Unit = {
  id: UUID;
  nome: string;
  tipo: "matriz" | "filial" | string;
  cidade?: string | null;
  uf?: string | null;
  is_active?: boolean | null;
  manager_user_id?: UUID | null;
};

type CommissionTableRule = {
  id: UUID;
  sim_table_id: UUID | null;
  administradora: string | null;
  segmento: string | null;
  nome_tabela: string;
  percent_total: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  is_active: boolean;
};

type CommissionSplitRule = {
  id: UUID;
  table_rule_id: UUID;
  business_unit_id: UUID | null;
  recipient_type: "vendedor" | "unidade" | "empresa" | "gestor" | "indicador" | "outro";
  recipient_user_id: UUID | null;
  recipient_unit_id: UUID | null;
  split_percent: number;
  is_active: boolean;
};

type CommissionBatch = {
  id: UUID;
  venda_id: UUID;
  sim_table_id: UUID | null;
  table_rule_id: UUID | null;
  business_unit_id: UUID | null;
  vendedor_id: UUID;
  data_venda: string | null;
  valor_venda: number;
  percent_total: number;
  commission_total_gross: number;
  status: "a_pagar" | "parcial" | "pago" | "estornado" | "cancelado" | string;
  legacy?: boolean | null;
};

type CommissionEntry = {
  id: UUID;
  batch_id: UUID;
  venda_id: UUID;
  recipient_type: "vendedor" | "unidade" | "empresa" | "gestor" | "indicador" | "outro" | string;
  recipient_user_id: UUID | null;
  recipient_unit_id: UUID | null;
  business_unit_id: UUID | null;
  split_percent: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  status: "a_pagar" | "parcial" | "pago" | "estornado" | "cancelado" | string;
};

type CommissionEntryFlow = {
  id: UUID;
  entry_id: UUID;
  batch_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number;
  valor_pago: number;
  data_pagamento: string | null;
  comprovante_url?: string | null;
  demonstrativo_url?: string | null;
  comprovante_dispensado?: boolean | null;
  comprovante_unidade_url?: string | null;
  comprovante_vendedor_url?: string | null;
  comprovante_unidade_dispensado?: boolean | null;
  comprovante_vendedor_dispensado?: boolean | null;
  status: "a_pagar" | "pago" | "estornado" | "cancelado" | string;
};

type CommissionAdjustment = {
  id: UUID;
  entry_id: UUID;
  batch_id: UUID;
  venda_id: UUID | null;
  adjustment_type: "estorno" | "desconto" | "ajuste_manual" | "bonus" | string;
  amount: number;
  tax_amount?: number | null;
  data_estorno?: string | null;
  is_reversed?: boolean | null;
  reversed_at?: string | null;
  description: string | null;
  grupo?: string | null;
  cota?: string | null;
  parcela?: string | null;
  created_at?: string | null;
};

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;

const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);

const clamp0 = (n: number) => (n < 0 ? 0 : n);

const totalCommissionGross = (r: CommissionWithFlow) => {
  return Number(r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0))) || 0;
};

const paidCommissionGross = (r: CommissionWithFlow) => {
  return sum((r.flow || []).map((f) => Number(f.valor_pago_vendedor) || 0));
};

const isOperationalCommission = (r: CommissionWithFlow) => {
  return r.status !== "estorno" && !r.venda_cancelada;
};

const pendingCommissionGross = (r: CommissionWithFlow) => {
  return clamp0(totalCommissionGross(r) - paidCommissionGross(r));
};

const lostCommissionGross = (r: CommissionWithFlow) => {
  if (!r.venda_cancelada) return 0;
  return clamp0(totalCommissionGross(r) - paidCommissionGross(r));
};

const commissionNet = (gross: number, impostoFrac: number) => {
  return gross * (1 - impostoFrac);
};

const toDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));

function isoToBRDate(iso?: string | null) {
  return !iso ? "" : String(iso).slice(0, 10).split("-").reverse().join("/");
}

function brDateToISO(value: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function parseBRL(s: string) {
  return parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;
}

function parsePctHumanToNumber(s: string) {
  const cleaned = (s || "").replace("%", "").trim();
  return parseFloat(cleaned.replace(",", ".")) || 0;
}

function formatPctHuman(n: number) {
  return `${(n || 0).toFixed(2).replace(".", ",")}%`;
}

const monthStartInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const monthEndInput = () => {
  const d = new Date();
  return toDateInput(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

function parseFluxoPercentuais(text: string) {
  return (text || "")
    .split(/[;|,]/g)
    .map((x) => parsePctHumanToNumber(x.trim()) / 100)
    .filter((x) => x > 0);
}

function isCloseTo100(fracs: number[]) {
  const total = fracs.reduce((a, b) => a + b, 0);
  return Math.abs(total - 1) < 0.001;
}

/* ======================== Datas / projeções ======================== */
const localDateFromISO = (iso?: string | null) => {
  if (!iso) return null;

  const cleanIso = String(iso).slice(0, 10);
  const [y, m, d] = cleanIso.split("-").map((v) => parseInt(v, 10));

  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d);
};

const isBetweenISO = (iso?: string | null, s?: Date, e?: Date) => {
  const d = localDateFromISO(iso);
  if (!d) return false;

  const si = s?.getTime() ?? Number.NEGATIVE_INFINITY;
  const ei = e?.getTime() ?? Number.POSITIVE_INFINITY;
  const t = d.getTime();

  return t >= si && t <= ei;
};

function valorPorExtenso(n: number) {
  const u = [
    "zero",
    "um",
    "dois",
    "três",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
    "dez",
    "onze",
    "doze",
    "treze",
    "quatorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
  ];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "noventos"];

  const ext = (n0: number): string =>
    n0 < 20
      ? u[n0]
      : n0 < 100
        ? d[Math.floor(n0 / 10)] + (n0 % 10 ? " e " + u[n0 % 10] : "")
        : n0 === 100
          ? "cem"
          : c[Math.floor(n0 / 100)] + (n0 % 100 ? " e " + ext(n0 % 100) : "");

  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);

  return `${ext(i)} ${i === 1 ? "real" : "reais"}${ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""}`;
}

function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;

  return flow.some(
    (f) =>
      (Number(f.percentual) || 0) > 0 &&
      !!f.data_pagamento_vendedor &&
      (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

function flowStats(flow?: CommissionFlow[]) {
  const relevant = (flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
  const total = relevant.length;
  const paid = relevant.filter((f) => (Number(f.valor_pago_vendedor) || 0) > 0).length;

  return { paid, total };
}

function pctPagoFromCommission(r: CommissionWithFlow) {
  const totalCom = totalCommissionGross(r);
  const paidBruto = paidCommissionGross(r);
  const pct = totalCom > 0 ? (paidBruto / totalCom) * 100 : 0;

  return {
    pct: Math.max(0, Math.min(9999, pct)),
    paidBruto,
    totalCom,
  };
}

function isVendaCancelada(venda: { codigo?: string | null; cancelada_em?: string | null }) {
  const codigo = venda.codigo ?? null;
  const canceladaEm = venda.cancelada_em ?? null;

  if (codigo === "00") return false;
  if (codigo && codigo !== "00") return true;
  if (canceladaEm) return true;

  return false;
}

/* ========================= Donut ========================= */
function Donut({
  paid,
  pending,
  label,
  hoverPaidText,
  hoverPendText,
  pendingLegend = "Previsto",
}: {
  paid: number;
  pending: number;
  label: string;
  hoverPaidText: string;
  hoverPendText: string;
  pendingLegend?: string;
}) {
  const paidSafe = Math.max(0, Number(paid) || 0);
  const pendingSafe = Math.max(0, Number(pending) || 0);

  const total = paidSafe + pendingSafe;
  const paidPct = total > 0 ? (paidSafe / total) * 100 : 0;

  const [hover, setHover] = useState<"paid" | "pend" | null>(null);

  const navy = "#1E293F";
  const red = "#A11C27";
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const paidLen = (paidPct / 100) * circumference;
  const pendLen = circumference - paidLen;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-xl bg-white">
      <div className="relative">
        <svg width="160" height="160" className="-rotate-90" role="img" aria-label={label}>
          <circle cx="80" cy="80" r={radius} stroke="#e5e7eb" strokeWidth="22" fill="none" />

          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={navy}
            strokeWidth={hover === "paid" ? 26 : 22}
            fill="none"
            strokeDasharray={`${paidLen} ${circumference}`}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("paid")}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: "all .2s ease",
              filter: hover === "paid" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none",
            }}
          />

          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={red}
            strokeWidth={hover === "pend" ? 26 : 22}
            fill="none"
            strokeDasharray={`${pendLen} ${circumference}`}
            strokeDashoffset={-paidLen}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("pend")}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: "all .2s ease",
              filter: hover === "pend" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none",
            }}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xl font-bold">{total === 0 ? "0%" : `${paidPct.toFixed(0)}%`}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        </div>
      </div>

      <div className="text-sm">
        <div className="mb-1">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: navy }} />
          <span className="font-medium">Pago bruto</span>
        </div>
        <div className="text-gray-600">{hover === "paid" ? hoverPaidText : BRL(paidSafe)}</div>

        <div className="mt-3 mb-1">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: red }} />
          <span className="font-medium">{pendingLegend}</span>
        </div>
        <div className="text-gray-600">{hover === "pend" ? hoverPendText : BRL(pendingSafe)}</div>
      </div>
    </div>
  );
}

/* ========================= LineChart ========================= */
function LineChart({
  labels,
  series,
  height = 200,
  formatY = (v: number) => BRL(v),
}: {
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const palette = ["#1E293F", "#A11C27"];
  const pad = { top: 10, right: 16, bottom: 28, left: 56 };
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const safeSeries = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        data: (s.data || []).map((v) => Math.max(0, Number(v) || 0)),
      })),
    [series]
  );

  const maxY = useMemo(() => {
    const all = safeSeries.flatMap((s) => s.data);
    const m = Math.max(1, ...all);
    const pow = Math.pow(10, String(Math.floor(m)).length - 1);
    return Math.ceil(m / pow) * pow;
  }, [safeSeries]);

  const width = 720;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xStep = innerW / Math.max(1, labels.length - 1);
  const yScale = (v: number) => innerH - (v / maxY) * innerH;

  const pointsFor = (arr: number[]) =>
    arr.map((v, i) => [pad.left + i * xStep, pad.top + yScale(v)] as const);

  const clientToViewBox = (evt: React.MouseEvent<SVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };

    const inv = ctm.inverse();
    const p2 = pt.matrixTransform(inv);

    return { x: p2.x, y: p2.y };
  };

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (!labels.length) return;

    const { x } = clientToViewBox(e);
    const local = x - pad.left;
    const i = Math.round(local / xStep);

    setHoverX(Math.min(Math.max(i, 0), labels.length - 1));
  };

  const hovered =
    hoverX != null
      ? {
          label: labels[hoverX],
          values: safeSeries.map((s) => s.data[hoverX] ?? 0),
        }
      : null;

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        onMouseLeave={() => setHoverX(null)}
      >
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = pad.top + innerH * (1 - t);
            const val = maxY * t;

            return (
              <g key={i}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="4 4"
                />
                <text x={pad.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="#6b7280">
                  {formatY(val)}
                </text>
              </g>
            );
          })}

          <line
            x1={pad.left}
            x2={pad.left + innerW}
            y1={pad.top + innerH}
            y2={pad.top + innerH}
            stroke="#e5e7eb"
          />

          {labels.map((lb, i) => {
            const x = pad.left + i * xStep;

            return (
              <text key={i} x={x} y={pad.top + innerH + 18} fontSize="11" textAnchor="middle" fill="#6b7280">
                {lb}
              </text>
            );
          })}
        </g>

        {safeSeries.map((s, si) => {
          const pts = pointsFor(s.data);
          const d = pts.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(" ");

          return (
            <g key={si}>
              <path d={d} fill="none" stroke={palette[si % palette.length]} strokeWidth={2} />

              {pts.map(([x, y], pi) => (
                <circle
                  key={pi}
                  cx={x}
                  cy={y}
                  r={2.5}
                  fill="#fff"
                  stroke={palette[si % palette.length]}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
        />

        {hoverX != null && (
          <line
            x1={pad.left + hoverX * xStep}
            x2={pad.left + hoverX * xStep}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="#9ca3af"
            strokeDasharray="4 4"
          />
        )}
      </svg>

      <div className="mt-4 flex flex-wrap gap-4">
        {safeSeries.map((s, si) => (
          <div className="flex items-center gap-2 text-sm" key={si}>
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: palette[si % palette.length] }}
            />
            <span className="text-gray-700">{s.name}</span>
          </div>
        ))}
      </div>

      {hovered && (
        <div
          className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow"
          style={{ left: 16, top: 16 }}
        >
          <div className="mb-1 font-semibold text-gray-800">{hovered.label}</div>

          <div className="space-y-1">
            {hovered.values.map((v, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-gray-600">{safeSeries[i]?.name ?? `Série ${i + 1}`}</span>
                <span className="tabular-nums ml-8">{formatY(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Projeções ========================= */
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

function expectedDateForParcel(
  _saleDateISO: string | null | undefined,
  flow: CommissionFlow[] | undefined,
  mes: number
): Date | null {
  const safeFlow = Array.isArray(flow) ? flow : [];

  const m2 = safeFlow.find((f) => f.mes === 2);
  const m2Date = m2?.data_pagamento_vendedor ? localDateFromISO(m2.data_pagamento_vendedor) : null;

  if (mes <= 2) {
    const f = safeFlow.find((x) => x.mes === mes);
    const regDate = f?.data_pagamento_vendedor ? localDateFromISO(f.data_pagamento_vendedor) : null;

    return regDate ?? null;
  }

  if (!m2Date) return null;

  const offset = mes - 2;
  const expected = new Date(m2Date.getFullYear(), m2Date.getMonth(), m2Date.getDate());

  expected.setDate(expected.getDate() + offset * 30);

  return expected;
}

function getWeeklyIntervalsFriToThu(year: number, month: number) {
  const first = new Date(year, month, 1);
  const eom = new Date(year, month + 1, 0);

  let d = new Date(year, month, 1);
  while (d.getDay() !== 5) {
    d = new Date(year, month, d.getDate() + 1);
  }

  const intervals: Array<{ start: Date; end: Date; label: string }> = [];

  while (d <= eom) {
    const start = new Date(d);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const endClamped = end > eom ? eom : end;

    const s = `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
    const e = `${String(endClamped.getDate()).padStart(2, "0")}/${String(endClamped.getMonth() + 1).padStart(2, "0")}`;

    intervals.push({
      start,
      end: endClamped,
      label: `S${intervals.length + 1} (${s}–${e})`,
    });

    d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  }

  if (!intervals.length) {
    intervals.push({
      start: first,
      end: eom,
      label: `S1 (01/${String(month + 1).padStart(2, "0")}–${String(eom.getDate()).padStart(2, "0")}/${String(
        month + 1
      ).padStart(2, "0")})`,
    });
  }

  return intervals;
}

type ProjSeries = {
  labels: string[];
  previstoBruto: number[];
  pagoBruto: number[];
};

function projectAnnualFlows(rows: CommissionWithFlow[]): ProjSeries {
  const operationalRows = rows.filter(isOperationalCommission);

  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i);
  const previsto = Array(years.length).fill(0);
  const pagos = Array(years.length).fill(0);

  for (const r of operationalRows) {
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      if (!f.data_pagamento_vendedor) continue;

      const pd = localDateFromISO(f.data_pagamento_vendedor);
      if (!pd) continue;

      const yi = years.indexOf(pd.getFullYear());
      if (yi >= 0) {
        pagos[yi] += Number(f.valor_pago_vendedor) || 0;
      }
    }
  }

  return {
    labels: years.map(String),
    previstoBruto: previsto,
    pagoBruto: pagos,
  };
}

function projectMonthlyFlows(rows: CommissionWithFlow[], year: number, includePrevisto: boolean): ProjSeries {
  const operationalRows = rows.filter(isOperationalCommission);

  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const previsto = Array(12).fill(0);
  const pagos = Array(12).fill(0);

  for (const r of operationalRows) {
    const total = totalCommissionGross(r);
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      if (f.data_pagamento_vendedor) {
        const pd = localDateFromISO(f.data_pagamento_vendedor);

        if (pd && pd.getFullYear() === year) {
          pagos[pd.getMonth()] += Number(f.valor_pago_vendedor) || 0;
        }
      }

      if (!includePrevisto) continue;

      const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
      if (!exp || exp.getFullYear() !== year) continue;

      const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
      if (isPaid) continue;

      const expVal = Number(f.valor_previsto ?? total * (Number(f.percentual) || 0)) || 0;
      previsto[exp.getMonth()] += expVal;
    }
  }

  return {
    labels,
    previstoBruto: previsto,
    pagoBruto: pagos,
  };
}

function projectWeeklyFlows(rows: CommissionWithFlow[]): ProjSeries {
  const operationalRows = rows.filter(isOperationalCommission);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const intervals = getWeeklyIntervalsFriToThu(year, month);

  const labels = intervals.map((i) => i.label);
  const previsto = Array(intervals.length).fill(0);
  const pagos = Array(intervals.length).fill(0);

  for (const r of operationalRows) {
    const total = totalCommissionGross(r);
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      if (f.data_pagamento_vendedor) {
        const pd = localDateFromISO(f.data_pagamento_vendedor);

        if (pd && pd.getFullYear() === year && pd.getMonth() === month) {
          const idx = intervals.findIndex((iv) => pd >= iv.start && pd <= iv.end);

          if (idx >= 0) {
            pagos[idx] += Number(f.valor_pago_vendedor) || 0;
          }
        }
      }

      const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
      if (!exp || exp.getFullYear() !== year || exp.getMonth() !== month) continue;

      const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
      if (isPaid) continue;

      const expVal = Number(f.valor_previsto ?? total * (Number(f.percentual) || 0)) || 0;
      const idx = intervals.findIndex((iv) => exp >= iv.start && exp <= iv.end);

      if (idx >= 0) {
        previsto[idx] += expVal;
      }
    }
  }

  return {
    labels,
    previstoBruto: previsto,
    pagoBruto: pagos,
  };
}

/* ========================= Página ========================= */
const LS_IMPOSTO_PCT = "@consulmax:recibo-imposto-pct-v1";
const APP_SETTING_IMPOSTO_KEY = "commission_tax_pct";

export default function ComissoesPage() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAuthUserId(data?.user?.id ?? null);
    })();
  }, []);

  const canEdit = isAdmin;

  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [simAdmins, setSimAdmins] = useState<{ id: UUID; name: string }[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [adminFilter, setAdminFilter] = useState<string>("all");
  const [periodStart, setPeriodStart] = useState<string>("2025-01-01");
  const [periodEnd, setPeriodEnd] = useState<string>(() => monthEndInput());

  const [tableRules, setTableRules] = useState<CommissionTableRule[]>([]);
  const [splitRules, setSplitRules] = useState<CommissionSplitRule[]>([]);
  const [partitionBatches, setPartitionBatches] = useState<CommissionBatch[]>([]);
  const [partitionEntries, setPartitionEntries] = useState<CommissionEntry[]>([]);
  const [partitionFlows, setPartitionFlows] = useState<CommissionEntryFlow[]>([]);
  const [partitionAdjustments, setPartitionAdjustments] = useState<CommissionAdjustment[]>([]);

  const [openPartitionRules, setOpenPartitionRules] = useState(false);
  const [partRuleTableId, setPartRuleTableId] = useState<string>("");
  const [partRuleUnitId, setPartRuleUnitId] = useState<string>("");
  const [partVendorId, setPartVendorId] = useState<string>("");
  const [partAdminFilter, setPartAdminFilter] = useState<string>("all");
  const [partSegmentFilter, setPartSegmentFilter] = useState<string>("all");
  const [partSplitVendedor, setPartSplitVendedor] = useState<string>("25,00");
  const [partSplitUnidade, setPartSplitUnidade] = useState<string>("25,00");

  const [tableRuleAdminFilter, setTableRuleAdminFilter] = useState<string>("all");
  const [tableRuleSegmentFilter, setTableRuleSegmentFilter] = useState<string>("all");
  const [tableRuleTableId, setTableRuleTableId] = useState<string>("");
  const [tableRuleTotalPct, setTableRuleTotalPct] = useState<string>("5,00");
  const [tableRuleFluxoMeses, setTableRuleFluxoMeses] = useState<number>(4);
  const [tableRuleFluxoPctList, setTableRuleFluxoPctList] = useState<string[]>(["2,00", "1,00", "1,00", "1,00"]);
  const [tableRulesPage, setTableRulesPage] = useState<number>(1);
  const [partitionScheduleFlow, setPartitionScheduleFlow] = useState<CommissionEntryFlow | null>(null);
  const [partitionScheduleDateBR, setPartitionScheduleDateBR] = useState<string>(() => isoToBRDate(toDateInput(new Date())));
  const [partitionPayFlow, setPartitionPayFlow] = useState<CommissionEntryFlow | null>(null);
  const [partitionPayDate, setPartitionPayDate] = useState<string>(() => toDateInput(new Date()));
  const [partitionPayUnidadeFile, setPartitionPayUnidadeFile] = useState<File | null>(null);
  const [partitionPayVendedorFile, setPartitionPayVendedorFile] = useState<File | null>(null);
  const [partitionPayDispensarUnidade, setPartitionPayDispensarUnidade] = useState<boolean>(false);
  const [partitionPayDispensarVendedor, setPartitionPayDispensarVendedor] = useState<boolean>(false);

  const [partitionRefundBatchId, setPartitionRefundBatchId] = useState<string | null>(null);
  const [partitionRefundMes, setPartitionRefundMes] = useState<string>("");
  const [partitionRefundAmount, setPartitionRefundAmount] = useState<string>("");
  const [partitionRefundDateBR, setPartitionRefundDateBR] = useState<string>(() => isoToBRDate(toDateInput(new Date())));
  const [partitionRefundDescription, setPartitionRefundDescription] = useState<string>("Estorno de comissão");
  const [expandedPartitionBatchIds, setExpandedPartitionBatchIds] = useState<Record<string, boolean>>({});
  const [commissionSearch, setCommissionSearch] = useState<string>("");
  const [showFinalizadas, setShowFinalizadas] = useState<boolean>(false);
  const [showPerdidas, setShowPerdidas] = useState<boolean>(false);
  const [demonstrativoTipo, setDemonstrativoTipo] = useState<"data" | "mes">("data");
  const [demonstrativoMes, setDemonstrativoMes] = useState<string>(() => toDateInput(new Date()).slice(0, 7));

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const usersByAuth = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => {
      if (u.auth_user_id) m[u.auth_user_id] = u;
    });
    return m;
  }, [users]);

  const activeUsers = useMemo(() => users.filter((u) => u.is_active === true), [users]);
  const secureById = useMemo(() => Object.fromEntries(usersSecure.map((u) => [u.id, u])), [usersSecure]);
  const adminById = useMemo(() => Object.fromEntries(simAdmins.map((a) => [a.id, a.name])), [simAdmins]);

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const currentUser = useMemo(() => users.find((u) => u.auth_user_id === authUserId) || null, [users, authUserId]);
  const currentUnit = useMemo(() => units.find((u) => u.id === currentUser?.unit_id) || null, [units, currentUser]);
  const matrixUnit = useMemo(() => units.find((u) => u.tipo === "matriz") || null, [units]);
  const isMatrixAdmin = !!currentUser && currentUser.role === "admin" && currentUnit?.tipo === "matriz";
  const isBranchManager = currentUser?.hierarchy_level === "gestor_filial";

  const scopedUnitIds = useMemo(() => {
    if (isMatrixAdmin) return units.map((u) => u.id);
    return currentUser?.unit_id ? [currentUser.unit_id] : [];
  }, [isMatrixAdmin, units, currentUser]);

  const scopedUserIds = useMemo(() => {
    if (isMatrixAdmin) return users.map((u) => u.id);
    if (isBranchManager) return users.filter((u) => u.unit_id === currentUser?.unit_id).map((u) => u.id);
    return currentUser?.id ? [currentUser.id] : [];
  }, [isMatrixAdmin, isBranchManager, users, currentUser]);

  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id] || usersByAuth[id];
    return u?.nome?.trim() || u?.email?.trim() || id;
  };

  const canonUserId = (id?: string | null) => (id ? usersById[id]?.id || usersByAuth[id]?.id || null : null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CommissionWithFlow[]>([]);
  const [allVendasComissao, setAllVendasComissao] = useState<Venda[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  const [openRules, setOpenRules] = useState(false);
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20");
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]);
  const [ruleObs, setRuleObs] = useState<string>("");
  const [ruleRows, setRuleRows] = useState<(CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null })[]>([]);
  const [ruleAdminFilter, setRuleAdminFilter] = useState<string>("all");
  const [ruleSegmentFilter, setRuleSegmentFilter] = useState<string>("all");
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleFormSimTable, setRuleFormSimTable] = useState<SimTable | null>(null);
  const [viewRule, setViewRule] = useState<(CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null }) | null>(null);

  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<(CommissionFlow & { _valor_previsto_calc?: number })[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");
  const [payDefaultTab, setPayDefaultTab] = useState<"selecionar" | "arquivos">("selecionar");

  const [reciboDate, setReciboDate] = useState<string>(() => toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00%");
  const [reciboVendor, setReciboVendor] = useState<string>("all");
  const [openImpostoCfg, setOpenImpostoCfg] = useState(false);
  const [impostoDraft, setImpostoDraft] = useState<string>("6,00");

  const [openBulkRefund, setOpenBulkRefund] = useState(false);
  const [bulkRefundProp, setBulkRefundProp] = useState<string>("");
  const [bulkRefundFound, setBulkRefundFound] = useState<{ comm: Commission; flows: CommissionFlow[] } | null>(null);
  const [bulkRefundDate, setBulkRefundDate] = useState<string>(() => toDateInput(new Date()));
  const [bulkRefundGross, setBulkRefundGross] = useState<string>("");
  const [busyRefund, setBusyRefund] = useState(false);

  const [showPaid, setShowPaid] = useState(false);
  const [showUnpaid, setShowUnpaid] = useState(true);
  const [showVendasSem, setShowVendasSem] = useState(true);

  const [paidSearch, setPaidSearch] = useState<string>("");
  const [paidPage, setPaidPage] = useState<number>(1);
  const pageSize = 15;
  const [unpaidPropSearch, setUnpaidPropSearch] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [
        { data: u },
        { data: st },
        { data: us },
        { data: admins },
        { data: unitsData },
        { data: tableRulesData },
        { data: splitRulesData },
        { data: batchesData },
        { data: entriesData },
        { data: entryFlowsData },
        { data: adjustmentsData },
      ] = await Promise.all([
        supabase
          .from("users")
          .select("id, auth_user_id, nome, email, phone, cep, logradouro, numero, bairro, cidade, uf, pix_key, pix_type, login, role, scopes, avatar_url, pix_kind, is_active, unit_id, hierarchy_level")
          .order("nome", { ascending: true }),
        supabase.from("sim_tables").select("id, segmento, nome_tabela, admin_id").order("segmento", { ascending: true }),
        supabase.from("users_secure").select("id, nome, email, logradouro, numero, bairro, cidade, uf, pix_key, cpf, cpf_mascarado"),
        supabase.from("sim_admins").select("id, name").order("name", { ascending: true }),
        supabase.from("units").select("*").order("tipo", { ascending: true }).order("nome", { ascending: true }),
        supabase.from("commission_table_rules").select("*").order("created_at", { ascending: false }),
        supabase.from("commission_split_rules").select("*").order("created_at", { ascending: true }),
        supabase.from("commission_batches").select("*").order("created_at", { ascending: false }).limit(3000),
        supabase.from("commission_entries").select("*").order("created_at", { ascending: false }).limit(6000),
        supabase.from("commission_entry_flow").select("*").order("mes", { ascending: true }).limit(10000),
        supabase.from("commission_adjustments").select("*").order("created_at", { ascending: false }).limit(3000),
      ]);

      const usersData = (u || []) as User[];
      setUsers(usersData);
      setSimTables((st || []) as SimTable[]);
      setUsersSecure((us || []) as UserSecure[]);
      setSimAdmins((admins || []) as { id: UUID; name: string }[]);
      setUnits((unitsData || []) as Unit[]);
      setTableRules((tableRulesData || []) as CommissionTableRule[]);
      setSplitRules((splitRulesData || []) as CommissionSplitRule[]);
      setPartitionBatches((batchesData || []) as CommissionBatch[]);
      setPartitionEntries((entriesData || []) as CommissionEntry[]);
      setPartitionFlows((entryFlowsData || []) as CommissionEntryFlow[]);
      setPartitionAdjustments((adjustmentsData || []) as CommissionAdjustment[]);

      const current = usersData.find((x) => x.auth_user_id && x.auth_user_id === (authUserId || ""));
      const admin = current?.role === "admin";
      setIsAdmin(!!admin);

      if (!admin && current?.id) {
        setVendedorId(current.id);
        setReciboVendor(current.id);
      }
    })();
  }, [authUserId]);

  useEffect(() => {
    setReciboVendor(vendedorId);
  }, [vendedorId]);

  async function loadImpostoParam() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTING_IMPOSTO_KEY)
        .maybeSingle();

      if (!error && data?.value) {
        const n = parsePctHumanToNumber(data.value);
        const fmt = formatPctHuman(n);
        setReciboImpostoPct(fmt);
        setImpostoDraft((n || 0).toFixed(2).replace(".", ","));
        return;
      }
    } catch {}

    try {
      const saved = (typeof window !== "undefined" && window.localStorage.getItem(LS_IMPOSTO_PCT)) || "6,00%";
      const n = parsePctHumanToNumber(saved);
      const fmt = formatPctHuman(n);
      setReciboImpostoPct(fmt);
      setImpostoDraft((n || 0).toFixed(2).replace(".", ","));
    } catch {
      setReciboImpostoPct("6,00%");
      setImpostoDraft("6,00");
    }
  }

  useEffect(() => {
    if (!authUserId) return;
    loadImpostoParam();
  }, [authUserId]);

  const adminOptions = useMemo(() => {
    const ids = Array.from(new Set(simTables.map((t) => t.admin_id).filter(Boolean))) as string[];
    return ids
      .map((id) => ({ id, name: adminById[id] || "Sem administradora" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [simTables, adminById]);

  const mainAdminOptions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...simTables.map((t) => (t.admin_id ? adminById[t.admin_id] : null)),
          ...allVendasComissao.map((v) => v.administradora),
          ...rows.map((r) => r.administradora),
        ].filter(Boolean) as string[]
      )
    ).sort();
  }, [simTables, adminById, allVendasComissao, rows]);

  const mainSegmentOptions = useMemo(() => {
    let base = simTables;
    if (adminFilter !== "all") {
      const adminName = normalize(adminFilter);
      base = base.filter((t) => normalize(adminById[t.admin_id || ""]) === adminName);
    }
    return Array.from(new Set(base.map((t) => t.segmento).filter(Boolean))).sort() as string[];
  }, [simTables, adminFilter, adminById]);

  const mainTableOptions = useMemo(() => {
    let base = simTables;
    if (adminFilter !== "all") {
      const adminName = normalize(adminFilter);
      base = base.filter((t) => normalize(adminById[t.admin_id || ""]) === adminName);
    }
    if (segmento !== "all") base = base.filter((t) => t.segmento === segmento);
    return Array.from(new Set(base.map((t) => t.nome_tabela).filter(Boolean))).sort() as string[];
  }, [simTables, adminFilter, segmento, adminById]);

  useEffect(() => {
    if (segmento !== "all" && !mainSegmentOptions.includes(segmento)) setSegmento("all");
    if (tabela !== "all" && !mainTableOptions.includes(tabela)) setTabela("all");
  }, [adminFilter, mainSegmentOptions, mainTableOptions, segmento, tabela]);

  const tableRuleAdminOptions = useMemo(() => adminOptions, [adminOptions]);

  const tableRuleSegmentOptions = useMemo(() => {
    let base = simTables;
    if (tableRuleAdminFilter !== "all") base = base.filter((t) => t.admin_id === tableRuleAdminFilter);
    return Array.from(new Set(base.map((t) => t.segmento).filter(Boolean))).sort() as string[];
  }, [simTables, tableRuleAdminFilter]);

  const tableRuleTableOptions = useMemo(() => {
    return simTables
      .filter((t) => tableRuleAdminFilter === "all" || t.admin_id === tableRuleAdminFilter)
      .filter((t) => tableRuleSegmentFilter === "all" || t.segmento === tableRuleSegmentFilter)
      .sort((a, b) => {
        const an = adminById[a.admin_id || ""] || "";
        const bn = adminById[b.admin_id || ""] || "";
        return an.localeCompare(bn) || (a.segmento || "").localeCompare(b.segmento || "") || a.nome_tabela.localeCompare(b.nome_tabela);
      });
  }, [simTables, tableRuleAdminFilter, tableRuleSegmentFilter, adminById]);

  const paginatedTableRules = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(tableRules.length / 10));
    const safePage = Math.min(Math.max(tableRulesPage, 1), totalPages);
    const start = (safePage - 1) * 10;
    return { rows: tableRules.slice(start, start + 10), page: safePage, totalPages };
  }, [tableRules, tableRulesPage]);

  useEffect(() => {
    setTableRulesPage(1);
  }, [tableRules.length, tableRuleAdminFilter, tableRuleSegmentFilter]);

  const partSegmentOptions = useMemo(() => {
    let base = simTables;
    if (partAdminFilter !== "all") base = base.filter((t) => t.admin_id === partAdminFilter);
    return Array.from(new Set(base.map((t) => t.segmento).filter(Boolean))).sort() as string[];
  }, [simTables, partAdminFilter]);

  const partTableOptions = useMemo(() => {
    return simTables
      .filter((t) => partAdminFilter === "all" || t.admin_id === partAdminFilter)
      .filter((t) => partSegmentFilter === "all" || t.segmento === partSegmentFilter)
      .filter((t) => tableRules.some((r) => r.sim_table_id === t.id || normalize(r.nome_tabela) === normalize(t.nome_tabela)))
      .sort((a, b) => {
        const an = adminById[a.admin_id || ""] || "";
        const bn = adminById[b.admin_id || ""] || "";
        return an.localeCompare(bn) || (a.segmento || "").localeCompare(b.segmento || "") || a.nome_tabela.localeCompare(b.nome_tabela);
      });
  }, [simTables, partAdminFilter, partSegmentFilter, adminById, tableRules]);

  const selectedPartTable = useMemo(() => simTables.find((t) => t.id === partRuleTableId) || null, [simTables, partRuleTableId]);
  const selectedPartTableRule = useMemo(() => {
    if (!selectedPartTable) return null;
    return (
      tableRules.find((r) => r.sim_table_id === selectedPartTable.id && r.is_active !== false) ||
      tableRules.find((r) => normalize(r.nome_tabela) === normalize(selectedPartTable.nome_tabela) && r.is_active !== false) ||
      null
    );
  }, [tableRules, selectedPartTable]);

  const selectedPartCommissionPreview = useMemo(() => {
    const rule = selectedPartTableRule;
    if (!rule) return null;
    const vendaExemplo = 100000;
    const comissaoTotal = vendaExemplo * (Number(rule.percent_total) || 0);
    const vendedorFrac = parsePctHumanToNumber(partSplitVendedor) / 100;
    const unidadeFrac = parsePctHumanToNumber(partSplitUnidade) / 100;
    const empresaFrac = Math.max(0, 1 - vendedorFrac - unidadeFrac);
    return {
      comissaoTotal,
      vendedorFrac,
      unidadeFrac,
      empresaFrac,
      fluxo: Array.isArray(rule.fluxo_percentuais) ? rule.fluxo_percentuais : [],
    };
  }, [selectedPartTableRule, partSplitVendedor, partSplitUnidade]);

  const splitRulesConfiguredRows = useMemo(() => {
    const activeSplits = splitRules.filter((s) => s.is_active !== false);
    const keys = new Set<string>();

    activeSplits.forEach((s) => {
      const vendorId =
        s.recipient_type === "vendedor"
          ? s.recipient_user_id || ""
          : activeSplits.find(
              (v) =>
                v.table_rule_id === s.table_rule_id &&
                v.business_unit_id === s.business_unit_id &&
                v.recipient_type === "vendedor"
            )?.recipient_user_id || "";

      keys.add(`${s.table_rule_id}|${s.business_unit_id || ""}|${vendorId}`);
    });

    return Array.from(keys)
      .map((key) => {
        const [tableRuleId, unitId, vendorId] = key.split("|");
        const rule = tableRules.find((r) => r.id === tableRuleId);
        if (!rule) return null;

        const table =
          simTables.find((t) => t.id === rule.sim_table_id) ||
          simTables.find((t) => normalize(t.nome_tabela) === normalize(rule.nome_tabela));

        const rowSplits = activeSplits.filter(
          (s) =>
            s.table_rule_id === tableRuleId &&
            (s.business_unit_id || "") === unitId &&
            (
              s.recipient_type !== "vendedor" ||
              (s.recipient_user_id || "") === vendorId
            )
        );

        const vendedorSplit = rowSplits.find((s) => s.recipient_type === "vendedor");
        const unidadeSplit = rowSplits.find((s) => s.recipient_type === "unidade");
        const empresaSplit = rowSplits.find((s) => s.recipient_type === "empresa");
        const unidade = unitById[unitId];
        const vendedor = usersById[vendorId];
        const adminName = table?.admin_id ? adminById[table.admin_id] || rule.administradora || "—" : rule.administradora || "—";

        if (partAdminFilter !== "all" && table?.admin_id !== partAdminFilter && normalize(rule.administradora) !== normalize(adminName)) return null;
        if (partSegmentFilter !== "all" && table?.segmento !== partSegmentFilter && rule.segmento !== partSegmentFilter) return null;
        if (partRuleTableId && partRuleTableId !== "all" && partRuleTableId !== table?.id && partRuleTableId !== rule.sim_table_id) return null;
        if (partRuleUnitId && partRuleUnitId !== "all" && unitId !== partRuleUnitId) return null;
        if (partVendorId && partVendorId !== "all" && vendorId !== partVendorId) return null;

        return {
          key,
          administradora: adminName,
          segmento: table?.segmento || rule.segmento || "—",
          tabela: table?.nome_tabela || rule.nome_tabela || "—",
          unidadeNome: unidade?.nome || "—",
          vendedorNome: vendedor?.nome || vendedor?.email || "—",
          vendedorPct: Number(vendedorSplit?.split_percent) || 0,
          unidadePct: Number(unidadeSplit?.split_percent) || 0,
          matrizPct: Number(empresaSplit?.split_percent) || Math.max(0, 1 - (Number(vendedorSplit?.split_percent) || 0) - (Number(unidadeSplit?.split_percent) || 0)),
          commissionPct: Number(rule.percent_total) || 0,
          fluxo: Array.isArray(rule.fluxo_percentuais) ? rule.fluxo_percentuais : [],
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        String(a.unidadeNome).localeCompare(String(b.unidadeNome)) ||
        String(a.vendedorNome).localeCompare(String(b.vendedorNome)) ||
        String(a.administradora).localeCompare(String(b.administradora)) ||
        String(a.tabela).localeCompare(String(b.tabela))
      ) as Array<{
        key: string;
        administradora: string;
        segmento: string;
        tabela: string;
        unidadeNome: string;
        vendedorNome: string;
        vendedorPct: number;
        unidadePct: number;
        matrizPct: number;
        commissionPct: number;
        fluxo: number[];
      }>;
  }, [splitRules, tableRules, simTables, unitById, usersById, adminById, partAdminFilter, partSegmentFilter, partRuleTableId, partRuleUnitId, partVendorId]);

  const selectedTableRuleForForm = useMemo(() => {
    if (!tableRuleTableId) return null;
    const table = simTables.find((t) => t.id === tableRuleTableId);
    if (!table) return null;
    return (
      tableRules.find((r) => r.sim_table_id === table.id && r.is_active !== false) ||
      tableRules.find((r) => normalize(r.nome_tabela) === normalize(table.nome_tabela) && r.is_active !== false) ||
      null
    );
  }, [tableRuleTableId, simTables, tableRules]);

  useEffect(() => {
    if (!selectedTableRuleForForm) return;
    const totalPctHuman = (Number(selectedTableRuleForForm.percent_total) || 0) * 100;
    const fluxoSobreVenda = (selectedTableRuleForForm.fluxo_percentuais || []).map((p) => {
      const valor = (Number(p) || 0) * (Number(selectedTableRuleForForm.percent_total) || 0) * 100;
      return valor.toFixed(2).replace(".", ",");
    });

    setTableRuleTotalPct(totalPctHuman.toFixed(2).replace(".", ","));
    setTableRuleFluxoMeses(Math.max(1, fluxoSobreVenda.length || 1));
    setTableRuleFluxoPctList(fluxoSobreVenda.length ? fluxoSobreVenda : [totalPctHuman.toFixed(2).replace(".", ",")]);
  }, [selectedTableRuleForForm?.id]);

  function alterarQtdParcelasFluxoTabela(qtd: number) {
    const n = Math.max(1, Math.min(60, Number(qtd) || 1));
    setTableRuleFluxoMeses(n);
    setTableRuleFluxoPctList((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("0,00");
      return next.slice(0, n);
    });
  }

  const fluxoTabelaSomaPercentualVenda = useMemo(() => {
    return tableRuleFluxoPctList.reduce((acc, value) => acc + parsePctHumanToNumber(value), 0);
  }, [tableRuleFluxoPctList]);

  const fluxoTabelaPreviewText = useMemo(() => {
    return tableRuleFluxoPctList.map((value, idx) => `P${idx + 1}: ${value || "0,00"}%`).join(" • ");
  }, [tableRuleFluxoPctList]);

  const ruleSegmentOptions = useMemo(() => {
    let base = simTables;
    if (ruleAdminFilter !== "all") base = base.filter((t) => t.admin_id === ruleAdminFilter);
    const segs = Array.from(new Set(base.map((t) => t.segmento).filter(Boolean))) as string[];
    return segs.sort();
  }, [simTables, ruleAdminFilter]);

  const dedupedTables = useMemo(() => {
    const base = simTables
      .filter((t) => ruleAdminFilter === "all" || t.admin_id === ruleAdminFilter)
      .filter((t) => ruleSegmentFilter === "all" || t.segmento === ruleSegmentFilter);

    const groups = new Map<string, SimTable[]>();
    for (const t of base) {
      const key = normalize(t.nome_tabela) || t.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const repr: Array<{ key: string; rep: SimTable; all: SimTable[] }> = [];
    for (const [key, all] of groups.entries()) {
      const sorted = [...all].sort((a, b) => {
        const an = adminById[a.admin_id || ""] || "";
        const bn = adminById[b.admin_id || ""] || "";
        return an.localeCompare(bn) || (a.segmento || "").localeCompare(b.segmento || "") || a.nome_tabela.localeCompare(b.nome_tabela);
      });
      repr.push({ key, rep: sorted[0], all: sorted });
    }

    repr.sort((a, b) => {
      const an = adminById[a.rep.admin_id || ""] || "";
      const bn = adminById[b.rep.admin_id || ""] || "";
      return an.localeCompare(bn) || (a.rep.segmento || "").localeCompare(b.rep.segmento || "") || a.rep.nome_tabela.localeCompare(b.rep.nome_tabela);
    });

    return repr;
  }, [simTables, ruleAdminFilter, ruleSegmentFilter, adminById]);

  const getSimTableGroupByRep = (rep: SimTable) => {
    const key = normalize(rep.nome_tabela);
    if (!key) return [rep];
    return simTables.filter((t) => normalize(t.nome_tabela) === key);
  };

  async function fetchData() {
    setLoading(true);

    try {
      let qb = supabase.from("commissions").select("*");
      if (status !== "all") qb = qb.eq("status", status);

      if (!isAdmin) qb = qb.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);
      else if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
      else if (unitFilter !== "all") {
        const ids = users.filter((u) => u.unit_id === unitFilter).map((u) => u.id);
        qb = ids.length ? qb.in("vendedor_id", ids) : qb.eq("vendedor_id", "00000000-0000-0000-0000-000000000000");
      }

      if (periodStart) qb = qb.gte("data_venda", periodStart);
      if (periodEnd) qb = qb.lte("data_venda", periodEnd);
      if (adminFilter !== "all") qb = qb.eq("administradora", adminFilter);
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
      (flows || []).forEach((f: any) => {
        if (!flowBy[f.commission_id]) flowBy[f.commission_id] = [];
        if (!flowBy[f.commission_id].some((x) => x.mes === f.mes)) {
          flowBy[f.commission_id].push(f as CommissionFlow);
        }
      });

      const vendasExtras: Record<
        string,
        {
          clienteId?: string;
          numero_proposta?: string | null;
          cliente_nome?: string | null;
          codigo?: string | null;
          cancelada_em?: string | null;
          venda_cancelada?: boolean;
        }
      > = {};

      if (comms && comms.length) {
        const { data: vendas } = await supabase
          .from("vendas")
          .select("id, numero_proposta, cliente_lead_id, lead_id, codigo, cancelada_em")
          .in("id", comms.map((c: any) => c.venda_id));

        const cliIds = Array.from(
          new Set(
            (vendas || [])
              .map((v: any) => v.lead_id || v.cliente_lead_id)
              .filter(Boolean) as string[]
          )
        );

        const nomes: Record<string, string> = {};
        if (cliIds.length) {
          const { data: cli } = await supabase.from("leads").select("id, nome").in("id", cliIds);
          (cli || []).forEach((c: any) => {
            nomes[c.id] = c.nome || "";
          });
        }

        (vendas || []).forEach((v: any) => {
          const cid = v.lead_id || v.cliente_lead_id || undefined;
          const codigo = v.codigo ?? null;
          const cancelada_em = v.cancelada_em ?? null;
          const venda_cancelada = isVendaCancelada({ codigo, cancelada_em });

          vendasExtras[v.id] = {
            clienteId: cid,
            numero_proposta: v.numero_proposta || null,
            cliente_nome: cid ? nomes[cid] || null : null,
            codigo,
            cancelada_em,
            venda_cancelada,
          };
        });
      }

      const mappedRows: CommissionWithFlow[] =
        (comms || []).map((c: any) => ({
          ...(c as Commission),
          flow: flowBy[c.id] || [],
          cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
          numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
          venda_cancelada: !!vendasExtras[c.venda_id]?.venda_cancelada,
          venda_codigo: vendasExtras[c.venda_id]?.codigo ?? null,
          venda_cancelada_em: vendasExtras[c.venda_id]?.cancelada_em ?? null,
        })) || [];

      setRows(mappedRows);

      let qbV = supabase
        .from("vendas")
        .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id, encarteirada_em, codigo, cancelada_em, grupo, cota")
        .order("data_venda", { ascending: false });

      if (!isAdmin) qbV = qbV.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);
      else if (vendedorId !== "all") qbV = qbV.eq("vendedor_id", vendedorId);
      else if (unitFilter !== "all") {
        const ids = users.filter((u) => u.unit_id === unitFilter).map((u) => u.id);
        qbV = ids.length ? qbV.in("vendedor_id", ids) : qbV.eq("vendedor_id", "00000000-0000-0000-0000-000000000000");
      }

      if (periodStart) qbV = qbV.gte("data_venda", periodStart);
      if (periodEnd) qbV = qbV.lte("data_venda", periodEnd);
      if (adminFilter !== "all") qbV = qbV.eq("administradora", adminFilter);
      if (segmento !== "all") qbV = qbV.eq("segmento", segmento);
      if (tabela !== "all") qbV = qbV.eq("tabela", tabela);

      qbV = qbV.not("encarteirada_em", "is", null);

      const { data: vendasPeriodo } = await qbV;
      setAllVendasComissao((vendasPeriodo || []) as Venda[]);

      const [{ data: commVendaIds }, { data: partVendaIds }] = await Promise.all([
        supabase.from("commissions").select("venda_id"),
        supabase.from("commission_batches").select("venda_id").eq("legacy", false),
      ]);
      const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
      const hasPartComm = new Set((partVendaIds || []).map((r: any) => r.venda_id));

      const vendasFiltered = (vendasPeriodo || [])
        .filter((v: any) => !hasComm.has(v.id) && !hasPartComm.has(v.id))
        .filter((v: any) => !isVendaCancelada({ codigo: v.codigo ?? null, cancelada_em: v.cancelada_em ?? null }));

      setVendasSemCom(vendasFiltered as Venda[]);

      const clientIds = Array.from(
        new Set((vendasPeriodo || []).map((v: any) => v.lead_id || v.cliente_lead_id).filter((x: any): x is string => !!x))
      );

      if (clientIds.length) {
        const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clientIds);
        const map: Record<string, string> = {};
        (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
        setClientesMap(map);
      } else {
        setClientesMap({});
      }

      const [
        { data: freshTableRules },
        { data: freshSplitRules },
        { data: freshBatches },
        { data: freshEntries },
        { data: freshEntryFlows },
        { data: freshAdjustments },
      ] = await Promise.all([
        supabase.from("commission_table_rules").select("*").order("created_at", { ascending: false }),
        supabase.from("commission_split_rules").select("*").order("created_at", { ascending: true }),
        supabase.from("commission_batches").select("*").order("created_at", { ascending: false }).limit(3000),
        supabase.from("commission_entries").select("*").order("created_at", { ascending: false }).limit(6000),
        supabase.from("commission_entry_flow").select("*").order("mes", { ascending: true }).limit(10000),
        supabase.from("commission_adjustments").select("*").order("created_at", { ascending: false }).limit(3000),
      ]);

      const combinedVendasMap: Record<string, Venda> = {};
      (vendasPeriodo || []).forEach((v: any) => { combinedVendasMap[v.id] = v as Venda; });
      const missingPartitionVendaIds = Array.from(new Set(((freshBatches || []) as any[]).map((b) => b.venda_id).filter(Boolean))).filter((id) => !combinedVendasMap[id]);
      if (missingPartitionVendaIds.length) {
        const { data: partVendasInfo } = await supabase
          .from("vendas")
          .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id, encarteirada_em, codigo, cancelada_em, grupo, cota")
          .in("id", missingPartitionVendaIds);
        (partVendasInfo || []).forEach((v: any) => { combinedVendasMap[v.id] = v as Venda; });
      }
      const combinedVendasList = Object.values(combinedVendasMap);
      setAllVendasComissao(combinedVendasList);

      const combinedClientIds = Array.from(new Set(combinedVendasList.map((v: any) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
      if (combinedClientIds.length) {
        const { data: cli } = await supabase.from("leads").select("id, nome").in("id", combinedClientIds);
        const map: Record<string, string> = {};
        (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
        setClientesMap(map);
      }

      setTableRules((freshTableRules || []) as CommissionTableRule[]);
      setSplitRules((freshSplitRules || []) as CommissionSplitRule[]);
      setPartitionBatches((freshBatches || []) as CommissionBatch[]);
      setPartitionEntries((freshEntries || []) as CommissionEntry[]);
      setPartitionFlows((freshEntryFlows || []) as CommissionEntryFlow[]);
      setPartitionAdjustments((freshAdjustments || []) as CommissionAdjustment[]);


      try {
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
      } catch (e) {
        console.warn("[reconcile] erro:", e);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [vendedorId, status, segmento, tabela, unitFilter, adminFilter, periodStart, periodEnd, isAdmin, authUserId]);

  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const impostoFrac = useMemo(() => {
    const n = parsePctHumanToNumber(reciboImpostoPct);
    return (n || 0) / 100;
  }, [reciboImpostoPct]);

  const partitionBatchByVendaId = useMemo(() => {
    const m: Record<string, CommissionBatch> = {};
    partitionBatches.forEach((b) => {
      if (!b.legacy) m[b.venda_id] = b;
    });
    return m;
  }, [partitionBatches]);

  const partitionVendaById = useMemo(() => {
    const m: Record<string, Venda> = {};
    allVendasComissao.forEach((v) => (m[v.id] = v));
    rows.forEach((r) => {
      if (!m[r.venda_id]) {
        m[r.venda_id] = {
          id: r.venda_id,
          data_venda: r.data_venda || "",
          vendedor_id: r.vendedor_id,
          segmento: r.segmento,
          tabela: r.tabela,
          administradora: r.administradora,
          valor_venda: r.valor_venda || r.base_calculo || 0,
          numero_proposta: r.numero_proposta,
        } as Venda;
      }
    });
    return m;
  }, [allVendasComissao, rows]);


  const partitionEntriesVisible = useMemo(() => {
    return partitionEntries.filter((entry) => {
      const batch = partitionBatches.find((b) => b.id === entry.batch_id);
      const vendedor = batch?.vendedor_id ? usersById[batch.vendedor_id] : null;
      const unitId = entry.business_unit_id || batch?.business_unit_id || vendedor?.unit_id || null;

      if (!isMatrixAdmin) {
        if (isBranchManager && unitId !== currentUser?.unit_id) return false;
        if (!isBranchManager && entry.recipient_user_id !== currentUser?.id && batch?.vendedor_id !== currentUser?.id) return false;
      }

      if (unitFilter !== "all" && unitId !== unitFilter) return false;
      if (vendedorId !== "all" && entry.recipient_user_id !== vendedorId && batch?.vendedor_id !== vendedorId) return false;
      if (status !== "all" && entry.status !== status) return false;
      if (!isBetweenISO(batch?.data_venda, localDateFromISO(periodStart), localDateFromISO(periodEnd))) return false;

      const venda = batch ? partitionVendaById[batch.venda_id] : null;
      if (adminFilter !== "all" && normalize(venda?.administradora) !== normalize(adminFilter)) return false;

      return true;
    });
  }, [
    partitionEntries,
    partitionBatches,
    usersById,
    isMatrixAdmin,
    isBranchManager,
    currentUser,
    unitFilter,
    vendedorId,
    status,
    periodStart,
    periodEnd,
    adminFilter,
    partitionVendaById,
  ]);

  const partitionBatchRowsVisible = useMemo(() => {
    const visibleEntryIds = new Set(partitionEntriesVisible.map((entry) => entry.id));
    return partitionBatches
      .filter((batch) => partitionEntries.some((entry) => entry.batch_id === batch.id && visibleEntryIds.has(entry.id)))
      .map((batch) => {
        const batchEntries = partitionEntries.filter((entry) => entry.batch_id === batch.id && visibleEntryIds.has(entry.id));
        const allBatchEntries = partitionEntries.filter((entry) => entry.batch_id === batch.id);
        const venda = partitionVendaById[batch.venda_id];
        const unidade = unitById[batch.business_unit_id || ""];
        const vendedor = usersById[batch.vendedor_id];
        const flows = partitionFlows.filter((flow) => flow.batch_id === batch.id).sort((a, b) => a.mes - b.mes);
        const gross = batchEntries.reduce((acc, entry) => acc + (Number(entry.gross_amount) || 0), 0);
        const tax = batchEntries.reduce((acc, entry) => acc + (Number(entry.tax_amount) || 0), 0);
        const net = batchEntries.reduce((acc, entry) => acc + (Number(entry.net_amount) || 0), 0);
        const clienteId = venda?.lead_id || venda?.cliente_lead_id || "";
        const clienteNome = (clienteId && clientesMap[clienteId]?.trim()) || "";
        const search = normalize(commissionSearch);
        if (search) {
          const haystack = normalize([
            clienteNome,
            venda?.numero_proposta,
            venda?.grupo,
            venda?.cota,
            venda?.segmento,
            venda?.tabela,
            vendedor?.nome,
            unidade?.nome,
          ].filter(Boolean).join(" "));
          if (!haystack.includes(search)) return null;
        }

        return {
          batch,
          venda,
          unidade,
          vendedor,
          entries: batchEntries,
          allEntries: allBatchEntries,
          flows,
          clienteId,
          gross,
          tax,
          net,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String((b as any).batch.data_venda || "").localeCompare(String((a as any).batch.data_venda || ""))) as Array<{
        batch: CommissionBatch;
        venda: Venda | undefined;
        unidade: Unit | undefined;
        vendedor: User | undefined;
        entries: CommissionEntry[];
        allEntries: CommissionEntry[];
        flows: CommissionEntryFlow[];
        clienteId: string;
        gross: number;
        tax: number;
        net: number;
      }>;
  }, [partitionBatches, partitionEntries, partitionEntriesVisible, partitionVendaById, unitById, usersById, partitionFlows, clientesMap, commissionSearch]);

  const isPartitionBatchCancelada = (row: { venda?: Venda }) =>
    isVendaCancelada({ codigo: row.venda?.codigo ?? null, cancelada_em: row.venda?.cancelada_em ?? null });

  const partitionBatchRowsAPagar = useMemo(() =>
    partitionBatchRowsVisible.filter((row) => !isPartitionBatchCancelada(row) && !isFlowGroupPaid(row.flows)),
    [partitionBatchRowsVisible]
  );

  const partitionBatchRowsFinalizadas = useMemo(() =>
    partitionBatchRowsVisible.filter((row) => isFlowGroupPaid(row.flows)),
    [partitionBatchRowsVisible]
  );

  const partitionBatchRowsPerdidas = useMemo(() =>
    partitionBatchRowsVisible.filter((row) => isPartitionBatchCancelada(row) && !isFlowGroupPaid(row.flows)),
    [partitionBatchRowsVisible]
  );

  function paidInRangeGross(s: Date, e: Date) {
    const partitionPaid = partitionFlows.reduce((acc, f) => {
      const entry = partitionEntries.find((e0) => e0.id === f.entry_id);
      if (!entry || !partitionEntriesVisible.some((e0) => e0.id === entry.id)) return acc;
      if (!f.data_pagamento || !isBetweenISO(f.data_pagamento, s, e)) return acc;
      return acc + (Number(f.valor_pago) || 0);
    }, 0);

    return partitionPaid;
  }

  function previstoInRangeGross(s: Date, e: Date) {
    let total = 0;
    const operationalRows = rows.filter(isOperationalCommission);

    for (const r of operationalRows) {
      const totalComissao = totalCommissionGross(r);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

      for (const f of flows) {
        const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
        if (isPaid) continue;

        const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
        if (!exp) continue;

        if (exp.getTime() >= s.getTime() && exp.getTime() <= e.getTime()) {
          const expVal = Number(f.valor_previsto ?? totalComissao * (Number(f.percentual) || 0)) || 0;
          total += expVal;
        }
      }
    }

    for (const f of partitionFlows) {
      const entry = partitionEntries.find((e0) => e0.id === f.entry_id);
      if (!entry || !partitionEntriesVisible.some((e0) => e0.id === entry.id)) continue;
      const isPaid = f.status === "pago" || (Number(f.valor_pago) || 0) > 0;
      if (isPaid) continue;
      if (!f.data_pagamento) continue;
      const exp = localDateFromISO(f.data_pagamento);
      if (!exp) continue;
      if (exp.getTime() >= s.getTime() && exp.getTime() <= e.getTime()) {
        total += Number(f.valor_previsto) || 0;
      }
    }

    return total;
  }

  const kpi = useMemo(() => {
    const operationalRows = rows.filter(isOperationalCommission);
    const canceledRows = rows.filter((r) => r.venda_cancelada);

    const vendasTotal = sum(operationalRows.map((r) => r.valor_venda ?? r.base_calculo));

    const comBruta = sum(operationalRows.map((r) => totalCommissionGross(r)));
    const comLiquida = commissionNet(comBruta, impostoFrac);

    const comPagaBruta = sum(operationalRows.map((r) => paidCommissionGross(r)));
    const comPagaLiquida = commissionNet(comPagaBruta, impostoFrac);

    const comPendenteBruta = sum(operationalRows.map((r) => pendingCommissionGross(r)));
    const comPendenteLiquida = commissionNet(comPendenteBruta, impostoFrac);

    const comPerdidaBruta = sum(canceledRows.map((r) => lostCommissionGross(r)));
    const comPerdidaLiquida = commissionNet(comPerdidaBruta, impostoFrac);

    return {
      vendasTotal,
      comBruta,
      comLiquida,
      comPagaBruta,
      comPagaLiquida,
      comPendenteBruta,
      comPendenteLiquida,
      comPerdidaBruta,
      comPerdidaLiquida,
    };
  }, [rows, impostoFrac]);

  const annual = useMemo(() => projectAnnualFlows(rows), [rows]);
  const monthlyCurr = useMemo(() => projectMonthlyFlows(rows, new Date().getFullYear(), true), [rows]);
  const weeklyCurr = useMemo(() => projectWeeklyFlows(rows), [rows]);

  const previousYearMonthly = useMemo(() => projectMonthlyFlows(rows, new Date().getFullYear() - 1, false), [rows]);

  const comissaoProgramada = useMemo(() => {
    const programadas: Array<{ dateIso: string; bruto: number; liquido: number }> = [];

    for (const r of rows) {
      if (!isOperationalCommission(r)) continue;

      const totalComissao = totalCommissionGross(r);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

      for (const f of flows) {
        const dataProgramada = f.data_pagamento_vendedor;
        const valorJaPago = Number(f.valor_pago_vendedor) || 0;

        if (!dataProgramada) continue;
        if (valorJaPago > 0) continue;

        const bruto = Number(f.valor_previsto ?? totalComissao * (Number(f.percentual) || 0)) || 0;
        const liquido = commissionNet(bruto, impostoFrac);

        programadas.push({
          dateIso: dataProgramada,
          bruto,
          liquido,
        });
      }
    }

    for (const f of partitionFlows) {
      const entry = partitionEntries.find((e) => e.id === f.entry_id);
      if (!entry || !partitionEntriesVisible.some((visible) => visible.id === entry.id)) continue;
      const isPaid = f.status === "pago" || (Number(f.valor_pago) || 0) > 0;
      if (isPaid || !f.data_pagamento) continue;
      const bruto = Number(f.valor_previsto) || 0;
      programadas.push({
        dateIso: f.data_pagamento,
        bruto,
        liquido: commissionNet(bruto, impostoFrac),
      });
    }

    if (!programadas.length) return null;

    programadas.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    const proxData = programadas[0].dateIso;

    const brutoTotal = programadas.filter((x) => x.dateIso === proxData).reduce((acc, cur) => acc + cur.bruto, 0);
    const liquidoTotal = programadas.filter((x) => x.dateIso === proxData).reduce((acc, cur) => acc + cur.liquido, 0);

    return {
      data: proxData,
      bruto: brutoTotal,
      liquido: liquidoTotal,
    };
  }, [rows, partitionFlows, partitionEntries, partitionEntriesVisible, impostoFrac]);

  function onChangeMeses(n: number) {
    setRuleMeses(n);
    const arr = [...ruleFluxoPct];

    if (n > arr.length) {
      while (arr.length < n) arr.push("0,00");
    } else {
      arr.length = n;
    }

    setRuleFluxoPct(arr);
  }

  const fluxoSoma = useMemo(
    () => ruleFluxoPct.reduce((a, b) => a + (parseFloat((b || "0").replace(",", ".")) || 0), 0),
    [ruleFluxoPct]
  );

  async function fetchRulesForVendor(vId: string) {
    if (!vId) {
      setRuleRows([]);
      return;
    }

    const { data: rules } = await supabase
      .from("commission_rules")
      .select("vendedor_id, sim_table_id, percent_padrao, fluxo_meses, fluxo_percentuais, obs")
      .eq("vendedor_id", vId);

    if (!rules || !rules.length) {
      setRuleRows([]);
      return;
    }

    const rowsOut = (rules as any[]).map((r) => {
      const st = simTables.find((t) => t.id === r.sim_table_id);
      const adminName = st?.admin_id ? adminById[st.admin_id] || "—" : "—";

      return {
        ...(r as CommissionRule),
        segmento: st?.segmento || "-",
        nome_tabela: st?.nome_tabela || "-",
        administradora: adminName,
      } as CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null };
    });

    setRuleRows(rowsOut);
  }

  useEffect(() => {
    if (openRules && ruleVendorId) {
      fetchRulesForVendor(ruleVendorId);
    }
  }, [openRules, ruleVendorId, simTables, adminById]);

  useEffect(() => {
    if (!openRules) {
      setRuleAdminFilter("all");
      setRuleSegmentFilter("all");
    }
  }, [openRules]);

  async function saveRule() {
    if (!canEdit) return alert("Vendedor não pode alterar regras.");
    if (!ruleVendorId) return alert("Selecione o vendedor.");
    if (!ruleSimTableId) return alert("Selecione a tabela.");

    const pctPadraoPercent = parseFloat((rulePercent || "0").replace(",", "."));
    if (!isFinite(pctPadraoPercent) || pctPadraoPercent <= 0) return alert("Informe o % Padrão corretamente.");

    const somaFluxo = fluxoSoma;
    const soma100 = Math.abs(somaFluxo - 1.0) < 1e-6;
    const somaIgualPadrao = Math.abs(somaFluxo - pctPadraoPercent) < 1e-6;

    if (!(soma100 || somaIgualPadrao)) {
      return alert(`Soma do fluxo deve ser 1,00 (100%) ou igual ao % padrão. Soma atual = ${somaFluxo.toFixed(2).replace(".", ",")}`);
    }

    let fluxo_percentuais_frac: number[] = [];
    if (soma100) {
      fluxo_percentuais_frac = ruleFluxoPct.map((x) => parseFloat((x || "0").replace(",", ".")) || 0);
    } else {
      fluxo_percentuais_frac = ruleFluxoPct.map((x) => {
        const v = parseFloat((x || "0").replace(",", ".")) || 0;
        return pctPadraoPercent > 0 ? v / pctPadraoPercent : 0;
      });
    }

    const percent_padrao_frac = pctPadraoPercent / 100;

    const baseTable = simTables.find((t) => t.id === ruleSimTableId) || ruleFormSimTable;
    const group = baseTable
      ? simTables.filter((t) => normalize(t.nome_tabela) === normalize(baseTable.nome_tabela))
      : ([{ id: ruleSimTableId }] as any[]);

    const payload = group.map((t) => ({
      vendedor_id: ruleVendorId,
      sim_table_id: t.id,
      percent_padrao: percent_padrao_frac,
      fluxo_meses: ruleMeses,
      fluxo_percentuais: fluxo_percentuais_frac,
      obs: ruleObs || null,
    }));

    const { error } = await supabase.from("commission_rules").upsert(payload as any[], { onConflict: "vendedor_id,sim_table_id" });
    if (error) return alert(error.message);

    await fetchRulesForVendor(ruleVendorId);
    setRuleFormOpen(false);
    alert(`Regra salva e aplicada em ${payload.length} tabela(s) com o mesmo nome.`);
  }

  async function deleteRuleGroup(vId: string, simTableId: string) {
    if (!canEdit) return alert("Vendedor não pode alterar regras.");
    if (!vId || !simTableId) return;
    if (!confirm("Excluir regra desta tabela (e duplicadas com mesmo nome)?")) return;

    const baseTable = simTables.find((t) => t.id === simTableId);
    const group = baseTable
      ? simTables.filter((t) => normalize(t.nome_tabela) === normalize(baseTable.nome_tabela))
      : ([{ id: simTableId }] as any[]);
    const ids = group.map((t) => t.id);

    const { error } = await supabase.from("commission_rules").delete().eq("vendedor_id", vId).in("sim_table_id", ids);
    if (error) return alert(error.message);

    await fetchRulesForVendor(vId);
  }

  function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null }) {
    setRuleVendorId(r.vendedor_id);
    setRuleSimTableId(r.sim_table_id);

    const percentPadrao = (r.percent_padrao ?? 0) * 100;
    const meses = r.fluxo_meses && r.fluxo_meses > 0 ? r.fluxo_meses : 1;
    const fluxos = (r.fluxo_percentuais && r.fluxo_percentuais.length ? r.fluxo_percentuais : Array.from({ length: meses }, () => 0)).map((p) =>
      (p * percentPadrao).toFixed(2).replace(".", ",")
    );

    setRulePercent(percentPadrao.toFixed(2).replace(".", ","));
    setRuleMeses(meses);
    setRuleFluxoPct(fluxos);
    setRuleObs(r.obs || "");
  }

  function openRuleFormForTable(rep: SimTable) {
    if (!canEdit) return alert("Vendedor não pode alterar regras.");

    if (!ruleVendorId) {
      alert("Selecione um vendedor primeiro.");
      return;
    }

    const group = getSimTableGroupByRep(rep);
    const groupIds = new Set(group.map((t) => t.id));
    const existing = ruleRows.find((r) => r.vendedor_id === ruleVendorId && groupIds.has(r.sim_table_id));

    setRuleFormSimTable(rep);
    setRuleSimTableId(rep.id);

    if (existing) {
      loadRuleToForm(existing);
    } else {
      setRulePercent("1,20");
      setRuleMeses(1);
      setRuleFluxoPct(["100,00"]);
      setRuleObs("");
    }

    setRuleFormOpen(true);
  }

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

    const valorTotal = totalCommissionGross(c);
    const inserts = percentuais.map((p, idx) => ({
      commission_id: c.id,
      mes: idx + 1,
      percentual: p,
      valor_previsto: Math.round(valorTotal * p * 100) / 100,
      valor_recebido_admin: null,
      data_recebimento_admin: null,
      valor_pago_vendedor: 0,
      data_pagamento_vendedor: null,
      recibo_vendedor_url: null,
      comprovante_pagto_url: null,
    }));

    const { error } = await supabase.from("commission_flow").insert(inserts as any[]);
    if (error) console.warn("[ensureFlowForCommission] erro ao inserir fluxo:", error.message);

    const { data: created } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    return (created || []) as CommissionFlow[];
  }

  async function openPaymentFor(c: CommissionWithFlow) {
    if (!canEdit) return alert("Vendedor não pode registrar pagamento.");

    setPayCommissionId(c.id);

    let { data } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });

    if (!data || data.length === 0) {
      const created = await ensureFlowForCommission(c);
      data = created as any;
    }

    const totalGross = totalCommissionGross(c);
    const arr = (data || []).map((f: any) => ({
      ...f,
      _valor_previsto_calc: totalGross * (Number(f.percentual) || 0),
    }));

    const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
    arr.forEach((f: any) => uniq.set(f.mes, f));

    const finalArr = Array.from(uniq.values());

    setPayFlow(finalArr);
    setPaySelected({});

    const registered = hasRegisteredButUnpaid(finalArr);
    setPayDefaultTab(registered ? "arquivos" : "selecionar");
    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  async function uploadToBucket(file: File, commissionId: string) {
    const path = `${commissionId}/${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
    if (error) {
      alert("Falha ao enviar arquivo: " + error.message);
      return null;
    }

    return data?.path || null;
  }

  async function getSignedUrl(path: string | null | undefined) {
    if (!path) return null;

    const { data, error } = await supabase.storage.from("comissoes").createSignedUrl(path, 60 * 10);
    if (error) {
      console.warn("Signed URL error:", error.message);
      return null;
    }

    return (data as any)?.signedUrl || null;
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    if (!canEdit) return alert("Vendedor não pode registrar pagamento.");

    let reciboPath: string | null = null;
    let compPath: string | null = null;

    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

    const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);
    const selected = candidates.filter((f) => paySelected[f.id]);

    if (!selected.length) {
      alert("Selecione pelo menos uma parcela para pagar.");
      return;
    }

    for (const f of selected) {
      const { error } = await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor: payload.data_pagamento_vendedor || f.data_pagamento_vendedor || toDateInput(new Date()),
          valor_pago_vendedor: payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : f.valor_pago_vendedor ?? 0,
          recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
          comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
        })
        .eq("id", f.id);

      if (error) {
        alert("Falha ao atualizar parcela: " + error.message);
        return;
      }
    }

    const { data: fresh } = await supabase.from("commission_flow").select("*").eq("commission_id", payCommissionId).order("mes", { ascending: true });

    const relevant = (fresh || []).filter((f: any) => (Number(f.percentual) || 0) > 0);
    const isAllPaid = relevant.length > 0 && relevant.every((f: any) => (Number(f.valor_pago_vendedor) || 0) > 0);

    const { error: updErr } = await supabase
      .from("commissions")
      .update({
        status: isAllPaid ? "pago" : "a_pagar",
        data_pagamento: isAllPaid ? payload.data_pagamento_vendedor || toDateInput(new Date()) : null,
      })
      .eq("id", payCommissionId);

    if (updErr) console.warn("[commissions.update] falhou:", updErr.message);

    const uniq = new Map<number, CommissionFlow>();
    (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
    const freshArr = Array.from(uniq.values()) as CommissionFlow[];

    setPayFlow(freshArr);
    setRows((prev) => prev.map((r) => (r.id === payCommissionId ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" } : r)));

    if (isAllPaid) {
      setShowPaid(true);
      setStatus("pago");
    }

    setOpenPay(false);
    fetchData();
  }

  async function searchRefundByProposal() {
    const prop = (bulkRefundProp || "").trim();

    if (!prop) {
      setBulkRefundFound(null);
      return;
    }

    const { data: vendas } = await supabase.from("vendas").select("id, numero_proposta, vendedor_id, valor_venda").ilike("numero_proposta", `%${prop}%`);

    if (!vendas?.length) {
      setBulkRefundFound(null);
      alert("Proposta não encontrada.");
      return;
    }

    const vendaIds = vendas.map((v: any) => v.id);

    let qb = supabase.from("commissions").select("*").in("venda_id", vendaIds);
    if (!isAdmin) qb = qb.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);

    const { data: comms } = await qb;
    const comm = comms?.[0] as Commission | undefined;

    if (!comm) {
      setBulkRefundFound(null);
      alert("Nenhuma comissão encontrada para essa proposta.");
      return;
    }

    const { data: flows } = await supabase.from("commission_flow").select("*").eq("commission_id", comm.id);
    const paid = (flows || [])
      .filter((f: any) => (f.valor_pago_vendedor ?? 0) > 0)
      .sort((a: any, b: any) => (a.data_pagamento_vendedor || "").localeCompare(b.data_pagamento_vendedor || ""));

    if (!paid.length) {
      setBulkRefundFound(null);
      alert("Esta proposta não possui parcelas pagas.");
      return;
    }

    setBulkRefundFound({ comm, flows: paid });
  }

  async function confirmBulkRefund() {
    if (!canEdit) return alert("Vendedor não pode estornar.");
    if (!bulkRefundFound) return;

    const gross = parseBRL(bulkRefundGross);
    if (gross <= 0) {
      alert("Informe o valor bruto do estorno.");
      return;
    }

    setBusyRefund(true);

    try {
      let remaining = gross;
      const ordered = [...bulkRefundFound.flows].sort((a, b) => (b.data_pagamento_vendedor || "").localeCompare(a.data_pagamento_vendedor || ""));

      for (const f of ordered) {
        const current = Math.max(0, f.valor_pago_vendedor ?? 0);
        if (remaining <= 0) break;

        const take = Math.min(current, remaining);
        const newPaid = current - take;

        const { error } = await supabase.from("commission_flow").update({ valor_pago_vendedor: newPaid } as any).eq("id", f.id);
        if (error) throw new Error(error.message);

        remaining -= take;

        try {
          const net = commissionNet(take, impostoFrac);
          await supabase.from("commission_refunds").insert({
            commission_id: f.commission_id,
            flow_id: f.id,
            numero_proposta: bulkRefundFound.comm.numero_proposta || null,
            data_estorno: bulkRefundDate,
            valor_bruto: take,
            valor_liquido: net,
          } as any);
        } catch (e: any) {
          console.warn("[commission_refunds] tabela ausente/erro ao registrar:", e?.message);
        }
      }

      await supabase.from("commissions").update({ status: "estorno" }).eq("id", bulkRefundFound.comm.id);

      setOpenBulkRefund(false);
      setBulkRefundFound(null);
      setBulkRefundGross("");
      fetchData();
      alert("Estorno registrado com sucesso.");
    } catch (e: any) {
      alert("Falha ao registrar estorno: " + (e?.message || e));
    } finally {
      setBusyRefund(false);
    }
  }


  const combinedKpi = useMemo(() => {
    const visibleEntryIds = new Set(partitionEntriesVisible.map((entry) => entry.id));
    const paidByEntry = new Map<string, number>();
    const scheduledByEntry = new Map<string, number>();

    for (const flow of partitionFlows) {
      if (!visibleEntryIds.has(flow.entry_id)) continue;
      const previsto = Number(flow.valor_previsto) || 0;
      const pago = Number(flow.valor_pago) || 0;
      const isPaid = flow.status === "pago" || pago > 0;

      if (pago > 0) {
        paidByEntry.set(flow.entry_id, (paidByEntry.get(flow.entry_id) || 0) + pago);
      }

      if (!isPaid && previsto > 0 && !!flow.data_pagamento) {
        scheduledByEntry.set(flow.entry_id, (scheduledByEntry.get(flow.entry_id) || 0) + Math.max(0, previsto - pago));
      }
    }

    let partitionBruta = 0;
    let partitionPaga = 0;
    let partitionPendente = 0;
    let partitionPerdida = 0;
    let partitionProgramada = 0;
    let proximaDataProgramada: string | null = null;
    const partitionVendaIds = new Set<string>();

    for (const flow of partitionFlows) {
      if (!visibleEntryIds.has(flow.entry_id)) continue;
      const previsto = Number(flow.valor_previsto) || 0;
      const pago = Number(flow.valor_pago) || 0;
      const isPaid = flow.status === "pago" || pago > 0;
      if (!isPaid && previsto > 0 && !!flow.data_pagamento) {
        if (!proximaDataProgramada || flow.data_pagamento < proximaDataProgramada) proximaDataProgramada = flow.data_pagamento;
      }
    }

    for (const entry of partitionEntriesVisible) {
      const batch = partitionBatches.find((b) => b.id === entry.batch_id);
      const venda = batch ? partitionVendaById[batch.venda_id] : partitionVendaById[entry.venda_id];
      const cancelada = isVendaCancelada({ codigo: venda?.codigo ?? null, cancelada_em: venda?.cancelada_em ?? null });
      const gross = Number(entry.gross_amount) || 0;
      const paid = paidByEntry.get(entry.id) || 0;
      const unpaid = Math.max(0, gross - paid);

      if (!cancelada) {
        partitionVendaIds.add(entry.venda_id);
        partitionBruta += gross;
        partitionPaga += paid;
        partitionPendente += unpaid;
        partitionProgramada += scheduledByEntry.get(entry.id) || 0;
      } else {
        partitionPerdida += unpaid;
      }
    }

    const partitionVendasTotal = Array.from(partitionVendaIds).reduce<number>((acc, vendaId) => {
      const venda = partitionVendaById[vendaId];
      const batch = partitionBatches.find((b) => b.venda_id === vendaId);
      return acc + (Number(venda?.valor_venda ?? batch?.valor_venda) || 0);
    }, 0);

    return {
      vendasTotal: partitionVendasTotal,
      comBruta: partitionBruta,
      comLiquida: commissionNet(partitionBruta, impostoFrac),
      comPagaBruta: partitionPaga,
      comPagaLiquida: commissionNet(partitionPaga, impostoFrac),
      comPendenteBruta: partitionPendente,
      comPendenteLiquida: commissionNet(partitionPendente, impostoFrac),
      comPerdidaBruta: partitionPerdida,
      comPerdidaLiquida: commissionNet(partitionPerdida, impostoFrac),
      comProgramadaBruta: partitionProgramada,
      comProgramadaLiquida: commissionNet(partitionProgramada, impostoFrac),
      proximaDataProgramada,
    };
  }, [partitionEntriesVisible, partitionFlows, partitionVendaById, partitionBatches, impostoFrac]);

  function findPartitionRuleForVenda(venda: Venda) {
    const vendaTabela = normalize(venda.tabela);
    const vendaAdmin = normalize(venda.administradora);

    return (
      tableRules.find(
        (r) =>
          r.is_active !== false &&
          normalize(r.nome_tabela) === vendaTabela &&
          (!r.administradora || normalize(r.administradora) === vendaAdmin)
      ) ||
      tableRules.find((r) => r.is_active !== false && normalize(r.nome_tabela) === vendaTabela) ||
      null
    );
  }

  async function salvarRegraTabelaParticionada() {
    if (!canEdit) return alert("Somente admin pode configurar regras de comissão.");
    if (!tableRuleTableId) return alert("Selecione a tabela.");

    const table = simTables.find((t) => t.id === tableRuleTableId);
    if (!table) return alert("Tabela não encontrada.");

    const percentTotal = parsePctHumanToNumber(tableRuleTotalPct) / 100;
    if (percentTotal <= 0) return alert("Informe a comissão total da tabela.");

    const fluxoRaw = tableRuleFluxoPctList.map((x) => parsePctHumanToNumber(String(x ?? "0").trim() || "0") / 100);
    if (!fluxoRaw.length || fluxoRaw.some((x) => !isFinite(x) || x < 0)) {
      return alert("Informe percentuais válidos no fluxo de pagamento. Parcelas zeradas são permitidas.");
    }

    const fluxoComoPercentualDaVenda = fluxoRaw.reduce((a, b) => a + b, 0);
    if (Math.abs(fluxoComoPercentualDaVenda - percentTotal) > 0.001) {
      return alert(
        `O fluxo precisa somar a comissão total da tabela. Comissão total: ${formatPctHuman(percentTotal * 100)}. Soma do fluxo: ${formatPctHuman(fluxoComoPercentualDaVenda * 100)}.`
      );
    }

    const fluxoPercentuais = fluxoRaw.map((x) => x / percentTotal);
    const adminName = table.admin_id ? adminById[table.admin_id] || null : null;
    const payload = {
      sim_table_id: table.id,
      administradora: adminName,
      segmento: table.segmento,
      nome_tabela: table.nome_tabela,
      percent_total: percentTotal,
      fluxo_meses: fluxoPercentuais.length,
      fluxo_percentuais: fluxoPercentuais,
      is_active: true,
      created_by: authUserId,
    } as any;

    const existing = tableRules.find((r) => r.sim_table_id === table.id && r.is_active !== false);
    const { error } = existing
      ? await supabase.from("commission_table_rules").update(payload).eq("id", existing.id)
      : await supabase.from("commission_table_rules").insert(payload);

    if (error) return alert("Erro ao salvar regra da tabela: " + error.message);

    await fetchData();
    alert("Regra da tabela salva com sucesso.");
  }

  async function salvarRegraParticionada() {
    if (!canEdit) return alert("Somente admin pode configurar partilhas.");
    if (!partRuleTableId) return alert("Selecione a tabela.");
    if (!partRuleUnitId) return alert("Selecione a unidade.");
    if (!partVendorId) return alert("Selecione o vendedor de referência da unidade.");

    const table = simTables.find((t) => t.id === partRuleTableId);
    if (!table) return alert("Tabela não encontrada.");

    const rule =
      tableRules.find((r) => r.sim_table_id === table.id && r.is_active !== false) ||
      tableRules.find((r) => normalize(r.nome_tabela) === normalize(table.nome_tabela) && r.is_active !== false);

    if (!rule) return alert("Cadastre primeiro a regra de comissão dessa tabela em Regras de Comissão.");

    const splitVendedor = parsePctHumanToNumber(partSplitVendedor) / 100;
    const splitUnidade = parsePctHumanToNumber(partSplitUnidade) / 100;
    const splitEmpresa = 1 - splitVendedor - splitUnidade;

    if (splitVendedor < 0 || splitUnidade < 0 || splitEmpresa < -0.001) {
      return alert("A soma de Vendedor + Unidade não pode passar de 100%.");
    }

    const unidade = unitById[partRuleUnitId];
    const vendedor = usersById[partVendorId];
    if (!unidade) return alert("Unidade não encontrada.");
    if (!vendedor) return alert("Vendedor não encontrado.");
    if (vendedor.unit_id && vendedor.unit_id !== partRuleUnitId) {
      return alert("O vendedor selecionado não está vinculado à unidade escolhida.");
    }

    const matrixManagerId = matrixUnit?.manager_user_id || null;
    const unitManagerId = unidade.manager_user_id || null;

    const { error: delErr } = await supabase
      .from("commission_split_rules")
      .delete()
      .eq("table_rule_id", rule.id)
      .eq("business_unit_id", partRuleUnitId);

    if (delErr) return alert("Erro ao substituir partilha anterior: " + delErr.message);

    const splitPayload = [
      {
        table_rule_id: rule.id,
        business_unit_id: partRuleUnitId,
        recipient_type: "vendedor",
        recipient_user_id: partVendorId,
        recipient_unit_id: partRuleUnitId,
        split_percent: splitVendedor,
        is_active: true,
        created_by: authUserId,
      },
      {
        table_rule_id: rule.id,
        business_unit_id: partRuleUnitId,
        recipient_type: "unidade",
        recipient_user_id: unitManagerId,
        recipient_unit_id: partRuleUnitId,
        split_percent: splitUnidade,
        is_active: true,
        created_by: authUserId,
      },
      {
        table_rule_id: rule.id,
        business_unit_id: partRuleUnitId,
        recipient_type: "empresa",
        recipient_user_id: matrixManagerId,
        recipient_unit_id: matrixUnit?.id || null,
        split_percent: Math.max(0, splitEmpresa),
        is_active: true,
        created_by: authUserId,
      },
    ];

    const { error: splitErr } = await supabase.from("commission_split_rules").insert(splitPayload as any[]);
    if (splitErr) return alert("Erro ao salvar partilha: " + splitErr.message);

    await fetchData();
    alert("Partilha da unidade salva com sucesso.");
  }

  async function gerarComissaoParticionadaDeVenda(venda: Venda) {
    const vendedor = canonUserId(venda.vendedor_id);
    const userVendedor = vendedor ? usersById[vendedor] : null;
    if (!userVendedor?.unit_id) throw new Error("Vendedor sem unidade vinculada.");

    if (partitionBatchByVendaId[venda.id]) throw new Error("Esta venda já possui comissão particionada.");

    const rule = findPartitionRuleForVenda(venda);
    if (!rule) return false;

    const splitsDaUnidade = splitRules.filter(
      (s) => s.table_rule_id === rule.id && s.business_unit_id === userVendedor.unit_id && s.is_active !== false
    );

    if (!splitsDaUnidade.length) throw new Error("Existe regra da tabela, mas não há partilha para a unidade do vendedor.");

    const totalSplit = splitsDaUnidade.reduce((acc, cur) => acc + (Number(cur.split_percent) || 0), 0);
    if (Math.abs(totalSplit - 1) > 0.001) throw new Error("A soma da partilha dessa regra não fecha 100%.");

    const valorVenda = Number(venda.valor_venda) || 0;
    const commissionTotal = Math.round(valorVenda * (Number(rule.percent_total) || 0) * 100) / 100;

    const { data: batch, error: batchErr } = await supabase
      .from("commission_batches")
      .insert({
        venda_id: venda.id,
        sim_table_id: rule.sim_table_id,
        table_rule_id: rule.id,
        business_unit_id: userVendedor.unit_id,
        vendedor_id: userVendedor.id,
        data_venda: venda.data_venda,
        valor_venda: valorVenda,
        percent_total: rule.percent_total,
        commission_total_gross: commissionTotal,
        status: "a_pagar",
        legacy: false,
        created_by: authUserId,
      } as any)
      .select("*")
      .single();

    if (batchErr) throw batchErr;

    const saleUnit = unitById[userVendedor.unit_id];
    const fluxo = Array.isArray(rule.fluxo_percentuais) && rule.fluxo_percentuais.length ? rule.fluxo_percentuais : [1];

    for (const split of splitsDaUnidade) {
      const isEmpresa = split.recipient_type === "empresa";
      const isUnidade = split.recipient_type === "unidade";

      const recipientUserId =
        split.recipient_type === "vendedor"
          ? userVendedor.id
          : split.recipient_user_id || (isEmpresa ? matrixUnit?.manager_user_id || null : saleUnit?.manager_user_id || null);

      const recipientUnitId = isEmpresa ? matrixUnit?.id || null : isUnidade ? saleUnit?.id || null : split.recipient_unit_id || null;
      const businessUnitId = isEmpresa ? matrixUnit?.id || null : userVendedor.unit_id;
      const gross = Math.round(commissionTotal * (Number(split.split_percent) || 0) * 100) / 100;
      const tax = Math.round(gross * impostoFrac * 100) / 100;

      const { data: entry, error: entryErr } = await supabase
        .from("commission_entries")
        .insert({
          batch_id: batch.id,
          venda_id: venda.id,
          recipient_type: split.recipient_type,
          recipient_user_id: recipientUserId,
          recipient_unit_id: recipientUnitId,
          business_unit_id: businessUnitId,
          split_percent: split.split_percent,
          gross_amount: gross,
          tax_amount: tax,
          net_amount: gross - tax,
          status: "a_pagar",
          created_by: authUserId,
        } as any)
        .select("*")
        .single();

      if (entryErr) throw entryErr;

      const flowPayload = fluxo.map((p, idx) => ({
        entry_id: entry.id,
        batch_id: batch.id,
        mes: idx + 1,
        percentual: Number(p) || 0,
        valor_previsto: Math.round(gross * (Number(p) || 0) * 100) / 100,
        valor_pago: 0,
        data_pagamento: null,
        status: "a_pagar",
      }));

      const { error: flowErr } = await supabase.from("commission_entry_flow").insert(flowPayload as any[]);
      if (flowErr) throw flowErr;
    }

    return true;
  }

  function programarPagamentoParticionado(flow: CommissionEntryFlow) {
    if (!canEdit) return alert("Somente admin pode programar pagamento.");
    setPartitionScheduleFlow(flow);
    setPartitionScheduleDateBR(isoToBRDate(flow.data_pagamento || toDateInput(new Date())));
  }

  async function confirmarProgramacaoParticionada() {
    if (!canEdit) return alert("Somente admin pode programar pagamento.");
    if (!partitionScheduleFlow) return;

    const dataISO = brDateToISO(partitionScheduleDateBR);
    if (!dataISO) return alert("Informe a data no formato dd/mm/aaaa.");

    // Programa a mesma parcela da venda para Matriz, Unidade e Vendedor de uma só vez.
    const { error } = await supabase
      .from("commission_entry_flow")
      .update({ data_pagamento: dataISO, status: "a_pagar" } as any)
      .eq("batch_id", partitionScheduleFlow.batch_id)
      .eq("mes", partitionScheduleFlow.mes);

    if (error) return alert("Erro ao programar pagamento: " + error.message);

    setPartitionScheduleFlow(null);
    fetchData();
  }

  function abrirPagamentoParticionado(flow: CommissionEntryFlow) {
    setPartitionPayFlow(flow);
    setPartitionPayDate(flow.data_pagamento || toDateInput(new Date()));
    setPartitionPayUnidadeFile(null);
    setPartitionPayVendedorFile(null);
    setPartitionPayDispensarUnidade(false);
    setPartitionPayDispensarVendedor(false);
  }

  async function confirmarPagamentoParticionado() {
    if (!canEdit) return alert("Somente admin pode registrar pagamento.");
    if (!partitionPayFlow) return;
    if (!partitionPayDate) return alert("Informe a data do pagamento.");

    // Pagamento é por venda/parcela. Uma confirmação sensibiliza Empresa, Unidade e Vendedor de uma vez.
    const sameParcelFlows = partitionFlows.filter((f) => f.batch_id === partitionPayFlow.batch_id && f.mes === partitionPayFlow.mes);
    const payableFlows = sameParcelFlows.filter((f) => (Number(f.valor_previsto) || 0) > 0);
    const relatedEntries = partitionEntries.filter((entry) => sameParcelFlows.some((flow) => flow.entry_id === entry.id));
    const hasUnidade = relatedEntries.some((entry) => entry.recipient_type === "unidade");
    const hasVendedor = relatedEntries.some((entry) => entry.recipient_type === "vendedor");

    if (hasUnidade && !partitionPayUnidadeFile && !partitionPayDispensarUnidade) {
      return alert("Anexe o comprovante da Unidade ou marque Dispensar.");
    }

    if (hasVendedor && !partitionPayVendedorFile && !partitionPayDispensarVendedor) {
      return alert("Anexe o comprovante do Vendedor ou marque Dispensar.");
    }

    let comprovanteUnidadePath: string | null = null;
    let comprovanteVendedorPath: string | null = null;

    if (partitionPayUnidadeFile) {
      comprovanteUnidadePath = await uploadToBucket(partitionPayUnidadeFile, partitionPayFlow.entry_id);
      if (!comprovanteUnidadePath) return;
    }

    if (partitionPayVendedorFile) {
      comprovanteVendedorPath = await uploadToBucket(partitionPayVendedorFile, partitionPayFlow.entry_id);
      if (!comprovanteVendedorPath) return;
    }

    for (const flow of payableFlows) {
      const entry = partitionEntries.find((item) => item.id === flow.entry_id);
      const expected = Number(flow.valor_previsto) || 0;
      const payload: any = { valor_pago: expected, data_pagamento: partitionPayDate, status: "pago" };

      if (entry?.recipient_type === "unidade") {
        if (comprovanteUnidadePath) {
          payload.comprovante_url = comprovanteUnidadePath;
          payload.comprovante_unidade_url = comprovanteUnidadePath;
        }
        if (partitionPayDispensarUnidade) {
          payload.comprovante_dispensado = true;
          payload.comprovante_unidade_dispensado = true;
        }
      }

      if (entry?.recipient_type === "vendedor") {
        if (comprovanteVendedorPath) {
          payload.comprovante_url = comprovanteVendedorPath;
          payload.comprovante_vendedor_url = comprovanteVendedorPath;
        }
        if (partitionPayDispensarVendedor) {
          payload.comprovante_dispensado = true;
          payload.comprovante_vendedor_dispensado = true;
        }
      }

      if (entry?.recipient_type === "empresa") {
        payload.comprovante_dispensado = true;
      }

      const { error } = await supabase.from("commission_entry_flow").update(payload).eq("id", flow.id);
      if (error) return alert("Erro ao registrar pagamento: " + error.message);
    }

    // Se todas as parcelas com valor da venda foram pagas, marca automaticamente as parcelas zeradas como pagas.
    const batchFlows = partitionFlows.filter((f) => f.batch_id === partitionPayFlow.batch_id);
    const paidIds = new Set(payableFlows.map((f) => f.id));
    const simulated = batchFlows.map((f) => (paidIds.has(f.id) ? { ...f, valor_pago: Number(f.valor_previsto) || 0, status: "pago" } : f));
    const positiveByMes = new Map<number, CommissionEntryFlow[]>();
    simulated.forEach((f) => {
      if ((Number(f.valor_previsto) || 0) > 0) positiveByMes.set(f.mes, [...(positiveByMes.get(f.mes) || []), f]);
    });
    const allPositivePaid = Array.from(positiveByMes.values()).every((items) => items.every((f) => f.status === "pago" || (Number(f.valor_pago) || 0) > 0));

    if (allPositivePaid) {
      const zeroIds = batchFlows.filter((f) => (Number(f.valor_previsto) || 0) <= 0 && f.status !== "pago").map((f) => f.id);
      if (zeroIds.length) {
        await supabase
          .from("commission_entry_flow")
          .update({ valor_pago: 0, data_pagamento: partitionPayDate, status: "pago", comprovante_dispensado: true } as any)
          .in("id", zeroIds);
      }
    }

    setPartitionPayFlow(null);
    setPartitionPayUnidadeFile(null);
    setPartitionPayVendedorFile(null);
    setPartitionPayDispensarUnidade(false);
    setPartitionPayDispensarVendedor(false);
    fetchData();
  }

  function abrirEstornoParticionado(row: {
    batch: CommissionBatch;
    venda?: Venda;
    entries: CommissionEntry[];
    flows: CommissionEntryFlow[];
  }) {
    if (!canEdit) return alert("Somente admin pode registrar estorno.");

    const paidMeses = Array.from(
      new Set(
        row.flows
          .filter((flow) => (Number(flow.valor_pago) || 0) > 0 && !monthHasActiveRefund([flow]))
          .map((flow) => Number(flow.mes))
      )
    ).sort((a, b) => a - b);

    if (!paidMeses.length) {
      alert("Essa venda ainda não possui parcelas pagas para estornar.");
      return;
    }

    const firstMes = paidMeses[0];
    const totalPagoMes = row.flows
      .filter((flow) => Number(flow.mes) === firstMes)
      .reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);

    setPartitionRefundBatchId(row.batch.id);
    setPartitionRefundMes(String(firstMes));
    setPartitionRefundAmount(String(totalPagoMes.toFixed(2)).replace(".", ","));
    setPartitionRefundDateBR(isoToBRDate(toDateInput(new Date())));
    setPartitionRefundDescription("Estorno de comissão");
  }

  async function confirmarEstornoParticionado() {
    if (!canEdit) return alert("Somente admin pode registrar estorno.");
    if (!partitionRefundBatchId) return;

    const mes = Number(partitionRefundMes);
    if (!mes) return alert("Selecione a parcela que será estornada.");

    const amount = parseBRL(partitionRefundAmount);
    if (amount <= 0) return alert("Informe o valor bruto do estorno.");

    const dataISO = brDateToISO(partitionRefundDateBR);
    if (!dataISO) return alert("Informe a data do estorno no formato dd/mm/aaaa.");

    if (activeRefundsForMonth(partitionRefundBatchId, mes).length > 0) {
      return alert("Essa parcela já possui estorno ativo. Reverta o estorno antes de lançar outro.");
    }

    const flowsMes = partitionFlows.filter(
      (flow) =>
        flow.batch_id === partitionRefundBatchId &&
        Number(flow.mes) === mes &&
        (Number(flow.valor_pago) || 0) > 0
    );

    if (!flowsMes.length) {
      alert("Nenhuma parcela paga encontrada para estornar.");
      return;
    }

    const totalPagoMes = flowsMes.reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);
    if (amount > totalPagoMes + 0.01) {
      return alert(`O estorno não pode ser maior que o valor bruto pago nessa parcela (${BRL(totalPagoMes)}).`);
    }

    for (const flow of flowsMes) {
      const entry = partitionEntries.find((item) => item.id === flow.entry_id);
      if (!entry) continue;

      const paid = Number(flow.valor_pago) || 0;
      const share = totalPagoMes > 0 ? paid / totalPagoMes : 0;
      const entryAmount = Math.round(amount * share * 100) / 100;
      const entryTax = Math.round(entryAmount * impostoFrac * 100) / 100;

      if (entryAmount <= 0) continue;

      const { error } = await supabase.from("commission_adjustments").insert({
        entry_id: entry.id,
        batch_id: entry.batch_id,
        venda_id: entry.venda_id,
        adjustment_type: "estorno",
        amount: entryAmount,
        tax_amount: entryTax,
        data_estorno: dataISO,
        description: partitionRefundDescription || "Estorno de comissão",
        parcela: `${mes}`,
        created_by: authUserId,
      } as any);

      if (error) return alert("Erro ao registrar estorno: " + error.message);
    }

    setPartitionRefundBatchId(null);
    setPartitionRefundMes("");
    setPartitionRefundAmount("");
    setPartitionRefundDescription("Estorno de comissão");
    fetchData();
  }

  async function reverterEstornosParticionados(batchId: string) {
    if (!canEdit) return alert("Somente admin pode reverter estorno.");

    const activeRefunds = partitionAdjustments.filter((a) => a.batch_id === batchId && a.adjustment_type === "estorno" && !a.is_reversed);
    const activeRefundIds = activeRefunds.map((a) => a.id);
    const totalAtivo = activeRefunds.reduce((acc, cur) => acc + (Number(cur.amount) || 0), 0);

    if (!activeRefundIds.length) {
      alert("Essa venda não possui estorno ativo para reverter.");
      return;
    }

    const valorInformado = prompt(`Valor bruto da reversão. Estorno ativo: ${BRL(totalAtivo)}`, String(totalAtivo.toFixed(2)).replace(".", ","));
    if (valorInformado === null) return;

    const valorReversao = parseBRL(valorInformado);
    if (valorReversao <= 0) return alert("Informe um valor bruto válido para a reversão.");
    if (Math.abs(valorReversao - totalAtivo) > 0.01) {
      return alert(`Por segurança, a reversão atual precisa ser pelo valor total do estorno ativo: ${BRL(totalAtivo)}.`);
    }

    if (!confirm("Confirmar reversão dos estornos ativos desta venda?")) return;

    const { error } = await supabase
      .from("commission_adjustments")
      .update({ is_reversed: true, reversed_at: new Date().toISOString() } as any)
      .in("id", activeRefundIds);

    if (error) return alert("Erro ao reverter estorno: " + error.message);

    fetchData();
  }

  function renderPartitionFlowAction(flow: CommissionEntryFlow) {
    const value = Number(flow.valor_previsto) || 0;
    const isZero = value <= 0;
    const isPaid = flow.status === "pago" || (Number(flow.valor_pago) || 0) > 0;
    const isProgrammed = !!flow.data_pagamento && !isPaid;

    if (isZero && !isPaid) {
      return (
        <Button size="sm" className="h-6 px-2 bg-gray-200 text-gray-500 opacity-60" disabled title="Parcela sem valor. Será marcada automaticamente após o pagamento da última parcela com valor.">
          —
        </Button>
      );
    }

    if (isPaid) {
      return (
        <Button size="sm" className="h-6 px-2 bg-green-600 text-white hover:bg-green-700" disabled>
          Pago
        </Button>
      );
    }

    if (isProgrammed) {
      return (
        <Button size="sm" className="h-6 px-2 bg-[#1E293F] text-white hover:bg-[#1E293F]/90" onClick={() => abrirPagamentoParticionado(flow)}>
          Pagar
        </Button>
      );
    }

    return (
      <Button size="sm" className="h-6 px-2 bg-[#A11C27] text-white hover:bg-[#A11C27]/90" onClick={() => programarPagamentoParticionado(flow)}>
        Prog
      </Button>
    );
  }



  async function abrirArquivosParcelaParticionada(flowsMes: CommissionEntryFlow[]) {
    const urls = Array.from(
      new Set(
        flowsMes
          .flatMap((flow) => [flow.comprovante_vendedor_url, flow.comprovante_unidade_url, flow.comprovante_url, flow.demonstrativo_url])
          .filter(Boolean) as string[]
      )
    );

    if (!urls.length) {
      const gerar = confirm("Nenhum comprovante anexado nessa parcela. Deseja gerar o demonstrativo em PDF?");
      if (gerar) downloadDemonstrativoParticionadoPDF();
      return;
    }

    for (const path of urls) {
      const signed = await getSignedUrl(path);
      if (signed) window.open(signed, "_blank");
    }

    const gerar = confirm("Deseja gerar também o demonstrativo em PDF?");
    if (gerar) downloadDemonstrativoParticionadoPDF();
  }

  function activeRefundsForMonth(batchId: string, mes: number) {
    return partitionAdjustments.filter(
      (a) =>
        a.batch_id === batchId &&
        a.adjustment_type === "estorno" &&
        !a.is_reversed &&
        String(a.parcela || "") === String(mes)
    );
  }

  function monthHasActiveRefund(flowsMes: CommissionEntryFlow[]) {
    const representative = flowsMes[0];
    if (!representative) return false;
    return activeRefundsForMonth(representative.batch_id, Number(representative.mes)).length > 0;
  }

  function renderPartitionMonthAction(flowsMes: CommissionEntryFlow[]) {
    const payable = flowsMes.filter((flow) => (Number(flow.valor_previsto) || 0) > 0);
    const total = payable.reduce((acc, flow) => acc + (Number(flow.valor_previsto) || 0), 0);
    const allPaid = payable.length > 0 && payable.every((flow) => flow.status === "pago" || (Number(flow.valor_pago) || 0) > 0);
    const isProgrammed = payable.some((flow) => !!flow.data_pagamento && flow.status !== "pago" && (Number(flow.valor_pago) || 0) <= 0);
    const representative = payable[0] || flowsMes[0];
    const hasRefund = monthHasActiveRefund(flowsMes);

    if (hasRefund) {
      return (
        <Button size="sm" className="h-7 px-3 bg-[#A11C27] text-white hover:bg-[#A11C27]/90" disabled title="Parcela estornada">
          Est
        </Button>
      );
    }

    if (!representative || total <= 0) {
      return (
        <Button size="sm" className="h-7 px-3 bg-gray-200 text-gray-500 opacity-60" disabled title="Parcela sem valor. Será marcada automaticamente após o pagamento da última parcela com valor.">
          Prog
        </Button>
      );
    }

    if (allPaid) {
      return (
        <Button size="sm" className="h-7 px-3 bg-green-600 text-white hover:bg-green-700" onClick={() => abrirArquivosParcelaParticionada(flowsMes)} title="Abrir comprovante(s) e demonstrativo">
          Pago
        </Button>
      );
    }

    if (isProgrammed) {
      return (
        <Button size="sm" className="h-7 px-3 bg-[#1E293F] text-white hover:bg-[#1E293F]/90" onClick={() => abrirPagamentoParticionado(representative)}>
          Pagar
        </Button>
      );
    }

    return (
      <Button size="sm" className="h-7 px-3 bg-[#A11C27] text-white hover:bg-[#A11C27]/90" onClick={() => programarPagamentoParticionado(representative)}>
        Prog
      </Button>
    );
  }

  function flowProgressText(flows: CommissionEntryFlow[]) {
    const byMes = new Map<number, CommissionEntryFlow[]>();
    flows.forEach((f) => {
      if ((Number(f.valor_previsto) || 0) <= 0) return;
      byMes.set(f.mes, [...(byMes.get(f.mes) || []), f]);
    });

    const total = byMes.size;
    const paid = Array.from(byMes.values()).filter((items) =>
      items.every((f) => f.status === "pago" || (Number(f.valor_pago) || 0) > 0)
    ).length;

    return `${paid}/${total}`;
  }

  function isFlowGroupProgrammed(flows: CommissionEntryFlow[]) {
    return flows.some((f) => !!f.data_pagamento && f.status !== "pago" && (Number(f.valor_previsto) || 0) > 0);
  }

  function isFlowGroupPaid(flows: CommissionEntryFlow[]) {
    const payable = flows.filter((f) => (Number(f.valor_previsto) || 0) > 0);
    return payable.length > 0 && payable.every((f) => f.status === "pago" || (Number(f.valor_pago) || 0) > 0);
  }

  function downloadDemonstrativoParticionadoPDF() {
    const periodoIni = demonstrativoTipo === "data" ? reciboDate : `${demonstrativoMes}-01`;
    const periodoFim =
      demonstrativoTipo === "data"
        ? reciboDate
        : toDateInput(new Date(Number(demonstrativoMes.slice(0, 4)), Number(demonstrativoMes.slice(5, 7)), 0));

    type DemoLine = {
      unitId: string;
      unitName: string;
      vendedorId: string;
      vendedorName: string;
      recipientType: string;
      vendaId: string;
      tipo: string;
      proposta: string;
      cliente: string;
      grupo: string;
      cota: string;
      parcela: string;
      valorVenda: number;
      bruto: number;
      impostos: number;
      liquida: number;
      status: string;
    };

    const getReportLevel = (): "matriz" | "unidade" | "vendedor" => {
      if (vendedorId !== "all") return "vendedor";
      if (!isMatrixAdmin && !isBranchManager) return "vendedor";
      if (unitFilter !== "all") return "unidade";
      if (isBranchManager) return "unidade";
      return "matriz";
    };

    const reportLevel = getReportLevel();
    // Para o demonstrativo hierárquico, a base analítica é sempre a comissão do vendedor:
    // clientes somam vendedor, vendedores somam unidade e unidades somam matriz.
    const targetRecipientType = "vendedor";

    const flowInPeriod = (flow: CommissionEntryFlow) => {
      if (demonstrativoTipo === "data") return flow.data_pagamento === reciboDate;
      return !!flow.data_pagamento && flow.data_pagamento >= periodoIni && flow.data_pagamento <= periodoFim;
    };

    const getClienteNome = (venda?: Venda | null) => {
      if (!venda) return "—";
      return (
        (venda.lead_id && clientesMap[venda.lead_id]) ||
        (venda.cliente_lead_id && clientesMap[venda.cliente_lead_id]) ||
        (venda as any)?.cliente_nome ||
        "—"
      );
    };

    const getSaleUnitId = (batch?: CommissionBatch | null, venda?: Venda | null, entry?: CommissionEntry | null) => {
      const saleVendor =
        batch?.vendedor_id
          ? usersById[batch.vendedor_id]
          : venda?.vendedor_id
            ? usersById[venda.vendedor_id] || usersByAuth[venda.vendedor_id]
            : null;
      return batch?.business_unit_id || saleVendor?.unit_id || entry?.business_unit_id || "";
    };

    const getSaleVendorId = (batch?: CommissionBatch | null, venda?: Venda | null) => {
      const raw = batch?.vendedor_id || venda?.vendedor_id || "";
      return usersById[raw]?.id || usersByAuth[raw]?.id || raw;
    };

    const canIncludeSale = (entry: CommissionEntry, batch?: CommissionBatch | null, venda?: Venda | null) => {
      const saleVendorId = getSaleVendorId(batch, venda);
      const saleUnitId = getSaleUnitId(batch, venda, entry);

      if (entry.recipient_type !== targetRecipientType) return false;

      if (reportLevel === "vendedor") {
        const targetVendor = vendedorId !== "all" ? vendedorId : currentUser?.id || "";
        if (!targetVendor) return false;
        if (saleVendorId !== targetVendor) return false;
        if (entry.recipient_user_id !== targetVendor) return false;
        return true;
      }

      if (reportLevel === "unidade") {
        const targetUnit = unitFilter !== "all" ? unitFilter : currentUser?.unit_id || "";
        if (!targetUnit) return false;
        if (saleUnitId !== targetUnit) return false;
        return true;
      }

      return true;
    };

    const lines: DemoLine[] = [];

    for (const entry of partitionEntriesVisible) {
      const batch = partitionBatches.find((b) => b.id === entry.batch_id);
      const venda = batch ? partitionVendaById[batch.venda_id] : partitionVendaById[entry.venda_id];

      if (!canIncludeSale(entry, batch, venda)) continue;

      const unitId = getSaleUnitId(batch, venda, entry);
      const unitName = unitById[unitId]?.nome || "Sem unidade";
      const saleVendorId = getSaleVendorId(batch, venda);
      const vendedorName = saleVendorId ? userLabel(saleVendorId) : "—";
      const allFlows = partitionFlows.filter((f) => f.entry_id === entry.id).sort((a, b) => (a.mes || 0) - (b.mes || 0));
      const totalParcelas = Math.max(1, allFlows.length);

      allFlows.filter(flowInPeriod).forEach((flow) => {
        const bruto = Number(flow.valor_pago || flow.valor_previsto) || 0;
        const impostos = Math.round(bruto * impostoFrac * 100) / 100;
        lines.push({
          unitId,
          unitName,
          vendedorId: saleVendorId,
          vendedorName,
          recipientType: entry.recipient_type,
          vendaId: entry.venda_id,
          tipo: entry.recipient_type === "empresa" ? "Comissão Matriz" : entry.recipient_type === "unidade" ? "Comissão Unidade" : "Comissão Vendedor",
          proposta: venda?.numero_proposta || "—",
          cliente: getClienteNome(venda),
          grupo: (venda as any)?.grupo || "—",
          cota: (venda as any)?.cota || "—",
          parcela: `${flow.mes}/${totalParcelas}`,
          valorVenda: Number(batch?.valor_venda ?? venda?.valor_venda) || 0,
          bruto,
          impostos,
          liquida: bruto - impostos,
          status: flow.status === "pago" ? "Pago" : flow.data_pagamento ? "Programado" : "A programar",
        });
      });
    }

    partitionAdjustments
      .filter((a) => {
        if (a.is_reversed) return false;
        const d = String(a.data_estorno || a.created_at || "").slice(0, 10);
        return d >= periodoIni && d <= periodoFim;
      })
      .forEach((a) => {
        const entry = partitionEntriesVisible.find((e) => e.id === a.entry_id);
        if (!entry) return;
        const batch = partitionBatches.find((b) => b.id === entry.batch_id);
        const venda = batch ? partitionVendaById[batch.venda_id] : partitionVendaById[entry.venda_id];

        if (!canIncludeSale(entry, batch, venda)) return;

        const unitId = getSaleUnitId(batch, venda, entry);
        const saleVendorId = getSaleVendorId(batch, venda);
        const bruto = -Math.abs(Number(a.amount) || 0);

        lines.push({
          unitId,
          unitName: unitById[unitId]?.nome || "Sem unidade",
          vendedorId: saleVendorId,
          vendedorName: saleVendorId ? userLabel(saleVendorId) : "—",
          recipientType: entry.recipient_type,
          vendaId: a.venda_id || entry.venda_id,
          tipo: a.adjustment_type === "estorno" ? "(-) Estorno" : "Ajuste",
          proposta: venda?.numero_proposta || "—",
          cliente: getClienteNome(venda),
          grupo: a.grupo || (venda as any)?.grupo || "—",
          cota: a.cota || (venda as any)?.cota || "—",
          parcela: a.parcela || "—",
          valorVenda: Number(batch?.valor_venda ?? venda?.valor_venda) || 0,
          bruto,
          impostos: -Math.abs(Number(a.tax_amount) || Math.round(Math.abs(bruto) * impostoFrac * 100) / 100),
          liquida: bruto - (-Math.abs(Number(a.tax_amount) || Math.round(Math.abs(bruto) * impostoFrac * 100) / 100)),
          status: "Descontado",
        });
      });

    if (!lines.length) return alert("Nenhum lançamento encontrado para o demonstrativo.");

    lines.sort(
      (a, b) =>
        a.unitName.localeCompare(b.unitName) ||
        a.vendedorName.localeCompare(b.vendedorName) ||
        a.cliente.localeCompare(b.cliente) ||
        a.proposta.localeCompare(b.proposta) ||
        a.parcela.localeCompare(b.parcela)
    );

    const uniqueBy = (arr: DemoLine[], key: (r: DemoLine) => string) => Array.from(new Set(arr.map(key).filter(Boolean))).length;
    const totals = (arr: DemoLine[]) => ({
      vendas: uniqueBy(arr, (r) => r.vendaId),
      valorVenda: Array.from(new Map(arr.map((r) => [r.vendaId, r.valorVenda])).values()).reduce((a, b) => a + b, 0),
      bruto: arr.reduce((a, r) => a + r.bruto, 0),
      impostos: arr.reduce((a, r) => a + r.impostos, 0),
      liquida: arr.reduce((a, r) => a + r.liquida, 0),
    });
    const groupBy = <T,>(arr: T[], key: (item: T) => string) => {
      const m = new Map<string, T[]>();
      arr.forEach((item) => {
        const k = key(item) || "—";
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(item);
      });
      return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    };

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    let y = 38;
    const pageHeight = doc.internal.pageSize.getHeight();
    const ensureSpace = (needed = 80) => {
      if (y + needed > pageHeight - 36) {
        doc.addPage();
        y = 38;
      }
    };
    const title = (text: string, size = 12) => {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.text(text, 40, y);
      y += size + 8;
    };
    const subtitle = (text: string) => {
      ensureSpace(24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(text, 40, y);
      y += 14;
    };
    const table = (head: string[][], body: any[][], fontSize = 7.2) => {
      ensureSpace(90);
      autoTable(doc, {
        startY: y,
        head,
        body,
        styles: { font: "helvetica", fontSize, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 63] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
      y = ((doc as any).lastAutoTable?.finalY || y) + 16;
    };

    const periodoLabel = `${formatISODateBR(periodoIni)} até ${formatISODateBR(periodoFim)}`;
    const detailHead = [["Nível", "Proposta", "Cliente", "Grupo", "Cota", "Parcela", "R$ da Venda", "Comissão Bruta", "Impostos", "Comissão Líquida", "Status"]];
    const detailBody = (arr: DemoLine[]) =>
      arr.map((r) => [
        r.tipo,
        r.proposta,
        r.cliente,
        r.grupo,
        r.cota,
        r.parcela,
        BRL(r.valorVenda),
        BRL(r.bruto),
        BRL(r.impostos),
        BRL(r.liquida),
        r.status,
      ]);
    const totalLine = (label: string, arr: DemoLine[]) => {
      const t = totals(arr);
      return [[label, "", "", "", "", "", BRL(t.valorVenda), BRL(t.bruto), BRL(t.impostos), BRL(t.liquida), `${t.vendas} venda(s)`]];
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("DEMONSTRATIVO DE COMISSÃO", 40, y);
    y += 18;
    subtitle(`Período: ${periodoLabel}`);
    subtitle("Demonstrativo de comissões com pagamento programado.");
    y += 4;

    if (reportLevel === "matriz") {
      title(`MATRIZ: ${matrixUnit?.nome || "Consulmax Consórcios"}`, 13);
      const resumoUnidades = groupBy(lines, (r) => r.unitName).map(([unidade, arr]) => {
        const t = totals(arr);
        return [`(+) ${unidade}`, String(t.vendas), BRL(t.valorVenda), BRL(t.bruto), BRL(t.impostos), BRL(t.liquida)];
      });
      const totalGeral = totals(lines);
      table(
        [["Plano", "Vendas", "R$ da Venda", "Comissão Bruta", "Impostos", "Comissão Líquida"]],
        resumoUnidades.concat([["TOTAL MATRIZ", String(totalGeral.vendas), BRL(totalGeral.valorVenda), BRL(totalGeral.bruto), BRL(totalGeral.impostos), BRL(totalGeral.liquida)]]),
        8
      );

      for (const [unidade, unitRows] of groupBy(lines, (r) => r.unitName)) {
        title(`(+) UNIDADE: ${unidade}`, 11);
        const resumoVendedores = groupBy(unitRows, (r) => r.vendedorName).map(([vendedor, arr]) => {
          const t = totals(arr);
          return [`   (+) ${vendedor}`, String(t.vendas), BRL(t.valorVenda), BRL(t.bruto), BRL(t.impostos), BRL(t.liquida)];
        });
        table(
          [["Plano", "Vendas", "R$ da Venda", "Comissão Bruta", "Impostos", "Comissão Líquida"]],
          resumoVendedores.concat([["TOTAL DA UNIDADE", String(totals(unitRows).vendas), BRL(totals(unitRows).valorVenda), BRL(totals(unitRows).bruto), BRL(totals(unitRows).impostos), BRL(totals(unitRows).liquida)]]),
          8
        );
        for (const [vendedor, vendedorRows] of groupBy(unitRows, (r) => r.vendedorName)) {
          title(`   (+) VENDEDOR: ${vendedor}`, 10);
          table(detailHead, detailBody(vendedorRows).concat(totalLine("TOTAL DO VENDEDOR", vendedorRows)), 7);
        }
      }
    } else if (reportLevel === "unidade") {
      const unidadeNome = unitFilter !== "all" ? unitById[unitFilter]?.nome : currentUnit?.nome || lines[0]?.unitName || "—";
      title(`UNIDADE: ${unidadeNome}`, 13);
      const resumoVendedores = groupBy(lines, (r) => r.vendedorName).map(([vendedor, arr]) => {
        const t = totals(arr);
        return [`(+) ${vendedor}`, String(t.vendas), BRL(t.valorVenda), BRL(t.bruto), BRL(t.impostos), BRL(t.liquida)];
      });
      table(
        [["Plano", "Vendas", "R$ da Venda", "Comissão Bruta", "Impostos", "Comissão Líquida"]],
        resumoVendedores.concat([["TOTAL DA UNIDADE", String(totals(lines).vendas), BRL(totals(lines).valorVenda), BRL(totals(lines).bruto), BRL(totals(lines).impostos), BRL(totals(lines).liquida)]]),
        8
      );
      for (const [vendedor, vendedorRows] of groupBy(lines, (r) => r.vendedorName)) {
        title(`(+) VENDEDOR: ${vendedor}`, 10);
        table(detailHead, detailBody(vendedorRows).concat(totalLine("TOTAL DO VENDEDOR", vendedorRows)), 7);
      }
    } else {
      const vendedorNome = vendedorId !== "all" ? userLabel(vendedorId) : currentUser?.nome || lines[0]?.vendedorName || "—";
      title(`VENDEDOR: ${vendedorNome}`, 13);
      table(detailHead, detailBody(lines).concat(totalLine("TOTAL A RECEBER", lines)), 7);
    }

    const grand = totals(lines);
    ensureSpace(42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.save(`demonstrativo_comissao_${reportLevel}_${periodoIni}_${periodoFim}.pdf`);
  }

  async function gerarComissaoDeVenda(venda: Venda) {
    if (!canEdit) return alert("Vendedor não pode gerar comissão.");

    try {
      setGenBusy(venda.id);

      try {
        const gerouParticionado = await gerarComissaoParticionadaDeVenda(venda);
        if (gerouParticionado) {
          await fetchData();
          alert("Comissão particionada gerada com sucesso.");
          return;
        }
      } catch (partErr: any) {
        alert("Não foi possível gerar comissão particionada: " + (partErr?.message || partErr));
        return;
      }

      const vendedorIdCanon = canonUserId(venda.vendedor_id);
      if (!vendedorIdCanon) {
        alert("Vínculo do vendedor não encontrado em 'users'.");
        return;
      }

      let simTableId: string | null = null;
      const vendaTabNorm = normalize(venda.tabela);
      const vendaSegNorm = normalize(venda.segmento);

      const local =
        simTables.find((s) => normalize(s.nome_tabela) === vendaTabNorm && (!venda.segmento || normalize(s.segmento) === vendaSegNorm)) ||
        simTables.find((s) => normalize(s.nome_tabela) === vendaTabNorm) ||
        null;

      simTableId = local?.id || null;

      if (!simTableId && venda.tabela) {
        let qb2 = supabase.from("sim_tables").select("id, segmento, nome_tabela, admin_id").ilike("nome_tabela", `%${venda.tabela}%`).limit(1);
        if (venda.segmento) qb2 = qb2.eq("segmento", venda.segmento);
        const { data: st2 } = await qb2;
        simTableId = st2?.[0]?.id ?? null;
      }

      let percent_aplicado: number | null = null;
      if (simTableId) {
        const { data: rule } = await supabase
          .from("commission_rules")
          .select("percent_padrao")
          .eq("vendedor_id", vendedorIdCanon)
          .eq("sim_table_id", simTableId)
          .limit(1);

        percent_aplicado = rule?.[0]?.percent_padrao ?? null;
      }

      const base = venda.valor_venda ?? null;
      const valor_total = percent_aplicado && base ? Math.round(base * percent_aplicado * 100) / 100 : null;

      const insert = {
        venda_id: venda.id,
        vendedor_id: vendedorIdCanon,
        sim_table_id: simTableId,
        data_venda: venda.data_venda,
        segmento: venda.segmento,
        tabela: venda.tabela,
        administradora: venda.administradora,
        valor_venda: base,
        base_calculo: base,
        percent_aplicado,
        valor_total,
        status: "a_pagar" as const,
      };

      const { data: inserted, error } = await supabase
        .from("commissions")
        .insert(insert as any)
        .select("id, venda_id, vendedor_id, sim_table_id, valor_total, base_calculo, percent_aplicado")
        .limit(1);

      if (error) {
        if (String(error.message || "").includes("row-level security")) alert("RLS bloqueou o INSERT. Ajuste policies.");
        else if (String((error as any).code) === "23503") alert("Não foi possível criar: verifique vendedor e/ou a SimTable.");
        else alert("Erro ao criar a comissão: " + error.message);
        return;
      }

      const createdComm = inserted?.[0] as Commission | undefined;
      if (createdComm) await ensureFlowForCommission(createdComm);

      await fetchData();
    } finally {
      setGenBusy(null);
    }
  }

  async function retornarComissao(c: Commission) {
    if (!canEdit) return alert("Vendedor não pode retornar comissão.");
    if (!confirm("Confirmar retorno desta comissão para 'Vendas sem comissão'?")) return;

    try {
      const delFlow = await supabase.from("commission_flow").delete().eq("commission_id", c.id).select("id");
      if (delFlow.error) throw delFlow.error;

      const { data: stillFlows } = await supabase.from("commission_flow").select("id").eq("commission_id", c.id);
      if (stillFlows && stillFlows.length > 0) {
        alert("Não foi possível remover as parcelas (RLS).");
        return;
      }

      const delComm = await supabase.from("commissions").delete().eq("id", c.id).select("id");
      if (delComm.error) throw delComm.error;

      setRows((prev) => prev.filter((r) => r.id !== c.id));
      await fetchData();
    } catch (err: any) {
      if (String(err?.message || "").includes("row-level security")) alert("RLS bloqueou a exclusão.");
      else alert("Falha ao retornar: " + (err?.message || err));
    }
  }

  async function saveImpostoParam() {
    if (!canEdit) return alert("Somente admin pode alterar o imposto.");

    const n = parsePctHumanToNumber(impostoDraft);
    const val = formatPctHuman(n);

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: APP_SETTING_IMPOSTO_KEY,
          value: val,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "key" }
      );

    if (error) {
      alert("Falha ao salvar imposto: " + error.message);
      return;
    }

    try {
      window.localStorage.setItem(LS_IMPOSTO_PCT, val);
    } catch {}

    setReciboImpostoPct(val);
    setOpenImpostoCfg(false);
  }

  async function downloadReceiptPDFPorData() {
    const impostoPct = (parsePctHumanToNumber(reciboImpostoPct) || 0) / 100;
    const dataRecibo = reciboDate;

    const vendedorSel = reciboVendor !== "all" ? reciboVendor : isAdmin ? null : usersByAuth[authUserId || ""]?.id || null;

    const { data: flowsAllOnDate, error: flowsErr } = await supabase.from("commission_flow").select("*, commission_id").eq("data_pagamento_vendedor", dataRecibo);

    if (flowsErr) {
      alert("Erro ao buscar parcelas: " + flowsErr.message);
      return;
    }

    if (!flowsAllOnDate || !flowsAllOnDate.length) {
      try {
        const { data: onlyRefunds } = await supabase.from("commission_refunds").select("id").eq("data_estorno", dataRecibo).limit(1);
        if (!onlyRefunds?.length) {
          alert("Não há parcelas/estornos na data selecionada.");
          return;
        }
      } catch {
        alert("Não há parcelas na data selecionada.");
        return;
      }
    }

    const commIdsAll = Array.from(new Set((flowsAllOnDate || []).map((f: any) => f.commission_id)));
    const { data: commsAll } = await supabase
      .from("commissions")
      .select("*")
      .in("id", commIdsAll.length ? commIdsAll : ["00000000-0000-0000-0000-000000000000"]);

    const chosenFlows = vendedorSel
      ? (flowsAllOnDate || []).filter((f: any) => (commsAll || []).find((c: any) => c.id === f.commission_id)?.vendedor_id === vendedorSel)
      : flowsAllOnDate || [];

    const byCommission: Record<string, CommissionFlow[]> = {};
    chosenFlows.forEach((f: any) => {
      if (!byCommission[f.commission_id]) byCommission[f.commission_id] = [];
      if (!byCommission[f.commission_id].some((x) => x.mes === f.mes)) byCommission[f.commission_id].push(f);
    });

    const commIds = Object.keys(byCommission);
    const { data: comms } = await supabase
      .from("commissions")
      .select("*")
      .in("id", commIds.length ? commIds : ["00000000-0000-0000-0000-000000000000"]);

    const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id)));
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, valor_venda, numero_proposta, cliente_lead_id, lead_id")
      .in("id", vendaIds.length ? vendaIds : ["00000000-0000-0000-0000-000000000000"]);

    const clienteIds = Array.from(new Set((vendas || []).map((v: any) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
    const nomesCli: Record<string, string> = {};

    if (clienteIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
      (cli || []).forEach((c: any) => {
        nomesCli[c.id] = c.nome || "";
      });
    }

    const year = new Date(dataRecibo).getFullYear();
    const { data: seqData, error: seqErr } = await supabase.rpc("next_receipt_seq", { p_year: year });

    if (seqErr) {
      alert("Erro ao gerar número do recibo: " + seqErr.message);
      return;
    }

    const seq = Number(seqData) || 1;
    const numeroRecibo = `${String(seq).padStart(3, "0")}/${year}`;

    const vendedorUsado = vendedorSel ?? (comms || [])[0]?.vendedor_id ?? (usersByAuth[authUserId || ""]?.id || null);
    const vendInfo = vendedorUsado ? secureById[vendedorUsado] : null;

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("DEMONSTRATIVO DE COMISSÃO", 297, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Demonstrativo Nº: ${numeroRecibo}`, 40, 60);
    doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 40, 74);

    let y = 92;
    [
      "Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03",
      "Endereço: Av. Menezes Filho, 3171, Casa Preta, Ji-Paraná/RO. CEP: 76907-532",
    ].forEach((l) => {
      doc.text(l, 40, y);
      y += 14;
    });

    const recebedor = [
      `Nome do Recebedor: ${userLabel(vendedorUsado)}`,
      `CPF/CNPJ: ${vendInfo?.cpf || "—"}`,
      `Endereço: ${
        [vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`].filter(Boolean).join(", ") || "—"
      }`,
    ];

    y += 10;
    recebedor.forEach((l) => {
      doc.text(l, 40, y);
      y += 14;
    });

    y += 6;
    doc.text("Descrição: Demonstrativo das comissões, pagamentos e estornos abaixo relacionados.", 40, y);
    y += 16;

    const head = [["CLIENTE", "PROPOSTA", "PARCELA", "R$ VENDA", "COM. BRUTA", "IMPOSTOS", "COM. LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    const commsFiltradas = (comms || []).filter((c: any) => !vendedorSel || c.vendedor_id === vendedorSel);
    commsFiltradas.sort((a: any, b: any) => (a.venda_id > b.venda_id ? 1 : -1));

    commsFiltradas.forEach((c: any) => {
      const v = (vendas || []).find((x: any) => x.id === c.venda_id);
      const clienteId = v?.lead_id || v?.cliente_lead_id || "";
      const clienteNome = clienteId ? nomesCli[clienteId] || "—" : "—";
      const vendaValor = v?.valor_venda || 0;

      const parcelas = Array.from(new Map((byCommission[c.id] || []).map((p) => [p.mes, p])).values()) as CommissionFlow[];
      parcelas.sort((a, b) => a.mes - b.mes);

      parcelas.forEach((p) => {
        const comBruta = (c.percent_aplicado || 0) * (p.percentual || 0) * vendaValor;
        const impostos = comBruta * impostoPct;
        const liquida = comBruta - impostos;

        totalLiquido += liquida;

        body.push([clienteNome, v?.numero_proposta || "—", `M${p.mes}`, BRL(vendaValor), BRL(comBruta), BRL(impostos), BRL(liquida)]);
      });
    });

    try {
      const { data: refunds } = await supabase.from("commission_refunds").select("id, commission_id, flow_id, numero_proposta, data_estorno, valor_bruto, valor_liquido");
      const refundsOnDate = (refunds || []).filter(
        (r: any) => r.data_estorno === dataRecibo && (!vendedorSel || rows.find((x) => x.id === r.commission_id)?.vendedor_id === vendedorSel)
      );

      for (const rf of refundsOnDate) {
        body.push([
          "—",
          rf.numero_proposta || "—",
          "ESTORNO",
          "—",
          BRL(-(rf.valor_bruto || 0)),
          BRL((rf.valor_bruto || 0) * impostoPct),
          BRL(-(rf.valor_liquido || 0)),
        ]);
        totalLiquido -= rf.valor_liquido || 0;
      }
    } catch {}

    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
    });

    const endY = (doc as any).lastAutoTable.finalY + 12;

    doc.setFont("helvetica", "bold");
    doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`, 40, endY);

    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
    doc.text(`Chave PIX do pagamento: ${secureById[vendedorUsado || ""]?.pix_key || "—"}`, 40, endY + 34);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Demonstrativo de comissões com pagamento programado.", 40, endY + 58);

    doc.save(`demonstrativo_${dataRecibo}_${userLabel(vendedorUsado || "")}.pdf`);
  }

  const rowsAPagarBase = useMemo(() => rows.filter((r) => r.status === "a_pagar" && isOperationalCommission(r)), [rows]);

  const rowsAPagar = useMemo(() => {
    const q = normalize(unpaidPropSearch);
    if (!q) return rowsAPagarBase;
    return rowsAPagarBase.filter((r) => normalize(r.numero_proposta || "").includes(q));
  }, [rowsAPagarBase, unpaidPropSearch]);

  const pagosFlat = useMemo(() => {
    const list: Array<{ flow: CommissionFlow; comm: CommissionWithFlow }> = [];

    rows
      .filter((r) => r.status !== "estorno")
      .forEach((r) =>
        (r.flow || []).forEach((f) => {
          if ((Number(f.valor_pago_vendedor) || 0) > 0) {
            list.push({ flow: f, comm: r });
          }
        })
      );

    return list.sort((a, b) => ((b.flow.data_pagamento_vendedor || "") > (a.flow.data_pagamento_vendedor || "") ? 1 : -1));
  }, [rows]);

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

  return (
    <div className="relative p-4 space-y-8 isolate">
      <div className="liquid-bg">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="gold" />
      </div>

      <div className="relative z-[1] space-y-8">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <FilterIcon className="w-5 h-5" /> Filtros
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-8 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId} disabled={!isAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">Todos</SelectItem>}
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome?.trim() || u.email?.trim() || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isAdmin && <div className="text-xs text-gray-500">Modo vendedor: filtros travados.</div>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Unidade</Label>
              <Select value={unitFilter} onValueChange={setUnitFilter} disabled={!isAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">Todas</SelectItem>}
                  {(isAdmin ? units : units.filter((u) => u.id === currentUser?.unit_id)).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Início do período</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Fim do período</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Administradora</Label>
              <Select value={adminFilter} onValueChange={(v) => { setAdminFilter(v); setSegmento("all"); setTabela("all"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {mainAdminOptions.map((adm) => (
                    <SelectItem key={adm} value={adm}>
                      {adm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Segmento</Label>
              <Select value={segmento} onValueChange={(v) => { setSegmento(v); setTabela("all"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mainSegmentOptions.map((seg) => (
                    <SelectItem key={seg} value={seg}>
                      {seg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tabela</Label>
              <Select value={tabela} onValueChange={setTabela}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {mainTableOptions.map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {tab}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="a_pagar">A pagar</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="estorno">Estorno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-8 flex flex-wrap gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setOpenRules(true)} disabled={!canEdit} title={!canEdit ? "Vendedor não pode editar regras" : ""}>
                <Settings className="w-4 h-4 mr-1" /> Regras de Comissão
              </Button>

              <Button
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenPartitionRules(true);
                }}
                disabled={!canEdit}
                title={!canEdit ? "Vendedor não pode editar partilhas" : ""}
              >
                <Settings className="w-4 h-4 mr-1" /> Partilhas por Unidade
              </Button>

              <Button variant="outline" onClick={() => setOpenImpostoCfg(true)} disabled={!canEdit} title={!canEdit ? "Somente admin pode configurar imposto" : ""}>
                <Settings className="w-4 h-4 mr-1" /> Configurar Imposto
              </Button>

              <Button onClick={fetchData}>
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Nos últimos 5 anos — {userLabel(vendedorId === "all" ? null : vendedorId)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Donut
                paid={paidInRangeGross(new Date(now.getFullYear() - 5, now.getMonth(), 1), now)}
                pending={0}
                label="5 anos"
                hoverPaidText={`Pago bruto no período: ${BRL(paidInRangeGross(new Date(now.getFullYear() - 5, now.getMonth(), 1), now))}`}
                hoverPendText="—"
                pendingLegend="—"
              />
              <LineChart
                labels={annual.labels}
                series={[
                  { name: "Previsto bruto", data: annual.previstoBruto.map(() => 0) },
                  { name: "Pago bruto", data: annual.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ano anterior — {new Date().getFullYear() - 1}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Donut
                paid={paidInRangeGross(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31))}
                pending={0}
                label="Ano anterior"
                hoverPaidText={`Pago bruto no ano anterior: ${BRL(paidInRangeGross(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31)))}`}
                hoverPendText="—"
                pendingLegend="—"
              />
              <LineChart
                labels={previousYearMonthly.labels}
                series={[
                  { name: "Previsto bruto", data: previousYearMonthly.previstoBruto },
                  { name: "Pago bruto", data: previousYearMonthly.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ano atual — {new Date().getFullYear()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Donut
                paid={paidInRangeGross(new Date(now.getFullYear(), 0, 1), now)}
                pending={previstoInRangeGross(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31))}
                label="Ano"
                hoverPaidText={`Pago bruto no ano: ${BRL(paidInRangeGross(new Date(now.getFullYear(), 0, 1), now))}`}
                hoverPendText={`Previsto bruto no ano: ${BRL(previstoInRangeGross(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)))}`}
                pendingLegend="Previsto bruto"
              />
              <LineChart
                labels={monthlyCurr.labels}
                series={[
                  { name: "Previsto bruto", data: monthlyCurr.previstoBruto },
                  { name: "Pago bruto", data: monthlyCurr.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Mês atual (semanas sex→qui)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Donut
                paid={paidInRangeGross(mStart, now)}
                pending={previstoInRangeGross(mStart, endOfMonth(now))}
                label="Mês"
                hoverPaidText={`Pago bruto no mês: ${BRL(paidInRangeGross(mStart, now))}`}
                hoverPendText={`Previsto bruto no mês: ${BRL(previstoInRangeGross(mStart, endOfMonth(now)))}`}
                pendingLegend="Previsto bruto"
              />
              <LineChart
                labels={weeklyCurr.labels}
                series={[
                  { name: "Previsto bruto", data: weeklyCurr.previstoBruto },
                  { name: "Pago bruto", data: weeklyCurr.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
          {[
            { title: "Vendas", value: BRL(combinedKpi.vendasTotal), hint: "Crédito vendido", tone: "navy" },
            { title: "Comissão Bruta", value: BRL(combinedKpi.comBruta), hint: "Base total", tone: "navy" },
            { title: "Comissão Líquida", value: BRL(combinedKpi.comLiquida), hint: `Imposto ${reciboImpostoPct}`, tone: "gold" },
            { title: "Comissão Paga", value: BRL(combinedKpi.comPagaBruta), hint: `Líquida ${BRL(combinedKpi.comPagaLiquida)}`, tone: "green" },
            { title: "Comissão Pendente", value: BRL(combinedKpi.comPendenteBruta), hint: `Líquida ${BRL(combinedKpi.comPendenteLiquida)}`, tone: "navy" },
            { title: "Comissão Perdida", value: BRL(combinedKpi.comPerdidaBruta), hint: "Canceladas não quitadas", tone: "red" },
            { title: "Comissão Programada", value: BRL(combinedKpi.comProgramadaBruta), hint: combinedKpi.proximaDataProgramada ? `Prevista para: ${formatISODateBR(combinedKpi.proximaDataProgramada)}` : "Sem previsão programada", tone: "blue" },
          ].map((item) => {
            const toneColor = item.tone === "red" ? "#A11C27" : item.tone === "gold" ? "#B5A573" : item.tone === "green" ? "#047857" : item.tone === "blue" ? "#1E40AF" : "#1E293F";
            return (
              <Card key={item.title} className="overflow-hidden border border-slate-200/70 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.title}</div>
                      <div className="mt-2 text-xl font-bold tabular-nums" style={{ color: "#1E293F" }}>{item.value}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.hint}</div>
                    </div>
                    <span className="mt-1 h-8 w-1.5 rounded-full" style={{ background: toneColor }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>


        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span>Nova Venda</span>
              <div className="flex items-center gap-3">
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
                    <th className="p-2 text-left hidden md:table-cell">Nº Proposta</th>
                    <th className="p-2 text-left hidden md:table-cell">Administradora</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasSemCom.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-4 text-gray-500">
                        Sem pendências 🎉
                      </td>
                    </tr>
                  )}

                  {vendasSemCom.map((v) => {
                    const clienteId = v.lead_id || v.cliente_lead_id || "";

                    return (
                      <tr key={v.id} className="border-b">
                        <td className="p-2">{formatISODateBR(v.data_venda)}</td>
                        <td className="p-2">{userLabel(v.vendedor_id)}</td>
                        <td className="p-2">{(clienteId && clientesMap[clienteId]?.trim()) || "—"}</td>
                        <td className="p-2 hidden md:table-cell">{v.numero_proposta || "—"}</td>
                        <td className="p-2 hidden md:table-cell">{v.administradora || "—"}</td>
                        <td className="p-2">{v.segmento || "—"}</td>
                        <td className="p-2">{v.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            onClick={() => gerarComissaoDeVenda(v)}
                            disabled={!canEdit || genBusy === v.id}
                            title={!canEdit ? "Vendedor não pode gerar comissão" : ""}
                          >
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

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>Comissões a Pagar</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={downloadDemonstrativoParticionadoPDF}>
                  <FileText className="w-4 h-4 mr-1" /> Demonstrativo
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Tipo do demonstrativo</Label>
                <Select value={demonstrativoTipo} onValueChange={(v) => setDemonstrativoTipo(v as "data" | "mes")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="data">Por data de pagamento</SelectItem>
                    <SelectItem value="mes">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {demonstrativoTipo === "data" ? (
                <div className="flex flex-col gap-2">
                  <Label>Data do demonstrativo</Label>
                  <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label>Mês do demonstrativo</Label>
                  <Input type="month" value={demonstrativoMes} onChange={(e) => setDemonstrativoMes(e.target.value)} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 md:max-w-md">
              <Label>Pesquisar</Label>
              <Input
                placeholder="Cliente ou nº da proposta"
                value={commissionSearch}
                onChange={(e) => setCommissionSearch(e.target.value)}
              />
            </div>

            <table className="min-w-[1380px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Unidade</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Proposta</th>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">Crédito</th>
                  <th className="p-2 text-right">Comissão Bruta</th>
                  <th className="p-2 text-right">Impostos</th>
                  <th className="p-2 text-right">Comissão Líquida</th>
                  <th className="p-2 text-left">Fluxo</th>
                  <th className="p-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {partitionBatchRowsAPagar.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-4 text-gray-500">
                      Nenhuma comissão a pagar encontrada para os filtros atuais.
                    </td>
                  </tr>
                )}

                {partitionBatchRowsAPagar.map((row) => {
                  const expanded = !!expandedPartitionBatchIds[row.batch.id];
                  const clienteNome = (row.clienteId && clientesMap[row.clienteId]?.trim()) || "—";
                  const flowStatusLabel = isFlowGroupPaid(row.flows)
                    ? "Pago"
                    : isFlowGroupProgrammed(row.flows)
                      ? "Programado"
                      : "A programar";

                  return (
                    <React.Fragment key={row.batch.id}>
                      <tr className={`border-b align-middle hover:bg-gray-50 ${isFlowGroupProgrammed(row.flows) ? "bg-blue-50/70 border-l-4 border-l-[#1E40AF]" : ""}`}>
                        <td className="p-2">{row.unidade?.nome || "—"}</td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="font-medium text-[#1E293F] underline-offset-2 hover:underline"
                            onClick={() => setExpandedPartitionBatchIds((prev) => ({ ...prev, [row.batch.id]: !prev[row.batch.id] }))}
                            title={expanded ? "Recolher detalhes" : "Expandir detalhes"}
                          >
                            {row.vendedor?.nome || userLabel(row.batch.vendedor_id)}
                          </button>
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            onClick={() => setExpandedPartitionBatchIds((prev) => ({ ...prev, [row.batch.id]: !prev[row.batch.id] }))}
                            title={expanded ? "Recolher detalhes" : "Expandir detalhes"}
                          >
                            {clienteNome}
                          </button>
                        </td>
                        <td className="p-2">{row.venda?.numero_proposta || "—"}</td>
                        <td className="p-2">{row.venda?.segmento || "—"}</td>
                        <td className="p-2">{row.venda?.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(row.venda?.valor_venda ?? row.batch.valor_venda)}</td>
                        <td className="p-2 text-right">{BRL(row.gross)}</td>
                        <td className="p-2 text-right">{BRL(row.tax)}</td>
                        <td className="p-2 text-right">{BRL(row.net)}</td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="font-semibold">{flowProgressText(row.flows)}</span>
                            <span className="text-gray-500">{flowStatusLabel}</span>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-2">
                            {canEdit && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => abrirEstornoParticionado(row)}>
                                  Estornar
                                </Button>
                                {partitionAdjustments.some((a) => a.batch_id === row.batch.id && a.adjustment_type === "estorno" && !a.is_reversed) && (
                                  <Button size="sm" variant="outline" className="border-[#A11C27] text-[#A11C27]" onClick={() => reverterEstornosParticionados(row.batch.id)}>
                                    Reverter Estorno
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="border-b bg-slate-50/60">
                          <td colSpan={12} className="p-3">
                            <div className="rounded-lg border bg-white p-3">
                              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase text-gray-500">
                                <span>Fluxo de pagamento da venda</span>
                                <span>Clique novamente no vendedor/cliente para recolher</span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="p-2 text-left">Fluxo</th>
                                    <th className="p-2 text-left">Situação</th>
                                    <th className="p-2 text-left">Ações</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(Array.from(new Set(row.flows.map((flow) => Number(flow.mes)))) as number[]).sort((a, b) => a - b).map((mes) => {
                                    const flowsMes = row.flows.filter((flow) => flow.mes === mes);
                                    const payable = flowsMes.filter((flow) => (Number(flow.valor_previsto) || 0) > 0);
                                    const totalMes = flowsMes.reduce((acc, flow) => acc + (Number(flow.valor_previsto) || 0), 0);
                                    const allPaid = payable.length > 0 && payable.every((flow) => flow.status === "pago" || (Number(flow.valor_pago) || 0) > 0);
                                    const firstDate = flowsMes.find((flow) => !!flow.data_pagamento)?.data_pagamento || null;
                                    const hasRefund = monthHasActiveRefund(flowsMes);
                                    const situacao =
                                      hasRefund
                                        ? "Estornada"
                                        : totalMes <= 0
                                          ? "Parcela sem valor"
                                          : allPaid
                                            ? `Pago ${formatISODateBR(firstDate)}`
                                            : firstDate
                                              ? `Prog. ${formatISODateBR(firstDate)}`
                                              : "A programar";

                                    return (
                                      <tr key={mes} className="border-b last:border-0">
                                        <td className="p-2 font-medium">M{mes} • {BRL(totalMes)}</td>
                                        <td className="p-2 text-gray-600">{situacao}</td>
                                        <td className="p-2">{canEdit ? renderPartitionMonthAction(flowsMes) : null}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <div className="mt-2 text-xs text-gray-500">
                                A programação e o pagamento são feitos uma única vez por parcela da venda e espelham para Empresa, Unidade e Vendedor.
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span>Perdidas</span>
              <Button size="sm" variant="outline" onClick={() => setShowPerdidas((v) => !v)}>
                {showPerdidas ? "Ocultar" : "Expandir"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showPerdidas && (
            <CardContent className="space-y-4 overflow-x-auto">
              <div className="text-xs text-gray-500">
                Vendas canceladas (código diferente de 00 ou cancelada_em preenchido) que ainda possuem comissão não quitada.
              </div>
              <table className="min-w-[1380px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Unidade</th>
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Proposta</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-right">Comissão Bruta</th>
                    <th className="p-2 text-right">Pago</th>
                    <th className="p-2 text-right">Perdida</th>
                    <th className="p-2 text-left">Fluxo</th>
                  </tr>
                </thead>
                <tbody>
                  {partitionBatchRowsPerdidas.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-4 text-gray-500">
                        Nenhuma comissão perdida para os filtros atuais.
                      </td>
                    </tr>
                  )}
                  {partitionBatchRowsPerdidas.map((row) => {
                    const clienteNome = (row.clienteId && clientesMap[row.clienteId]?.trim()) || "—";
                    const pago = row.flows.reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);
                    const perdida = Math.max(0, row.gross - pago);
                    return (
                      <tr key={row.batch.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">{row.unidade?.nome || "—"}</td>
                        <td className="p-2">{row.vendedor?.nome || userLabel(row.batch.vendedor_id)}</td>
                        <td className="p-2">{clienteNome}</td>
                        <td className="p-2">{row.venda?.numero_proposta || "—"}</td>
                        <td className="p-2">{row.venda?.segmento || "—"}</td>
                        <td className="p-2">{row.venda?.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(row.venda?.valor_venda ?? row.batch.valor_venda)}</td>
                        <td className="p-2 text-right">{BRL(row.gross)}</td>
                        <td className="p-2 text-right">{BRL(pago)}</td>
                        <td className="p-2 text-right font-semibold text-[#A11C27]">{BRL(perdida)}</td>
                        <td className="p-2">{flowProgressText(row.flows)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span>Finalizadas</span>
              <Button size="sm" variant="outline" onClick={() => setShowFinalizadas((v) => !v)}>
                {showFinalizadas ? "Ocultar" : "Expandir"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showFinalizadas && (
            <CardContent className="space-y-4 overflow-x-auto">
              <div className="text-xs text-gray-500">
                Vendas em que todas as parcelas com valor já foram pagas.
              </div>
              <table className="min-w-[1380px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Unidade</th>
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Proposta</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-right">Comissão Bruta</th>
                    <th className="p-2 text-right">Impostos</th>
                    <th className="p-2 text-right">Comissão Líquida</th>
                    <th className="p-2 text-left">Fluxo</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {partitionBatchRowsFinalizadas.length === 0 && (
                    <tr>
                      <td colSpan={12} className="p-4 text-gray-500">
                        Nenhuma comissão finalizada para os filtros atuais.
                      </td>
                    </tr>
                  )}
                  {partitionBatchRowsFinalizadas.map((row) => {
                    const clienteNome = (row.clienteId && clientesMap[row.clienteId]?.trim()) || "—";
                    return (
                      <tr key={row.batch.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">{row.unidade?.nome || "—"}</td>
                        <td className="p-2">{row.vendedor?.nome || userLabel(row.batch.vendedor_id)}</td>
                        <td className="p-2">{clienteNome}</td>
                        <td className="p-2">{row.venda?.numero_proposta || "—"}</td>
                        <td className="p-2">{row.venda?.segmento || "—"}</td>
                        <td className="p-2">{row.venda?.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(row.venda?.valor_venda ?? row.batch.valor_venda)}</td>
                        <td className="p-2 text-right">{BRL(row.gross)}</td>
                        <td className="p-2 text-right">{BRL(row.tax)}</td>
                        <td className="p-2 text-right">{BRL(row.net)}</td>
                        <td className="p-2">{flowProgressText(row.flows)}</td>
                        <td className="p-2">
                          <Button size="sm" variant="outline" onClick={() => downloadDemonstrativoParticionadoPDF()}>
                            Demonstrativo
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



        {/* Modelo antigo ocultado após migração: Detalhamento de Comissões e Comissões pagas foram removidos da operação principal. */}

        <Dialog open={openRules} onOpenChange={(v) => setOpenRules(v)}>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle>Regras de Comissão</DialogTitle>
            </DialogHeader>

            {!canEdit && <div className="text-sm text-gray-600">Modo vendedor: visualização apenas.</div>}

            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Administradora</Label>
                  <Select value={tableRuleAdminFilter} onValueChange={(v) => { setTableRuleAdminFilter(v); setTableRuleSegmentFilter("all"); setTableRuleTableId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {tableRuleAdminOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Segmento</Label>
                  <Select value={tableRuleSegmentFilter} onValueChange={(v) => { setTableRuleSegmentFilter(v); setTableRuleTableId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {tableRuleSegmentOptions.map((seg) => <SelectItem key={seg} value={seg}>{seg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 lg:col-span-3">
                  <Label>Tabela</Label>
                  <Select value={tableRuleTableId} onValueChange={setTableRuleTableId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a tabela" /></SelectTrigger>
                    <SelectContent>
                      {tableRuleTableOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {(t.admin_id && adminById[t.admin_id] ? `${adminById[t.admin_id]} • ` : "") + t.segmento + " • " + t.nome_tabela}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Comissão total da tabela (%)</Label>
                  <Input value={tableRuleTotalPct} onChange={(e) => setTableRuleTotalPct(e.target.value)} placeholder="5,00" disabled={!canEdit} />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Quantidade de parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={tableRuleFluxoMeses}
                    onChange={(e) => alterarQtdParcelasFluxoTabela(parseInt(e.target.value || "1", 10))}
                    disabled={!canEdit}
                  />
                </div>

                <div className="flex flex-col gap-2 lg:col-span-4">
                  <Label>Fluxo de pagamento sobre a venda (%)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 rounded-md border bg-white p-3">
                    {Array.from({ length: tableRuleFluxoMeses }).map((_, idx) => (
                      <div key={idx} className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Parcela {idx + 1}</span>
                        <Input
                          value={tableRuleFluxoPctList[idx] || "0,00"}
                          onChange={(e) => {
                            const next = [...tableRuleFluxoPctList];
                            next[idx] = e.target.value;
                            setTableRuleFluxoPctList(next);
                          }}
                          placeholder="0,00"
                          disabled={!canEdit}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    Exemplo: comissão total 5% em 4 parcelas: 2,00 + 1,00 + 1,00 + 1,00. Soma atual: <b>{formatPctHuman(fluxoTabelaSomaPercentualVenda)}</b>.
                    <br />
                    {fluxoTabelaPreviewText}
                  </div>
                </div>

                <div className="flex items-end">
                  <Button onClick={salvarRegraTabelaParticionada} disabled={!canEdit}>
                    <Save className="w-4 h-4 mr-1" /> Salvar Regra
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">Administradora</th>
                      <th className="p-2 text-left">Segmento</th>
                      <th className="p-2 text-left">Tabela</th>
                      <th className="p-2 text-right">Comissão total</th>
                      <th className="p-2 text-left">Fluxo de pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTableRules.rows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.administradora || "—"}</td>
                        <td className="p-2">{r.segmento || "—"}</td>
                        <td className="p-2">{r.nome_tabela}</td>
                        <td className="p-2 text-right">{pct100(r.percent_total)}</td>
                        <td className="p-2">{(r.fluxo_percentuais || []).map((x) => formatPctHuman((Number(x) || 0) * (Number(r.percent_total) || 0) * 100)).join(" / ")}</td>
                      </tr>
                    ))}
                    {!tableRules.length && (
                      <tr><td colSpan={5} className="p-4 text-gray-500">Nenhuma regra de comissão cadastrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3 text-sm text-gray-600">
                <span>Página {paginatedTableRules.page} de {paginatedTableRules.totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => setTableRulesPage((p) => Math.max(1, p - 1))} disabled={paginatedTableRules.page <= 1}>Anterior</Button>
                <Button size="sm" variant="outline" onClick={() => setTableRulesPage((p) => Math.min(paginatedTableRules.totalPages, p + 1))} disabled={paginatedTableRules.page >= paginatedTableRules.totalPages}>Próxima</Button>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button variant="secondary" onClick={() => setOpenRules(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openPartitionRules} onOpenChange={setOpenPartitionRules}>
          <DialogContent className="max-w-[96vw] xl:max-w-[1400px] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Partilhas por Unidade</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Administradora</Label>
                <Select value={partAdminFilter} onValueChange={(v) => { setPartAdminFilter(v); setPartSegmentFilter("all"); setPartRuleTableId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {adminOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Segmento</Label>
                <Select value={partSegmentFilter} onValueChange={(v) => { setPartSegmentFilter(v); setPartRuleTableId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {partSegmentOptions.map((seg) => <SelectItem key={seg} value={seg}>{seg}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 lg:col-span-2">
                <Label>Tabela</Label>
                <Select value={partRuleTableId} onValueChange={setPartRuleTableId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a tabela" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {partTableOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {(t.admin_id && adminById[t.admin_id] ? `${adminById[t.admin_id]} • ` : "") + t.segmento + " • " + t.nome_tabela}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Unidade</Label>
                <Select value={partRuleUnitId} onValueChange={(v) => { setPartRuleUnitId(v); setPartVendorId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {units.filter((u) => u.tipo !== "matriz" && u.is_active !== false).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Vendedor</Label>
                <Select value={partVendorId} onValueChange={setPartVendorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {activeUsers.filter((u) => !partRuleUnitId || partRuleUnitId === "all" || u.unit_id === partRuleUnitId).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome || u.email || u.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>% Vendedor</Label>
                <Input value={partSplitVendedor} onChange={(e) => setPartSplitVendedor(e.target.value)} placeholder="25,00" />
              </div>

              <div className="flex flex-col gap-2">
                <Label>% Unidade</Label>
                <Input value={partSplitUnidade} onChange={(e) => setPartSplitUnidade(e.target.value)} placeholder="25,00" />
              </div>
            </div>

            {selectedPartTableRule && selectedPartCommissionPreview && (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm">
                <div className="font-semibold text-[#1E293F]">Resumo da tabela selecionada</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <div>Comissão total: <b>{pct100(selectedPartTableRule.percent_total)}</b></div>
                  <div>Vendedor: <b>{pct100(selectedPartCommissionPreview.vendedorFrac)}</b></div>
                  <div>Unidade: <b>{pct100(selectedPartCommissionPreview.unidadeFrac)}</b></div>
                  <div>Matriz: <b>{pct100(selectedPartCommissionPreview.empresaFrac)}</b></div>
                  <div className="md:col-span-2">Fluxo: <b>{selectedPartCommissionPreview.fluxo.map((p) => formatPctHuman((Number(p) || 0) * (Number(selectedPartTableRule.percent_total) || 0) * 100)).join(" / ") || "—"}</b></div>
                </div>
                <div className="mt-2 text-xs text-slate-500">Exemplo: em uma venda de R$ 100.000,00, a comissão total seria {BRL(selectedPartCommissionPreview.comissaoTotal)}.</div>
                <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
                  <table className="min-w-[720px] w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 text-left">Parcela</th>
                        <th className="p-2 text-right">% da venda</th>
                        <th className="p-2 text-right">Comissão total</th>
                        <th className="p-2 text-right">Matriz</th>
                        <th className="p-2 text-right">Unidade</th>
                        <th className="p-2 text-right">Vendedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPartCommissionPreview.fluxo.map((p, idx) => {
                        const parcelaTotal = selectedPartCommissionPreview.comissaoTotal * (Number(p) || 0);
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">M{idx + 1}</td>
                            <td className="p-2 text-right">{formatPctHuman((Number(p) || 0) * (Number(selectedPartTableRule.percent_total) || 0) * 100)}</td>
                            <td className="p-2 text-right">{BRL(parcelaTotal)}</td>
                            <td className="p-2 text-right">{BRL(parcelaTotal * selectedPartCommissionPreview.empresaFrac)}</td>
                            <td className="p-2 text-right">{BRL(parcelaTotal * selectedPartCommissionPreview.unidadeFrac)}</td>
                            <td className="p-2 text-right">{BRL(parcelaTotal * selectedPartCommissionPreview.vendedorFrac)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[#1E293F]">Configurações já cadastradas</div>
                  <div className="text-xs text-slate-500">Unidade, vendedor, administradora e tabela com partilha configurada.</div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{splitRulesConfiguredRows.length} configuração(ões)</span>
              </div>

              <div className="max-h-[320px] overflow-auto rounded-lg border">
                <table className="min-w-[1180px] w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-2 text-left">Unidade</th>
                      <th className="p-2 text-left">Vendedor</th>
                      <th className="p-2 text-left">Administradora</th>
                      <th className="p-2 text-left">Segmento</th>
                      <th className="p-2 text-left">Tabela</th>
                      <th className="p-2 text-right">Comissão tabela</th>
                      <th className="p-2 text-left">Fluxo da tabela</th>
                      <th className="p-2 text-right">Matriz</th>
                      <th className="p-2 text-right">Unidade</th>
                      <th className="p-2 text-right">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitRulesConfiguredRows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-4 text-center text-slate-500">Nenhuma partilha cadastrada para os filtros selecionados.</td>
                      </tr>
                    )}
                    {splitRulesConfiguredRows.map((row) => (
                      <tr key={row.key} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-2">{row.unidadeNome}</td>
                        <td className="p-2">{row.vendedorNome}</td>
                        <td className="p-2">{row.administradora}</td>
                        <td className="p-2">{row.segmento}</td>
                        <td className="p-2">{row.tabela}</td>
                        <td className="p-2 text-right">{pct100(row.commissionPct)}</td>
                        <td className="p-2 text-left text-xs">{row.fluxo?.length ? row.fluxo.map((x) => formatPctHuman((Number(x) || 0) * row.commissionPct * 100)).join(" / ") : "—"}</td>
                        <td className="p-2 text-right">{pct100(row.matrizPct)}</td>
                        <td className="p-2 text-right">{pct100(row.unidadePct)}</td>
                        <td className="p-2 text-right">{pct100(row.vendedorPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button variant="secondary" onClick={() => setOpenPartitionRules(false)}>Fechar</Button>
              <Button onClick={salvarRegraParticionada} disabled={!canEdit}>
                <Save className="w-4 h-4 mr-1" /> Salvar Partilha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={ruleFormOpen}
          onOpenChange={(open) => {
            if (!canEdit && open) return;
            setRuleFormOpen(open);
            if (!open) setRuleFormSimTable(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {ruleFormSimTable
                  ? `Regra de comissão — ${(ruleFormSimTable.admin_id && adminById[ruleFormSimTable.admin_id]) || ""} / ${ruleFormSimTable.segmento} / ${ruleFormSimTable.nome_tabela}`
                  : "Regra de comissão"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2">
                  <Label>Vendedor</Label>
                  <Input readOnly value={userLabel(ruleVendorId) || ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>% Padrão (ex.: 1,20 = 1,20%)</Label>
                  <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" disabled={!canEdit} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Nº de meses do fluxo</Label>
                  <Input type="number" min={1} max={36} value={ruleMeses} onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))} disabled={!canEdit} />
                </div>
              </div>

              <div className="space-y-4">
                <Label>
                  Fluxo do pagamento (M1..Mn) — você pode digitar 100% no total <b>ou</b> a soma igual ao % Padrão
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4 border rounded-md bg-white">
                  {Array.from({ length: ruleMeses }).map((_, i) => (
                    <Input
                      key={i}
                      value={ruleFluxoPct[i] || "0,00"}
                      onChange={(e) => {
                        const arr = [...ruleFluxoPct];
                        arr[i] = e.target.value;
                        setRuleFluxoPct(arr);
                      }}
                      placeholder="0,33"
                      disabled={!canEdit}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-600">
                  Soma do fluxo: <b>{fluxoSoma.toFixed(2)} (aceitas: 1,00 ou % padrão {rulePercent || "0,00"})</b>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
                <div className="lg:col-span-2 flex flex-col gap-2">
                  <Label>Observações</Label>
                  <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" disabled={!canEdit} />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button onClick={saveRule} disabled={!canEdit}>
                    <Save className="w-4 h-4 mr-1" /> Salvar Regra
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRulePercent("1,20");
                      setRuleMeses(1);
                      setRuleFluxoPct(["100,00"]);
                      setRuleObs("");
                    }}
                    disabled={!canEdit}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button variant="secondary" onClick={() => setRuleFormOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!viewRule}
          onOpenChange={(open) => {
            if (!open) setViewRule(null);
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Visualizar regra</DialogTitle>
            </DialogHeader>

            {viewRule && (
              <div className="space-y-4 text-sm">
                <div>
                  <b>Administradora:</b> {viewRule.administradora || "—"}
                </div>
                <div>
                  <b>Segmento:</b> {viewRule.segmento || "—"}
                </div>
                <div>
                  <b>Tabela:</b> {viewRule.nome_tabela}
                </div>
                <div>
                  <b>% Padrão:</b> {pct100(viewRule.percent_padrao)}
                </div>
                <div>
                  <b>Meses do fluxo:</b> {viewRule.fluxo_meses}
                </div>
                <div>
                  <b>Fluxo de pagamento:</b>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                    {viewRule.fluxo_percentuais?.map((p, idx) => (
                      <div key={idx} className="border rounded px-2 py-1 flex items-center justify-between">
                        <span>M{idx + 1}</span>
                        <span>{(p * 100).toFixed(2).replace(".", ",")}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setViewRule(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={openPay}
          onOpenChange={(v) => {
            if (!canEdit && v) return;
            setOpenPay(v);
          }}
        >
          <DialogContent className="w-[98vw] max-w-[1400px]">
            <DialogHeader>
              <DialogTitle>Registrar pagamento ao vendedor</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue={payDefaultTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger>
                <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
              </TabsList>

              <TabsContent value="selecionar" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="flex flex-col gap-2">
                    <Label>Data do pagamento</Label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Valor pago ao vendedor (opcional)</Label>
                    <Input placeholder="Ex.: 1.974,00" value={payValue} onChange={(e) => setPayValue(e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() =>
                        paySelectedParcels({
                          data_pagamento_vendedor: payDate,
                          valor_pago_vendedor: payValue ? parseBRL(payValue) : undefined,
                          recibo_file: null,
                          comprovante_file: null,
                        })
                      }
                    >
                      <Save className="w-4 h-4 mr-1" /> Salvar
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const pend = Object.fromEntries(
                          payFlow.filter((f) => !f.data_pagamento_vendedor && (f.valor_pago_vendedor ?? 0) === 0).map((f) => [f.id, true])
                        );
                        setPaySelected(pend);
                      }}
                    >
                      Selecionar tudo pendente
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1300px] w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-2 text-left">Sel.</th>
                        <th className="p-2 text-left">Mês</th>
                        <th className="p-2 text-left">% Parcela</th>
                        <th className="p-2 text-right">Valor Previsto</th>
                        <th className="p-2 text-right">Valor Pago</th>
                        <th className="p-2 text-left">Data Pagto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payFlow.map((f) => {
                        const isLocked = (f.valor_pago_vendedor ?? 0) > 0 || Boolean(f.recibo_vendedor_url) || Boolean(f.comprovante_pagto_url);

                        return (
                          <tr key={f.id} className={`border-b ${isLocked ? "opacity-60 pointer-events-none" : ""}`}>
                            <td className="p-2">
                              <Checkbox
                                checked={!!paySelected[f.id]}
                                onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))}
                                disabled={isLocked}
                              />
                            </td>
                            <td className="p-2">M{f.mes}</td>
                            <td className="p-2">{pct100(f.percentual)}</td>
                            <td className="p-2 text-right">{BRL((f as any)._valor_previsto_calc ?? f.valor_previsto)}</td>
                            <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                            <td className="p-2">{f.data_pagamento_vendedor ? formatISODateBR(f.data_pagamento_vendedor) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="arquivos" className="space-y-6">
                <UploadArea onConfirm={paySelectedParcels} />
              </TabsContent>
            </Tabs>

            <DialogFooter className="pt-6">
              <Button onClick={() => setOpenPay(false)} variant="secondary">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!partitionScheduleFlow} onOpenChange={(open) => { if (!open) setPartitionScheduleFlow(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Programar pagamento da comissão</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label>Data programada</Label>
                <Input
                  value={partitionScheduleDateBR}
                  onChange={(e) => setPartitionScheduleDateBR(e.target.value)}
                  placeholder="dd/mm/aaaa"
                  inputMode="numeric"
                />
                <div className="text-xs text-gray-500">Use o formato dd/mm/aaaa. Essa data será usada no demonstrativo.</div>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setPartitionScheduleFlow(null)}>Cancelar</Button>
              <Button onClick={confirmarProgramacaoParticionada} style={{ background: "#A11C27" }}>Programar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!partitionPayFlow} onOpenChange={(open) => { if (!open) setPartitionPayFlow(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Confirmar pagamento da comissão</DialogTitle>
            </DialogHeader>

            {partitionPayFlow && (() => {
              const flowsMes = partitionFlows.filter((f) => f.batch_id === partitionPayFlow.batch_id && f.mes === partitionPayFlow.mes);
              const entryById = Object.fromEntries(partitionEntries.map((entry) => [entry.id, entry]));
              const unidadeFlow = flowsMes.find((f) => entryById[f.entry_id]?.recipient_type === "unidade");
              const vendedorFlow = flowsMes.find((f) => entryById[f.entry_id]?.recipient_type === "vendedor");
              const unidadeValor = Number(unidadeFlow?.valor_previsto) || 0;
              const vendedorValor = Number(vendedorFlow?.valor_previsto) || 0;

              return (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label>Data do pagamento</Label>
                    <Input type="date" value={partitionPayDate} onChange={(e) => setPartitionPayDate(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border bg-white p-3 space-y-3">
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">Unidade</div>
                        <div className="text-lg font-bold text-[#1E293F]">{BRL(unidadeValor)}</div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Comprovante da Unidade</Label>
                        <Input type="file" accept="application/pdf,image/*" disabled={partitionPayDispensarUnidade} onChange={(e) => setPartitionPayUnidadeFile(e.target.files?.[0] || null)} />
                        <label className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                          <Checkbox
                            checked={partitionPayDispensarUnidade}
                            onCheckedChange={(v) => {
                              setPartitionPayDispensarUnidade(!!v);
                              if (v) setPartitionPayUnidadeFile(null);
                            }}
                          />
                          Dispensar
                        </label>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-white p-3 space-y-3">
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">Vendedor</div>
                        <div className="text-lg font-bold text-[#1E293F]">{BRL(vendedorValor)}</div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Comprovante do Vendedor</Label>
                        <Input type="file" accept="application/pdf,image/*" disabled={partitionPayDispensarVendedor} onChange={(e) => setPartitionPayVendedorFile(e.target.files?.[0] || null)} />
                        <label className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                          <Checkbox
                            checked={partitionPayDispensarVendedor}
                            onCheckedChange={(v) => {
                              setPartitionPayDispensarVendedor(!!v);
                              if (v) setPartitionPayVendedorFile(null);
                            }}
                          />
                          Dispensar
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-slate-50 p-3 text-xs text-gray-600">
                    A confirmação será aplicada uma única vez para a parcela da venda e espelhada para Empresa, Unidade e Vendedor.
                  </div>
                </div>
              );
            })()}

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setPartitionPayFlow(null)}>Cancelar</Button>
              <Button onClick={confirmarPagamentoParticionado} style={{ background: "#1E293F" }}>Confirmar pagamento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openImpostoCfg} onOpenChange={setOpenImpostoCfg}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar imposto (fixo)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label>Imposto (%)</Label>
                <Input value={impostoDraft} onChange={(e) => setImpostoDraft(e.target.value)} placeholder="Ex.: 6,00" disabled={!canEdit} />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setOpenImpostoCfg(false)}>
                Cancelar
              </Button>
              <Button onClick={saveImpostoParam} disabled={!canEdit}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!partitionRefundBatchId} onOpenChange={(open) => !open && setPartitionRefundBatchId(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Estorno de comissão particionada</DialogTitle>
            </DialogHeader>

            {(() => {
              const row = partitionBatchRowsVisible.find((item) => item.batch.id === partitionRefundBatchId);
              const paidMeses = row
                ? Array.from(new Set(row.flows.filter((flow) => (Number(flow.valor_pago) || 0) > 0 && !monthHasActiveRefund([flow])).map((flow) => Number(flow.mes)))).sort((a, b) => a - b)
                : [];
              const selectedMes = Number(partitionRefundMes);
              const flowsMes = row?.flows.filter((flow) => Number(flow.mes) === selectedMes && (Number(flow.valor_pago) || 0) > 0) || [];
              const totalPagoMes = flowsMes.reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);
              const impostoEstorno = parseBRL(partitionRefundAmount) * impostoFrac;

              return (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-slate-50 p-3 text-sm">
                    <div><b>Cliente:</b> {(row?.clienteId && clientesMap[row.clienteId]?.trim()) || "—"}</div>
                    <div><b>Proposta:</b> {row?.venda?.numero_proposta || "—"} • <b>Vendedor:</b> {row?.vendedor?.nome || "—"}</div>
                    <div><b>Unidade:</b> {row?.unidade?.nome || "—"}</div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <Label>Parcela paga</Label>
                      <Select value={partitionRefundMes} onValueChange={(v) => {
                        setPartitionRefundMes(v);
                        const total = (row?.flows || [])
                          .filter((flow) => Number(flow.mes) === Number(v) && (Number(flow.valor_pago) || 0) > 0)
                          .reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);
                        setPartitionRefundAmount(String(total.toFixed(2)).replace(".", ","));
                      }}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {paidMeses.map((mes) => {
                            const total = (row?.flows || [])
                              .filter((flow) => Number(flow.mes) === mes && (Number(flow.valor_pago) || 0) > 0)
                              .reduce((acc, flow) => acc + (Number(flow.valor_pago) || 0), 0);
                            return <SelectItem key={mes} value={String(mes)}>M{mes} • Pago {BRL(total)}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Valor bruto do estorno</Label>
                      <Input value={partitionRefundAmount} onChange={(e) => setPartitionRefundAmount(e.target.value)} placeholder="0,00" />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Data do estorno</Label>
                      <Input value={partitionRefundDateBR} onChange={(e) => setPartitionRefundDateBR(e.target.value)} placeholder="dd/mm/aaaa" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-slate-500">Valor pago na parcela selecionada</div>
                      <div className="text-lg font-semibold text-[#1E293F]">{BRL(totalPagoMes)}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-slate-500">Imposto a estornar</div>
                      <div className="text-lg font-semibold text-[#A11C27]">{BRL(impostoEstorno)}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Descrição</Label>
                    <Input value={partitionRefundDescription} onChange={(e) => setPartitionRefundDescription(e.target.value)} />
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    O estorno será lançado proporcionalmente nos participantes da parcela paga e também registrará o imposto correspondente. A venda poderá ter o estorno revertido depois.
                  </div>
                </div>
              );
            })()}

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setPartitionRefundBatchId(null)}>Cancelar</Button>
              <Button onClick={confirmarEstornoParticionado}>Confirmar estorno</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openBulkRefund} onOpenChange={(v) => (canEdit ? setOpenBulkRefund(v) : undefined)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Estorno de comissão (por nº de proposta)</DialogTitle>
            </DialogHeader>

            {!canEdit && <div className="text-sm text-gray-600">Modo vendedor: não é possível estornar.</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>Nº da proposta</Label>
                <div className="flex gap-2">
                  <Input value={bulkRefundProp} onChange={(e) => setBulkRefundProp(e.target.value)} placeholder="Ex.: 1234" disabled={!canEdit} />
                  <Button variant="secondary" onClick={searchRefundByProposal} disabled={!canEdit}>
                    Buscar
                  </Button>
                </div>
              </div>
              <div>
                <Label>Data do estorno</Label>
                <Input type="date" value={bulkRefundDate} onChange={(e) => setBulkRefundDate(e.target.value)} disabled={!canEdit} />
              </div>
            </div>

            {bulkRefundFound && (
              <div className="mt-4 space-y-3 border rounded-md p-4 bg-white">
                <div className="text-sm text-gray-700">
                  <b>Vendedor:</b> {userLabel(bulkRefundFound.comm.vendedor_id)} &nbsp; • &nbsp;
                  <b>Proposta:</b> {bulkRefundFound.comm.numero_proposta || "—"}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[700px] w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-2 text-left">Parcela</th>
                        <th className="p-2 text-left">Data Pagto</th>
                        <th className="p-2 text-right">Valor Pago (Bruto)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRefundFound.flows.map((f) => (
                        <tr key={f.id} className="border-b">
                          <td className="p-2">M{f.mes}</td>
                          <td className="p-2">{formatISODateBR(f.data_pagamento_vendedor)}</td>
                          <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="p-2 font-medium" colSpan={2}>
                          Total pago
                        </td>
                        <td className="p-2 text-right font-bold">{BRL(sum(bulkRefundFound.flows.map((f) => f.valor_pago_vendedor || 0)))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="md:col-span-2">
                    <Label>Valor bruto do estorno</Label>
                    <Input value={bulkRefundGross} onChange={(e) => setBulkRefundGross(e.target.value)} placeholder="Ex.: 5.000,00" disabled={!canEdit} />
                  </div>
                  <div className="flex flex-col">
                    <Label>Valor líquido (auto)</Label>
                    <div className="p-2 border rounded-md bg-gray-50">
                      {(() => {
                        const g = parseBRL(bulkRefundGross);
                        const n = commissionNet(g, impostoFrac);
                        return BRL(n);
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setOpenBulkRefund(false)}>
                Fechar
              </Button>
              <Button disabled={!bulkRefundFound || busyRefund || !canEdit} onClick={confirmBulkRefund}>
                {busyRefund ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirmar estorno
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

/* ========================= Subcomponentes ========================= */
function UploadArea({
  onConfirm,
}: {
  onConfirm: (payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) => Promise<void>;
}) {
  const [dataPg, setDataPg] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [valorPg, setValorPg] = useState<string>("");
  const [fileRecibo, setFileRecibo] = useState<File | null>(null);
  const [fileComp, setFileComp] = useState<File | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex flex-col gap-2">
          <Label>Data do pagamento</Label>
          <Input type="date" value={dataPg} onChange={(e) => setDataPg(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Valor pago ao vendedor (opcional)</Label>
          <Input placeholder="Ex.: 1.974,00" value={valorPg} onChange={(e) => setValorPg(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() =>
              onConfirm({
                data_pagamento_vendedor: dataPg,
                valor_pago_vendedor: valorPg ? parseFloat(valorPg.replace(/\./g, "").replace(",", ".")) : undefined,
                recibo_file: fileRecibo,
                comprovante_file: fileComp,
              })
            }
          >
            <Save className="w-4 h-4 mr-1" /> Confirmar pagamento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <Label>Demonstrativo anexado (PDF)</Label>
          <Input type="file" accept="application/pdf" onChange={(e) => setFileRecibo(e.target.files?.[0] || null)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Comprovante de pagamento (PDF/Imagem)</Label>
          <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFileComp(e.target.files?.[0] || null)} />
        </div>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed">
        Arquivos vão para o bucket <code>comissoes</code>. Digite o valor <b>BRUTO</b>. Não é necessário recibo assinado; anexe o demonstrativo e/ou comprovante bancário.
      </div>
    </div>
  );
}
