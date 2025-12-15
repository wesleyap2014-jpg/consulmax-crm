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

const CONCENTRACAO_ALERTA = 0.10; // 10%

/* =========================
   Tipos (DB)
========================= */
type UUID = string;

type VendaRow = {
  id: UUID;
  vendedor_id: UUID | null; // IMPORTANT: referencia users.id

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
  id: UUID; // IMPORTANT
  auth_user_id: UUID;
  nome: string | null;
  user_role?: string | null;
  role?: string | null;
  is_active?: boolean | null;
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

/* =========================
   Excel (XLS via HTML table)
========================= */
function escapeHtml(v: any) {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadXls(filename: string, headers: string[], rows: any[][]) {
  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");

  const html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
          <x:Name>Relatorio</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
      </xml><![endif]-->
    </head>
    <body>
      <table border="1">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </body>
  </html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
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

  const [fVendedor, setFVendedor] = useState<string>("all"); // users.id
  const [fAdmin, setFAdmin] = useState<string>("all");
  const [fSeg, setFSeg] = useState<string>("all");
  const [fTabela, setFTabela] = useState<string>("all");
  const [fTipoVenda, setFTipoVenda] = useState<string>("all");
  const [fContemplada, setFContemplada] = useState<string>("all"); // all|sim|nao

  // dados
  const [loading, setLoading] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
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
  const [exportType, setExportType] = useState<"vendas" | "canceladas" | "contempladas" | "inadimplentes">("vendas");
  const [exportStatusStart, setExportStatusStart] = useState<string>("");
  const [exportStatusEnd, setExportStatusEnd] = useState<string>("");

  const todayYMD = useMemo(() => todayLocalYMD(), []);

  /* =========================
     Carrega auth + role (corrigido)
     - authUserId: supabase auth user id
     - myUserId: users.id (referência usada em vendas.vendedor_id)
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

  // default do filtro vendedor:
  // - admin: all
  // - vendedor: meu users.id
  useEffect(() => {
    if (!myUserId) return;
    if (isAdmin) setFVendedor("all");
    else setFVendedor(myUserId);
  }, [isAdmin, myUserId]);

  /* =========================
     Fetch principal (UI)
     - Admin: tudo (sem filtro vendedor)
     - Vendedor: somente dele (vendas.vendedor_id = myUserId)
  ========================= */
  async function fetchAllUI() {
    if (!myUserId) return;

    setLoading(true);
    try {
      // users (nome do vendedor) - mapeando por users.id
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

      // vendas (UI: performance, últimos 24 meses)
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

      if (!isAdmin) q = q.eq("vendedor_id", myUserId);

      const { data: vendasData, error: vendasErr } = await q;
      if (vendasErr) {
        console.error("Erro vendas:", vendasErr.message);
        setVendas([]);
        setLeadsMap({});
        return;
      }

      const list = (vendasData || []) as VendaRow[];
      setVendas(list);

      // leads usados
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
    if (!myUserId) return;
    fetchAllUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, isAdmin]);

  /* =========================
     Status (UI e export)
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

    // período (encarteirada_em)
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

    // vendedor é users.id
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
     Inadimplência 12-6 (VALOR)
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
     Inadimplência 8-2 (aging por inad_em)
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
     Prazo + contemplação por tipo (melhorado)
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

    // por segmento/admin com amostras (proposta + prazo)
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

    // tipos de lance (conforme schema)
    const allowedTypes = ["Lance Livre", "Primeiro Lance Fixo", "Segundo Lance Fixo"];

    // prazo médio por tipo (somente contempladas com datas)
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

    // =========================
    // Taxa de contemplação por tipo (do total no filtro)
    // =========================
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
     Clientes (via lead_id)
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
     Carteira série mensal (12 meses)
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
     Distribuição por segmento (carteira ativa)
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
     Concentração (Pareto + Lorenz + Heat)
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
      const x = (i + 1) / n; // % clientes
      const y = cumValue / total; // % valor
      points.push({ x, y });
    });

    return { points };
  }, [concRows, totalsCarteira.ativoValue]);

  const heat = useMemo(() => {
    const buckets = [
      { key: "0-1", label: "0–1%", from: 0, to: 0.01 },
      { key: "1-2", label: "1–2%", from: 0.01, to: 0.02 },
      { key: "2-5", label: "2–5%", from: 0.02, to: 0.05 },
      { key: "5-10", label: "5–10%", from: 0.05, to: 0.10 },
      { key: "10-20", label: "10–20%", from: 0.10, to: 0.20 },
      { key: "20+", label: "20%+", from: 0.20, to: 1.0 },
    ];

    const counts = buckets.map((b) => ({ ...b, qtd: 0 }));
    for (const r of concRows) {
      const idx = counts.findIndex((b) => r.pct >= b.from && r.pct < b.to);
      if (idx >= 0) counts[idx].qtd += 1;
      else if (r.pct >= 0.20) counts[counts.length - 1].qtd += 1;
    }

    const max = Math.max(1, ...counts.map((c) => c.qtd));
    return counts.map((c) => ({ ...c, intensity: c.qtd / max }));
  }, [concRows]);

  /* =========================
     Dialog concentração (detalhes)
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

  /* =========================
     UI helpers
========================= */
  const vendorName = (userId: string | null) => {
    if (!userId) return "—";
    return usersMap[userId]?.nome || "—";
  };

  const leadName = (lid: string | null) => {
    if (!lid) return "—";
    return leadsMap[lid]?.nome || lid;
  };

  const vendedorSelectDisabled = !isAdmin;

  const concTotalPages = Math.max(1, Math.ceil(concRows.length / concPageSize));
  const concSlice = concRows.slice((concPage - 1) * concPageSize, concPage * concPageSize);

  /* =========================
     Export (histórico completo)
========================= */
  async function exportReport() {
    if (!myUserId) return;

    setExportLoading(true);
    try {
      // base query: SEM limite 24 meses
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
            "inad",
            "inad_em",
          ].join(",")
        )
        .order("encarteirada_em", { ascending: false });

      // trava por perfil
      if (!isAdmin) q = q.eq("vendedor_id", myUserId);

      // filtros globais
      if (fVendedor !== "all") q = q.eq("vendedor_id", fVendedor);
      if (fAdmin !== "all") q = q.eq("administradora", fAdmin);
      if (fSeg !== "all") q = q.eq("segmento", fSeg);
      if (fTabela !== "all") q = q.eq("tabela", fTabela);
      if (fTipoVenda !== "all") q = q.eq("tipo_venda", fTipoVenda);
      if (fContemplada !== "all") q = q.eq("contemplada", fContemplada === "sim");

      if (dateStart) q = q.gte("encarteirada_em", new Date(dateStart + "T00:00:00").toISOString());
      if (dateEnd) q = q.lte("encarteirada_em", new Date(dateEnd + "T23:59:59").toISOString());

      const { data, error } = await q;
      if (error) throw error;

      const list = (data || []) as VendaRow[];

      // carregar users faltantes
      const vendorIds = Array.from(new Set(list.map((v) => v.vendedor_id).filter(Boolean) as string[]));
      if (vendorIds.length) {
        const { data: uData } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, user_role, role, is_active")
          .in("id", vendorIds);

        if (uData?.length) {
          const mId = { ...usersMap };
          const mAuth = { ...usersByAuth };
          uData.forEach((u: any) => {
            if (u?.id) mId[u.id] = u;
            if (u?.auth_user_id) mAuth[u.auth_user_id] = u;
          });
          setUsersMap(mId);
          setUsersByAuth(mAuth);
        }
      }

      // carregar leads faltantes
      const leadIds = Array.from(new Set(list.map((v) => v.lead_id).filter(Boolean) as string[]));
      if (leadIds.length) {
        const chunkSize = 200;
        const m = { ...leadsMap };
        for (let i = 0; i < leadIds.length; i += chunkSize) {
          const chunk = leadIds.slice(i, i + chunkSize);
          const { data: lData } = await supabase
            .from("leads")
            .select("id, nome, telefone, email, origem")
            .in("id", chunk);

          lData?.forEach((l: any) => (m[l.id] = l));
        }
        setLeadsMap(m);
      }

      // aplica tipo do relatório
      let rows = list.slice();
      if (exportType === "canceladas") rows = rows.filter((v) => getStatus(v) === "Cancelada");
      if (exportType === "inadimplentes") rows = rows.filter((v) => getStatus(v) === "Inadimplente");
      if (exportType === "contempladas") rows = rows.filter((v) => getStatus(v) === "Contemplada");

      // filtro por "data do status"
      const sStart = exportStatusStart ? parseLocalDate(exportStatusStart).getTime() : null;
      const sEnd = exportStatusEnd ? new Date(exportStatusEnd + "T23:59:59").getTime() : null;

      if (sStart || sEnd) {
        rows = rows.filter((v) => {
          const sd = getStatusDate(v);
          if (!sd) return false;
          const t = new Date(sd).getTime();
          if (!Number.isFinite(t)) return false;
          if (sStart && t < sStart) return false;
          if (sEnd && t > sEnd) return false;
          return true;
        });
      }

      // HEADERS (VENDAS agora inclui Cliente + Proposta)
      const headers = [
        "Vendedor",
        "Cliente",
        "Número da Proposta",
        "Administradora",
        "Segmento",
        "Tabela",
        "Valor",
        "Data da Venda",
        "Data do Encarteiramento",
        "Status",
        "Data do Status",
        "Dias de Inadimplência",
      ];

      const body = rows.map((v) => {
        const status = getStatus(v);
        const statusDate = getStatusDate(v);
        const cliente = v.lead_id ? (leadsMap[v.lead_id]?.nome || v.lead_id) : "";
        const proposta = v.numero_proposta || "";

        return [
          vendorName(v.vendedor_id),
          cliente,
          proposta,
          v.administradora || "",
          v.segmento || "",
          v.tabela || "",
          fmtBRL(safeNum(v.valor_venda)),
          fmtDateBR(v.data_venda),
          fmtDateBR(v.encarteirada_em),
          status,
          fmtDateBR(statusDate),
          getDiasInad(v),
        ];
      });

      const nameMap: Record<string, string> = {
        vendas: "Relatorio_Vendas",
        canceladas: "Relatorio_Canceladas",
        contempladas: "Relatorio_Contempladas",
        inadimplentes: "Relatorio_Inadimplentes",
      };

      downloadXls(`${nameMap[exportType]}_${todayYMD}.xls`, headers, body);
      setExportOpen(false);
    } catch (e: any) {
      console.error("Erro ao exportar relatório:", e?.message || e);
      alert("Não foi possível gerar o relatório. Verifique o console para detalhes.");
    } finally {
      setExportLoading(false);
    }
  }

  /* =========================
     UI
========================= */
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: C.navy }}>
            Relatórios
          </h1>
          <p className="text-sm" style={{ color: C.muted }}>
            Indicadores e análises da Consulmax
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setExportOpen(true)}
          disabled={!myUserId}
          className="rounded-xl"
        >
          <Download className="h-4 w-4 mr-2" />
          Extrair Relatório
        </Button>
      </div>

      {/* Filtros globais */}
      <GlassCard>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: C.navy }}>
            Filtros globais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Início
              </div>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Fim
              </div>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Vendedor
              </div>
              <Select value={fVendedor} onValueChange={setFVendedor} disabled={vendedorSelectDisabled}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.vends
                    .filter((id) => {
                      const u = usersMap[id];
                      // opcional: esconder inativos da lista (não afeta admin ver dados)
                      return u ? u.is_active !== false : true;
                    })
                    .map((id) => (
                      <SelectItem key={id} value={id}>
                        {vendorName(id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Administradora
              </div>
              <Select value={fAdmin} onValueChange={setFAdmin}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {distincts.admins.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Segmento
              </div>
              <Select value={fSeg} onValueChange={setFSeg}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.segs.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Tabela
              </div>
              <Select value={fTabela} onValueChange={setFTabela}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {distincts.tabs.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Tipo de venda
              </div>
              <Select value={fTipoVenda} onValueChange={setFTipoVenda}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.tipos.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                Contemplada
              </div>
              <Select value={fContemplada} onValueChange={setFContemplada}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 flex items-end">
              <Button
                variant="outline"
                className="rounded-xl w-full"
                onClick={() => {
                  setDateStart("");
                  setDateEnd("");
                  setFAdmin("all");
                  setFSeg("all");
                  setFTabela("all");
                  setFTipoVenda("all");
                  setFContemplada("all");
                  if (isAdmin) setFVendedor("all");
                  else if (myUserId) setFVendedor(myUserId);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </GlassCard>

      {/* KPIs gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>
              Carteira ativa
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.ativoValue)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>
              Total vendido (filtro)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.vendido)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>
              Total cancelado (filtro)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.cancelado)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>
              Carteira inadimplente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtPctHuman(totalsCarteira.inadPct, 1)}
          </CardContent>
        </GlassCard>
      </div>

      <Tabs defaultValue="concentracao" className="space-y-3">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="inad126">Inadimplência 12-6</TabsTrigger>
          <TabsTrigger value="inad82">Inadimplência 8-2</TabsTrigger>
          <TabsTrigger value="prazo">Prazo</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="concentracao">Concentração</TabsTrigger>
        </TabsList>

        {/* 12-6 (VALOR + % no centro) */}
        <TabsContent value="inad126" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                title: `Semestre anterior (${inad126.prevLabel})`,
                soldValue: inad126.previousWindow.soldValue,
                cancelValue: inad126.previousWindow.cancelValue,
                pct: inad126.previousWindow.pct,
              },
              {
                title: `Semestre atual (${inad126.nowLabel})`,
                soldValue: inad126.currentWindow.soldValue,
                cancelValue: inad126.currentWindow.cancelValue,
                pct: inad126.currentWindow.pct,
              },
            ].map((x) => {
              const alarm = x.pct > 0.30;
              const restante = Math.max(0, x.soldValue - x.cancelValue);

              const pieData = [
                { name: "Vendido", value: restante },
                { name: "Cancelado", value: x.cancelValue },
              ];

              return (
                <GlassCard key={x.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between" style={{ color: C.navy }}>
                      <span>{x.title}</span>
                      {alarm ? (
                        <Badge tone="danger">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          Alarmante
                        </Badge>
                      ) : (
                        <Badge tone="ok">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          OK
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>

                  {/* ✅ FIX: não estoura mais pra fora */}
                  <CardContent className="space-y-2">
                    <div className="h-[240px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                            <Cell fill={C.navy} />
                            <Cell fill={C.rubi} />
                          </Pie>
                          <RTooltip formatter={(v: any, n: any) => [fmtBRL(safeNum(v)), String(n)]} />
                          <Legend />
                          <text
                            x="50%"
                            y="50%"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ fill: C.navy, fontWeight: 800, fontSize: 18 }}
                          >
                            {fmtPctHuman(x.pct, 1)}
                          </text>
                          <text
                            x="50%"
                            y="58%"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ fill: C.muted, fontWeight: 700, fontSize: 11 }}
                          >
                            cancelado
                          </text>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-sm" style={{ color: C.navy }}>
                      <span>
                        Vendido: <b>{fmtBRL(x.soldValue)}</b>
                      </span>
                      <span>
                        Cancelado: <b>{fmtBRL(x.cancelValue)}</b>
                      </span>
                    </div>
                  </CardContent>
                </GlassCard>
              );
            })}
          </div>
        </TabsContent>

        {/* 8-2 */}
        <TabsContent value="inad82" className="space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Inadimplência 8-2
              </CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  % carteira inadimplente
                </div>
                <div className="text-3xl font-extrabold mt-1" style={{ color: C.navy }}>
                  {fmtPctHuman(totalsCarteira.inadPct, 1)}
                </div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  {fmtBRL(totalsCarteira.inadValue)} / {fmtBRL(totalsCarteira.ativoValue)}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div className="text-xs font-semibold" style={{ color: C.muted }}>
                    Cotas recém-inadimplentes
                  </div>
                  <div className="space-y-1">
                    {inad82.recem.length === 0 ? (
                      <div className="text-xs" style={{ color: C.muted }}>
                        —
                      </div>
                    ) : (
                      inad82.recem.map(({ v, dias }) => (
                        <div key={v.id} className="text-xs flex items-center justify-between" style={{ color: C.navy }}>
                          <span className="truncate max-w-[70%]">
                            {leadName(v.lead_id)} • {v.grupo || "—"}/{v.cota || "—"}
                          </span>
                          <Badge tone="info">{dias}d</Badge>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="text-xs font-semibold mt-2" style={{ color: C.muted }}>
                    Top cotas em risco
                  </div>
                  <div className="space-y-1">
                    {inad82.topRisco.length === 0 ? (
                      <div className="text-xs" style={{ color: C.muted }}>
                        —
                      </div>
                    ) : (
                      inad82.topRisco.map(({ v, dias }) => (
                        <div key={v.id} className="text-xs flex items-center justify-between" style={{ color: C.navy }}>
                          <span className="truncate max-w-[70%]">
                            {leadName(v.lead_id)} • {v.grupo || "—"}/{v.cota || "—"}
                          </span>
                          <Badge tone="danger">{dias}d</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl border" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Faixas de atraso
                </div>

                <div className="h-[240px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={inad82.rows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="faixa" />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="qtd" fill={C.rubi} radius={[8, 8, 0, 0]}>
                        <LabelList dataKey="qtd" position="top" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Prazo */}
        <TabsContent value="prazo" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Média (dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.mean || 0)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Mediana P50 (dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.p50 || 0)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  P75 (dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.p75 || 0)}
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Prazo por segmento (média)
                </CardTitle>
              </CardHeader>

              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.segChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <RTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div className="rounded-xl border px-3 py-2 text-xs bg-white/90" style={{ borderColor: C.border, color: C.navy }}>
                            <div className="font-bold">{p.name}</div>
                            <div>
                              Média: <b>{p.media}</b> dias
                            </div>
                            <div className="mt-2 font-semibold" style={{ color: C.muted }}>
                              Amostras (proposta • prazo)
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {(p.sample || []).slice(0, 5).map((s: any, i: number) => (
                                <div key={i}>
                                  {s.proposta} • <b>{s.dias} dias</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="media" fill={C.navy} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="media" position="top" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Prazo por administradora (média)
                </CardTitle>
              </CardHeader>

              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.admChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <RTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div className="rounded-xl border px-3 py-2 text-xs bg-white/90" style={{ borderColor: C.border, color: C.navy }}>
                            <div className="font-bold">{p.name}</div>
                            <div>
                              Média: <b>{p.media}</b> dias
                            </div>
                            <div className="mt-2 font-semibold" style={{ color: C.muted }}>
                              Amostras (proposta • prazo)
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {(p.sample || []).slice(0, 5).map((s: any, i: number) => (
                                <div key={i}>
                                  {s.proposta} • <b>{s.dias} dias</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="media" fill={C.gold} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="media" position="top" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Prazo médio por tipo de lance
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.tipoChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tipo" />
                    <YAxis />
                    <RTooltip />
                    <Bar dataKey="media" fill={C.navy} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="media" position="top" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Prazo médio por tipo de lance por administradora
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.tipoPorAdmChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="adm" hide />
                    <YAxis />
                    <RTooltip />
                    <Legend />
                    <Bar dataKey="Lance Livre" fill={C.navy} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="Lance Livre" position="top" />
                    </Bar>
                    <Bar dataKey="Primeiro Lance Fixo" fill={C.gold} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="Primeiro Lance Fixo" position="top" />
                    </Bar>
                    <Bar dataKey="Segundo Lance Fixo" fill={C.rubi} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="Segundo Lance Fixo" position="top" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>
          </div>

          {/* ✅ NOVO: Taxa de contemplação por tipo + por administradora */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Taxa de contemplação por tipo de lance
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="text-xs mb-2" style={{ color: C.muted }}>
                  Base: {prazo.totalBase || 0} vendas no filtro • Contempladas: {prazo.contemplatedAll || 0}
                </div>

                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prazo.tipoRateChart || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tipo" />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => fmtPct100Human(Number(v), 2)} />
                      <RTooltip
                        formatter={(v: any, n: any) => {
                          if (String(n) === "taxa100") return [fmtPct100Human(Number(v), 2), "Taxa (do total)"];
                          if (String(n) === "shareContempladas100") return [fmtPct100Human(Number(v), 2), "Share (nas contempladas)"];
                          return [v, String(n)];
                        }}
                        labelFormatter={(l) => `Tipo: ${l}`}
                        contentStyle={{ borderRadius: 12 }}
                      />
                      <Legend />
                      <Bar dataKey="taxa100" name="Taxa (do total)" fill={C.navy} radius={[8, 8, 0, 0]}>
                        <LabelList dataKey="taxa100" position="top" formatter={(v: any) => fmtPct100Human(Number(v), 2)} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-1 text-xs" style={{ color: C.muted }}>
                  {(prazo.tipoRateChart || []).map((r: any) => (
                    <div key={r.tipo} className="flex items-center justify-between">
                      <span>{r.tipo}</span>
                      <span style={{ color: C.navy, fontWeight: 800 }}>
                        {r.qtd} • {fmtPct100Human(Number(r.taxa100), 2)} (share: {fmtPct100Human(Number(r.shareContempladas100), 2)})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Taxa de contemplação por administradora (Top 12)
                </CardTitle>
              </CardHeader>

              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.tipoRatePorAdmChart || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="adm" hide />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => fmtPct100Human(Number(v), 2)} />
                    <RTooltip
                      formatter={(v: any, n: any) => [fmtPct100Human(Number(v), 2), String(n)]}
                      labelFormatter={(l) => `Administradora: ${l}`}
                      contentStyle={{ borderRadius: 12 }}
                    />
                    <Legend />
                    <Bar dataKey="Lance Livre" stackId="a" fill={C.navy} />
                    <Bar dataKey="Primeiro Lance Fixo" stackId="a" fill={C.gold} />
                    <Bar dataKey="Segundo Lance Fixo" stackId="a" fill={C.rubi} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clientes" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Total de clientes
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {clientes.total}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Ativos
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {clientes.ativos}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Inadimplentes
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {clientes.inadimplentes}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Inativos
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {clientes.inativos}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  % Ativos
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPctHuman(clientes.pctAtivos, 1)}
              </CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      <th className="text-left py-2">Indicador</th>
                      <th className="text-right py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: C.navy }}>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Total de clientes</td>
                      <td className="py-2 text-right font-bold">{clientes.total}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Ativos</td>
                      <td className="py-2 text-right font-bold">{clientes.ativos}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Inadimplentes</td>
                      <td className="py-2 text-right font-bold">{clientes.inadimplentes}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Inativos</td>
                      <td className="py-2 text-right font-bold">{clientes.inativos}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">% Ativos</td>
                      <td className="py-2 text-right font-bold">{fmtPctHuman(clientes.pctAtivos, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Carteira */}
        <TabsContent value="carteira" className="space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Série mensal (últimos 12 meses)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={carteiraSerie}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <RTooltip formatter={(v: any) => fmtBRL(safeNum(v))} />
                  <Legend />
                  <Bar dataKey="vendido" name="Vendido" fill={C.navy} radius={[8, 8, 0, 0]} />
                  <Bar dataKey="cancelado" name="Cancelado" fill={C.rubi} radius={[8, 8, 0, 0]} />
                  <Line dataKey="liquido" name="Líquido" stroke={C.gold} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Segmentos */}
        <TabsContent value="segmentos" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Distribuição da carteira ativa por segmento
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distSegmento.rows} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={2}>
                      {distSegmento.rows.map((_, idx) => (
                        <Cell key={idx} fill={[C.navy, C.rubi, C.gold, "#2B3A55", "#8E7A3B", "#4D0E16"][idx % 6]} />
                      ))}
                    </Pie>
                    <RTooltip formatter={(v: any) => fmtBRL(safeNum(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Ranking por segmento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {distSegmento.rows.slice(0, 10).map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-3">
                      <div className="font-semibold truncate" style={{ color: C.navy }}>
                        {r.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="info">{fmtPctHuman(r.pct, 1)}</Badge>
                        <div className="font-bold" style={{ color: C.navy }}>
                          {fmtBRL(r.value)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Concentração */}
        <TabsContent value="concentracao" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Corte (alerta)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPctHuman(CONCENTRACAO_ALERTA, 0)}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Clientes concentrados
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {concKpis.acimaCount}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  % em concentrados
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPctHuman(concKpis.acimaPct, 1)}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>
                  Maior concentração
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPctHuman(concKpis.top1, 1)}
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Curva de Lorenz
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lorenz.points}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} domain={[0, 1]} />
                    <RTooltip formatter={(v: any) => fmtPctHuman(safeNum(v), 2)} />
                    <Area type="monotone" dataKey="y" stroke={C.navy} fill={C.gold} fillOpacity={0.25} />
                    <Line type="linear" data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" stroke={C.rubi} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Heatmap de distribuição (faixas de concentração)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {heat.map((b) => (
                    <div
                      key={b.key}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: C.border,
                        background: `rgba(161,28,39,${0.10 + 0.35 * b.intensity})`,
                      }}
                    >
                      <div className="text-xs font-semibold" style={{ color: C.navy }}>
                        {b.label}
                      </div>
                      <div className="text-2xl font-extrabold" style={{ color: C.navy }}>
                        {b.qtd}
                      </div>
                      <div className="text-[11px]" style={{ color: C.muted }}>
                        clientes
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between" style={{ color: C.navy }}>
                {/* ✅ título ajustado */}
                <span>Concentração - Top 10</span>
                <div className="flex items-center gap-2">
                  <Badge tone="info">Top 10: {fmtPctHuman(paretoData.sumTop10, 2)}</Badge>
                  <Badge tone="muted">Resto: {fmtPctHuman(paretoData.restoPct, 2)}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData.rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} />
                  {/* ✅ % humano 2 casas */}
                  <YAxis yAxisId="left" tickFormatter={(v) => fmtPct100Human(Number(v), 2)} domain={[0, 100]} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => fmtPct100Human(Number(v), 2)}
                    domain={[0, 100]}
                  />
                  <RTooltip
                    formatter={(v: any, n: any) => [fmtPct100Human(Number(v), 2), String(n)]}
                    contentStyle={{ borderRadius: 12 }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="pct100" name="Participação" fill={C.navy} radius={[8, 8, 0, 0]} />
                  <Line yAxisId="right" dataKey="cum100" name="Acumulado" stroke={C.gold} strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </GlassCard>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Concentração por cliente (carteira ativa)
              </CardTitle>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : concRows.length === 0 ? (
                <div className="text-sm" style={{ color: C.muted }}>
                  Sem dados de carteira ativa para exibir.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: C.muted }}>
                          <th className="text-left py-2">Cliente</th>
                          <th className="text-left py-2">Vendedor(es)</th>
                          <th className="text-right py-2">Valor (ativo)</th>
                          <th className="text-right py-2">% Concentração</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-right py-2">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {concSlice.map((row) => {
                          const lead = leadsMap[row.lead_id];
                          const nome = lead?.nome || row.lead_id;
                          const sellers = Array.from(row.sellers)
                            .map((sid) => vendorName(sid))
                            .filter(Boolean)
                            .join(", ");

                          return (
                            <tr key={row.lead_id} className="border-t" style={{ borderColor: C.border, color: C.navy }}>
                              <td className="py-2">
                                <div className="font-bold truncate max-w-[260px]">{nome}</div>
                                <div className="text-xs truncate max-w-[260px]" style={{ color: C.muted }}>
                                  {lead?.telefone || "—"} • {lead?.email || "—"} • {lead?.origem || "—"}
                                </div>

                                <div className="mt-2 h-2 w-full rounded-full bg-white/60 border border-white/40 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, row.pct * 100)}%`,
                                      background: row.alerta ? C.rubi : C.navy,
                                    }}
                                  />
                                </div>
                              </td>

                              <td className="py-2">
                                <div className="text-sm">{sellers || "—"}</div>
                              </td>
                              <td className="py-2 text-right font-extrabold">{fmtBRL(row.value)}</td>

                              <td className="py-2 text-right">
                                <Badge tone={row.alerta ? "danger" : "info"}>{fmtPctHuman(row.pct, 1)}</Badge>
                              </td>

                              <td className="py-2">
                                {row.alerta ? (
                                  <Badge tone="danger">
                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                    Cliente concentrado
                                  </Badge>
                                ) : (
                                  <Badge tone="ok">
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    OK
                                  </Badge>
                                )}
                              </td>

                              <td className="py-2 text-right">
                                <Button
                                  variant="outline"
                                  className="rounded-xl"
                                  onClick={() => {
                                    setLeadDialogId(row.lead_id);
                                    setLeadDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs" style={{ color: C.muted }}>
                      Página {concPage} / {concTotalPages} • {concRows.length} clientes
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setConcPage((p) => Math.max(1, p - 1))}
                        disabled={concPage <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setConcPage((p) => Math.min(concTotalPages, p + 1))}
                        disabled={concPage >= concTotalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </GlassCard>

          <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
            <DialogContent className="sm:max-w-[900px] rounded-2xl">
              <DialogHeader>
                <DialogTitle style={{ color: C.navy }}>Detalhes do cliente (Concentração)</DialogTitle>
              </DialogHeader>

              {leadDialogId && (
                <div className="space-y-3">
                  <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-lg font-extrabold" style={{ color: C.navy }}>
                          {leadName(leadDialogId)}
                        </div>
                        <div className="text-xs mt-1" style={{ color: C.muted }}>
                          {leadsMap[leadDialogId]?.telefone || "—"} • {leadsMap[leadDialogId]?.email || "—"} •{" "}
                          {leadsMap[leadDialogId]?.origem || "—"}
                        </div>

                        <div className="text-xs mt-2 flex items-center gap-2 flex-wrap" style={{ color: C.muted }}>
                          <span>Carteira ativa do cliente:</span>
                          <span className="font-bold" style={{ color: C.navy }}>
                            {fmtBRL(leadDialogAtivoTotal)}
                          </span>
                          <Badge tone={leadDialogPct >= CONCENTRACAO_ALERTA ? "danger" : "info"}>{fmtPctHuman(leadDialogPct, 1)} da carteira</Badge>
                          {leadDialogPct >= CONCENTRACAO_ALERTA ? (
                            <Badge tone="danger">Cliente concentrado (≥ 10%)</Badge>
                          ) : (
                            <Badge tone="ok">OK</Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold" style={{ color: C.muted }}>
                          Total cotas (filtro)
                        </div>
                        <div className="text-2xl font-extrabold" style={{ color: C.navy }}>
                          {leadDialogVendas.length}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: C.muted }}>
                          <th className="text-left py-2">Grupo/Cota</th>
                          <th className="text-left py-2">Administradora</th>
                          <th className="text-left py-2">Segmento</th>
                          <th className="text-left py-2">Tabela</th>
                          <th className="text-left py-2">Vendedor</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-right py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: C.navy }}>
                        {leadDialogVendas.slice(0, 50).map((v) => (
                          <tr key={v.id} className="border-t" style={{ borderColor: C.border }}>
                            <td className="py-2">{`${v.grupo || "—"} / ${v.cota || "—"}`}</td>
                            <td className="py-2">{v.administradora || "—"}</td>
                            <td className="py-2">{v.segmento || "—"}</td>
                            <td className="py-2">{v.tabela || "—"}</td>
                            <td className="py-2">{vendorName(v.vendedor_id)}</td>
                            <td className="py-2">
                              <Badge
                                tone={
                                  getStatus(v) === "Cancelada"
                                    ? "danger"
                                    : getStatus(v) === "Inadimplente"
                                    ? "danger"
                                    : getStatus(v) === "Contemplada"
                                    ? "info"
                                    : "ok"
                                }
                              >
                                {getStatus(v)}
                              </Badge>
                            </td>
                            <td className="py-2 text-right font-bold">{fmtBRL(safeNum(v.valor_venda))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {leadDialogVendas.length > 50 && (
                    <div className="text-xs" style={{ color: C.muted }}>
                      Mostrando 50 de {leadDialogVendas.length} registros.
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Export overlay */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-[720px] rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ color: C.navy }}>Extrair Relatório (XLS)</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Tipo de relatório
                </div>
                <Select value={exportType} onValueChange={(v: any) => setExportType(v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="canceladas">Canceladas</SelectItem>
                    <SelectItem value="contempladas">Contempladas</SelectItem>
                    <SelectItem value="inadimplentes">Inadimplentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Data do status (início)
                </div>
                <Input type="date" value={exportStatusStart} onChange={(e) => setExportStatusStart(e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Data do status (fim)
                </div>
                <Input type="date" value={exportStatusEnd} onChange={(e) => setExportStatusEnd(e.target.value)} />
              </div>
            </div>

            <div className="text-xs" style={{ color: C.muted }}>
              Se você não preencher a data do status, o relatório é gerado com todo o histórico (respeitando os filtros globais).
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setExportOpen(false)} disabled={exportLoading}>
                Cancelar
              </Button>
              <Button className="rounded-xl" onClick={exportReport} disabled={exportLoading}>
                {exportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Baixar XLS
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
