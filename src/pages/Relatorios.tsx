// src/pages/Relatorios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Loader2, AlertTriangle, CheckCircle2, Eye, Download } from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Line,
  LabelList,
  AreaChart,
  Area,
} from "recharts";

/* =========================
   Paleta Consulmax
========================= */
const C = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  muted: "rgba(30,41,63,.70)",
  border: "rgba(255,255,255,.35)",
  glass: "rgba(255,255,255,.55)",
};

const CONCENTRACAO_ALERTA = 0.1; // 10%

/* =========================
   Tipos (DB)
========================= */
type UUID = string;

type VendaRow = {
  id: UUID;
  vendedor_id: UUID | null; // pode ser users.id OU auth_user_id (vamos suportar os 2)

  administradora: string | null;
  segmento: string | null;
  tabela: string | null;

  tipo_venda: "Normal" | "Contemplada" | "Bolsão" | string | null;
  contemplada: boolean | null;

  encarteirada_em: string | null; // timestamptz
  cancelada_em: string | null; // timestamptz
  codigo: string | null; // '00' ativa

  data_venda: string | null; // date
  data_contemplacao: string | null; // date

  contemplacao_tipo: string | null; // "Lance Livre" | "Primeiro Lance Fixo" | "Segundo Lance Fixo"
  contemplacao_pct: number | null;

  valor_venda: number | null;

  lead_id: UUID | null;
  numero_proposta: string | null;

  grupo?: string | null;
  cota?: string | null;

  inad?: boolean | null; // bool
  inad_em: string | null; // date/timestamptz -> data da parcela mais antiga inadimplida
};

type LeadRow = {
  id: UUID;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
};

type UserRow = {
  id: UUID; // users.id
  auth_user_id: UUID; // auth.users.id
  nome: string | null;
  user_role?: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

type GroupRow = {
  id: UUID;
  codigo: string | null;
  administradora: string | null;
  segmento: string | null;
  prox_vencimento: string | null;
};

type LastAssemblyRow = {
  group_id: UUID | null;
  date: string | null;

  fixed25_offers: number | null;
  fixed25_deliveries: number | null;

  fixed50_offers: number | null;
  fixed50_deliveries: number | null;

  ll_offers: number | null;
  ll_deliveries: number | null;
  ll_high: number | null;
  ll_low: number | null;
  median: number | null;
};

/* =========================
   Helpers
========================= */
function safeNum(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmtBRL(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

/** p em fração (0..1) */
function fmtPctHuman(p: number, digits = 1) {
  const v = Number.isFinite(p) ? p : 0;
  return `${(v * 100).toFixed(digits).replace(".", ",")}%`;
}

/** v em percent (0..100) */
function fmtPct100Human(v: number, digits = 2) {
  const n = Number.isFinite(v) ? v : 0;
  return `${n.toFixed(digits).replace(".", ",")}%`;
}

function fmtPctMaybeHuman(v: number | null | undefined, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(digits).replace(".", ",")}%`;
}

function fmtDateBR(isoOrDate: string | null) {
  if (!isoOrDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  const dt = new Date(isoOrDate);
  if (!Number.isFinite(dt.getTime())) return isoOrDate;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/** "Hoje" local sem deslizar */
function todayLocalYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse date string (YYYY-MM-DD) como data local (meia-noite) */
function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/** Diferença em dias usando datas locais (evita “voltar um dia”) */
function diffDaysLocal(from: string, toYMD: string) {
  const fromDt = /^\d{4}-\d{2}-\d{2}$/.test(from) ? parseLocalDate(from) : new Date(from);
  const toDt = parseLocalDate(toYMD);
  const a = fromDt.getTime();
  const b = toDt.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

function monthKeyFromISO(iso: string | null) {
  if (!iso) return null;
  const m = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function diffDays(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getSemesterRange(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const isH1 = m <= 5;
  const start = new Date(y, isH1 ? 0 : 6, 1, 0, 0, 0, 0);
  const end = new Date(y, isH1 ? 5 : 11, isH1 ? 30 : 31, 23, 59, 59, 999);
  return { start, end, label: isH1 ? `Jan–Jun ${y}` : `Jul–Dez ${y}` };
}

function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}

function normalizeDigits(v: string | null | undefined) {
  return String(v || "").replace(/\D+/g, "");
}

function sameGroupCode(a: string | null | undefined, b: string | null | undefined) {
  return normalizeDigits(a) === normalizeDigits(b);
}

function inYmdRange(dateValue: string | null | undefined, startYmd: string, endYmd: string) {
  if (!dateValue) return false;
  const ymd = dateValue.slice(0, 10);
  return ymd >= startYmd && ymd <= endYmd;
}

/* =========================
   Excel XML 2003 (sem alerta de extensão)
   - gera um arquivo .xml compatível com Excel
   - valores monetários são enviados como Number + estilo moeda
========================= */
type ExcelCell = {
  value: string | number | null | undefined;
  type?: "String" | "Number";
  styleId?: "Header" | "Text" | "Number" | "Currency";
};

function escapeXml(v: any) {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildExcelXml(filenameBase: string, headers: string[], rows: ExcelCell[][]) {
  const headerRow = `
    <Row ss:StyleID="Header">
      ${headers
        .map(
          (h) => `
        <Cell ss:StyleID="Header">
          <Data ss:Type="String">${escapeXml(h)}</Data>
        </Cell>`
        )
        .join("")}
    </Row>
  `;

  const bodyRows = rows
    .map((r) => {
      const cells = r
        .map((c) => {
          const type = c.type || (typeof c.value === "number" ? "Number" : "String");
          const styleId =
            c.styleId ||
            (type === "Number" ? "Number" : "Text");

          const raw =
            type === "Number"
              ? String(Number(c.value ?? 0))
              : escapeXml(c.value ?? "");

          return `
            <Cell ss:StyleID="${styleId}">
              <Data ss:Type="${type}">${raw}</Data>
            </Cell>
          `;
        })
        .join("");

      return `<Row>${cells}</Row>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>ChatGPT</Author>
    <Company>Consulmax</Company>
  </DocumentProperties>

  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <WindowHeight>12000</WindowHeight>
    <WindowWidth>20000</WindowWidth>
    <ProtectStructure>False</ProtectStructure>
    <ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>

  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1E293F"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>

    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E293F" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
      </Borders>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="Text">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
      </Borders>
    </Style>

    <Style ss:ID="Number">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
      </Borders>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="0.00"/>
    </Style>

    <Style ss:ID="Currency">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
      </Borders>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00"/>
    </Style>
  </Styles>

  <Worksheet ss:Name="Relatorio">
    <Table>
      ${headerRow}
      ${bodyRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <DisplayGridlines/>
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <Panes>
        <Pane>
          <Number>3</Number>
          <ActiveRow>1</ActiveRow>
        </Pane>
      </Panes>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameBase.endsWith(".xml") ? filenameBase : `${filenameBase}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   UI helpers
========================= */
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Card
      className={`border ${className}`}
      style={{
        background: C.glass,
        borderColor: C.border,
        backdropFilter: "saturate(160%) blur(10px)",
        WebkitBackdropFilter: "saturate(160%) blur(10px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.20), 0 10px 30px rgba(30,41,63,.08)",
        borderRadius: 18,
      }}
    >
      {children}
    </Card>
  );
}

function Badge({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "danger" | "ok" | "muted";
}) {
  const styles: Record<string, React.CSSProperties> = {
    info: {
      background: "rgba(30,41,63,.10)",
      color: C.navy,
      border: "1px solid rgba(30,41,63,.18)",
    },
    danger: {
      background: "rgba(161,28,39,.12)",
      color: C.rubi,
      border: "1px solid rgba(161,28,39,.22)",
    },
    ok: {
      background: "rgba(181,165,115,.18)",
      color: C.navy,
      border: "1px solid rgba(181,165,115,.35)",
    },
    muted: {
      background: "rgba(255,255,255,.55)",
      color: C.muted,
      border: "1px solid rgba(255,255,255,.45)",
    },
  };

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={styles[tone]}>
      {children}
    </span>
  );
}

/* =========================
   Página
========================= */
export default function Relatorios() {
  // filtros globais (auto-aplicáveis)
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  const [fVendedor, setFVendedor] = useState<string>("all"); // pode ser users.id ou auth_user_id (o que vier em vendas.vendedor_id)
  const [fAdmin, setFAdmin] = useState<string>("all");
  const [fSeg, setFSeg] = useState<string>("all");
  const [fTabela, setFTabela] = useState<string>("all");
  const [fTipoVenda, setFTipoVenda] = useState<string>("all");
  const [fContemplada, setFContemplada] = useState<string>("all"); // all|sim|nao

  // dados
  const [loading, setLoading] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null); // auth.users.id
  const [myUserId, setMyUserId] = useState<string | null>(null); // users.id
  const [isAdmin, setIsAdmin] = useState(false);

  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserRow>>({}); // key: users.id
  const [usersByAuth, setUsersByAuth] = useState<Record<string, UserRow>>({}); // key: users.auth_user_id
  const [leadsMap, setLeadsMap] = useState<Record<string, LeadRow>>({});

  // dialog concentração
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadDialogId, setLeadDialogId] = useState<string | null>(null);

  // paginação concentração
  const [concPage, setConcPage] = useState(1);
  const concPageSize = 10;

  // dialog export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportType, setExportType] = useState<
    "vendas" | "canceladas" | "contempladas" | "inadimplentes" | "vencimentos" | "result_assembleia"
  >("vendas");
  const [exportStatusStart, setExportStatusStart] = useState<string>("");
  const [exportStatusEnd, setExportStatusEnd] = useState<string>("");

  const todayYMD = useMemo(() => todayLocalYMD(), []);

  /* =========================
     Carrega auth + role
  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;

        if (error || !data?.user) {
          setAuthUserId(null);
          setMyUserId(null);
          setIsAdmin(false);
          return;
        }

        const authId = data.user.id;
        setAuthUserId(authId);

        const { data: urow, error: uerr } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, user_role, role, is_active")
          .eq("auth_user_id", authId)
          .maybeSingle();

        if (!alive) return;

        if (uerr || !urow?.id) {
          console.error("Erro ao carregar usuário (users):", uerr?.message);
          setMyUserId(null);
          setIsAdmin(false);
          return;
        }

        setMyUserId(urow.id);

        const roleRaw = (urow.user_role || urow.role || "").toString().trim().toLowerCase();
        setIsAdmin(roleRaw === "admin");
      } catch (e) {
        console.error("Erro ao identificar usuário:", e);
        if (!alive) return;
        setAuthUserId(null);
        setMyUserId(null);
        setIsAdmin(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* =========================
     Helpers vendedor
  ========================= */
  const vendorName = (sellerId: string | null) => {
    if (!sellerId) return "—";
    return usersMap[sellerId]?.nome || usersByAuth[sellerId]?.nome || "—";
  };

  const myVendorFilterId = useMemo(() => {
    if (isAdmin) return "all";

    const hasUsersId = myUserId ? vendas.some((v) => (v.vendedor_id || "") === myUserId) : false;
    const hasAuthId = authUserId ? vendas.some((v) => (v.vendedor_id || "") === authUserId) : false;

    if (hasUsersId && myUserId) return myUserId;
    if (hasAuthId && authUserId) return authUserId;

    return myUserId || authUserId || "all";
  }, [isAdmin, myUserId, authUserId, vendas]);

  useEffect(() => {
    if (isAdmin) {
      setFVendedor("all");
      return;
    }
    setFVendedor(myVendorFilterId);
  }, [isAdmin, myVendorFilterId]);

  /* =========================
     Fetch principal (UI)
  ========================= */
  async function fetchAllUI() {
    if (!myUserId && !authUserId) return;

    setLoading(true);
    try {
      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, user_role, role, is_active")
        .order("nome", { ascending: true });

      if (usersErr) console.error("Erro users:", usersErr.message);
      else {
        const mapById: Record<string, UserRow> = {};
        const mapByAuth: Record<string, UserRow> = {};
        (usersData || []).forEach((u: any) => {
          if (u?.id) mapById[u.id] = u as UserRow;
          if (u?.auth_user_id) mapByAuth[u.auth_user_id] = u as UserRow;
        });
        setUsersMap(mapById);
        setUsersByAuth(mapByAuth);
      }

      const now = new Date();
      const defaultMin = addMonths(now, -24).toISOString();

      let q = supabase
        .from("vendas")
        .select(
          [
            "id",
            "vendedor_id",
            "administradora",
            "segmento",
            "tabela",
            "tipo_venda",
            "contemplada",
            "encarteirada_em",
            "cancelada_em",
            "codigo",
            "data_venda",
            "data_contemplacao",
            "contemplacao_tipo",
            "contemplacao_pct",
            "valor_venda",
            "lead_id",
            "numero_proposta",
            "grupo",
            "cota",
            "inad",
            "inad_em",
          ].join(",")
        )
        .order("encarteirada_em", { ascending: false })
        .gte("encarteirada_em", defaultMin);

      if (!isAdmin) {
        const parts: string[] = [];
        if (myUserId) parts.push(`vendedor_id.eq.${myUserId}`);
        if (authUserId) parts.push(`vendedor_id.eq.${authUserId}`);
        if (parts.length === 1) {
          const only = myUserId || authUserId!;
          q = q.eq("vendedor_id", only);
        } else if (parts.length > 1) {
          q = q.or(parts.join(","));
        }
      }

      const { data: vendasData, error: vendasErr } = await q;
      if (vendasErr) {
        console.error("Erro vendas:", vendasErr.message);
        setVendas([]);
        setLeadsMap({});
        return;
      }

      const list = (vendasData || []) as VendaRow[];
      setVendas(list);

      const leadIds = Array.from(new Set(list.map((v) => v.lead_id).filter(Boolean) as string[]));
      if (leadIds.length) {
        const chunkSize = 200;
        const map: Record<string, LeadRow> = {};
        for (let i = 0; i < leadIds.length; i += chunkSize) {
          const chunk = leadIds.slice(i, i + chunkSize);
          const { data: leadsData, error: leadsErr } = await supabase
            .from("leads")
            .select("id, nome, telefone, email, origem")
            .in("id", chunk);

          if (leadsErr) {
            console.error("Erro leads:", leadsErr.message);
            continue;
          }
          (leadsData || []).forEach((l: any) => {
            if (l?.id) map[l.id] = l as LeadRow;
          });
        }
        setLeadsMap(map);
      } else {
        setLeadsMap({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!myUserId && !authUserId) return;
    fetchAllUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, authUserId, isAdmin]);

  /* =========================
     Status
  ========================= */
  const isActive = (v: VendaRow) => v.codigo === "00" && !v.cancelada_em;
  const isCanceled = (v: VendaRow) => Boolean(v.cancelada_em) || (v.codigo !== null && v.codigo !== "00");

  function getStatus(v: VendaRow) {
    if (isCanceled(v)) return "Cancelada";
    if (isActive(v) && Boolean(v.inad)) return "Inadimplente";
    if (Boolean(v.contemplada)) return "Contemplada";
    if (isActive(v)) return "Ativa";
    return "—";
  }

  function getStatusDate(v: VendaRow) {
    const status = getStatus(v);
    if (status === "Cancelada") return v.cancelada_em;
    if (status === "Inadimplente") return v.inad_em || v.encarteirada_em;
    if (status === "Contemplada") return v.data_contemplacao || v.encarteirada_em;
    if (status === "Ativa") return v.encarteirada_em;
    return v.encarteirada_em || v.data_venda;
  }

  function getDiasInad(v: VendaRow) {
    if (!(isActive(v) && Boolean(v.inad))) return "";
    if (!v.inad_em) return "";
    return String(diffDaysLocal(v.inad_em, todayYMD));
  }

  /* =========================
     Filtros
  ========================= */
  const filtered = useMemo(() => {
    let rows = vendas.slice();

    if (dateStart) {
      const s = new Date(dateStart + "T00:00:00");
      const sMs = s.getTime();
      rows = rows.filter((v) => {
        if (!v.encarteirada_em) return false;
        const t = new Date(v.encarteirada_em).getTime();
        return Number.isFinite(t) && t >= sMs;
      });
    }
    if (dateEnd) {
      const e = new Date(dateEnd + "T23:59:59");
      const eMs = e.getTime();
      rows = rows.filter((v) => {
        if (!v.encarteirada_em) return false;
        const t = new Date(v.encarteirada_em).getTime();
        return Number.isFinite(t) && t <= eMs;
      });
    }

    if (fVendedor !== "all") rows = rows.filter((v) => (v.vendedor_id || "") === fVendedor);
    if (fAdmin !== "all") rows = rows.filter((v) => (v.administradora || "") === fAdmin);
    if (fSeg !== "all") rows = rows.filter((v) => (v.segmento || "") === fSeg);
    if (fTabela !== "all") rows = rows.filter((v) => (v.tabela || "") === fTabela);
    if (fTipoVenda !== "all") rows = rows.filter((v) => (v.tipo_venda || "") === fTipoVenda);
    if (fContemplada !== "all") {
      const want = fContemplada === "sim";
      rows = rows.filter((v) => Boolean(v.contemplada) === want);
    }

    return rows;
  }, [vendas, dateStart, dateEnd, fVendedor, fAdmin, fSeg, fTabela, fTipoVenda, fContemplada]);

  useEffect(() => setConcPage(1), [dateStart, dateEnd, fVendedor, fAdmin, fSeg, fTabela, fTipoVenda, fContemplada]);

  /* =========================
     Distintos selects
  ========================= */
  const distincts = useMemo(() => {
    const admins = new Set<string>();
    const segs = new Set<string>();
    const tabs = new Set<string>();
    const tipos = new Set<string>();
    const vends = new Set<string>();

    for (const v of vendas) {
      if (v.administradora) admins.add(v.administradora);
      if (v.segmento) segs.add(v.segmento);
      if (v.tabela) tabs.add(v.tabela);
      if (v.tipo_venda) tipos.add(v.tipo_venda);
      if (v.vendedor_id) vends.add(v.vendedor_id);
    }

    return {
      admins: Array.from(admins).sort(),
      segs: Array.from(segs).sort(),
      tabs: Array.from(tabs).sort(),
      tipos: Array.from(tipos).sort(),
      vends: Array.from(vends).sort(),
    };
  }, [vendas]);

  /* =========================
     Carteira totais
  ========================= */
  const totalsCarteira = useMemo(() => {
    const vendido = filtered.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const cancelado = filtered.filter(isCanceled).reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const ativoValue = filtered.filter(isActive).reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const inadValue = filtered.filter((v) => isActive(v) && Boolean(v.inad)).reduce((s, v) => s + safeNum(v.valor_venda), 0);

    return {
      vendido,
      cancelado,
      liquido: vendido - cancelado,
      ativoValue,
      inadValue,
      inadPct: ativoValue > 0 ? inadValue / ativoValue : 0,
    };
  }, [filtered]);

  /* =========================
     Inadimplência 12-6
  ========================= */
  const inad126 = useMemo(() => {
    const now = new Date();
    const semNow = getSemesterRange(now);
    const semPrev = getSemesterRange(addMonths(semNow.start, -6));
    const semPrevPrev = getSemesterRange(addMonths(semNow.start, -12));

    const inRange = (iso: string | null, start: Date, end: Date) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
    };

    const soldPrev = filtered.filter((v) => inRange(v.encarteirada_em, semPrev.start, semPrev.end));
    const canceledInNowFromPrev = soldPrev.filter((v) => inRange(v.cancelada_em, semNow.start, semNow.end));

    const soldPrevPrev = filtered.filter((v) => inRange(v.encarteirada_em, semPrevPrev.start, semPrevPrev.end));
    const canceledInPrevFromPrevPrev = soldPrevPrev.filter((v) => inRange(v.cancelada_em, semPrev.start, semPrev.end));

    const mk = (sold: VendaRow[], canceled: VendaRow[]) => {
      const soldValue = sold.reduce((s, v) => s + safeNum(v.valor_venda), 0);
      const cancelValue = canceled.reduce((s, v) => s + safeNum(v.valor_venda), 0);
      const pct = soldValue > 0 ? cancelValue / soldValue : 0;
      return { soldValue, cancelValue, pct };
    };

    return {
      nowLabel: semNow.label,
      prevLabel: semPrev.label,
      prevPrevLabel: semPrevPrev.label,
      currentWindow: mk(soldPrev, canceledInNowFromPrev),
      previousWindow: mk(soldPrevPrev, canceledInPrevFromPrevPrev),
    };
  }, [filtered]);

  /* =========================
     Inadimplência 8-2
  ========================= */
  const inad82 = useMemo(() => {
    const buckets = [
      { key: "0-7", label: "0–7", from: 0, to: 7 },
      { key: "8-15", label: "8–15", from: 8, to: 15 },
      { key: "16-30", label: "16–30", from: 16, to: 30 },
      { key: "31-60", label: "31–60", from: 31, to: 60 },
      { key: "61-90", label: "61–90", from: 61, to: 90 },
      { key: "90+", label: "90+", from: 91, to: 99999 },
    ];

    const inadAtivas = filtered.filter((v) => isActive(v) && Boolean(v.inad));
    const rows = buckets.map((b) => ({ faixa: b.label, qtd: 0 }));

    for (const v of inadAtivas) {
      if (!v.inad_em) continue;
      const dias = diffDaysLocal(v.inad_em, todayYMD);
      const idx = buckets.findIndex((b) => dias >= b.from && dias <= b.to);
      if (idx >= 0) rows[idx].qtd += 1;
    }

    const withDias = inadAtivas
      .map((v) => ({ v, dias: v.inad_em ? diffDaysLocal(v.inad_em, todayYMD) : 0 }))
      .sort((a, b) => b.dias - a.dias);

    const topRisco = withDias.slice(0, 10);
    const recem = withDias.filter((x) => x.dias <= 7).slice(0, 10);

    return { rows, topRisco, recem };
  }, [filtered, todayYMD]);

  /* =========================
     Prazo + contemplação por tipo
  ========================= */
  const prazo = useMemo(() => {
    const rowsPrazo = filtered.filter((v) => v.encarteirada_em && v.data_contemplacao);

    const daysAll = rowsPrazo
      .map((v) => {
        const dc = v.data_contemplacao ? `${v.data_contemplacao}T00:00:00.000Z` : null;
        if (!dc || !v.encarteirada_em) return 0;
        return diffDays(v.encarteirada_em, dc);
      })
      .filter((d) => d > 0)
      .sort((a, b) => a - b);

    const mean = daysAll.length ? daysAll.reduce((s, x) => s + x, 0) / daysAll.length : 0;
    const p50 = percentile(daysAll, 0.5);
    const p75 = percentile(daysAll, 0.75);

    const bySeg: Record<string, { list: { proposta: string; dias: number }[]; sum: number; n: number }> = {};
    const byAdm: Record<string, { list: { proposta: string; dias: number }[]; sum: number; n: number }> = {};

    rowsPrazo.forEach((v) => {
      const dc = v.data_contemplacao ? `${v.data_contemplacao}T00:00:00.000Z` : null;
      if (!dc || !v.encarteirada_em) return;
      const d = diffDays(v.encarteirada_em, dc);
      if (d <= 0) return;

      const seg = v.segmento || "—";
      const adm = v.administradora || "—";
      const proposta = v.numero_proposta || v.id;

      bySeg[seg] = bySeg[seg] || { list: [], sum: 0, n: 0 };
      bySeg[seg].list.push({ proposta, dias: d });
      bySeg[seg].sum += d;
      bySeg[seg].n += 1;

      byAdm[adm] = byAdm[adm] || { list: [], sum: 0, n: 0 };
      byAdm[adm].list.push({ proposta, dias: d });
      byAdm[adm].sum += d;
      byAdm[adm].n += 1;
    });

    const segChart = Object.entries(bySeg)
      .map(([name, obj]) => {
        const media = obj.n ? obj.sum / obj.n : 0;
        const sample = obj.list.sort((a, b) => b.dias - a.dias).slice(0, 5);
        return { name, media: Math.round(media), sample };
      })
      .sort((a, b) => b.media - a.media)
      .slice(0, 10);

    const admChart = Object.entries(byAdm)
      .map(([name, obj]) => {
        const media = obj.n ? obj.sum / obj.n : 0;
        const sample = obj.list.sort((a, b) => b.dias - a.dias).slice(0, 5);
        return { name, media: Math.round(media), sample };
      })
      .sort((a, b) => b.media - a.media)
      .slice(0, 10);

    const allowedTypes = ["Lance Livre", "Primeiro Lance Fixo", "Segundo Lance Fixo"];

    const byTipo: Record<string, { sum: number; n: number }> = {};
    const byTipoAdm: Record<string, Record<string, { sum: number; n: number }>> = {};

    rowsPrazo.forEach((v) => {
      const dc = v.data_contemplacao ? `${v.data_contemplacao}T00:00:00.000Z` : null;
      if (!dc || !v.encarteirada_em) return;
      const d = diffDays(v.encarteirada_em, dc);
      if (d <= 0) return;

      const tipoRaw = (v.contemplacao_tipo || "").toString().trim();
      const tipo = allowedTypes.includes(tipoRaw) ? tipoRaw : "Lance Livre";

      byTipo[tipo] = byTipo[tipo] || { sum: 0, n: 0 };
      byTipo[tipo].sum += d;
      byTipo[tipo].n += 1;

      const adm = v.administradora || "—";
      byTipoAdm[adm] = byTipoAdm[adm] || {};
      byTipoAdm[adm][tipo] = byTipoAdm[adm][tipo] || { sum: 0, n: 0 };
      byTipoAdm[adm][tipo].sum += d;
      byTipoAdm[adm][tipo].n += 1;
    });

    const tipoChart = allowedTypes.map((t) => ({
      tipo: t,
      media: Math.round(byTipo[t]?.n ? byTipo[t].sum / byTipo[t].n : 0),
    }));

    const tipoPorAdmChart = Object.entries(byTipoAdm)
      .map(([adm, obj]) => {
        const row: any = { adm };
        for (const t of allowedTypes) {
          const it = obj[t];
          row[t] = Math.round(it?.n ? it.sum / it.n : 0);
        }
        return row;
      })
      .sort((a, b) => (b["Lance Livre"] || 0) - (a["Lance Livre"] || 0))
      .slice(0, 12);

    const baseAll = filtered.filter((v) => !!v.encarteirada_em);
    const totalBase = baseAll.length;

    const contemplatedAll = baseAll.filter((v) => Boolean(v.contemplada)).length;

    const contemplatedByTipo: Record<string, number> = {};
    const totalByAdm: Record<string, number> = {};
    const contemplatedByAdmTipo: Record<string, Record<string, number>> = {};

    baseAll.forEach((v) => {
      const adm = v.administradora || "—";
      totalByAdm[adm] = (totalByAdm[adm] || 0) + 1;

      if (!Boolean(v.contemplada)) return;

      const tipoRaw = (v.contemplacao_tipo || "").toString().trim();
      const tipo = allowedTypes.includes(tipoRaw) ? tipoRaw : "Lance Livre";

      contemplatedByTipo[tipo] = (contemplatedByTipo[tipo] || 0) + 1;

      contemplatedByAdmTipo[adm] = contemplatedByAdmTipo[adm] || {};
      contemplatedByAdmTipo[adm][tipo] = (contemplatedByAdmTipo[adm][tipo] || 0) + 1;
    });

    const tipoRateChart = allowedTypes.map((tipo) => {
      const qtd = contemplatedByTipo[tipo] || 0;
      const taxa100 = totalBase > 0 ? (qtd / totalBase) * 100 : 0;
      const shareContempladas100 = contemplatedAll > 0 ? (qtd / contemplatedAll) * 100 : 0;
      return { tipo, qtd, taxa100, shareContempladas100 };
    });

    const tipoRatePorAdmChart = Object.keys(totalByAdm)
      .map((adm) => {
        const tot = totalByAdm[adm] || 0;
        const row: any = { adm, total: tot };
        let sumTipos = 0;

        for (const t of allowedTypes) {
          const qtd = contemplatedByAdmTipo[adm]?.[t] || 0;
          const pct100 = tot > 0 ? (qtd / tot) * 100 : 0;
          row[t] = pct100;
          sumTipos += qtd;
        }

        row.taxa_total_cont100 = tot > 0 ? (sumTipos / tot) * 100 : 0;
        return row;
      })
      .sort((a, b) => (b.taxa_total_cont100 || 0) - (a.taxa_total_cont100 || 0))
      .slice(0, 12);

    return {
      mean,
      p50,
      p75,
      segChart,
      admChart,
      tipoChart,
      tipoPorAdmChart,
      tipoRateChart,
      tipoRatePorAdmChart,
      totalBase,
      contemplatedAll,
    };
  }, [filtered]);

  /* =========================
     Clientes
  ========================= */
  const clientes = useMemo(() => {
    const byLead: Record<string, { hasActive: boolean; hasCanceled: boolean; hasInad: boolean }> = {};

    for (const v of filtered) {
      if (!v.lead_id) continue;
      const k = v.lead_id;
      byLead[k] = byLead[k] || { hasActive: false, hasCanceled: false, hasInad: false };
      if (isActive(v)) byLead[k].hasActive = true;
      if (isCanceled(v)) byLead[k].hasCanceled = true;
      if (isActive(v) && Boolean(v.inad)) byLead[k].hasInad = true;
    }

    const total = Object.keys(byLead).length;
    const ativos = Object.values(byLead).filter((x) => x.hasActive).length;
    const inadimplentes = Object.values(byLead).filter((x) => x.hasInad).length;
    const inativos = total - ativos;
    const pctAtivos = total > 0 ? ativos / total : 0;

    return { total, ativos, inadimplentes, inativos, pctAtivos };
  }, [filtered]);

  /* =========================
     Carteira série mensal
  ========================= */
  const carteiraSerie = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = addMonths(now, -i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
    }

    const map: Record<string, { vendido: number; cancelado: number }> = {};
    keys.forEach((k) => (map[k] = { vendido: 0, cancelado: 0 }));

    filtered.forEach((v) => {
      const mk = monthKeyFromISO(v.encarteirada_em);
      if (mk && map[mk]) map[mk].vendido += safeNum(v.valor_venda);

      const ck = monthKeyFromISO(v.cancelada_em);
      if (ck && map[ck]) map[ck].cancelado += safeNum(v.valor_venda);
    });

    return keys.map((k) => {
      const vendido = map[k]?.vendido || 0;
      const cancelado = map[k]?.cancelado || 0;
      return { mes: k, vendido, cancelado, liquido: vendido - cancelado };
    });
  }, [filtered]);

  /* =========================
     Distribuição por segmento
  ========================= */
  const distSegmento = useMemo(() => {
    const by: Record<string, number> = {};
    filtered.filter(isActive).forEach((v) => {
      const s = v.segmento || "—";
      by[s] = (by[s] || 0) + safeNum(v.valor_venda);
    });

    const total = Object.values(by).reduce((s, x) => s + x, 0);
    const rows = Object.entries(by)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? value / total : 0 }))
      .sort((a, b) => b.value - a.value);

    return { rows, total };
  }, [filtered]);

  /* =========================
     Concentração
  ========================= */
  const concRows = useMemo(() => {
    const byLead: Record<string, { lead_id: string; value: number; count: number; sellers: Set<string> }> = {};
    const ativos = filtered.filter(isActive);

    for (const v of ativos) {
      if (!v.lead_id) continue;
      const k = v.lead_id;
      byLead[k] = byLead[k] || { lead_id: k, value: 0, count: 0, sellers: new Set() };
      byLead[k].value += safeNum(v.valor_venda);
      byLead[k].count += 1;
      if (v.vendedor_id) byLead[k].sellers.add(v.vendedor_id);
    }

    const ativoTotal = totalsCarteira.ativoValue || 0;

    return Object.values(byLead)
      .map((x) => {
        const pct = ativoTotal > 0 ? x.value / ativoTotal : 0;
        return { ...x, pct, alerta: pct >= CONCENTRACAO_ALERTA };
      })
      .sort((a, b) => b.value - a.value);
  }, [filtered, totalsCarteira.ativoValue]);

  const concKpis = useMemo(() => {
    const acima = concRows.filter((x) => x.alerta);
    const acimaPct = acima.reduce((s, x) => s + x.pct, 0);
    const top1 = concRows[0]?.pct || 0;
    return { acimaCount: acima.length, acimaPct, top1 };
  }, [concRows]);

  const paretoData = useMemo(() => {
    const top10 = concRows.slice(0, 10);
    const sumTop10 = top10.reduce((s, x) => s + x.pct, 0);
    const restoPct = Math.max(0, 1 - sumTop10);

    let cum = 0;
    const rows = top10.map((r) => {
      cum += r.pct;
      const lead = leadsMap[r.lead_id];
      const nm = (lead?.nome || "Cliente").toString();
      const label = nm.slice(0, 18) + (nm.length > 18 ? "…" : "");
      return { name: label, pct100: r.pct * 100, cum100: cum * 100 };
    });

    rows.push({ name: "Resto", pct100: restoPct * 100, cum100: 100 });

    return { rows, sumTop10, restoPct };
  }, [concRows, leadsMap]);

  const lorenz = useMemo(() => {
    const total = totalsCarteira.ativoValue || 0;
    const n = concRows.length || 0;
    if (!total || !n) return { points: [] as any[] };

    const sorted = concRows.slice().sort((a, b) => a.value - b.value);
    let cumValue = 0;
    const points = [{ x: 0, y: 0 }];

    sorted.forEach((r, i) => {
      cumValue += r.value;
      const x = (i + 1) / n;
      const y = cumValue / total;
      points.push({ x, y });
    });

    return { points };
  }, [concRows, totalsCarteira.ativoValue]);

  const heat = useMemo(() => {
    const buckets = [
      { key: "0-1", label: "0–1%", from: 0, to: 0.01 },
      { key: "1-2", label: "1–2%", from: 0.01, to: 0.02 },
      { key: "2-5", label: "2–5%", from: 0.02, to: 0.05 },
      { key: "5-10", label: "5–10%", from: 0.05, to: 0.1 },
      { key: "10-20", label: "10–20%", from: 0.1, to: 0.2 },
      { key: "20+", label: "20%+", from: 0.2, to: 1.0 },
    ];

    const counts = buckets.map((b) => ({ ...b, qtd: 0 }));
    for (const r of concRows) {
      const idx = counts.findIndex((b) => r.pct >= b.from && r.pct < b.to);
      if (idx >= 0) counts[idx].qtd += 1;
      else if (r.pct >= 0.2) counts[counts.length - 1].qtd += 1;
    }

    const max = Math.max(1, ...counts.map((c) => c.qtd));
    return counts.map((c) => ({ ...c, intensity: c.qtd / max }));
  }, [concRows]);

  /* =========================
     Dialog concentração
  ========================= */
  const leadDialogVendas = useMemo(() => {
    if (!leadDialogId) return [];
    return filtered.filter((v) => v.lead_id === leadDialogId);
  }, [filtered, leadDialogId]);

  const leadDialogAtivoTotal = useMemo(() => {
    return leadDialogVendas.filter(isActive).reduce((s, v) => s + safeNum(v.valor_venda), 0);
  }, [leadDialogVendas]);

  const leadDialogPct = useMemo(() => {
    const total = totalsCarteira.ativoValue || 0;
    return total > 0 ? leadDialogAtivoTotal / total : 0;
  }, [leadDialogAtivoTotal, totalsCarteira.ativoValue]);

  const leadName = (lid: string | null) => {
    if (!lid) return "—";
    return leadsMap[lid]?.nome || lid;
  };

  const vendedorSelectDisabled = !isAdmin;

  const concTotalPages = Math.max(1, Math.ceil(concRows.length / concPageSize));
  const concSlice = concRows.slice((concPage - 1) * concPageSize, concPage * concPageSize);

  /* =========================
     Helpers exportação
  ========================= */
  function applySellerSecurity<T extends { vendedor_id: string | null }>(rows: T[]) {
    if (isAdmin) return rows;
    return rows.filter((v) => {
      const sid = v.vendedor_id || "";
      return sid === myUserId || sid === authUserId;
    });
  }

  function applyGlobalFiltersOnVendas(rows: VendaRow[]) {
    let list = rows.slice();

    if (fVendedor !== "all") list = list.filter((v) => (v.vendedor_id || "") === fVendedor);
    if (fAdmin !== "all") list = list.filter((v) => (v.administradora || "") === fAdmin);
    if (fSeg !== "all") list = list.filter((v) => (v.segmento || "") === fSeg);
    if (fTabela !== "all") list = list.filter((v) => (v.tabela || "") === fTabela);
    if (fTipoVenda !== "all") list = list.filter((v) => (v.tipo_venda || "") === fTipoVenda);
    if (fContemplada !== "all") {
      const want = fContemplada === "sim";
      list = list.filter((v) => Boolean(v.contemplada) === want);
    }

    if (dateStart) {
      const s = new Date(dateStart + "T00:00:00").getTime();
      list = list.filter((v) => {
        if (!v.encarteirada_em) return false;
        const t = new Date(v.encarteirada_em).getTime();
        return Number.isFinite(t) && t >= s;
      });
    }

    if (dateEnd) {
      const e = new Date(dateEnd + "T23:59:59").getTime();
      list = list.filter((v) => {
        if (!v.encarteirada_em) return false;
        const t = new Date(v.encarteirada_em).getTime();
        return Number.isFinite(t) && t <= e;
      });
    }

    return list;
  }

  async function fetchAllVendasForExport() {
    let q = supabase
      .from("vendas")
      .select(
        [
          "id",
          "vendedor_id",
          "administradora",
          "segmento",
          "tabela",
          "tipo_venda",
          "contemplada",
          "encarteirada_em",
          "cancelada_em",
          "codigo",
          "data_venda",
          "data_contemplacao",
          "contemplacao_tipo",
          "contemplacao_pct",
          "valor_venda",
          "lead_id",
          "numero_proposta",
          "grupo",
          "cota",
          "inad",
          "inad_em",
        ].join(",")
      )
      .order("encarteirada_em", { ascending: false });

    if (!isAdmin) {
      const parts: string[] = [];
      if (myUserId) parts.push(`vendedor_id.eq.${myUserId}`);
      if (authUserId) parts.push(`vendedor_id.eq.${authUserId}`);
      if (parts.length === 1) {
        q = q.eq("vendedor_id", myUserId || authUserId!);
      } else if (parts.length > 1) {
        q = q.or(parts.join(","));
      }
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data || []) as VendaRow[];
  }

  async function ensureUsersAndLeadsMaps(localVendas: VendaRow[]) {
    const localUsersById: Record<string, UserRow> = { ...usersMap };
    const localUsersByAuth: Record<string, UserRow> = { ...usersByAuth };
    const localLeads: Record<string, LeadRow> = { ...leadsMap };

    const vendorIds = Array.from(new Set(localVendas.map((v) => v.vendedor_id).filter(Boolean) as string[]));
    if (vendorIds.length) {
      const { data: uData } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, user_role, role, is_active")
        .or(`id.in.(${vendorIds.join(",")}),auth_user_id.in.(${vendorIds.join(",")})`);

      if (uData?.length) {
        uData.forEach((u: any) => {
          if (u?.id) localUsersById[u.id] = u;
          if (u?.auth_user_id) localUsersByAuth[u.auth_user_id] = u;
        });
        setUsersMap(localUsersById);
        setUsersByAuth(localUsersByAuth);
      }
    }

    const leadIds = Array.from(new Set(localVendas.map((v) => v.lead_id).filter(Boolean) as string[]));
    if (leadIds.length) {
      const chunkSize = 200;
      for (let i = 0; i < leadIds.length; i += chunkSize) {
        const chunk = leadIds.slice(i, i + chunkSize);
        const { data: lData } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, origem")
          .in("id", chunk);

        lData?.forEach((l: any) => {
          localLeads[l.id] = l;
        });
      }
      setLeadsMap(localLeads);
    }

    const localVendorName = (sellerId: string | null) => {
      if (!sellerId) return "—";
      return localUsersById[sellerId]?.nome || localUsersByAuth[sellerId]?.nome || "—";
    };

    const localLeadName = (leadId: string | null) => {
      if (!leadId) return "—";
      return localLeads[leadId]?.nome || leadId;
    };

    return {
      localUsersById,
      localUsersByAuth,
      localLeads,
      localVendorName,
      localLeadName,
    };
  }

  /* =========================
     Export (histórico + novos relatórios)
  ========================= */
  async function exportReport() {
    if (!myUserId && !authUserId) return;

    setExportLoading(true);
    try {
      if (!exportStatusStart || !exportStatusEnd) {
        alert("Informe a data inicial e final do intervalo do relatório.");
        return;
      }

      const startYmd = exportStatusStart;
      const endYmd = exportStatusEnd;

      // Relatórios baseados na tabela vendas
      if (["vendas", "canceladas", "contempladas", "inadimplentes"].includes(exportType)) {
        let rows = await fetchAllVendasForExport();
        rows = applyGlobalFiltersOnVendas(rows);

        const { localVendorName, localLeadName } = await ensureUsersAndLeadsMaps(rows);

        if (exportType === "canceladas") rows = rows.filter((v) => getStatus(v) === "Cancelada");
        if (exportType === "inadimplentes") rows = rows.filter((v) => getStatus(v) === "Inadimplente");
        if
