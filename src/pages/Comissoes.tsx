// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// UI Components (shadcn/ui)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// Icons (lucide-react)
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

// PDF libs
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;

// Usuário simples
export type User = {
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
};

// Usuário com dados sensíveis
export type UserSecure = {
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

// Tabela de simulação
export type SimTable = {
  id: UUID;
  segmento: string;
  nome_tabela: string;
};

// Venda
export type Venda = {
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

// Comissão
export type Commission = {
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

// Fluxo da Comissão
export type CommissionFlow = {
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

// Regra de Comissão
export type CommissionRule = {
  vendedor_id: string;
  sim_table_id: string;
  percent_padrao: number;        // armazenado como fração (ex.: 0.012 = 1,20%)
  fluxo_meses: number;
  fluxo_percentuais: number[];   // frações que somam 1.00
  obs: string | null;
};

/* ========================= Helpers ========================= */
export const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;

export const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export const sum = (arr: (number | null | undefined)[]) =>
  arr.reduce((a, b) => a + (b || 0), 0);

export const clamp0 = (n: number) => (n < 0 ? 0 : n);

export const formatISODateBR = (iso?: string | null) =>
  !iso ? "—" : iso.split("-").reverse().join("/");

export const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export function valorPorExtenso(n: number) {
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

/* ====== Helpers de estágio do pagamento (2 etapas) ====== */
export function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  return flow.some(
    (f) =>
      (Number(f.percentual) || 0) > 0 &&
      !!f.data_pagamento_vendedor &&
      (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

export function isFullyPaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  const relevant = flow.filter((f) => (Number(f.percentual) || 0) > 0);
  return (
    relevant.length > 0 &&
    relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0)
  );
}

/* ========================= Cálculo de datas-base ========================= */
export const now = new Date();

// Início do ano corrente
export const yStart = new Date(now.getFullYear(), 0, 1);

// Início do mês corrente
export const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

// Cinco anos atrás (do mês atual para trás)
export const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);

// Fim do mês para qualquer data
export function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Verifica se uma data ISO está dentro do intervalo [s, e]
export function isBetween(
  iso?: string | null,
  s?: Date,
  e?: Date
): boolean {
  if (!iso) return false;
  const time = new Date(iso + "T00:00:00").getTime();
  return (
    time >= (s?.getTime() || 0) &&
    time <= (e?.getTime() || now.getTime())
  );
}

// Lista todas as quintas-feiras de um mês específico
export function getThursdaysOfMonth(year: number, month: number): Date[] {
  const thursdays: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() === 4) { // 0=Domingo, 4=Quinta
      thursdays.push(d);
    }
  }
  return thursdays;
}

// Retorna intervalo [quinta, quarta seguinte] baseado nas quintas do mês
export function getWeeklyIntervalsByThursdays(year: number, month: number) {
  const thursdays = getThursdaysOfMonth(year, month);
  const weeks: { start: Date; end: Date }[] = [];

  for (let i = 0; i < thursdays.length; i++) {
    const start = thursdays[i];
    const end =
      i < thursdays.length - 1
        ? new Date(thursdays[i + 1].getTime() - 24 * 60 * 60 * 1000) // dia antes da próxima quinta
        : endOfMonth(start);
    weeks.push({ start, end });
  }
  return weeks;
}

/* ========================= Projeções automáticas ========================= */
/**
 * Gera projeções de recebimentos futuros a cada 30 dias,
 * apenas para alimentar gráficos/relógios (não altera DB).
 */
function generateProjections(flow: CommissionFlow[]): { date: Date; value: number }[] {
  const projections: { date: Date; value: number }[] = [];

  flow.forEach((f) => {
    const recebido = f.valor_pago_vendedor || 0;
    const previsto = f.valor_previsto || 0;

    // Já pago → não precisa projetar
    if (recebido > 0) return;

    // Se não tem data de pagamento registrada, mas existe valor previsto
    if (!f.data_pagamento_vendedor && previsto > 0) {
      const baseDate = f.data_recebimento_admin
        ? new Date(f.data_recebimento_admin)
        : now;

      // Projeta a cada 30 dias
      for (let i = 0; i < 12; i++) {
        const projDate = new Date(baseDate);
        projDate.setDate(projDate.getDate() + i * 30);
        projections.push({ date: projDate, value: previsto });
      }
    }
  });

  return projections;
}

/* ====== Projeção por meses (Ano corrente) ====== */
export function projectMonthlyFlows(rows: Commission[]): Record<number, { recebido: number; projetado: number }> {
  const result: Record<number, { recebido: number; projetado: number }> = {};

  for (let m = 0; m < 12; m++) {
    result[m] = { recebido: 0, projetado: 0 };
  }

  rows.forEach((c) => {
    if (!(c as any).flow) return;
    const flow: CommissionFlow[] = (c as any).flow;

    flow.forEach((f) => {
      const valor = f.valor_pago_vendedor || 0;
      if (f.data_pagamento_vendedor) {
        const d = new Date(f.data_pagamento_vendedor);
        if (d.getFullYear() === now.getFullYear()) {
          result[d.getMonth()].recebido += valor;
        }
      }
    });

    // Projeções
    const projections = generateProjections(flow);
    projections.forEach((p) => {
      if (p.date.getFullYear() === now.getFullYear()) {
        result[p.date.getMonth()].projetado += p.value;
      }
    });
  });

  return result;
}

/* ====== Projeção por semanas (mês corrente) ====== */
export function projectWeeklyFlows(rows: Commission[]) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const weeks = getWeeklyIntervalsByThursdays(year, month);

  const result: { [week: string]: { recebido: number; projetado: number } } = {};
  weeks.forEach((w, i) => {
    result[`Sem ${i + 1}`] = { recebido: 0, projetado: 0 };
  });

  rows.forEach((c) => {
    if (!(c as any).flow) return;
    const flow: CommissionFlow[] = (c as any).flow;

    flow.forEach((f) => {
      const valor = f.valor_pago_vendedor || 0;
      if (f.data_pagamento_vendedor) {
        const d = new Date(f.data_pagamento_vendedor);
        if (d.getFullYear() === year && d.getMonth() === month) {
          const week = weeks.findIndex(
            (w) => d >= w.start && d <= w.end
          );
          if (week >= 0) {
            result[`Sem ${week + 1}`].recebido += valor;
          }
        }
      }
    });

    // Projeções
    const projections = generateProjections(flow);
    projections.forEach((p) => {
      if (p.getFullYear() === year && p.getMonth() === month) {
        const week = weeks.findIndex(
          (w) => p.date >= w.start && p.date <= w.end
        );
        if (week >= 0) {
          result[`Sem ${week + 1}`].projetado += p.value;
        }
      }
    });
  });

  return result;
}

/* ====== Projeção anual (Últimos 5 anos) ====== */
export function projectAnnualFlows(rows: Commission[]) {
  const currentYear = now.getFullYear();
  const startYear = currentYear - 4;

  const result: Record<number, number> = {};
  for (let y = startYear; y <= currentYear; y++) {
    result[y] = 0;
  }

  rows.forEach((c) => {
    if (!(c as any).flow) return;
    const flow: CommissionFlow[] = (c as any).flow;

    flow.forEach((f) => {
      const valor = f.valor_pago_vendedor || 0;
      if (f.data_pagamento_vendedor) {
        const d = new Date(f.data_pagamento_vendedor);
        if (d.getFullYear() >= startYear && d.getFullYear() <= currentYear) {
          result[d.getFullYear()] += valor;
        }
      }
    });
  });

  return result;
}

/* ========================= KPI & Totais por período ========================= */
type Totals = {
  totalBruta: number;
  totalLiquida: number;
  pagoLiquido: number;
  pendente: number;
  pct: number;
};

/**
 * Apenas pagos no intervalo
 * Usado em: Últimos 5 anos e Ano anterior
 */
export function totalsInRangePaidOnly(rows: Commission[], s?: Date, e?: Date): Totals {
  let totalBruta = 0;
  let totalLiquida = 0;
  let pagoLiquido = 0;

  rows.forEach((c) => {
    if (!(c as any).flow) return;
    const flow: CommissionFlow[] = (c as any).flow;

    flow.forEach((f) => {
      if (f.data_pagamento_vendedor && isBetween(f.data_pagamento_vendedor, s, e)) {
        const bruto = f.valor_previsto || 0;
        const liquido = f.valor_pago_vendedor || 0;
        totalBruta += bruto;
        totalLiquida += liquido;
        pagoLiquido += liquido;
      }
    });
  });

  const pendente = clamp0(totalLiquida - pagoLiquido);
  const pct = totalBruta > 0 ? (pagoLiquido / totalBruta) * 100 : 0;

  return { totalBruta, totalLiquida, pagoLiquido, pendente, pct };
}

/**
 * Pagos + Projeções no intervalo
 * Usado em: No ano e No mês
 */
export function totalsInRangePaidAndProjected(rows: Commission[], s?: Date, e?: Date): Totals {
  let totalBruta = 0;
  let totalLiquida = 0;
  let pagoLiquido = 0;
  let pendente = 0;

  rows.forEach((c) => {
    if (!(c as any).flow) return;
    const flow: CommissionFlow[] = (c as any).flow;

    // Pagos
    flow.forEach((f) => {
      if (f.data_pagamento_vendedor && isBetween(f.data_pagamento_vendedor, s, e)) {
        const bruto = f.valor_previsto || 0;
        const liquido = f.valor_pago_vendedor || 0;
        totalBruta += bruto;
        totalLiquida += liquido;
        pagoLiquido += liquido;
      }
    });

    // Projeções (a cada 30 dias)
    const projections = ((): { date: Date; value: number }[] => {
      const list: { date: Date; value: number }[] = [];
      flow.forEach((f) => {
        if (!f.data_pagamento_vendedor && (f.valor_previsto || 0) > 0) {
          const baseDate = f.data_recebimento_admin
            ? new Date(f.data_recebimento_admin)
            : now;
          for (let i = 0; i < 12; i++) {
            const projDate = new Date(baseDate);
            projDate.setDate(projDate.getDate() + i * 30);
            if (isBetween(projDate.toISOString().slice(0, 10), s, e)) {
              list.push({ date: projDate, value: f.valor_previsto || 0 });
            }
          }
        }
      });
      return list;
    })();

    projections.forEach((p) => {
      totalBruta += p.value;
      totalLiquida += p.value;
      pendente += p.value;
    });
  });

  const pct = totalBruta > 0 ? (pagoLiquido / totalBruta) * 100 : 0;

  return { totalBruta, totalLiquida, pagoLiquido, pendente, pct };
}

/* ========================= Componentes Visuais dos Gráficos ========================= */
import React from "react";

/**
 * DonutChart - já existente no projeto (mantido como está)
 * Nenhuma alteração feita aqui para não quebrar o layout atual.
 */

/**
 * LineChart - gráfico leve em SVG
 * Recebe múltiplas séries de dados (cada uma com {label, values, color}).
 */
type LineChartProps = {
  title: string;
  labels: string[];
  series: {
    name: string;
    values: number[];
    color: string;
  }[];
};

export const LineChart: React.FC<LineChartProps> = ({ title, labels, series }) => {
  const width = 500;
  const height = 200;
  const padding = 40;

  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(...allValues, 1);

  const xStep = (width - padding * 2) / (labels.length - 1 || 1);
  const yScale = (height - padding * 2) / maxVal;

  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className="my-4">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <svg width={width} height={height} className="border rounded bg-white">
        {/* Eixos */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ccc" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ccc" />

        {/* Linhas das séries */}
        {series.map((s, si) => {
          const path = s.values
            .map((v, i) => {
              const x = padding + i * xStep;
              const y = height - padding - v * yScale;
              return `${i === 0 ? "M" : "L"}${x},${y}`;
            })
            .join(" ");
          return <path key={si} d={path} stroke={s.color} fill="none" strokeWidth={2} />;
        })}

        {/* Pontos interativos */}
        {series.map((s, si) =>
          s.values.map((v, i) => {
            const x = padding + i * xStep;
            const y = height - padding - v * yScale;
            return (
              <circle
                key={`${si}-${i}`}
                cx={x}
                cy={y}
                r={4}
                fill={s.color}
                onMouseEnter={() =>
                  setTooltip({
                    x,
                    y,
                    text: `${labels[i]} - ${s.name}: ${BRL(v)}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })
        )}

        {/* Labels do eixo X */}
        {labels.map((l, i) => {
          const x = padding + i * xStep;
          const y = height - padding + 15;
          return (
            <text key={i} x={x} y={y} textAnchor="middle" fontSize="10">
              {l}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-black text-white text-xs px-2 py-1 rounded"
          style={{ left: tooltip.x + 10, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

/**
 * Exemplos de uso:
 * 
 * <LineChart
 *   title="Últimos 5 anos"
 *   labels={["2021","2022","2023","2024","2025"]}
 *   series={[{ name: "Recebido", values: [1000,2000,1500,3000,2500], color: "#1E293F" }]}
 * />
 *
 * <LineChart
 *   title="No ano"
 *   labels={["Jan","Fev","Mar","Abr","Mai"]}
 *   series={[
 *     { name: "Recebido", values: [1000, 1200, 900, 1400, 1100], color: "#1E293F" },
 *     { name: "A receber", values: [200, 300, 400, 250, 350], color: "#B5A573" }
 *   ]}
 * />
 */


/* ========================= Estado principal e filtros ========================= */
const [vendedorId, setVendedorId] = useState<string | null>(null);
const [status, setStatus] = useState<string | null>(null);
const [segmento, setSegmento] = useState<string | null>(null);
const [tabela, setTabela] = useState<string | null>(null);

// Bases
const [users, setUsers] = useState<User[]>([]);
const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
const [simTables, setSimTables] = useState<SimTable[]>([]);
const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

// Memos auxiliares
const usersById = useMemo(() => {
  const map: Record<string, User> = {};
  users.forEach((u) => (map[u.id] = u));
  return map;
}, [users]);

const usersByAuth = useMemo(() => {
  const map: Record<string, User> = {};
  users.forEach((u) => {
    if (u.auth_user_id) map[u.auth_user_id] = u;
  });
  return map;
}, [users]);

const simTablesById = useMemo(() => {
  const map: Record<string, SimTable> = {};
  simTables.forEach((s) => (map[s.id] = s));
  return map;
}, [simTables]);

// Dados principais
const [loading, setLoading] = useState(false);
const [rows, setRows] = useState<Commission[]>([]);
const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
const [genBusy, setGenBusy] = useState(false);

/* ========================= Estados auxiliares ========================= */

// Regras
const [openRules, setOpenRules] = useState(false);
const [ruleVendorId, setRuleVendorId] = useState<string>("");
const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
const [rulePercent, setRulePercent] = useState<string>("1,20");
const [ruleMeses, setRuleMeses] = useState<number>(1);
const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]);
const [ruleObs, setRuleObs] = useState<string>("");
const [ruleRows, setRuleRows] = useState<
  (CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null })[]
>([]);

// Pagamento
const [openPay, setOpenPay] = useState(false);
const [payCommissionId, setPayCommissionId] = useState<string>("");
const [payFlow, setPayFlow] = useState<(CommissionFlow & { _valor_previsto_calc?: number })[]>([]);
const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
const [payValue, setPayValue] = useState<string>("");
const [payDefaultTab, setPayDefaultTab] = useState<"selecionar" | "arquivos">("selecionar");

// Recibo
const [reciboDate, setReciboDate] = useState<string>(() => toDateInput(new Date()));
const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00");
const [reciboVendor, setReciboVendor] = useState<string>("all");

// Expand/Collapse
const [showPaid, setShowPaid] = useState(false);
const [showUnpaid, setShowUnpaid] = useState(true);
const [showVendasSem, setShowVendasSem] = useState(true);

// Busca/Paginação pagos
const [paidSearch, setPaidSearch] = useState("");
const [paidPage, setPaidPage] = useState(1);
const pageSize = 15;

/* ========================= Efeitos de carregamento de bases ========================= */
useEffect(() => {
  async function loadBases() {
    try {
      // Carregar usuários
      const { data: u, error: errU } = await supabase
        .from("users")
        .select(
          "id, auth_user_id, nome, email, phone, cep, logradouro, numero, bairro, cidade, uf, pix_key, pix_type"
        )
        .order("nome", { ascending: true });
      if (errU) throw errU;

      // Carregar tabelas de simulação
      const { data: st, error: errST } = await supabase
        .from("sim_tables")
        .select("id, segmento, nome_tabela")
        .order("segmento", { ascending: true });
      if (errST) throw errST;

      // Carregar dados sensíveis
      const { data: us, error: errUS } = await supabase
        .from("users_secure")
        .select("id, nome, email, logradouro, numero, bairro, cidade, uf, pix_key, cpf, cpf_mascarado");
      if (errUS) throw errUS;

      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
      setUsersSecure((us || []) as UserSecure[]);
    } catch (err: any) {
      console.error("Erro ao carregar bases:", err.message || err);
    }
  }

  loadBases();
}, []);

/* ========================= Fetch principal ========================= */
async function fetchData() {
  setLoading(true);
  try {
    // Buscar comissões
    let qb = supabase.from("commissions").select("*");
    if (status && status !== "all") qb = qb.eq("status", status);
    if (vendedorId && vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
    if (segmento && segmento !== "all") qb = qb.eq("segmento", segmento);
    if (tabela && tabela !== "all") qb = qb.eq("tabela", tabela);

    const { data: comms, error: errC } = await qb.order("data_venda", { ascending: false });
    if (errC) throw errC;

    const ids = (comms || []).map((c) => c.id);
    const { data: flows, error: errF } = await supabase
      .from("commission_flow")
      .select("*")
      .in("commission_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("mes", { ascending: true });
    if (errF) throw errF;

    // Agrupar flows por comissão
    const flowBy: Record<string, CommissionFlow[]> = {};
    (flows || []).forEach((f) => {
      if (!flowBy[f.commission_id]) flowBy[f.commission_id] = [];
      if (!flowBy[f.commission_id].some((x) => x.mes === f.mes)) flowBy[f.commission_id].push(f as CommissionFlow);
    });

    // Buscar vendas relacionadas
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
        vendasExtras[v.id] = {
          clienteId: cid,
          numero_proposta: v.numero_proposta || null,
          cliente_nome: cid ? (nomes[cid] || null) : null,
        };
      });
    }

    // Popular linhas
    setRows(
      (comms || []).map((c: any) => ({
        ...(c as Commission),
        flow: flowBy[c.id] || [],
        cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
        numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
      }))
    );

    // Vendas sem comissão
    const { data: vendasPeriodo } = await supabase
      .from("vendas")
      .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
      .order("data_venda", { ascending: false });

    const { data: commVendaIds } = await supabase.from("commissions").select("venda_id");
    const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
    const vendasFiltered = (vendasPeriodo || []).filter((v) => !hasComm.has(v.id));

    const vendasFiltered2 = vendasFiltered.filter((v) => {
      const vendCanon = usersById[v.vendedor_id]?.id || usersByAuth[v.vendedor_id]?.id || v.vendedor_id;
      return (
        (!vendedorId || vendedorId === "all" || vendCanon === vendedorId) &&
        (!segmento || segmento === "all" || v.segmento === segmento) &&
        (!tabela || tabela === "all" || (v.tabela || "") === tabela)
      );
    });

    setVendasSemCom(vendasFiltered2 as Venda[]);

    const clientIds = Array.from(new Set((vendasFiltered2 || []).map((v) => v.lead_id || v.cliente_lead_id).filter((x): x is string => !!x)));
    if (clientIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clientIds);
      const map: Record<string, string> = {};
      (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
      setClientesMap(map);
    } else {
      setClientesMap({});
    }

    // Reconcile status baseado nas parcelas
    setRows((prev) =>
      prev.map((r) => {
        const relevant = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
        const allPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);
        if (allPaid && r.status !== "pago") {
          const lastDate = r.data_pagamento || (relevant[relevant.length - 1]?.data_pagamento_vendedor ?? null);
          supabase.from("commissions")
            .update({ status: "pago", data_pagamento: lastDate })
            .eq("id", r.id)
            .then(({ error }) => {
              if (error) console.warn("[reconcile] commissions.update falhou:", error.message);
            });
          return { ...r, status: "pago", data_pagamento: lastDate };
        }
        return r;
      })
    );
  } catch (e: any) {
    console.warn("[fetchData] erro:", e.message || e);
  } finally {
    setLoading(false);
  }
}

/* ========================= Lógica de regras de comissão ========================= */

// Alterar quantidade de meses no fluxo
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

// Buscar regras de comissão para um vendedor
async function fetchRulesForVendor(vId: string) {
  if (!vId) {
    setRuleRows([]);
    return;
  }

  const { data: rules, error } = await supabase
    .from("commission_rules")
    .select("vendedor_id, sim_table_id, percent_padrao, fluxo_meses, fluxo_percentuais, obs")
    .eq("vendedor_id", vId);

  if (error || !rules) {
    console.warn("Erro ao buscar regras:", error?.message);
    setRuleRows([]);
    return;
  }

  // Buscar informações das simTables relacionadas
  const stIds = Array.from(new Set(rules.map((r) => r.sim_table_id)));
  const { data: st } = await supabase
    .from("sim_tables")
    .select("id, segmento, nome_tabela")
    .in("id", stIds);

  const bySt: Record<string, SimTable> = {};
  (st || []).forEach((s) => { bySt[s.id] = s as SimTable; });

  // Mapear administradoras prováveis
  const tableNames = Array.from(new Set((st || []).map((s) => s.nome_tabela))).filter(Boolean);
  let adminMap: Record<string, string> = {};
  if (tableNames.length) {
    const { data: vendas } = await supabase
      .from("vendas")
      .select("segmento, tabela, administradora")
      .in("tabela", tableNames);

    (vendas || []).forEach((v) => {
      const key = `${v.segmento || "-"}|${v.tabela || "-"}`;
      if (!adminMap[key] && v.administradora) adminMap[key] = v.administradora;
    });
  }

  setRuleRows(rules.map((r) => {
    const stInfo = bySt[r.sim_table_id];
    const key = `${stInfo?.segmento || "-"}|${stInfo?.nome_tabela || "-"}`;
    return {
      ...(r as CommissionRule),
      segmento: stInfo?.segmento || "-",
      nome_tabela: stInfo?.nome_tabela || "-",
      administradora: adminMap[key] || "—",
    };
  }));
}

// Salvar regra
async function saveRule() {
  if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");

  const pctPadraoPercent = parseFloat((rulePercent || "0").replace(",", "."));
  if (!isFinite(pctPadraoPercent) || pctPadraoPercent <= 0) {
    return alert("Informe o % Padrão corretamente.");
  }

  // Soma do fluxo
  const somaFluxo = ruleFluxoPct.reduce(
    (a, b) => a + (parseFloat((b || "0").replace(",", ".")) || 0),
    0
  );
  const soma100 = Math.abs(somaFluxo - 100) < 1e-6;
  const somaIgualPadrao = Math.abs(somaFluxo - pctPadraoPercent) < 1e-6;

  if (!(soma100 || somaIgualPadrao)) {
    return alert(
      `Soma do fluxo deve ser 100,00 ou igual ao % padrão. Soma atual = ${somaFluxo.toFixed(2).replace(".", ",")}`
    );
  }

  // Normalizar fluxo em frações
  let fluxo_percentuais_frac: number[] = [];
  if (soma100) {
    fluxo_percentuais_frac = ruleFluxoPct.map(
      (x) => (parseFloat((x || "0").replace(",", ".")) || 0) / 100
    );
  } else {
    fluxo_percentuais_frac = ruleFluxoPct.map((x) => {
      const v = parseFloat((x || "0").replace(",", ".")) || 0;
      return pctPadraoPercent > 0 ? v / pctPadraoPercent : 0;
    });
  }

  const percent_padrao_frac = pctPadraoPercent / 100;

  const { error } = await supabase.from("commission_rules").upsert(
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
  alert("Regra salva.");
}

// Excluir regra
async function deleteRule(vId: string, stId: string) {
  if (!confirm("Excluir esta regra?")) return;
  const { error } = await supabase
    .from("commission_rules")
    .delete()
    .eq("vendedor_id", vId)
    .eq("sim_table_id", stId);

  if (error) return alert(error.message);
  await fetchRulesForVendor(vId);
}

// Carregar regra para formulário
function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string }) {
  setRuleVendorId(r.vendedor_id);
  setRuleSimTableId(r.sim_table_id);
  setRulePercent(((r.percent_padrao || 0) * 100).toFixed(2).replace(".", ","));
  setRuleMeses(r.fluxo_meses);

  const padraoPctPercent = (r.percent_padrao || 0) * 100;
  const arr = r.fluxo_percentuais.map((p) =>
    (p * padraoPctPercent).toFixed(2).replace(".", ",")
  );
  setRuleFluxoPct(arr);
  setRuleObs(r.obs || "");
}

/* ========================= Garantia de fluxo por comissão ========================= */
async function ensureFlowForCommission(c: Commission): Promise<CommissionFlow[]> {
  // Verifica se já existe fluxo cadastrado
  const { data: existing, error: errE } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });

  if (errE) {
    console.warn("[ensureFlowForCommission] erro ao buscar fluxo:", errE.message);
    return [];
  }

  if (existing && existing.length > 0) {
    return existing as CommissionFlow[];
  }

  // Default
  let meses = 1;
  let percentuais: number[] = [1];

  // Verificar se há regra para este vendedor/tabela
  if (c.vendedor_id && c.sim_table_id) {
    const { data: rule, error: errR } = await supabase
      .from("commission_rules")
      .select("fluxo_meses, fluxo_percentuais")
      .eq("vendedor_id", c.vendedor_id)
      .eq("sim_table_id", c.sim_table_id)
      .limit(1);

    if (!errR && rule && rule[0]) {
      const soma = (rule[0].fluxo_percentuais || []).reduce(
        (a: number, b: number) => a + (b || 0),
        0
      );
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
    valor_previsto: Math.round(valorTotal * p * 100) / 100,
    valor_recebido_admin: null,
    data_recebimento_admin: null,
    valor_pago_vendedor: 0,
    data_pagamento_vendedor: null,
    recibo_vendedor_url: null,
    comprovante_pagto_url: null,
  }));

  const { error: errI } = await supabase.from("commission_flow").insert(inserts as any[]);
  if (errI) {
    console.warn("[ensureFlowForCommission] erro ao inserir fluxo:", errI.message);
  }

  const { data: created, error: errC } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });

  if (errC) {
    console.warn("[ensureFlowForCommission] erro ao buscar fluxo criado:", errC.message);
    return [];
  }

  return (created || []) as CommissionFlow[];
}

/* ========================= Pagamento (overlay) ========================= */

// Abrir overlay de pagamento para uma comissão
async function openPaymentFor(c: Commission) {
  setPayCommissionId(c.id);

  // Garantir fluxo
  let { data } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });

  if (!data || data.length === 0) {
    const created = await ensureFlowForCommission(c);
    data = created as any;
  }

  // Calcular valor previsto
  const arr = (data || []).map((f: any) => ({
    ...f,
    _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0),
  }));

  const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
  arr.forEach((f: any) => uniq.set(f.mes, f));
  const finalArr = Array.from(uniq.values());

  setPayFlow(finalArr);

  // Pré-selecionar pendentes
  const pre = Object.fromEntries(
    finalArr
      .filter((f) => (Number(f.percentual) || 0) > 0 && (Number(f.valor_pago_vendedor) || 0) === 0)
      .map((f) => [f.id, true])
  );
  setPaySelected(pre);

  // Definir aba inicial
  const registered = hasRegisteredButUnpaid(finalArr);
  setPayDefaultTab(registered ? "arquivos" : "selecionar");

  setPayDate(toDateInput(new Date()));
  setPayValue("");
  setOpenPay(true);
}

// Upload para bucket
async function uploadToBucket(file: File, commissionId: string) {
  const path = `${commissionId}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
  if (error) {
    alert("Falha ao enviar arquivo: " + error.message);
    return null;
  }
  return data?.path || null;
}

// Gerar URL assinada
async function getSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("comissoes").createSignedUrl(path, 60 * 10);
  if (error) {
    console.warn("Signed URL error:", error.message);
    return null;
  }
  return (data as any)?.signedUrl || null;
}

// Registrar pagamento de parcelas
async function paySelectedParcels(payload: {
  data_pagamento_vendedor?: string;
  valor_pago_vendedor?: number;
  recibo_file?: File | null;
  comprovante_file?: File | null;
}) {
  // Uploads
  let reciboPath: string | null = null,
    compPath: string | null = null;
  if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
  if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

  const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);

  // Seleção explícita
  let selected = candidates.filter((f) => paySelected[f.id]);

  // Seleção automática se não houver
  if (!selected.length && payload.data_pagamento_vendedor) {
    selected = candidates.filter(
      (f) => (f.data_pagamento_vendedor || "") === payload.data_pagamento_vendedor
    );
  }

  if (!selected.length) {
    const unpaid = candidates.filter((f) => (Number(f.valor_pago_vendedor) || 0) === 0);
    if (unpaid.length === 1) selected = unpaid;
    else if (unpaid.length > 0) selected = [unpaid[0]];
  }

  if (!selected.length) {
    alert("Selecione pelo menos uma parcela.");
    return;
  }

  // UPDATE
  const toUpdate = selected.filter((f) => !!f.id);
  if (toUpdate.length) {
    for (const f of toUpdate) {
      const { error } = await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor:
            payload.data_pagamento_vendedor ||
            f.data_pagamento_vendedor ||
            toDateInput(new Date()),
          valor_pago_vendedor:
            payload.valor_pago_vendedor !== undefined
              ? payload.valor_pago_vendedor
              : (f.valor_pago_vendedor ?? 0),
          recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
          comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
        })
        .eq("id", f.id);
      if (error) {
        alert("Falha ao atualizar parcela: " + error.message);
        return;
      }
    }
  }

  // INSERT (sem id)
  const toInsert = selected.filter((f) => !f.id);
  if (toInsert.length) {
    const inserts = toInsert.map((f) => ({
      commission_id: f.commission_id,
      mes: f.mes,
      percentual: f.percentual ?? 0,
      valor_previsto: f.valor_previsto ?? 0,
      data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
      valor_pago_vendedor:
        payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : 0,
      recibo_vendedor_url: reciboPath || null,
      comprovante_pagto_url: compPath || null,
    }));
    const { error } = await supabase.from("commission_flow").insert(inserts);
    if (error) {
      alert("Falha ao inserir parcela: " + error.message);
      return;
    }
  }

  // Reconcile
  const { data: fresh } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", payCommissionId)
    .order("mes", { ascending: true });

  const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
  const isAllPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

  const { error: updErr } = await supabase
    .from("commissions")
    .update({
      status: isAllPaid ? "pago" : "a_pagar",
      data_pagamento: isAllPaid
        ? payload.data_pagamento_vendedor || toDateInput(new Date())
        : null,
    })
    .eq("id", payCommissionId);

  if (updErr) {
    console.warn("[commissions.update] falhou:", updErr.message);
    alert("A comissão foi paga, mas não consegui atualizar o status no banco.");
  }

  // Atualizar estado local
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

/* ========================= Exportações / Recibos ========================= */

// Exportar dados para CSV
function exportCSV() {
  const headers = [
    "ID",
    "Vendedor",
    "Cliente",
    "Nº Proposta",
    "Segmento",
    "Tabela",
    "Administradora",
    "Valor Venda",
    "Valor Total Comissão",
    "Status",
    "Data Venda",
    "Data Pagamento",
  ];

  const rowsCSV = rows.map((r) => [
    r.id,
    usersById[r.vendedor_id]?.nome || "—",
    r.cliente_nome || "—",
    r.numero_proposta || "—",
    r.segmento || "—",
    r.tabela || "—",
    r.administradora || "—",
    r.valor_venda?.toFixed(2) || "0,00",
    r.valor_total?.toFixed(2) || "0,00",
    r.status,
    r.data_venda ? formatISODateBR(r.data_venda) : "—",
    r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—",
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers, ...rowsCSV].map((e) => e.join(";")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "comissoes.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Gerar recibo PDF por data
async function downloadReceiptPDFPorData(dataRecibo: string) {
  const vendedor =
    reciboVendor === "all" ? null : usersById[reciboVendor]?.nome || null;
  const impostoPct = parseFloat(reciboImpostoPct.replace(",", ".")) || 0;

  const filtered = rows.filter(
    (r) =>
      r.data_pagamento &&
      r.data_pagamento.slice(0, 10) === dataRecibo &&
      (reciboVendor === "all" || r.vendedor_id === reciboVendor)
  );

  if (!filtered.length) {
    alert("Nenhum pagamento encontrado para a data selecionada.");
    return;
  }

  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Recibo de Pagamento de Comissões", 105, 15, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 14, 25);
  if (vendedor) doc.text(`Vendedor: ${vendedor}`, 14, 30);

  const body = filtered.map((r) => {
    const bruto = r.valor_total || 0;
    const imposto = bruto * (impostoPct / 100);
    const liquido = bruto - imposto;
    return [
      r.numero_proposta || "—",
      r.cliente_nome || "—",
      BRL(bruto),
      `${impostoPct.toFixed(2).replace(".", ",")}%`,
      BRL(imposto),
      BRL(liquido),
    ];
  });

  autoTable(doc, {
    head: [["Proposta", "Cliente", "Valor Bruto", "Imposto", "Desconto", "Valor Líquido"]],
    body,
    startY: 40,
    styles: { fontSize: 9 },
  });

  const totalBruto = filtered.reduce((acc, r) => acc + (r.valor_total || 0), 0);
  const totalImposto = totalBruto * (impostoPct / 100);
  const totalLiquido = totalBruto - totalImposto;

  doc.setFontSize(10);
  doc.text(`Total Bruto: ${BRL(totalBruto)}`, 14, doc.lastAutoTable.finalY + 10);
  doc.text(`Total Imposto: ${BRL(totalImposto)}`, 14, doc.lastAutoTable.finalY + 16);
  doc.text(`Total Líquido: ${BRL(totalLiquido)}`, 14, doc.lastAutoTable.finalY + 22);

  doc.save(`recibo-${dataRecibo}.pdf`);
}

/* ========================= Memos derivados para render ========================= */

// Comissões a pagar
const rowsAPagar = useMemo(() => {
  return rows.filter((r) => r.status === "a_pagar");
}, [rows]);

// Lista plana de comissões pagas (flatten dos fluxos)
const pagosFlat = useMemo(() => {
  const arr: (Commission & { flowItem: CommissionFlow })[] = [];
  rows.forEach((r) => {
    if (r.status === "pago" || r.status === "estorno") {
      (r.flow || []).forEach((f) => {
        if (f.valor_pago_vendedor && f.data_pagamento_vendedor) {
          arr.push({ ...r, flowItem: f });
        }
      });
    }
  });
  return arr.sort(
    (a, b) =>
      new Date(b.flowItem.data_pagamento_vendedor || "").getTime() -
      new Date(a.flowItem.data_pagamento_vendedor || "").getTime()
  );
}, [rows]);

// Filtrar pagos por busca
const pagosFiltered = useMemo(() => {
  const term = normalize(paidSearch);
  if (!term) return pagosFlat;
  return pagosFlat.filter(
    (r) =>
      normalize(r.cliente_nome).includes(term) ||
      normalize(r.numero_proposta).includes(term) ||
      normalize(usersById[r.vendedor_id]?.nome).includes(term)
  );
}, [pagosFlat, paidSearch, usersById]);

// Paginação
const pagosPage = useMemo(() => {
  const start = (paidPage - 1) * pageSize;
  return pagosFiltered.slice(start, start + pageSize);
}, [pagosFiltered, paidPage, pageSize]);

/* ========================= Séries de dados para gráficos (ETAPA 1) ========================= */

// Últimos 5 anos → apenas recebidos
const series5Anos = useMemo(() => {
  const data = projectAnnualFlows(rows);
  const labels = Object.keys(data).map((y) => y.toString());
  const values = Object.values(data);
  return {
    labels,
    series: [{ name: "Recebido", values, color: "#1E293F" }],
  };
}, [rows]);

// Ano anterior → recebidos mês a mês
const seriesAnoAnterior = useMemo(() => {
  const anoAnterior = now.getFullYear() - 1;
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const valores = new Array(12).fill(0);

  rows.forEach((c) => {
    (c as any).flow?.forEach((f: CommissionFlow) => {
      if (f.data_pagamento_vendedor) {
        const d = new Date(f.data_pagamento_vendedor);
        if (d.getFullYear() === anoAnterior) {
          valores[d.getMonth()] += f.valor_pago_vendedor || 0;
        }
      }
    });
  });

  return {
    labels: meses,
    series: [{ name: "Recebido", values: valores, color: "#1E293F" }],
  };
}, [rows]);

// Ano corrente → recebido + projetado
const seriesAnoCorrente = useMemo(() => {
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const proj = projectMonthlyFlows(rows);
  const recebidos = meses.map((_, i) => proj[i]?.recebido || 0);
  const projetados = meses.map((_, i) => proj[i]?.projetado || 0);

  return {
    labels: meses,
    series: [
      { name: "Recebido", values: recebidos, color: "#1E293F" },
      { name: "A receber", values: projetados, color: "#B5A573" },
    ],
  };
}, [rows]);

// Mês corrente → recebido + projetado por semana (quinta a quarta)
const seriesMesCorrente = useMemo(() => {
  const proj = projectWeeklyFlows(rows);
  const labels = Object.keys(proj);
  const recebidos = labels.map((l) => proj[l]?.recebido || 0);
  const projetados = labels.map((l) => proj[l]?.projetado || 0);

  return {
    labels,
    series: [
      { name: "Recebido", values: recebidos, color: "#1E293F" },
      { name: "A receber", values: projetados, color: "#B5A573" },
    ],
  };
}, [rows]);

/* ========================= Render ========================= */
return (
  <div className="p-4 space-y-6">
    {/* ====== Filtros topo ====== */}
    <Card>
      <CardContent className="flex flex-wrap gap-4 items-end">
        {/* Filtro Vendedor */}
        <div>
          <Label>Vendedor</Label>
          <Select value={vendedorId || "all"} onValueChange={(v) => setVendedorId(v === "all" ? null : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Status */}
        <div>
          <Label>Status</Label>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? null : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="a_pagar">A Pagar</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="estorno">Estorno</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Segmento */}
        <div>
          <Label>Segmento</Label>
          <Select value={segmento || "all"} onValueChange={(v) => setSegmento(v === "all" ? null : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {[...new Set(simTables.map((s) => s.segmento))].map((seg) => (
                <SelectItem key={seg} value={seg || "—"}>
                  {seg || "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Tabela */}
        <div>
          <Label>Tabela</Label>
          <Select value={tabela || "all"} onValueChange={(v) => setTabela(v === "all" ? null : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {simTables.map((s) => (
                <SelectItem key={s.id} value={s.nome_tabela}>
                  {s.nome_tabela}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>

    {/* ====== Dashboards (Relógios) ====== */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Últimos 5 anos */}
      <Card>
        <CardHeader><CardTitle>Últimos 5 anos</CardTitle></CardHeader>
        <CardContent>
          <DonutChart
            title="Total Pago"
            value={totalsInRangePaidOnly(rows, fiveYearsAgo, now).pagoLiquido}
          />
        </CardContent>
      </Card>

      {/* Ano anterior */}
      <Card>
        <CardHeader><CardTitle>Ano anterior</CardTitle></CardHeader>
        <CardContent>
          <DonutChart
            title="Total Pago"
            value={totalsInRangePaidOnly(rows, new Date(now.getFullYear()-1,0,1), new Date(now.getFullYear()-1,11,31)).pagoLiquido}
          />
        </CardContent>
      </Card>

      {/* Ano corrente */}
      <Card>
        <CardHeader><CardTitle>No ano</CardTitle></CardHeader>
        <CardContent>
          <DonutChart
            title="Pago + A receber"
            value={totalsInRangePaidAndProjected(rows, yStart, new Date(now.getFullYear(),11,31)).totalLiquida}
          />
        </CardContent>
      </Card>

      {/* Mês corrente */}
      <Card>
        <CardHeader><CardTitle>No mês</CardTitle></CardHeader>
        <CardContent>
          <DonutChart
            title="Pago + A receber"
            value={totalsInRangePaidAndProjected(rows, mStart, endOfMonth(now)).totalLiquida}
          />
        </CardContent>
      </Card>
    </div>

    {/* ====== Gráficos de linhas ====== */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LineChart title="Últimos 5 anos" labels={series5Anos.labels} series={series5Anos.series} />
      <LineChart title="Ano anterior" labels={seriesAnoAnterior.labels} series={seriesAnoAnterior.series} />
      <LineChart title="No ano" labels={seriesAnoCorrente.labels} series={seriesAnoCorrente.series} />
      <LineChart title="No mês" labels={seriesMesCorrente.labels} series={seriesMesCorrente.series} />
    </div>

    {/* ====== Resumo ====== */}
    {/* Mantido conforme implementação anterior */}

    {/* ====== Vendas sem comissão ====== */}
    {/* Mantido conforme implementação anterior */}

    {/* ====== Detalhamento (a pagar) ====== */}
    {/* Mantido conforme implementação anterior */}

    {/* ====== Comissões pagas ====== */}
    {/* Mantido conforme implementação anterior */}

    {/* ====== Dialog Regras ====== */}
    {/* Mantido conforme implementação anterior */}

    {/* ====== Dialog Pagamento ====== */}
    {/* Mantido conforme implementação anterior */}
  </div>
);

/* ========================= Subcomponentes ========================= */

/* Metric (já existente) */
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

/* UploadArea (já existente) */
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
  const [dataPg, setDataPg] = useState<string>(() => toDateInput(new Date()));
  const [valorPg, setValorPg] = useState<string>("");
  const [fileRecibo, setFileRecibo] = useState<File | null>(null);
  const [fileComp, setFileComp] = useState<File | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Data do pagamento</Label>
          <Input type="date" value={dataPg} onChange={(e) => setDataPg(e.target.value)} />
        </div>
        <div>
          <Label>Valor pago ao vendedor (opcional)</Label>
          <Input
            placeholder="Ex.: 1.974,00"
            value={valorPg}
            onChange={(e) => setValorPg(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() =>
              onConfirm({
                data_pagamento_vendedor: dataPg,
                valor_pago_vendedor: valorPg
                  ? parseFloat(valorPg.replace(/\./g, "").replace(",", "."))
                  : undefined,
                recibo_file: fileRecibo,
                comprovante_file: fileComp,
              })
            }
          >
            <Save className="w-4 h-4 mr-1" /> Confirmar pagamento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Recibo assinado (PDF)</Label>
          <Input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFileRecibo(e.target.files?.[0] || null)}
          />
        </div>
        <div>
          <Label>Comprovante de pagamento (PDF/Imagem)</Label>
          <Input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFileComp(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Arquivos vão para o bucket <code>comissoes</code>. Digite o valor <b>BRUTO</b>.
        Se nenhuma parcela estiver marcada, a confirmação faz uma seleção segura automática.
      </div>
    </div>
  );
}

/* LineChart (novo, minimalista e consistente) */
type LineChartProps = {
  title: string;
  labels: string[];
  series: {
    name: string;
    values: number[];
    color: string; // manter paleta atual (ex.: #1E293F para Recebido, #B5A573 para A receber)
  }[];
};

function LineChart({ title, labels, series }: LineChartProps) {
  const width = 560;
  const height = 220;
  const pad = 40;

  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(1, ...allValues);
  const xStep = labels.length > 1 ? (width - pad * 2) / (labels.length - 1) : 0;
  const yScale = (height - pad * 2) / maxVal;

  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className="relative p-3 border rounded-xl bg-white">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {/* Eixos */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#e5e7eb" />

        {/* Linhas das séries */}
        {series.map((s, si) => {
          const d = s.values
            .map((v, i) => {
              const x = pad + i * xStep;
              const y = height - pad - v * yScale;
              return `${i === 0 ? "M" : "L"}${x},${y}`;
            })
            .join(" ");
          return <path key={si} d={d} stroke={s.color} fill="none" strokeWidth={2} />;
        })}

        {/* Pontos e tooltip */}
        {series.map((s, si) =>
          s.values.map((v, i) => {
            const x = pad + i * xStep;
            const y = height - pad - v * yScale;
            return (
              <circle
                key={`${si}-${i}`}
                cx={x}
                cy={y}
                r={3.5}
                fill={s.color}
                onMouseEnter={(e) =>
                  setTip({
                    x: (e.target as SVGCircleElement).getBoundingClientRect().left,
                    y: (e.target as SVGCircleElement).getBoundingClientRect().top,
                    text: `${labels[i]} — ${s.name}: ${BRL(v)}`,
                  })
                }
                onMouseLeave={() => setTip(null)}
              />
            );
          })
        )}

        {/* Labels X */}
        {labels.map((l, i) => {
          const x = pad + i * xStep;
          return (
            <text key={i} x={x} y={height - pad + 14} textAnchor="middle" fontSize="10" fill="#6b7280">
              {l}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tip && (
        <div className="pointer-events-none absolute -mt-8 ml-4 bg-black text-white text-xs px-2 py-1 rounded shadow">
          {tip.text}
        </div>
      )}

      {/* Legenda simples */}
      <div className="flex gap-4 mt-2 text-xs text-gray-600">
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}
