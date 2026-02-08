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
  Trash2,
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
type SimTable = { id: UUID; segmento: string; nome_tabela: string; admin_id?: UUID | null };
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

  // 👇 cola aqui
  venda_cancelada?: boolean;
  venda_codigo?: string | null;
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
  percent_padrao: number;        // fração
  fluxo_meses: number;
  fluxo_percentuais: number[];   // frações somando 1.00
  obs: string | null;
};

/* ========================= Helpers de moeda/data ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;
const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);
const clamp0 = (n: number) => (n < 0 ? 0 : n);
const toDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));
const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/* ======================== Datas / projeções ======================== */
const localDateFromISO = (iso?: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
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
  const u = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "noventos"];
  const ext = (n0: number): string =>
    n0 < 20 ? u[n0] :
    n0 < 100 ? d[Math.floor(n0 / 10)] + (n0 % 10 ? " e " + u[n0 % 10] : "") :
    n0 === 100 ? "cem" :
    c[Math.floor(n0 / 100)] + (n0 % 100 ? " e " + ext(n0 % 100) : "");
  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);
  return `${ext(i)} ${i === 1 ? "real" : "reais"}${ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""}`;
}
function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  return flow.some(
    (f) => (Number(f.percentual) || 0) > 0 && !!f.data_pagamento_vendedor && (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

/* ========================= Donut ========================= */
function Donut({
  paid,
  pending,
  label,
  hoverPaidText,
  hoverPendText,
  pendingLegend = "A pagar",
}: {
  paid: number;
  pending: number;
  label: string;
  hoverPaidText: string;
  hoverPendText: string;
  pendingLegend?: string;
}) {
  const total = Math.max(0, paid + pending);
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
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
            cx="80" cy="80" r={radius}
            stroke={navy}
            strokeWidth={hover === "paid" ? 26 : 22}
            fill="none"
            strokeDasharray={`${paidLen} ${circumference}`}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("paid")}
            onMouseLeave={() => setHover(null)}
            style={{ transition: "all .2s ease", filter: hover === "paid" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none" }}
          />
          <circle
            cx="80" cy="80" r={radius}
            stroke={red}
            strokeWidth={hover === "pend" ? 26 : 22}
            fill="none"
            strokeDasharray={`${pendLen} ${circumference}`}
            strokeDashoffset={-paidLen}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("pend")}
            onMouseLeave={() => setHover(null)}
            style={{ transition: "all .2s ease", filter: hover === "pend" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none" }}
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
          <span className="font-medium">Pago</span>
        </div>
        <div className="text-gray-600">{hover === "paid" ? hoverPaidText : BRL(paid)}</div>
        <div className="mt-3 mb-1">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: red }} />
          <span className="font-medium">{pendingLegend}</span>
        </div>
        <div className="text-gray-600">{hover === "pend" ? hoverPendText : BRL(pending)}</div>
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

  const maxY = useMemo(() => {
    const all = series.flatMap((s) => s.data);
    const m = Math.max(1, ...all);
    const pow = Math.pow(10, String(Math.floor(m)).length - 1);
    return Math.ceil(m / pow) * pow;
  }, [series]);

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
    const { x } = clientToViewBox(e);
    const local = x - pad.left;
    const i = Math.round(local / xStep);
    setHoverX(Math.min(Math.max(i, 0), labels.length - 1));
  };

  const hovered = hoverX != null ? {
    label: labels[hoverX],
    values: series.map((s) => s.data[hoverX] ?? 0),
  } : null;

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="block w-full" onMouseLeave={() => setHoverX(null)}>
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

        {series.map((s, si) => {
          const pts = pointsFor(s.data);
          const d = pts.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(" ");
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={palette[si % palette.length]} strokeWidth={2} />
              {pts.map(([x, y], pi) => (
                <circle key={pi} cx={x} cy={y} r={2.5} fill="#fff" stroke={palette[si % palette.length]} strokeWidth={2} />
              ))}
            </g>
          );
        })}

        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />

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
        {series.map((s, si) => (
          <div className="flex items-center gap-2 text-sm" key={si}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ["#1E293F", "#A11C27"][si % 2] }} />
            <span className="text-gray-700">{s.name}</span>
          </div>
        ))}
      </div>

      {hovered && (
        <div className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow" style={{ left: 16, top: 16 }}>
          <div className="mb-1 font-semibold text-gray-800">{hovered.label}</div>
          <div className="space-y-1">
            {hovered.values.map((v, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-gray-600">{series[i]?.name ?? `Série ${i + 1}`}</span>
                <span className="tabular-nums ml-8">{formatY(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Projeções (resumo) ========================= */
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
function expectedDateForParcel(_saleDateISO: string | null | undefined, flow: CommissionFlow[] | undefined, mes: number): Date | null {
  const safeFlow = Array.isArray(flow) ? flow : [];
  const m2 = safeFlow.find(f => f.mes === 2);
  const m2Date = m2?.data_pagamento_vendedor ? localDateFromISO(m2.data_pagamento_vendedor) : null;
  if (mes <= 2) {
    const f = safeFlow.find(x => x.mes === mes);
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
  while (d.getDay() !== 5) d = new Date(year, month, d.getDate() + 1);
  const intervals: Array<{ start: Date; end: Date; label: string }> = [];
  while (d <= eom) {
    const start = new Date(d);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const endClamped = end > eom ? eom : end;
    const s = `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
    const e = `${String(endClamped.getDate()).padStart(2, "0")}/${String(endClamped.getMonth() + 1).padStart(2, "0")}`;
    intervals.push({ start, end: endClamped, label: `S${intervals.length + 1} (${s}–${e})` });
    d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  }
  if (!intervals.length) {
    intervals.push({ start: first, end: eom, label: `S1 (01/${String(month + 1).padStart(2, "0")}–${String(eom.getDate()).padStart(2, "0")}/${String(month + 1).padStart(2, "0")})` });
  }
  return intervals;
}
type ProjSeries = { labels: string[]; previstoBruto: number[]; pagoBruto: number[] };
function projectAnnualFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries {
  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i);
  const previsto = Array(years.length).fill(0);
  const pagos = Array(years.length).fill(0);
  for (const r of rows) {
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      if (f.data_pagamento_vendedor) {
        const pd = localDateFromISO(f.data_pagamento_vendedor);
        if (pd) {
          const yi = years.indexOf(pd.getFullYear());
          if (yi >= 0) pagos[yi] += f.valor_pago_vendedor ?? 0;
        }
      }
    }
  }
  return { labels: years.map(String), previstoBruto: previsto, pagoBruto: pagos };
}
function projectMonthlyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>, year: number, includePrevisto: boolean): ProjSeries {
  const labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const previsto = Array(12).fill(0);
  const pagos    = Array(12).fill(0);
  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      if (f.data_pagamento_vendedor) {
        const pd = localDateFromISO(f.data_pagamento_vendedor);
        if (pd && pd.getFullYear() === year) pagos[pd.getMonth()] += f.valor_pago_vendedor ?? 0;
      }
      if (!includePrevisto) continue;
      const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
      if (exp && exp.getFullYear() === year) {
        const expVal = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;
        const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
        if (!isPaid) previsto[exp.getMonth()] += expVal;
      }
    }
  }
  return { labels, previstoBruto: previsto, pagoBruto: pagos };
}
function projectWeeklyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries & { labels: string[] } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const intervals = getWeeklyIntervalsFriToThu(year, month);
  const labels = intervals.map(i => i.label);
  const previsto = Array(intervals.length).fill(0);
  const pagos    = Array(intervals.length).fill(0);
  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      if (f.data_pagamento_vendedor) {
        const pd = localDateFromISO(f.data_pagamento_vendedor);
        if (pd && pd.getFullYear() === year && pd.getMonth() === month) {
          const idx = intervals.findIndex(iv => pd >= iv.start && pd <= iv.end);
          if (idx >= 0) pagos[idx] += f.valor_pago_vendedor ?? 0;
        }
      }
      const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
      if (exp && exp.getFullYear() === year && exp.getMonth() === month) {
        const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
        if (!isPaid) {
          const expVal = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;
          const idx = intervals.findIndex(iv => exp >= iv.start && exp <= iv.end);
          if (idx >= 0) previsto[idx] += expVal;
        }
      }
    }
  }
  return { labels, previstoBruto: previsto, pagoBruto: pagos };
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
  /* ===== Auth & RBAC ===== */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const aid = data?.user?.id ?? null;
      setAuthUserId(aid);
    })();
  }, []);

  /* Filtros */
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  /* Bases */
  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [simAdmins, setSimAdmins] = useState<{ id: UUID; name: string }[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const usersByAuth = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => { if (u.auth_user_id) m[u.auth_user_id] = u; });
    return m;
  }, [users]);
  const secureById = useMemo(() => Object.fromEntries(usersSecure.map((u) => [u.id, u])), [usersSecure]);
  const adminById = useMemo(() => Object.fromEntries(simAdmins.map((a) => [a.id, a.name])), [simAdmins]);
  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id] || usersByAuth[id];
    return u?.nome?.trim() || u?.email?.trim() || id;
  };
  const canonUserId = (id?: string | null) => (id ? usersById[id]?.id || usersByAuth[id]?.id || null : null);

  /* Dados */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* Regras */
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

  /* Pagamento */
  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<(CommissionFlow & { _valor_previsto_calc?: number })[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");
  const [payDefaultTab, setPayDefaultTab] = useState<"selecionar" | "arquivos">("selecionar");

  /* Recibo */
  const [reciboDate, setReciboDate] = useState<string>(() => toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00");
  const [reciboVendor, setReciboVendor] = useState<string>("all");

  /* Estorno (global em Comissões Pagas) */
  const [openBulkRefund, setOpenBulkRefund] = useState(false);
  const [bulkRefundProp, setBulkRefundProp] = useState<string>("");
  const [bulkRefundFound, setBulkRefundFound] = useState<{ comm: Commission; flows: CommissionFlow[] } | null>(null);
  const [bulkRefundDate, setBulkRefundDate] = useState<string>(() => toDateInput(new Date()));
  const [bulkRefundGross, setBulkRefundGross] = useState<string>("");
  const [busyRefund, setBusyRefund] = useState(false);

  /* Expand/Collapse */
  const [showPaid, setShowPaid] = useState(false);
  const [showUnpaid, setShowUnpaid] = useState(true);
  const [showVendasSem, setShowVendasSem] = useState(true);

  /* Busca/Paginação (pagas) */
  const [paidSearch, setPaidSearch] = useState<string>("");
  const [paidPage, setPaidPage] = useState<number>(1);
  const pageSize = 15;

  /* Busca nº proposta (a pagar) */
  const [unpaidPropSearch, setUnpaidPropSearch] = useState<string>("");

  /* Carregamento de bases + RBAC */
  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }, { data: us }, { data: admins }] = await Promise.all([
        supabase
          .from("users")
          .select("id, auth_user_id, nome, email, phone, cep, logradouro, numero, bairro, cidade, uf, pix_key, pix_type, login, role, scopes, avatar_url, pix_kind")
          .order("nome", { ascending: true }),
        supabase.from("sim_tables").select("id, segmento, nome_tabela, admin_id").order("segmento", { ascending: true }),
        supabase.from("users_secure").select("id, nome, email, logradouro, numero, bairro, cidade, uf, pix_key, cpf, cpf_mascarado"),
        supabase.from("sim_admins").select("id, name").order("name", { ascending: true }),
      ]);
      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
      setUsersSecure((us || []) as UserSecure[]);
      setSimAdmins((admins || []) as { id: UUID; name: string }[]);

      // define ADMIN/SCOPES
      const current = (u || []).find((x: any) => x.auth_user_id && x.auth_user_id === (authUserId || "")) as User | undefined;
      const admin = current?.role === "admin";
      setIsAdmin(!!admin);

      // se não for admin, trava o vendedor no próprio id
      if (!admin && current?.id) {
        setVendedorId(current.id);
        setReciboVendor(current.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  // SINCRONIZA recibo com o vendedor selecionado
  useEffect(() => {
    setReciboVendor(vendedorId);
  }, [vendedorId]);

  // opções de administradora / segmento para Regras
  const adminOptions = useMemo(() => {
    const ids = Array.from(new Set(simTables.map((t) => t.admin_id).filter(Boolean))) as string[];
    return ids
      .map((id) => ({ id, name: adminById[id] || "Sem administradora" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [simTables, adminById]);

  const ruleSegmentOptions = useMemo(() => {
    let base = simTables;
    if (ruleAdminFilter !== "all") base = base.filter((t) => t.admin_id === ruleAdminFilter);
    const segs = Array.from(new Set(base.map((t) => t.segmento).filter(Boolean))) as string[];
    return segs.sort();
  }, [simTables, ruleAdminFilter]);

  const filteredTables = useMemo(() => {
    return simTables
      .filter((t) => ruleAdminFilter === "all" || t.admin_id === ruleAdminFilter)
      .filter((t) => ruleSegmentFilter === "all" || t.segmento === ruleSegmentFilter)
      .sort((a, b) => {
        const an = adminById[a.admin_id || ""] || "";
        const bn = adminById[b.admin_id || ""] || "";
        return (
          an.localeCompare(bn) ||
          (a.segmento || "").localeCompare(b.segmento || "") ||
          a.nome_tabela.localeCompare(b.nome_tabela)
        );
      });
  }, [simTables, ruleAdminFilter, ruleSegmentFilter, adminById]);

  /* Fetch principal */
  async function fetchData() {
    setLoading(true);
    try {
      // commissions
      let qb = supabase.from("commissions").select("*");
      if (status !== "all") qb = qb.eq("status", status);
      // RBAC: não admin só vê as suas
      if (!isAdmin) qb = qb.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);
      else if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
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

      // clientes extras (inclui status de cancelamento da venda)
let vendasExtras: Record<
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

  let nomes: Record<string, string> = {};
  if (cliIds.length) {
    const { data: cli } = await supabase.from("leads").select("id, nome").in("id", cliIds);
    (cli || []).forEach((c: any) => {
      nomes[c.id] = c.nome || "";
    });
  }

  (vendas || []).forEach((v: any) => {
    const cid = v.lead_id || v.cliente_lead_id || undefined;

    // Regra de cancelamento: venda não ativa quando codigo != "00"
    const codigo = v.codigo ?? null;
    const cancelada_em = v.cancelada_em ?? null;
    const venda_cancelada = !!codigo && codigo !== "00";

    vendasExtras[v.id] = {
      clienteId: cid,
      numero_proposta: v.numero_proposta || null,
      cliente_nome: cid ? (nomes[cid] || null) : null,
      codigo,
      cancelada_em,
      venda_cancelada,
    };
  });
}

    const mappedRows =
  (comms || []).map((c: any) => ({
    ...(c as Commission),
    flow: flowBy[c.id] || [],
    cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
    numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,

    // flags da venda
    venda_cancelada: !!vendasExtras[c.venda_id]?.venda_cancelada,
    venda_codigo: vendasExtras[c.venda_id]?.codigo ?? null,
  })) || [];

// 1) Quando a venda estiver cancelada, não mostrar em "comissões a pagar"
const filteredRows =
  status === "a_pagar"
    ? mappedRows.filter((r) => !r.venda_cancelada)
    : mappedRows;

setRows(filteredRows);

      // vendas sem comissão (mesmo filtro RBAC)
      let qbV = supabase
        .from("vendas")
        .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
        .order("data_venda", { ascending: false });
      if (!isAdmin) qbV = qbV.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);
      else if (vendedorId !== "all") qbV = qbV.eq("vendedor_id", vendedorId);
      if (segmento !== "all") qbV = qbV.eq("segmento", segmento);
      if (tabela !== "all") qbV = qbV.eq("tabela", tabela);
      const { data: vendasPeriodo } = await qbV;

      const { data: commVendaIds } = await supabase.from("commissions").select("venda_id");
      const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
      const vendasFiltered = (vendasPeriodo || []).filter((v) => !hasComm.has(v.id));
      setVendasSemCom(vendasFiltered as Venda[]);

      const clientIds = Array.from(new Set((vendasFiltered || []).map((v) => v.lead_id || v.cliente_lead_id).filter((x): x is string => !!x)));
      if (clientIds.length) {
        const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clientIds);
        const map: Record<string, string> = {};
        (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
        setClientesMap(map);
      } else setClientesMap({});

      // reconcile status
      try {
        setRows(prev => {
          const withFix = prev.map(r => {
            const relevant = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
            const allPaid = relevant.length > 0 && relevant.every(f => (Number(f.valor_pago_vendedor) || 0) > 0);
            if (allPaid && r.status !== "pago") {
              const lastDate = r.data_pagamento || (relevant[relevant.length - 1]?.data_pagamento_vendedor ?? null);
              supabase.from("commissions")
                .update({ status: "pago", data_pagamento: lastDate })
                .eq("id", r.id)
                .then(({ error }) => { if (error) console.warn("[reconcile] commissions.update falhou:", error.message); });
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
  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [vendedorId, status, segmento, tabela, isAdmin, authUserId]);

  /* Totais/KPIs */
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);
  const impostoFrac = useMemo(() => (parseFloat(reciboImpostoPct.replace(",", ".")) || 0) / 100, [reciboImpostoPct]);

  function paidInRangeLiquid(s: Date, e: Date) {
    const validRows = rows.filter(r => r.status !== "estorno");
    const valor = sum(
      validRows.flatMap(r =>
        (r.flow || [])
          .filter(f => f.data_pagamento_vendedor && isBetweenISO(f.data_pagamento_vendedor, s, e) && (Number(f.valor_pago_vendedor) > 0))
          .map(f => (f.valor_pago_vendedor ?? 0) * (1 - impostoFrac))
      )
    );
    return valor;
  }
  function previstoInRange(s: Date, e: Date) {
    let total = 0;
    for (const r of rows) {
      const totalComissao = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
      const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        const isPaid = (Number(f.valor_pago_vendedor) || 0) > 0;
        if (isPaid) continue;
        const exp = expectedDateForParcel(r.data_venda, flows, f.mes);
        if (!exp) continue;
        if (exp.getTime() >= s.getTime() && exp.getTime() <= e.getTime()) {
          const expVal = (f.valor_previsto ?? (totalComissao * (f.percentual ?? 0))) ?? 0;
          total += expVal * (1 - impostoFrac);
        }
      }
    }
    return total;
  }

  const kpi = useMemo(() => {
    const comBruta = sum(rows.map((r) => r.valor_total));
    const comLiquida = comBruta * (1 - impostoFrac);
    const pagoLiquido = sum(
      rows
        .filter(r => r.status !== "estorno")
        .flatMap((r) => (r.flow || []).map((f) => (f.valor_pago_vendedor ?? 0) * (1 - impostoFrac)))
    );
    const comPendente = clamp0(comLiquida - pagoLiquido);
    const vendasTotal = sum(rows.map((r) => r.valor_venda ?? r.base_calculo));
    return { vendasTotal, comBruta, comLiquida, comPaga: pagoLiquido, comPendente };
  }, [rows, impostoFrac]);

  // Projeções
  const annual = useMemo(() => projectAnnualFlows(rows), [rows]);
  const monthlyPrev = useMemo(() => projectMonthlyFlows(rows, new Date().getFullYear() - 1, false), [rows]);
  const monthlyCurr = useMemo(() => projectMonthlyFlows(rows, new Date().getFullYear(), true), [rows]);
  const weeklyCurr = useMemo(() => projectWeeklyFlows(rows), [rows]);

  /* Regras — utilitários */
  function onChangeMeses(n: number) {
    setRuleMeses(n);
    const arr = [...ruleFluxoPct];
    if (n > arr.length) { while (arr.length < n) arr.push("0,00"); } else arr.length = n;
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
    if (!ruleVendorId) return alert("Selecione o vendedor.");
    if (!ruleSimTableId) return alert("Selecione a tabela.");

    const pctPadraoPercent = parseFloat((rulePercent || "0").replace(",", "."));
    if (!isFinite(pctPadraoPercent) || pctPadraoPercent <= 0) return alert("Informe o % Padrão corretamente.");

    const somaFluxo = fluxoSoma;
    const soma100 = Math.abs(somaFluxo - 1.0) < 1e-6;
    const somaIgualPadrao = Math.abs(somaFluxo - pctPadraoPercent) < 1e-6;
    if (!(soma100 || somaIgualPadrao)) {
      return alert(
        `Soma do fluxo deve ser 1,00 (100%) ou igual ao % padrão. Soma atual = ${somaFluxo
          .toFixed(2)
          .replace(".", ",")}`
      );
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

    const { error } = await supabase
      .from("commission_rules")
      .upsert(
        {
          vendedor_id: ruleVendorId,
          sim_table_id: ruleSimTableId,
          percent_padrao: percent_padrao_frac,
          fluxo_meses: ruleMeses,
          fluxo_percentuais: fluxo_percentuais_frac,
          obs: ruleObs || null,
        },
        { onConflict: "vendedor_id,sim_table_id" }
      );
    if (error) return alert(error.message);

    await fetchRulesForVendor(ruleVendorId);
    setRuleFormOpen(false);
    alert("Regra salva com sucesso.");
  }

  async function deleteRule(vId: string, simTableId: string) {
    if (!vId || !simTableId) return;
    if (!confirm("Excluir regra desta tabela?")) return;

    const { error } = await supabase
      .from("commission_rules")
      .delete()
      .eq("vendedor_id", vId)
      .eq("sim_table_id", simTableId);
    if (error) return alert(error.message);
    await fetchRulesForVendor(vId);
  }

  function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null }) {
    setRuleVendorId(r.vendedor_id);
    setRuleSimTableId(r.sim_table_id);
    const percentPadrao = (r.percent_padrao ?? 0) * 100;
    const meses = r.fluxo_meses && r.fluxo_meses > 0 ? r.fluxo_meses : 1;
    const fluxos = (r.fluxo_percentuais && r.fluxo_percentuais.length
      ? r.fluxo_percentuais
      : Array.from({ length: meses }, () => 0)
    ).map((p) => (p * percentPadrao).toFixed(2).replace(".", ","));
    setRulePercent(percentPadrao.toFixed(2).replace(".", ","));
    setRuleMeses(meses);
    setRuleFluxoPct(fluxos);
    setRuleObs(r.obs || "");
  }

  function openRuleFormForTable(table: SimTable) {
    if (!ruleVendorId) {
      alert("Selecione um vendedor primeiro.");
      return;
    }
    const existing = ruleRows.find((r) => r.sim_table_id === table.id && r.vendedor_id === ruleVendorId);
    setRuleFormSimTable(table);
    setRuleSimTableId(table.id);
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

  /* Garantir/abrir pagamento (inalterado) */
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
    if (error) console.warn("[ensureFlowForCommission] erro ao inserir fluxo:", error.message);

    const { data: created } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    return (created || []) as CommissionFlow[];
  }

  async function openPaymentFor(c: Commission) {
    setPayCommissionId(c.id);
    let { data } = await supabase.from("commission_flow").select("*").eq("commission_id", c.id).order("mes", { ascending: true });
    if (!data || data.length === 0) {
      const created = await ensureFlowForCommission(c);
      data = created as any;
    }
    const arr = (data || []).map((f: any) => ({ ...f, _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0) }));
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
    let reciboPath: string | null = null, compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

    const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);
    let selected = candidates.filter((f) => paySelected[f.id]);
    if (!selected.length) { alert("Selecione pelo menos uma parcela para pagar."); return; }

    const toUpdate = selected.filter((f) => !!f.id);
    if (toUpdate.length) {
      for (const f of toUpdate) {
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
    }

    const { data: fresh } = await supabase.from("commission_flow").select("*").eq("commission_id", payCommissionId).order("mes", { ascending: true });

    const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
    const isAllPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

    const { error: updErr } = await supabase
      .from("commissions")
      .update({ status: isAllPaid ? "pago" : "a_pagar", data_pagamento: isAllPaid ? (payload.data_pagamento_vendedor || toDateInput(new Date())) : null })
      .eq("id", payCommissionId);
    if (updErr) console.warn("[commissions.update] falhou:", updErr.message);

    const uniq = new Map<number, CommissionFlow>();
    (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
    const freshArr = Array.from(uniq.values()) as CommissionFlow[];
    setPayFlow(freshArr);
    setRows((prev) => prev.map((r) => (r.id === payCommissionId ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" } : r)));

    if (isAllPaid) { setShowPaid(true); setStatus("pago"); }
    setOpenPay(false);
    fetchData();
  }

  /* ====== ESTORNO (GLOBAL) ====== */
  async function searchRefundByProposal() {
    const prop = (bulkRefundProp || "").trim();
    if (!prop) { setBulkRefundFound(null); return; }

    // localizar venda/comissão pela proposta
    const { data: vendas } = await supabase.from("vendas").select("id, numero_proposta, vendedor_id, valor_venda").ilike("numero_proposta", `%${prop}%`);
    if (!vendas?.length) { setBulkRefundFound(null); alert("Proposta não encontrada."); return; }

    const vendaIds = vendas.map(v => v.id);
    let qb = supabase.from("commissions").select("*").in("venda_id", vendaIds);
    if (!isAdmin) qb = qb.eq("vendedor_id", usersByAuth[authUserId || ""]?.id || vendedorId);
    const { data: comms } = await qb;
    const comm = comms?.[0] as Commission | undefined;
    if (!comm) { setBulkRefundFound(null); alert("Nenhuma comissão encontrada para essa proposta."); return; }

    const { data: flows } = await supabase.from("commission_flow").select("*").eq("commission_id", comm.id);
    const paid = (flows || []).filter(f => (f.valor_pago_vendedor ?? 0) > 0).sort((a,b) => (a.data_pagamento_vendedor || "").localeCompare(b.data_pagamento_vendedor || ""));
    if (!paid.length) { setBulkRefundFound(null); alert("Esta proposta não possui parcelas pagas."); return; }

    setBulkRefundFound({ comm, flows: paid });
  }

  async function confirmBulkRefund() {
    if (!bulkRefundFound) return;
    const gross = parseFloat(bulkRefundGross.replace(/\./g, "").replace(",", ".")) || 0;
    if (gross <= 0) { alert("Informe o valor bruto do estorno."); return; }

    setBusyRefund(true);
    try {
      // distribui LIFO (das últimas pagas para as primeiras)
      let remaining = gross;
      const ordered = [...bulkRefundFound.flows].sort((a,b) => (b.data_pagamento_vendedor || "").localeCompare(a.data_pagamento_vendedor || ""));
      for (const f of ordered) {
        const current = Math.max(0, f.valor_pago_vendedor ?? 0);
        if (remaining <= 0) break;
        const take = Math.min(current, remaining);
        const newPaid = current - take;
        const updates: Partial<CommissionFlow> = {
          valor_pago_vendedor: newPaid,
          // mantém a data original da parcela paga (para não bagunçar históricos)
        };
        const { error } = await supabase.from("commission_flow").update(updates as any).eq("id", f.id);
        if (error) throw new Error(error.message);
        remaining -= take;

        // tenta registrar evento (tabela opcional)
        try {
          const net = take * (1 - impostoFrac);
          await supabase.from("commission_refunds").insert({
            commission_id: f.commission_id,
            flow_id: f.id,
            numero_proposta: bulkRefundFound.comm.numero_proposta || null,
            data_estorno: bulkRefundDate,
            valor_bruto: take,
            valor_liquido: net,
          } as any);
        } catch (e) {
          // tabela pode não existir; seguimos sem travar o fluxo
          console.warn("[commission_refunds] tabela ausente/erro ao registrar:", (e as any)?.message);
        }
      }

      // marca comissão como estorno (rótulo)
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

  /* ====== Gerar / Retornar / Recibo ====== */
  async function gerarComissaoDeVenda(venda: Venda) {
    try {
      setGenBusy(venda.id);
      const vendedorIdCanon = canonUserId(venda.vendedor_id);
      if (!vendedorIdCanon) { alert("Vínculo do vendedor não encontrado em 'users'."); return; }

      let simTableId: string | null = null;
      const vendaTabNorm = normalize(venda.tabela), vendaSegNorm = normalize(venda.segmento);
      const local =
        simTables.find((s) => normalize(s.nome_tabela) === vendaTabNorm && (!venda.segmento || normalize(s.segmento) === vendaSegNorm)) ||
        simTables.find((s) => normalize(s.nome_tabela) === vendaTabNorm) || null;
      simTableId = local?.id || null;
      if (!simTableId && venda.tabela) {
        let qb2 = supabase.from("sim_tables").select("id, segmento, nome_tabela, admin_id").ilike("nome_tabela", `%${venda.tabela}%`).limit(1);
        if (venda.segmento) qb2 = qb2.eq("segmento", venda.segmento);
        const { data: st2 } = await qb2; simTableId = st2?.[0]?.id ?? null;
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
        venda_id: venda.id, vendedor_id: vendedorIdCanon, sim_table_id: simTableId,
        data_venda: venda.data_venda, segmento: venda.segmento, tabela: venda.tabela, administradora: venda.administradora,
        valor_venda: base, base_calculo: base, percent_aplicado, valor_total, status: "a_pagar" as const,
      };

      const { data: inserted, error } = await supabase
        .from("commissions")
        .insert(insert as any)
        .select("id, venda_id, vendedor_id, sim_table_id, valor_total, base_calculo, percent_aplicado")
        .limit(1);

      if (error) {
        if (String(error.message || "").includes("row-level security"))
          alert("RLS bloqueou o INSERT. Ajuste policies.");
        else if (String(error.code) === "23503")
          alert("Não foi possível criar: verifique vendedor e/ou a SimTable.");
        else alert("Erro ao criar a comissão: " + error.message);
        return;
      }

      const createdComm = inserted?.[0] as Commission | undefined;
      if (createdComm) await ensureFlowForCommission(createdComm);

      await fetchData();
    } finally { setGenBusy(null); }
  }

  async function retornarComissao(c: Commission) {
    if (!confirm("Confirmar retorno desta comissão para 'Vendas sem comissão'?")) return;
    try {
      const delFlow = await supabase.from("commission_flow").delete().eq("commission_id", c.id).select("id");
      if (delFlow.error) throw delFlow.error;
      const { data: stillFlows } = await supabase.from("commission_flow").select("id").eq("commission_id", c.id);
      if (stillFlows && stillFlows.length > 0) { alert("Não foi possível remover as parcelas (RLS)."); return; }
      const delComm = await supabase.from("commissions").delete().eq("id", c.id).select("id");
      if (delComm.error) throw delComm.error;
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      await fetchData();
    } catch (err: any) {
      if (String(err?.message || "").includes("row-level security")) alert("RLS bloqueou a exclusão.");
      else alert("Falha ao retornar: " + (err?.message || err));
    }
  }

  // Recibo por data (filtra pelo vendedor selecionado)
  async function downloadReceiptPDFPorData() {
    const impostoPct = parseFloat(reciboImpostoPct.replace(",", ".")) / 100 || 0;
    const dataRecibo = reciboDate;

    // vincula ao vendedor selecionado (se "all", inclui todos se admin; se não admin, apenas o próprio)
    const vendedorSel = reciboVendor !== "all" ? reciboVendor : (isAdmin ? null : (usersByAuth[authUserId || ""]?.id || null));

    const { data: flowsAllOnDate, error: flowsErr } = await supabase
      .from("commission_flow")
      .select("*, commission_id")
      .eq("data_pagamento_vendedor", dataRecibo);
    if (flowsErr) { alert("Erro ao buscar parcelas: " + flowsErr.message); return; }
    if (!flowsAllOnDate || !flowsAllOnDate.length) {
      // pode ser que só tenha estorno nessa data
      try {
        const { data: onlyRefunds } = await supabase.from("commission_refunds").select("id").eq("data_estorno", dataRecibo).limit(1);
        if (!onlyRefunds?.length) { alert("Não há parcelas/estornos na data selecionada."); return; }
      } catch {}
    }

    const commIdsAll = Array.from(new Set((flowsAllOnDate || []).map((f: any) => f.commission_id)));
    const { data: commsAll } = await supabase.from("commissions").select("*").in("id", commIdsAll.length ? commIdsAll : ["00000000-0000-0000-0000-000000000000"]);
    const chosenFlows = vendedorSel
      ? (flowsAllOnDate || []).filter((f: any) => (commsAll || []).find((c: any) => c.id === f.commission_id)?.vendedor_id === vendedorSel)
      : (flowsAllOnDate || []);

    const byCommission: Record<string, CommissionFlow[]> = {};
    chosenFlows.forEach((f: any) => {
      if (!byCommission[f.commission_id]) byCommission[f.commission_id] = [];
      if (!byCommission[f.commission_id].some((x) => x.mes === f.mes)) byCommission[f.commission_id].push(f);
    });
    const commIds = Object.keys(byCommission);
    const { data: comms } = await supabase.from("commissions").select("*").in("id", commIds.length ? commIds : ["00000000-0000-0000-0000-000000000000"]);

    const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id)));
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, valor_venda, numero_proposta, cliente_lead_id, lead_id, vendedor_id")
      .in("id", vendaIds.length ? vendaIds : ["00000000-0000-0000-0000-000000000000"]);

    const clienteIds = Array.from(new Set((vendas || []).map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
    const nomesCli: Record<string, string> = {};
    if (clienteIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
      (cli || []).forEach((c: any) => { nomesCli[c.id] = c.nome || ""; });
    }

    const year = new Date(dataRecibo).getFullYear();
    const { data: seqData, error: seqErr } = await supabase.rpc("next_receipt_seq", { p_year: year });
    if (seqErr) { alert("Erro ao gerar número do recibo: " + seqErr.message); return; }
    const seq = Number(seqData) || 1;
    const numeroRecibo = `${String(seq).padStart(3, "0")}/${year}`;

    const vendedorUsado = vendedorSel ?? (comms || [])[0]?.vendedor_id ?? (usersByAuth[authUserId || ""]?.id || null);
    const vendInfo = vendedorUsado ? secureById[vendedorUsado] : null;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("RECIBO DE COMISSÃO", 297, 40, { align: "center" });
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
      `CPF/CNPJ: ${vendInfo?.cpf || "—"}`,
      `Endereço: ${[vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`].filter(Boolean).join(", ") || "—"}`,
    ];
    y += 10; recebedor.forEach((l) => { doc.text(l, 40, y); y += 14; });
    y += 6; doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, y); y += 16;

    const head = [["CLIENTE","PROPOSTA","PARCELA","R$ VENDA","COM. BRUTA","IMPOSTOS","COM. LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    const commsFiltradas = (comms || []).filter((c: any) => !vendedorSel || c.vendedor_id === vendedorSel);
    commsFiltradas.sort((a: any, b: any) => (a.venda_id > b.venda_id ? 1 : -1));

    commsFiltradas.forEach((c: any) => {
      const v = (vendas || []).find((x) => x.id === c.venda_id);
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

        body.push([
          clienteNome,
          v?.numero_proposta || "—",
          `M${p.mes}`,
          BRL(vendaValor),
          BRL(comBruta),
          BRL(impostos),
          BRL(liquida),
        ]);
      });
    });

    // Linhas de ESTORNO (negativas)
    try {
      const vendFilter = vendedorSel ? { column: "vendedor_id", value: vendedorSel } : null;
      const { data: refunds } = await supabase
        .from("commission_refunds")
        .select("id, commission_id, flow_id, numero_proposta, data_estorno, valor_bruto, valor_liquido");
      const refundsOnDate = (refunds || []).filter(r => r.data_estorno === dataRecibo && (!vendFilter || (rows.find(x => x.id === r.commission_id)?.vendedor_id === vendFilter.value)));
      for (const rf of refundsOnDate) {
        body.push([
          "—",
          rf.numero_proposta || "—",
          "ESTORNO",
          "—",
          BRL(-(rf.valor_bruto || 0)),
          BRL( (rf.valor_bruto || 0) * impostoPct ),
          BRL(-(rf.valor_liquido || 0)),
        ]);
        totalLiquido -= (rf.valor_liquido || 0);
      }
    } catch (e) {
      // tabela opcional, segue sem quebrar
    }

    autoTable(doc, { startY: y, head, body, styles: { font: "helvetica", fontSize: 10 }, headStyles: { fillColor: [30, 41, 63] } });
    const endY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`, 40, endY);
    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
    doc.text(`Chave PIX do pagamento: ${secureById[vendedorUsado || ""]?.pix_key || "—"}`, 40, endY + 34);
    const signY = endY + 100;
    doc.line(40, signY, 320, signY);
    doc.text(`${userLabel(vendedorUsado || "")}`, 40, signY + 14);
    doc.text(`${secureById[vendedorUsado || ""]?.cpf || "—"}`, 40, signY + 28);

    doc.save(`recibo_${dataRecibo}_${userLabel(vendedorUsado || "")}.pdf`);
  }

  /* Listas auxiliares */
  const rowsAPagarBase = useMemo(() => rows.filter((r) => r.status === "a_pagar"), [rows]);
  const rowsAPagar = useMemo(() => {
    const q = normalize(unpaidPropSearch);
    if (!q) return rowsAPagarBase;
    return rowsAPagarBase.filter((r) => normalize(r.numero_proposta || "").includes(q));
  }, [rowsAPagarBase, unpaidPropSearch]);

  const pagosFlat = useMemo(() => {
    const list: Array<{ flow: CommissionFlow; comm: Commission }> = [];
    rows
      .filter(r => r.status !== "estorno")
      .forEach((r) => (r.flow || []).forEach((f) => { if ((f.valor_pago_vendedor ?? 0) > 0) list.push({ flow: f, comm: r }); }));
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

  /* ========================= Render ========================= */
  return (
    <div className="relative p-4 space-y-8 isolate">
      {/* Liquid background */}
      <div className="liquid-bg">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="gold" />
      </div>

      <div className="relative z-[1] space-y-8">
        {/* Filtros topo */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <FilterIcon className="w-5 h-5" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId} disabled={!isAdmin}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">Todos</SelectItem>}
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="md:col-span-6 flex flex-wrap gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setOpenRules(true)}>
                <Settings className="w-4 h-4 mr-1" /> Regras de Comissão
              </Button>
              <Button onClick={fetchData}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-1" />
                )}
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== Dashboards ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Nos últimos 5 anos — {userLabel(vendedorId === "all" ? null : vendedorId)}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Donut paid={paidInRangeLiquid(new Date(now.getFullYear()-5, now.getMonth(), 1), now)} pending={0} label="5 anos" hoverPaidText={`Pago no período: ${BRL(paidInRangeLiquid(new Date(now.getFullYear()-5, now.getMonth(), 1), now))}`} hoverPendText="—" pendingLegend="—" />
              <LineChart labels={annual.labels} series={[{ name: "Previsto", data: annual.previstoBruto.map(() => 0) }, { name: "Pago", data: annual.pagoBruto }]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle>Ano anterior — {new Date().getFullYear() - 1}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Donut paid={paidInRangeLiquid(new Date(now.getFullYear()-1,0,1), new Date(now.getFullYear()-1,11,31))} pending={0} label="Ano anterior" hoverPaidText={`Pago no ano anterior: ${BRL(paidInRangeLiquid(new Date(now.getFullYear()-1,0,1), new Date(now.getFullYear()-1,11,31)))}`} hoverPendText="—" pendingLegend="—" />
              <LineChart labels={projectMonthlyFlows(rows, new Date().getFullYear()-1, false).labels} series={[{ name: "Previsto", data: projectMonthlyFlows(rows, new Date().getFullYear()-1, false).previstoBruto }, { name: "Pago", data: projectMonthlyFlows(rows, new Date().getFullYear()-1, false).pagoBruto }]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle>Ano atual — {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Donut paid={paidInRangeLiquid(new Date(now.getFullYear(),0,1), now)} pending={previstoInRange(new Date(now.getFullYear(),0,1), new Date(now.getFullYear(),11,31))} label="Ano" hoverPaidText={`Pago no ano: ${BRL(paidInRangeLiquid(new Date(now.getFullYear(),0,1), now))}`} hoverPendText={`Previsto no ano: ${BRL(previstoInRange(new Date(now.getFullYear(),0,1), new Date(now.getFullYear(),11,31)))}`} />
              <LineChart labels={monthlyCurr.labels} series={[{ name: "Previsto", data: monthlyCurr.previstoBruto }, { name: "Pago", data: monthlyCurr.pagoBruto }]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle>Mês atual (semanas sex→qui)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Donut paid={paidInRangeLiquid(mStart, now)} pending={previstoInRange(mStart, endOfMonth(now))} label="Mês" hoverPaidText={`Pago no mês: ${BRL(paidInRangeLiquid(mStart, now))}`} hoverPendText={`Previsto no mês: ${BRL(previstoInRange(mStart, endOfMonth(now)))}`} />
              <LineChart labels={weeklyCurr.labels} series={[{ name: "Previsto", data: weeklyCurr.previstoBruto }, { name: "Pago", data: weeklyCurr.pagoBruto }]} />
            </CardContent>
          </Card>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card><CardHeader className="pb-3"><CardTitle>🔥 Vendas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle>📤 Comissão Paga (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle>⏳ Pendente (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent></Card>
        </div>

        {/* Vendas sem comissão */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span>Vendas sem comissão (todos os registros + filtros)</span>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => setShowVendasSem((v) => !v)}>{showVendasSem ? "Ocultar" : "Expandir"}</Button>
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
                  {vendasSemCom.length === 0 && (
                    <tr><td colSpan={9} className="p-4 text-gray-500">Sem pendências 🎉</td></tr>
                  )}
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
                          <Button size="sm" onClick={() => gerarComissaoDeVenda(v)} disabled={genBusy === v.id}>
                            {genBusy === v.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />} Gerar Comissão
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

        {/* Detalhamento — a pagar */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <span className="text-base font-semibold">Detalhamento de Comissões (a pagar)</span>

              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-6">
                <div className="flex flex-col gap-2">
                  <Label>Vendedor</Label>
                  <Select value={vendedorId} onValueChange={setVendedorId} disabled={!isAdmin}>
                    <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      {isAdmin && <SelectItem value="all">Todos</SelectItem>}
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                  <div className="flex flex-col gap-2">
                    <Label>Data do Recibo</Label>
                    <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Imposto (%)</Label>
                    <Input value={reciboImpostoPct} onChange={(e) => setReciboImpostoPct(e.target.value)} className="w-24" />
                  </div>
                  <div className="flex items-end gap-3">
                    <Button onClick={downloadReceiptPDFPorData}><FileText className="w-4 h-4 mr-1" /> Recibo</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowUnpaid((v) => !v)}>{showUnpaid ? "Ocultar" : "Expandir"}</Button>
                  </div>
                </div>
              </div>
            </CardTitle>
          </CardHeader>

          {showUnpaid && (
            <CardContent className="overflow-x-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-3">
                <Input
                  placeholder="Buscar pelo nº da proposta"
                  value={unpaidPropSearch}
                  onChange={(e) => { setUnpaidPropSearch(e.target.value); }}
                  className="w-[280px]"
                />
              </div>

              <table className="min-w-[1200px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Nº Proposta</th>
                    <th className="p-2 text-left">Segmento</th>
                    <th className="p-2 text-left">Tabela</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-right">% Comissão</th>
                    <th className="p-2 text-right">Valor Comissão</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Pagamento</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={12} className="p-6"><Loader2 className="animate-spin inline mr-2" /> Carregando...</td></tr>
                  )}
                  {!loading && rowsAPagar.length === 0 && (
                    <tr><td colSpan={12} className="p-6 text-gray-500">Sem registros.</td></tr>
                  )}
                  {!loading && rowsAPagar.map((r) => {
                    const isConfirm = hasRegisteredButUnpaid(r.flow);
                    // força as cores independente do tema
                    const chipClasses =
                      isConfirm
                        ? "!bg-[#1E293F] !text-white hover:!bg-[#1E293F]/90 focus-visible:!ring-[#1E293F]"
                        : "!bg-[#A11C27] !text-white hover:!bg-[#A11C27]/90 focus-visible:!ring-[#A11C27]";
                    return (
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
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              size="sm"
                              variant="default"
                              className={chipClasses}
                              onClick={() => openPaymentFor(r)}
                              title={isConfirm ? "Existe pagamento registrado sem valor — confirmar" : "Registrar pagamento"}
                            >
                              <DollarSign className="w-4 h-4 mr-1" />
                              {isConfirm ? "Confirmar Pagamento" : "Registrar pagamento"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => retornarComissao(r)}>
                              <RotateCcw className="w-4 h-4 mr-1" /> Retornar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>

        {/* Comissões pagas */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <span className="text-base font-semibold">Comissões pagas</span>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-4">
                <Input
                  placeholder="Buscar por cliente ou nº proposta"
                  value={paidSearch}
                  onChange={(e) => { setPaidSearch(e.target.value); setPaidPage(1); }}
                  className="w-[280px]"
                />
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={() => setShowPaid((v) => !v)}>
                    {showPaid ? "Ocultar" : "Expandir"}
                  </Button>
                  <Button size="sm" onClick={() => setOpenBulkRefund(true)} className="!bg-[#A11C27] !text-white hover:!bg-[#A11C27]/90">
                    Estorno
                  </Button>
                </div>
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
                  </tr>
                </thead>
                <tbody>
                  {pagosPage.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-gray-500">Nenhum pagamento encontrado.</td></tr>
                  )}
                  {pagosPage.map(({ flow, comm }) => (
                    <tr key={flow.id} className="border-b">
                      <td className="p-2">{flow.data_pagamento_vendedor ? formatISODateBR(flow.data_pagamento_vendedor) : "—"}</td>
                      <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                      <td className="p-2">{comm.cliente_nome || "—"}</td>
                      <td className="p-2">{comm.numero_proposta || "—"}</td>
                      <td className="p-2">M{flow.mes}</td>
                      <td className="p-2 text-right">{BRL(flow.valor_pago_vendedor)}</td>
                      <td className="p-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                          {flow.recibo_vendedor_url && (
                            <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.recibo_vendedor_url); if (u) window.open(u, "_blank"); }}>
                              Recibo
                            </a>
                          )}
                          {flow.comprovante_pagto_url && (
                            <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.comprovante_pagto_url); if (u) window.open(u, "_blank"); }}>
                              Comprovante
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 pt-6">
                <div className="text-sm text-gray-600">
                  Mostrando {pagosPage.length ? pageStart + 1 : 0}–{Math.min(pageStart + pageSize, pagosFiltered.length)} de {pagosFiltered.length}
                </div>
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.max(1, p - 1))} disabled={paidPage <= 1}>Anterior</Button>
                  <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.min(totalPages, p + 1))} disabled={paidPage >= totalPages}>Próxima</Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Regras (overlay principal) */}
        <Dialog open={openRules} onOpenChange={setOpenRules}>
          <DialogContent className="max-w-6xl">
            <DialogHeader><DialogTitle>Regras de Comissão</DialogTitle></DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2">
                  <Label>Vendedor</Label>
                  <Select value={ruleVendorId} onValueChange={(v) => setRuleVendorId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Administradora</Label>
                  <Select value={ruleAdminFilter} onValueChange={setRuleAdminFilter}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {adminOptions.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Segmento</Label>
                  <Select value={ruleSegmentFilter} onValueChange={setRuleSegmentFilter}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {ruleSegmentOptions.map((seg) => (
                        <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border rounded-md max-h-[45vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Administradora</th>
                      <th className="p-2 text-left">Segmento</th>
                      <th className="p-2 text-left">Tabela</th>
                      <th className="p-2 text-right">% Padrão</th>
                      <th className="p-2 text-left">Fluxo</th>
                      <th className="p-2 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTables.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-gray-500">
                          Nenhuma tabela encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                    {filteredTables.map((t) => {
                      const rule = ruleRows.find((r) => r.sim_table_id === t.id && r.vendedor_id === ruleVendorId);
                      return (
                        <tr key={t.id} className="border-t">
                          <td className="p-2">{adminById[t.admin_id || ""] || "—"}</td>
                          <td className="p-2">{t.segmento || "—"}</td>
                          <td className="p-2">{t.nome_tabela}</td>
                          <td className="p-2 text-right">{rule ? pct100(rule.percent_padrao) : "—"}</td>
                          <td className="p-2">
                            {rule ? `${rule.fluxo_meses} pgtos` : "—"}
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openRuleFormForTable(t)}
                              >
                                <Pencil className="w-4 h-4 mr-1" /> {rule ? "Editar" : "Cadastrar"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!rule}
                                onClick={() => rule && deleteRule(rule.vendedor_id, rule.sim_table_id)}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" /> Limpar
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={!rule}
                                onClick={() => rule && setViewRule(rule)}
                                title="Visualizar regra"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button variant="secondary" onClick={() => setOpenRules(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Editor de regra (overlay secundário) */}
        <Dialog
          open={ruleFormOpen}
          onOpenChange={(open) => {
            setRuleFormOpen(open);
            if (!open) setRuleFormSimTable(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {ruleFormSimTable
                  ? `Regra de comissão — ${(ruleFormSimTable.admin_id && adminById[ruleFormSimTable.admin_id]) || ""} / ${
                      ruleFormSimTable.segmento
                    } / ${ruleFormSimTable.nome_tabela}`
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
                  <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Nº de meses do fluxo</Label>
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={ruleMeses}
                    onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))}
                  />
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
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-600">
                  Soma do fluxo:{" "}
                  <b>
                    {fluxoSoma.toFixed(2)} (aceitas: 1,00 ou % padrão {rulePercent || "0,00"})
                  </b>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
                <div className="lg:col-span-2 flex flex-col gap-2">
                  <Label>Observações</Label>
                  <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button onClick={saveRule}>
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
                  >
                    Limpar
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button variant="secondary" onClick={() => setRuleFormOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Visualização da regra (ícone olho) */}
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
                      <div
                        key={idx}
                        className="border rounded px-2 py-1 flex items-center justify-between"
                      >
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

        {/* Pagamento (overlay) */}
        <Dialog open={openPay} onOpenChange={setOpenPay}>
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
                          valor_pago_vendedor: payValue ? parseFloat(payValue.replace(/\./g, "").replace(",", ".")) : undefined,
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
                          payFlow
                            .filter((f) => !f.data_pagamento_vendedor && (f.valor_pago_vendedor ?? 0) === 0)
                            .map((f) => [f.id, true])
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
                              <Checkbox checked={!!paySelected[f.id]} onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))} disabled={isLocked} />
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
            <DialogFooter className="pt-6"><Button onClick={() => setOpenPay(false)} variant="secondary">Fechar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Overlay de ESTORNO (global) */}
        <Dialog open={openBulkRefund} onOpenChange={setOpenBulkRefund}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Estorno de comissão (por nº de proposta)</DialogTitle></DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>Nº da proposta</Label>
                <div className="flex gap-2">
                  <Input value={bulkRefundProp} onChange={(e) => setBulkRefundProp(e.target.value)} placeholder="Ex.: 1234" />
                  <Button variant="secondary" onClick={searchRefundByProposal}>Buscar</Button>
                </div>
              </div>
              <div>
                <Label>Data do estorno</Label>
                <Input type="date" value={bulkRefundDate} onChange={(e) => setBulkRefundDate(e.target.value)} />
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
                      {bulkRefundFound.flows.map(f => (
                        <tr key={f.id} className="border-b">
                          <td className="p-2">M{f.mes}</td>
                          <td className="p-2">{formatISODateBR(f.data_pagamento_vendedor)}</td>
                          <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="p-2 font-medium" colSpan={2}>Total pago</td>
                        <td className="p-2 text-right font-bold">
                          {BRL(sum(bulkRefundFound.flows.map(f => f.valor_pago_vendedor || 0)))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="md:col-span-2">
                    <Label>Valor bruto do estorno</Label>
                    <Input value={bulkRefundGross} onChange={(e) => setBulkRefundGross(e.target.value)} placeholder="Ex.: 5.000,00" />
                  </div>
                  <div className="flex flex-col">
                    <Label>Valor líquido (auto)</Label>
                    <div className="p-2 border rounded-md bg-gray-50">
                      {(() => {
                        const g = parseFloat(bulkRefundGross.replace(/\./g, "").replace(",", ".")) || 0;
                        const n = g * (1 - impostoFrac);
                        return BRL(n);
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="secondary" onClick={() => setOpenBulkRefund(false)}>Fechar</Button>
              <Button disabled={!bulkRefundFound || busyRefund} onClick={confirmBulkRefund}>
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
          <Label>Recibo assinado (PDF)</Label>
          <Input type="file" accept="application/pdf" onChange={(e) => setFileRecibo(e.target.files?.[0] || null)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Comprovante de pagamento (PDF/Imagem)</Label>
          <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFileComp(e.target.files?.[0] || null)} />
        </div>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed">
        Arquivos vão para o bucket <code>comissoes</code>. Digite o valor <b>BRUTO</b>. Se nenhuma parcela estiver marcada, a confirmação faz uma seleção segura automática.
      </div>
    </div>
  );
}
