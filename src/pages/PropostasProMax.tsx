// src/pages/PropostasProMax.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronDown,
  CalendarDays,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";

type SimRow = {
  code: number;
  created_at: string;
  admin_id?: string | null;
  lead_id?: string | null;
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

type UserDirectoryRow = {
  id: string;
  authUserId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  role?: string | null;
  hierarchyLevel?: string | null;
  active?: boolean;
  scopes?: string[];
};

type AdminDirectoryRow = {
  id: string;
  name: string;
  slug?: string | null;
};

type ProposalParams = {
  selic_anual: number;
  cdi_anual: number;
  reforco_pct: number;
  ipca12m: number;
  igpm12m: number;
  incc12m: number;
  inpc12m: number;
  fin_veic_mensal: number;
  fin_imob_anual: number;
  aluguel_pct: number;
  airbnb_pct: number;
  condominio_pct: number;
};

const DEFAULT_PARAMS: ProposalParams = {
  selic_anual: 0.105,
  cdi_anual: 0.104,
  reforco_pct: 0.25,
  ipca12m: 0.045,
  igpm12m: 0.04,
  incc12m: 0.06,
  inpc12m: 0.045,
  fin_veic_mensal: 0.018,
  fin_imob_anual: 0.122,
  aluguel_pct: 0.006,
  airbnb_pct: 0.15,
  condominio_pct: 0.08,
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

function parsePercentInput(raw: string): number {
  const value = raw.trim().replace(/\s+/g, "");
  if (!value) return 0;
  const hasPercent = value.endsWith("%");
  const number = Number(value.replace("%", "").replace(".", "").replace(",", "."));
  if (!Number.isFinite(number)) return 0;
  if (hasPercent) return number / 100;
  return number > 1 ? number / 100 : number;
}

function formatPercentFraction(value: number) {
  return `${((Number(value) || 0) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function rowText(row: Proposal, keys: string[], fallback = "Não informado") {
  for (const key of keys) {
    const value = row.promax?.[key as keyof ProMaxMetadata] ?? row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return fallback;
}

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function unitLabel(unitId?: string | null, explicitName?: string | null) {
  if (explicitName?.trim()) return explicitName.trim();
  if (!unitId?.trim()) return "";
  return `Unidade ${unitId.slice(0, 8)}`;
}

function getAdminName(row: Proposal) {
  const explicit = rowText(
    row,
    [
      "administradora",
      "admin",
      "admin_name",
      "administradora_nome",
      "nome_administradora",
      "adminName",
      "administrator",
      "administrator_name",
      "source_admin",
    ],
    ""
  );
  if (explicit) return explicit;

  return "Não informado";
}

function adminIdFromRow(row: Proposal) {
  return firstText(row, ["admin_id", "administradora_id", "administrator_id"]);
}

function userIdFromRow(row: Proposal) {
  return firstText(row, ["vendedor_id", "seller_id", "consultor_id", "user_id", "usuario_id", "created_by", "owner_id"]);
}

function getSellerName(row: Proposal, usersById: Map<string, UserDirectoryRow>) {
  const explicit = rowText(row, ["vendedor_nome", "seller_name", "consultor_nome", "usuario_nome", "created_by_name"], "");
  if (explicit) return explicit;
  const userId = userIdFromRow(row);
  return usersById.get(userId)?.name || "";
}

function getUnitName(row: Proposal, usersById: Map<string, UserDirectoryRow>) {
  const explicit = rowText(row, ["unidade_nome", "unidade", "unit_name", "filial_nome"], "");
  if (explicit) return explicit;
  const unitId = rowText(row, ["unidade_id", "unit_id", "filial_id"], "");
  if (unitId) return unitLabel(unitId);
  const userId = userIdFromRow(row);
  return usersById.get(userId)?.unitName || "";
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
    <div className="rounded-lg border bg-white/95 p-4 shadow-sm">
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

function ParamInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <Input
        className="h-10 rounded-lg"
        defaultValue={formatPercentFraction(value)}
        onBlur={(event) => {
          const parsed = parsePercentInput(event.currentTarget.value);
          event.currentTarget.value = formatPercentFraction(parsed);
          onChange(parsed);
        }}
      />
    </label>
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
  const [users, setUsers] = useState<UserDirectoryRow[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [unitFilter, setUnitFilter] = useState("todos");
  const [sellerFilter, setSellerFilter] = useState("todos");
  const [adminFilter, setAdminFilter] = useState("todos");
  const [segmentFilter, setSegmentFilter] = useState("todos");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [proposalParams, setProposalParams] = useState<ProposalParams>(DEFAULT_PARAMS);
  const [paramsSaving, setParamsSaving] = useState(false);

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
      const leadIds = [
        ...new Set(((data || []) as SimRow[]).map((row) => String(row.lead_id || "")).filter(Boolean)),
      ];
      const metadataByCode = new Map<number, ProMaxMetadata>();
      const eventsList: ProposalEvent[] = [];
      const userDirectory: UserDirectoryRow[] = [];
      const adminDirectory = new Map<string, AdminDirectoryRow>();
      const ownerByLeadId = new Map<string, string>();

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

      const usersRes = await supabase
        .from("users")
        .select("id,auth_user_id,nome,email,phone,telefone,unit_id,role,user_role,hierarchy_level,is_active,scopes")
        .eq("is_active", true)
        .order("nome", { ascending: true })
        .limit(1000);

      if (!usersRes.error) {
        for (const item of (usersRes.data || []) as Record<string, unknown>[]) {
          const id = firstText(item, ["id"]);
          const authUserId = firstText(item, ["auth_user_id"]) || null;
          const name = firstText(item, ["nome", "email"]);
          const unitId = firstText(item, ["unit_id"]) || null;
          const role = firstText(item, ["user_role", "role"]) || null;

          if (!id || !name) continue;

          userDirectory.push({
            id,
            authUserId,
            name,
            email: firstText(item, ["email"]) || null,
            phone: firstText(item, ["phone", "telefone"]) || null,
            unitId,
            unitName: unitLabel(unitId),
            role,
            hierarchyLevel: firstText(item, ["hierarchy_level"]) || null,
            active: item.is_active !== false,
            scopes: Array.isArray(item.scopes) ? (item.scopes as string[]) : [],
          });
        }
      }

      const adminsRes = await supabase
        .from("sim_admins")
        .select("id,name,slug")
        .order("name", { ascending: true });

      if (!adminsRes.error) {
        for (const item of (adminsRes.data || []) as Record<string, unknown>[]) {
          const id = firstText(item, ["id"]);
          const name = firstText(item, ["name", "nome", "slug"]);
          if (!id || !name) continue;

          adminDirectory.set(id, {
            id,
            name,
            slug: firstText(item, ["slug"]) || null,
          });
        }
      }

      if (leadIds.length) {
        const opportunitiesRes = await supabase
          .from("opportunities")
          .select("lead_id,vendedor_id,owner_id,updated_at,created_at")
          .in("lead_id", leadIds)
          .order("updated_at", { ascending: false });

        if (!opportunitiesRes.error) {
          for (const item of (opportunitiesRes.data || []) as Record<string, unknown>[]) {
            const leadId = firstText(item, ["lead_id"]);
            const ownerId = firstText(item, ["vendedor_id", "owner_id"]);
            if (leadId && ownerId && !ownerByLeadId.has(leadId)) ownerByLeadId.set(leadId, ownerId);
          }
        }

        const leadsRes = await supabase
          .from("leads")
          .select("id,owner_id")
          .in("id", leadIds);

        if (!leadsRes.error) {
          for (const item of (leadsRes.data || []) as Record<string, unknown>[]) {
            const leadId = firstText(item, ["id"]);
            const ownerId = firstText(item, ["owner_id"]);
            if (leadId && ownerId && !ownerByLeadId.has(leadId)) ownerByLeadId.set(leadId, ownerId);
          }
        }

        const clientesRes = await supabase
          .from("clientes")
          .select("lead_id,vendedor_auth_user_id,created_by,updated_at")
          .in("lead_id", leadIds)
          .order("updated_at", { ascending: false });

        if (!clientesRes.error) {
          for (const item of (clientesRes.data || []) as Record<string, unknown>[]) {
            const leadId = firstText(item, ["lead_id"]);
            const ownerId = firstText(item, ["vendedor_auth_user_id", "created_by"]);
            if (leadId && ownerId && !ownerByLeadId.has(leadId)) ownerByLeadId.set(leadId, ownerId);
          }
        }
      }

      const paramsRes = await supabase
        .from("proposal_pro_max_parameters")
        .select("params")
        .eq("id", "global")
        .maybeSingle();

      if (!alive) return;

      const usersByAnyId = new Map<string, UserDirectoryRow>();
      for (const user of userDirectory) {
        usersByAnyId.set(user.id, user);
        if (user.authUserId) usersByAnyId.set(user.authUserId, user);
      }

      setRows(
        ((data || []) as SimRow[]).map((row) => {
          const metadata = metadataByCode.get(row.code);
          const adminName = metadata?.administradora || adminDirectory.get(adminIdFromRow(row))?.name || null;
          const leadOwnerId = row.lead_id ? ownerByLeadId.get(row.lead_id) : "";
          const sellerId = metadata?.vendedor_id || row.vendedor_id || leadOwnerId || null;
          const seller = sellerId ? usersByAnyId.get(sellerId) : null;

          return {
            ...row,
            administradora: adminName,
            vendedor_id: sellerId,
            vendedor_nome: metadata?.vendedor_nome || row.vendedor_nome || seller?.name || null,
            unidade_id: metadata?.unidade_id || row.unidade_id || seller?.unitId || null,
            unidade_nome: metadata?.unidade_nome || row.unidade_nome || seller?.unitName || null,
            promax: metadata,
          };
        })
      );
      setEvents(eventsList);
      setUsers(userDirectory);
      if (!paramsRes.error && paramsRes.data?.params) {
        setProposalParams({ ...DEFAULT_PARAMS, ...(paramsRes.data.params as Partial<ProposalParams>) });
      }
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const usersById = useMemo(() => {
    const map = new Map<string, UserDirectoryRow>();
    for (const user of users) {
      map.set(user.id, user);
      if (user.authUserId) map.set(user.authUserId, user);
    }
    return map;
  }, [users]);

  const options = useMemo(() => {
    const units = new Set<string>();
    const sellers = new Set<string>();
    const admins = new Set<string>();
    const segments = new Set<string>();

    const selectedUnitUsers = users.filter((user) => unitFilter === "todos" || user.unitName === unitFilter);

    for (const user of users) {
      if (user.unitName) units.add(user.unitName);
    }

    for (const user of selectedUnitUsers) {
      if (user.name) sellers.add(user.name);
    }

    for (const row of rows) {
      const unitName = getUnitName(row, usersById);
      const sellerName = getSellerName(row, usersById);

      units.add(unitName);
      if (unitFilter === "todos" || unitName === unitFilter) sellers.add(sellerName);
      admins.add(getAdminName(row));
      segments.add(row.segmento || "");
    }

    const clean = (set: Set<string>) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return {
      units: clean(units),
      sellers: clean(sellers),
      admins: clean(admins),
      segments: clean(segments),
    };
  }, [rows, unitFilter, users, usersById]);

  useEffect(() => {
    if (sellerFilter !== "todos" && !options.sellers.includes(sellerFilter)) {
      setSellerFilter("todos");
    }
  }, [options.sellers, sellerFilter]);

  const filteredRows = useMemo(() => {
    const query = normalizeText(q);

    return rows.filter((row) => {
      const adminName = getAdminName(row);
      const sellerName = getSellerName(row, usersById);
      const unitName = getUnitName(row, usersById);

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
  }, [adminFilter, q, rows, segmentFilter, sellerFilter, unitFilter, usersById]);

  const activeRow = useMemo(() => rows.find((row) => row.code === activeCode) || null, [activeCode, rows]);
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.code)), [rows, selected]);
  const totalCredit = useMemo(() => filteredRows.reduce((sum, row) => sum + creditoContratado(row), 0), [filteredRows]);
  const totalLiquidCredit = useMemo(() => filteredRows.reduce((sum, row) => sum + creditoLiquido(row), 0), [filteredRows]);
  const selectedTotalCredit = useMemo(() => selectedRows.reduce((sum, row) => sum + creditoContratado(row), 0), [selectedRows]);
  const totalSent = useMemo(() => events.filter((event) => event.event_type === "sent").length, [events]);
  const totalOpened = useMemo(() => events.filter((event) => event.event_type === "opened").length, [events]);

  const kpis = useMemo(() => {
    const ranges = [
      { key: "today", title: "Hoje", start: startOfToday() },
      { key: "week", title: "Semana", start: startOfWeek() },
      { key: "month", title: "Mês", start: startOfMonth() },
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

  async function persistProposalParams(next: ProposalParams) {
    setParamsSaving(true);
    const authRes = await supabase.auth.getUser();
    const { error: saveError } = await supabase
      .from("proposal_pro_max_parameters")
      .upsert(
        {
          id: "global",
          params: next,
          updated_by: authRes.data.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (saveError) {
      alert(`Não foi possível salvar os parâmetros: ${saveError.message}`);
    }
    setParamsSaving(false);
  }

  function updateProposalParam<K extends keyof ProposalParams>(key: K, value: ProposalParams[K]) {
    setProposalParams((prev) => {
      const next = { ...prev, [key]: value };
      persistProposalParams(next);
      return next;
    });
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
    doc.text(targetRows.length > 1 ? "Propostas Pró Max - Unificadas" : "Proposta Pró Max", 36, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 36, y + 18);

    y = 128;
    doc.setTextColor(30, 41, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Resumo: ${targetRows.length} proposta(s) | Crédito total ${brMoney(targetRows.reduce((sum, row) => sum + creditoContratado(row), 0))}`, 36, y);
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
      doc.text(`#${row.code} - ${row.lead_nome || "Lead não informado"}`, 52, y + 24);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Segmento: ${row.segmento || "-"} | Administradora: ${getAdminName(row)}`, 52, y + 43);
      doc.text(`Crédito contratado: ${brMoney(creditoContratado(row))} | Crédito líquido: ${brMoney(creditoLiquido(row))}`, 52, y + 62);
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
      title: `Unificação ${codes.join(", ")}`,
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
            <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Ambiente Pró Max</div>
            <h1 className="mt-2 text-2xl font-black" style={{ color: C.navy }}>
              Proposta #{activeCode}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Este ambiente será usado para os modelos visuais: resumo do cliente, sorteio x lance,
              estratégia recomendada, fluxo de parcelas, gráficos e PDF premium.
            </p>

            {activeRow ? (
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Lead</div>
                  <div className="font-black" style={{ color: C.navy }}>{activeRow.lead_nome || "-"}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Crédito contratado</div>
                  <div className="font-black" style={{ color: C.navy }}>{brMoney(creditoContratado(activeRow))}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Crédito líquido</div>
                  <div className="font-black" style={{ color: C.ruby }}>{brMoney(creditoLiquido(activeRow))}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-slate-500">Tipo de lance</div>
                  <div className="font-black" style={{ color: C.navy }}>{tipoLance(activeRow)}</div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Proposta não encontrada na lista carregada.
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 md:px-5 md:py-5">
      <div className="mx-auto w-full max-w-none space-y-4">
        <section
          className="relative overflow-hidden rounded-xl border p-5 shadow-sm"
          style={{ background: "linear-gradient(135deg, #1E293F 0%, #A11C27 100%)", borderColor: "rgba(255,255,255,.22)" }}
        >
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-24 top-8 h-32 w-32 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />

          <div className="relative z-[1] flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl text-white">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[.14em]">
                <FileText className="h-3.5 w-3.5" /> Consulmax
              </div>
              <h1 className="mt-3 text-2xl font-black md:text-4xl">Propostas Pró Max</h1>
              <p className="mt-2 text-sm text-white/78 md:text-base">
                Controle, envio e unificação das propostas salvas, com filtros comerciais e base pronta para os modelos visuais.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-white/25 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => setParamsOpen((prev) => !prev)}
                >
                  <Settings2 className="mr-2 h-4 w-4" /> Parâmetros
                  <ChevronDown className={`ml-2 h-4 w-4 transition ${paramsOpen ? "rotate-180" : ""}`} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-white/25 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => setSelected(filteredRows.map((row) => row.code))}
                >
                  Selecionar lista filtrada
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[720px] xl:grid-cols-4">
              <div className="rounded-lg border border-white/20 bg-white/95 p-3">
                <div className="text-xs font-semibold text-slate-500">Propostas</div>
                <div className="mt-1 text-2xl font-black" style={{ color: C.navy }}>{filteredRows.length}</div>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/95 p-3">
                <div className="text-xs font-semibold text-slate-500">Crédito total</div>
                <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{brMoney(totalCredit)}</div>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/95 p-3">
                <div className="text-xs font-semibold text-slate-500">Crédito líquido</div>
                <div className="mt-1 text-xl font-black" style={{ color: C.navy }}>{brMoney(totalLiquidCredit)}</div>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/95 p-3">
                <div className="text-xs font-semibold text-slate-500">Enviadas / abertas</div>
                <div className="mt-1 text-2xl font-black" style={{ color: C.gold }}>{totalSent} / {totalOpened}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.key} title={kpi.title} generated={kpi.generated} sent={kpi.sent} opened={kpi.opened} />
          ))}
        </div>

        {paramsOpen && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
                  <Settings2 className="h-4 w-4" /> Parâmetros da apresentação
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Mesmo conjunto base usado na guia Propostas. Esses índices alimentarão os modelos visuais e projeções futuras.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  setProposalParams(DEFAULT_PARAMS);
                  persistProposalParams(DEFAULT_PARAMS);
                }}
                disabled={paramsSaving}
              >
                Restaurar padrão
              </Button>
            </div>
            {paramsSaving && <div className="mt-2 text-xs font-semibold text-slate-500">Salvando parâmetros para todos os usuários...</div>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <ParamInput label="SELIC anual" value={proposalParams.selic_anual} onChange={(value) => updateProposalParam("selic_anual", value)} />
              <ParamInput label="CDI anual" value={proposalParams.cdi_anual} onChange={(value) => updateProposalParam("cdi_anual", value)} />
              <ParamInput label="Reforço venda" value={proposalParams.reforco_pct} onChange={(value) => updateProposalParam("reforco_pct", value)} />
              <ParamInput label="IPCA 12m" value={proposalParams.ipca12m} onChange={(value) => updateProposalParam("ipca12m", value)} />
              <ParamInput label="IGP-M 12m" value={proposalParams.igpm12m} onChange={(value) => updateProposalParam("igpm12m", value)} />
              <ParamInput label="INCC 12m" value={proposalParams.incc12m} onChange={(value) => updateProposalParam("incc12m", value)} />
              <ParamInput label="INPC 12m" value={proposalParams.inpc12m} onChange={(value) => updateProposalParam("inpc12m", value)} />
              <ParamInput label="Fin. veículos mês" value={proposalParams.fin_veic_mensal} onChange={(value) => updateProposalParam("fin_veic_mensal", value)} />
              <ParamInput label="Fin. imóvel ano" value={proposalParams.fin_imob_anual} onChange={(value) => updateProposalParam("fin_imob_anual", value)} />
              <ParamInput label="Aluguel mês" value={proposalParams.aluguel_pct} onChange={(value) => updateProposalParam("aluguel_pct", value)} />
              <ParamInput label="Airbnb" value={proposalParams.airbnb_pct} onChange={(value) => updateProposalParam("airbnb_pct", value)} />
              <ParamInput label="Condomínio" value={proposalParams.condominio_pct} onChange={(value) => updateProposalParam("condominio_pct", value)} />
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <label className="space-y-1 text-xs font-semibold text-slate-600 xl:flex-[1.7]">
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5" /> Buscar por número, lead ou celular
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-10 rounded-lg pl-9"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Ex.: 497, Letícia, 2394..."
                />
              </div>
            </label>
            <div className="grid flex-[2] gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SelectFilter label="Unidade" value={unitFilter} onChange={setUnitFilter} options={options.units} />
              <SelectFilter label="Vendedor" value={sellerFilter} onChange={setSellerFilter} options={options.sellers} />
              <SelectFilter label="Administradora" value={adminFilter} onChange={setAdminFilter} options={options.admins} />
              <SelectFilter label="Segmento" value={segmentFilter} onChange={setSegmentFilter} options={options.segments} />
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg xl:w-[120px]"
              onClick={() => {
                setQ("");
                setUnitFilter("todos");
                setSellerFilter("todos");
                setAdminFilter("todos");
                setSegmentFilter("todos");
              }}
            >
              Limpar
            </Button>
          </div>
        </section>

        {selectedRows.length > 0 && (
          <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-black" style={{ color: C.navy }}>{selectedRows.length} proposta(s) selecionada(s)</div>
              <div className="text-sm text-slate-600">Crédito contratado selecionado: {brMoney(selectedTotalCredit)}</div>
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

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando propostas...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-700">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
                  <tr>
                    <th className="w-10 p-3 text-left"></th>
                    <th className="p-3 text-left">Número</th>
                    <th className="p-3 text-left">Lead</th>
                    <th className="p-3 text-left">Segmento</th>
                    <th className="p-3 text-left">Administradora</th>
                    <th className="p-3 text-right">Crédito contratado</th>
                    <th className="p-3 text-right">Parcela inicial</th>
                    <th className="p-3 text-right">Demais parcelas</th>
                    <th className="p-3 text-left">Tipo de lance</th>
                    <th className="p-3 text-right">Crédito líquido</th>
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
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold" style={{ color: C.navy }}>
                          <Building2 className="h-3.5 w-3.5" /> {getAdminName(row)}
                        </span>
                      </td>
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

        <section className="rounded-xl border bg-white p-4 text-xs text-slate-500 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-slate-600">
            <BarChart3 className="h-4 w-4" /> Próximas etapas
          </div>
          <p className="mt-2">
            Ao abrir uma linha, a proposta já entra no ambiente Pró Max. Nas próximas fases, esse ambiente recebe
            os modelos visuais por estratégia, correção de crédito antes/depois da contemplação e link público rastreável.
          </p>
        </section>
      </div>
    </div>
  );
}
