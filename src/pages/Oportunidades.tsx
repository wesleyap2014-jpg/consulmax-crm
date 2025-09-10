// src/pages/Oportunidades.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  KeyboardEvent,
  CSSProperties,
} from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   Tipos
========================= */
type UUID = string;

type Lead = {
  id: UUID;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  owner_id?: UUID | null;
};

type User = { auth_user_id: UUID; nome: string };

type Vendedor = User;

type EstagioText =
  | "Novo"
  | "Qualificando"
  | "Proposta"
  | "Negociação"
  | "Fechado (Ganho)"
  | "Fechado (Perdido)";

type StageEnum = "novo" | "qualificando" | "proposta" | "negociacao" | "fechado_ganho" | "fechado_perdido";

type Oportunidade = {
  id: UUID;
  lead_id: UUID;
  vendedor_id: UUID;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number; // 1..5 idealmente, mas CHECK permite 0..100. Usamos 1..5 na UI.
  estagio: EstagioText;
  expected_close_at: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at?: string;
  stage?: StageEnum; // se vier
  stage_changed_at?: string | null;
  owner_id?: UUID;
};

type KpiRow = {
  stage: StageEnum | EstagioText;
  qtd: number;
  total: number;
  vendedor_id?: UUID | null;
  mes?: string | null;
};

type AuditRow = {
  id: number;
  opportunity_id: UUID;
  changed_at: string;
  changed_by: UUID;
  old_data: Record<string, any>;
  new_data: Record<string, any>;
  user_name?: string;
};

/* =========================
   Constantes / Helpers
========================= */
const STAGE_TEXT_TO_ENUM: Record<EstagioText, StageEnum> = {
  "Novo": "novo",
  "Qualificando": "qualificando",
  "Proposta": "proposta",
  "Negociação": "negociacao",
  "Fechado (Ganho)": "fechado_ganho",
  "Fechado (Perdido)": "fechado_perdido",
};
const STAGE_ENUM_TO_TEXT: Record<StageEnum, EstagioText> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado_ganho: "Fechado (Ganho)",
  fechado_perdido: "Fechado (Perdido)",
};

const STAGE_META: Record<EstagioText, { color: string; icon: string; slaDays?: number }> = {
  "Novo": { color: "#0ea5e9", icon: "🆕", slaDays: 3 },
  "Qualificando": { color: "#22c55e", icon: "🔍", slaDays: 5 },
  "Proposta": { color: "#f59e0b", icon: "📄", slaDays: 7 },
  "Negociação": { color: "#a855f7", icon: "🤝", slaDays: 10 },
  "Fechado (Ganho)": { color: "#16a34a", icon: "🏁" },
  "Fechado (Perdido)": { color: "#ef4444", icon: "🛑" },
};

const SEGMENTOS = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

const LS_KEYS = {
  COLUMNS: "opp_columns_visible",
  FAVORITES: "opp_views",
  TAGS: "opp_tags",
  TASKS: "opp_tasks",
  COMPACT: "opp_compact",
};

/* Formatadores */
const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtDateTime = (d: string | Date) => new Date(d).toLocaleString("pt-BR");
const fmtDateBR = (d?: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "-");
const toISODate = (ddmmaaaa: string | null | undefined) => {
  if (!ddmmaaaa) return null;
  const [d, m, y] = ddmmaaaa.split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
const moedaParaNumeroBR = (valor: string) => {
  const limpo = valor.replace(/[^\d,,-.]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
};
const onlyDigits = (s?: string | null) => (s || "").replace(/\D+/g, "");
const phoneToWA = (t?: string | null) => {
  const d = onlyDigits(t);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return "55" + d; // fallback
};

/* Toast minimalista */
type Toast = { id: number; kind: "success" | "error" | "info"; msg: string; undo?: () => void };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    const toast = { ...t, id };
    setToasts((s) => [...s, toast]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 6000);
  };
  return { toasts, push, remove: (id: number) => setToasts((s) => s.filter((t) => t.id !== id)) };
}

/* =========================
   Componente principal
========================= */
export default function Oportunidades() {
  /* ---- estado base ---- */
  const [meuId, setMeuId] = useState<UUID | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState<boolean>(() => localStorage.getItem(LS_KEYS.COMPACT) === "1");

  /* ---- busca e filtros ---- */
  const [search, setSearch] = useState("");
  const [filterChip, setFilterChip] = useState<"todos" | "meus" | "mes">("todos");
  const [filtros, setFiltros] = useState<{
    vendedorIds: UUID[];
    segmento: string | "todos";
    scoreMin: number | null;
    valorMin: number | null;
    valorMax: number | null;
    periodo: { ini: string | null; fim: string | null };
  }>({ vendedorIds: [], segmento: "todos", scoreMin: null, valorMin: null, valorMax: null, periodo: { ini: null, fim: null } });

  /* ---- colunas visíveis ---- */
  const defaultCols = {
    lead: true,
    vendedor: true,
    segmento: true,
    valor: true,
    score: true,
    estagio: true,
    previsao: true,
    acoes: true,
  };
  const [cols, setCols] = useState<Record<keyof typeof defaultCols, boolean>>(() => {
    const raw = localStorage.getItem(LS_KEYS.COLUMNS);
    return raw ? { ...defaultCols, ...JSON.parse(raw) } : defaultCols;
  });

  /* ---- ordenação e paginação ---- */
  const [sortBy, setSortBy] = useState<"valor" | "score" | "previsao" | "criado">("criado");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize] = useState(40);
  const [visibleCount, setVisibleCount] = useState(40);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /* ---- modais ---- */
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<AuditRow[]>([]);
  const [kanbanMode, setKanbanMode] = useState(false);

  /* ---- criar oportunidade form ---- */
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>(SEGMENTOS[0]);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageText, setStageText] = useState<EstagioText>("Novo");
  const [expectedDate, setExpectedDate] = useState("");

  /* ---- edição inline ---- */
  const [editingCell, setEditingCell] = useState<{ id: UUID; field: "valor" | "previsao" | "score" | "estagio" } | null>(null);

  /* ---- auto-complete ---- */
  const [acOpen, setAcOpen] = useState(false);
  const [acIndex, setAcIndex] = useState(0);

  /* ---- toasts ---- */
  const { toasts, push } = useToasts();

  /* =========================
     Carregamento inicial
  ========================= */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMeuId(auth?.user?.id ?? null);

      // Leads com telefone/email/origem para preview
      const { data: l } = await supabase.from("leads").select("id, nome, telefone, email, origem, owner_id");
      setLeads(l || []);

      // Usuários (nomes) — usamos também como vendedores
      const { data: us } = await supabase.from("users").select("auth_user_id, nome");
      setUsers((us || []) as User[]);
      // vendedores por RPC, mas se não houver, caímos para users
      const { data: v } = await supabase.rpc("listar_vendedores").catch(() => ({ data: null as any }));
      setVendedores(((v || us || []) as Vendedor[]) || []);

      // Oportunidades
      const { data: o } = await supabase
        .from("opportunities")
        .select("id, lead_id, vendedor_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at, updated_at, stage, stage_changed_at, owner_id")
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);

      // KPIs view
      const { data: k } = await supabase.from("vw_opportunities_kpi").select("*");
      setKpis((k || []) as KpiRow[]);

      setLoading(false);
    })();
  }, []);

  /* =========================
     Persistências simples
  ========================= */
  useEffect(() => {
    localStorage.setItem(LS_KEYS.COLUMNS, JSON.stringify(cols));
  }, [cols]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.COMPACT, compact ? "1" : "0");
  }, [compact]);

  /* =========================
     Infinite scroll
  ========================= */
  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((c) => c + pageSize);
      }
    });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [pageSize]);

  /* =========================
     Busca + auto-complete
  ========================= */
  const suggestions = useMemo(() => {
    const pool: string[] = [];
    leads.forEach((l) => {
      if (l.nome) pool.push(l.nome);
      if (l.telefone) pool.push(onlyDigits(l.telefone));
    });
    vendedores.forEach((v) => v.nome && pool.push(v.nome));
    (Object.keys(STAGE_TEXT_TO_ENUM) as EstagioText[]).forEach((t) => pool.push(t, t.toLowerCase()));
    const q = search.trim().toLowerCase();
    const uniq = Array.from(new Set(pool));
    return q ? uniq.filter((s) => s.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search, leads, vendedores]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!acOpen && (e.key === "ArrowDown" || e.key === "Enter")) setAcOpen(true);
    if (!acOpen) return;
    if (e.key === "ArrowDown") setAcIndex((i) => Math.min(i + 1, suggestions.length - 1));
    if (e.key === "ArrowUp") setAcIndex((i) => Math.max(i - 1, 0));
    if (e.key === "Enter") {
      const pick = suggestions[acIndex];
      if (pick) setSearch(pick);
      setAcOpen(false);
    }
    if (e.key === "Escape") setAcOpen(false);
  };

  /* =========================
     Filtros combinados + chips
  ========================= */
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const visiveisBase = useMemo(() => {
    let arr = [...lista];

    // Chip: Meus
    if (filterChip === "meus" && meuId) arr = arr.filter((o) => o.vendedor_id === meuId);
    // Chip: Este mês (pela data de criação)
    if (filterChip === "mes") arr = arr.filter((o) => new Date(o.created_at) >= firstOfMonth);

    // Filtros avançados
    if (filtros.vendedorIds.length) arr = arr.filter((o) => filtros.vendedorIds.includes(o.vendedor_id));
    if (filtros.segmento !== "todos") arr = arr.filter((o) => o.segmento === filtros.segmento);
    if (filtros.scoreMin != null) arr = arr.filter((o) => o.score >= (filtros.scoreMin || 0));
    if (filtros.valorMin != null) arr = arr.filter((o) => o.valor_credito >= (filtros.valorMin || 0));
    if (filtros.valorMax != null) arr = arr.filter((o) => o.valor_credito <= (filtros.valorMax || Infinity));
    if (filtros.periodo.ini) arr = arr.filter((o) => new Date(o.created_at) >= new Date(filtros.periodo.ini as string));
    if (filtros.periodo.fim) arr = arr.filter((o) => new Date(o.created_at) <= new Date(filtros.periodo.fim as string));

    // Busca geral
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((o) => {
        const lead = leads.find((l) => l.id === o.lead_id);
        const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
        const tel = onlyDigits(lead?.telefone || "");
        return (
          (lead?.nome || "").toLowerCase().includes(q) ||
          (vend?.nome || "").toLowerCase().includes(q) ||
          (o.estagio || "").toLowerCase().includes(q) ||
          tel.includes(q)
        );
      });
    }

    // Esconde fechados na lista "Oportunidades"
    arr = arr.filter((o) => !["Fechado (Ganho)", "Fechado (Perdido)"].includes(o.estagio));

    // Ordenação
    const getter: Record<typeof sortBy, (o: Oportunidade) => any> = {
      valor: (o) => o.valor_credito,
      score: (o) => o.score,
      previsao: (o) => o.expected_close_at || "",
      criado: (o) => o.created_at,
    };
    arr.sort((a, b) => {
      const va = getter[sortBy](a);
      const vb = getter[sortBy](b);
      const cmp = va > vb ? 1 : va < vb ? -1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [lista, filterChip, meuId, firstOfMonth, filtros, search, leads, vendedores, sortBy, sortDir]);

  const visiveis = useMemo(() => visiveisBase.slice(0, visibleCount), [visiveisBase, visibleCount]);

  /* =========================
     Ações de linha
  ========================= */
  const updateOpp = async (id: UUID, patch: Partial<Oportunidade>, optimisticNote?: string, undoPrev?: Oportunidade) => {
    // otimista
    setLista((s) => s.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const { error, data } = await supabase.from("opportunities").update(serializePatch(patch)).eq("id", id).select().single();
    if (error) {
      push({ kind: "error", msg: "Falha ao salvar alterações: " + error.message });
      // rollback
      if (undoPrev) setLista((s) => s.map((o) => (o.id === id ? undoPrev : o)));
      return;
    }
    push({
      kind: "success",
      msg: optimisticNote || "Alterações salvas.",
      undo:
        undoPrev &&
        (async () => {
          setLista((s) => s.map((o) => (o.id === id ? undoPrev : o)));
          await supabase.from("opportunities").update(serializePatch(undoPrev)).eq("id", id);
        }),
    });
    // normalizar resposta fresh
    setLista((s) => s.map((o) => (o.id === id ? (data as any as Oportunidade) : o)));
  };

  const serializePatch = (p: Partial<Oportunidade>) => {
    const out: any = {};
    if (p.segmento != null) out.segmento = p.segmento;
    if (p.valor_credito != null) out.valor_credito = p.valor_credito;
    if (p.observacao !== undefined) out.observacao = p.observacao;
    if (p.score != null) out.score = p.score;
    if (p.estagio != null) {
      out.estagio = p.estagio;
      // manter enum em sincronia quando possível
      const enumVal = STAGE_TEXT_TO_ENUM[p.estagio as EstagioText];
      if (enumVal) out.stage = enumVal;
    }
    if (p.expected_close_at !== undefined) out.expected_close_at = p.expected_close_at;
    return out;
  };

  const duplicateOpp = async (o: Oportunidade) => {
    const payload = {
      lead_id: o.lead_id,
      vendedor_id: o.vendedor_id,
      owner_id: o.owner_id || o.vendedor_id,
      segmento: o.segmento,
      valor_credito: o.valor_credito,
      observacao: o.observacao,
      score: o.score,
      estagio: o.estagio,
      stage: STAGE_TEXT_TO_ENUM[o.estagio as EstagioText],
      expected_close_at: o.expected_close_at,
    };
    const { data, error } = await supabase.from("opportunities").insert(payload).select().single();
    if (error) return push({ kind: "error", msg: "Falha ao duplicar: " + error.message });
    setLista((s) => [data as any as Oportunidade, ...s]);
    push({ kind: "success", msg: "Oportunidade duplicada." });
  };

  const archiveOpp = async (o: Oportunidade) => {
    if (!confirm("Arquivar esta oportunidade? Ela será marcada como 'Fechado (Perdido)'."))
      return;
    const prev = { ...o };
    await updateOpp(o.id, { estagio: "Fechado (Perdido)" }, "Arquivada.", prev);
  };

  const changeStage = async (o: Oportunidade, novo: EstagioText) => {
    if (o.estagio === novo) return;
    const prev = { ...o };
    await updateOpp(o.id, { estagio: novo }, `Estágio: ${o.estagio} → ${novo}`, prev);
  };

  /* =========================
     Modal: Tratar (editar)
  ========================= */
  const saveEdit = async (edited: Oportunidade) => {
    const prev = lista.find((x) => x.id === edited.id)!;
    await updateOpp(
      edited.id,
      {
        segmento: edited.segmento,
        valor_credito: edited.valor_credito,
        score: Math.max(1, Math.min(5, edited.score)),
        estagio: edited.estagio as EstagioText,
        expected_close_at: edited.expected_close_at || null,
        observacao: edited.observacao ?? null,
      },
      "Oportunidade atualizada.",
      prev
    );
    setEditing(null);
  };

  /* =========================
     Histórico (modal separado)
  ========================= */
  const openHistory = async (id: UUID) => {
    const { data, error } = await supabase
      .from("opportunity_audit")
      .select("*")
      .eq("opportunity_id", id)
      .order("changed_at", { ascending: false });

    if (error) return push({ kind: "error", msg: "Erro ao carregar histórico." });

    const rows = (data || []) as AuditRow[];
    const ids = [...new Set(rows.map((r) => r.changed_by))];
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("auth_user_id, nome").in("auth_user_id", ids);
      const map = new Map((us || []).map((u) => [u.auth_user_id, u.nome]));
      rows.forEach((r) => (r.user_name = map.get(r.changed_by) || r.changed_by));
    }
    setHistoryData(rows);
    setHistoryOpen(true);
  };

  const renderAuditDiffs = (h: AuditRow) => {
    const diffs: { field: string; from: any; to: any }[] = [];
    if (h.old_data && h.new_data) {
      for (const k of Object.keys(h.new_data)) {
        const a = h.old_data?.[k];
        const b = h.new_data?.[k];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          diffs.push({ field: k, from: a ?? "—", to: b ?? "—" });
        }
      }
    }
    return diffs.length ? (
      <ul style={{ margin: "4px 0 8px 16px" }}>
        {diffs.map((d, i) => (
          <li key={i}>
            <b>{d.field}</b>: {String(d.from)} → {String(d.to)}
          </li>
        ))}
      </ul>
    ) : (
      <div style={{ color: "#64748b" }}>(sem alterações relevantes)</div>
    );
  };

  /* =========================
     Criar oportunidade
  ========================= */
  const criarOportunidade = async () => {
    if (!leadId) return push({ kind: "error", msg: "Selecione um Lead." });
    if (!vendId) return push({ kind: "error", msg: "Selecione um Vendedor." });

    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return push({ kind: "error", msg: "Informe o valor do crédito." });

    const payload = {
      lead_id: leadId,
      vendedor_id: vendId,
      owner_id: vendId,
      segmento,
      valor_credito: valorNum,
      observacao: obs ? `[${fmtDateTime(new Date())}]\n${obs}` : null,
      score,
      estagio: stageText,
      stage: STAGE_TEXT_TO_ENUM[stageText],
      expected_close_at: toISODate(expectedDate),
    };

    const { data, error } = await supabase.from("opportunities").insert(payload).select().single();
    if (error) return push({ kind: "error", msg: "Erro ao criar oportunidade: " + error.message });

    setLista((s) => [data as any as Oportunidade, ...s]);
    setCreateOpen(false);
    // reset
    setLeadId(""); setVendId(""); setSegmento(SEGMENTOS[0]); setValor(""); setObs(""); setScore(1); setStageText("Novo"); setExpectedDate("");
    push({ kind: "success", msg: "Oportunidade criada!" });
  };

  /* =========================
     Inline edit handler
  ========================= */
  const commitInline = async (o: Oportunidade, field: "valor" | "previsao" | "score" | "estagio", value: any) => {
    const prev = { ...o };
    if (field === "valor") await updateOpp(o.id, { valor_credito: Math.max(0, Number(value) || 0) }, "Valor atualizado.", prev);
    if (field === "previsao") await updateOpp(o.id, { expected_close_at: value || null }, "Previsão atualizada.", prev);
    if (field === "score") await updateOpp(o.id, { score: Math.max(1, Math.min(5, Number(value) || 1)) }, "Score atualizado.", prev);
    if (field === "estagio") await changeStage(o, value as EstagioText);
    setEditingCell(null);
  };

  /* =========================
     Kanban DnD
  ========================= */
  const stagesKanban: EstagioText[] = [
    "Novo",
    "Qualificando",
    "Proposta",
    "Negociação",
    "Fechado (Ganho)",
    "Fechado (Perdido)",
  ];

  const onDragStart = (e: React.DragEvent, id: UUID) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const onDrop = (e: React.DragEvent, stage: EstagioText) => {
    const id = e.dataTransfer.getData("text/plain");
    const opp = lista.find((x) => x.id === id);
    if (opp) changeStage(opp, stage);
  };

  /* =========================
     CSV Export
  ========================= */
  const exportCSV = () => {
    const rows = visiveisBase; // exporta tudo que está filtrado/ordenado
    const headers = [
      cols.lead && "Lead",
      cols.vendedor && "Vendedor",
      cols.segmento && "Segmento",
      cols.valor && "Valor",
      cols.score && "Score",
      cols.estagio && "Estágio",
      cols.previsao && "Previsão",
    ].filter(Boolean) as string[];

    const lines = [headers.join(";")];
    rows.forEach((o) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
      const record = [
        cols.lead ? (lead?.nome || "-") : null,
        cols.vendedor ? (vend?.nome || "-") : null,
        cols.segmento ? o.segmento : null,
        cols.valor ? fmtBRL(o.valor_credito) : null,
        cols.score ? String(o.score) : null,
        cols.estagio ? o.estagio : null,
        cols.previsao ? (o.expected_close_at || "") : null,
      ].filter((x) => x !== null);
      lines.push(record.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oportunidades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* =========================
     UI
  ========================= */
  const ScoreBolinhas = ({ n }: { n: number }) => (
    <span title={n >= 4 ? "Probabilidade alta" : n === 3 ? "Média" : "Baixa"}>
      {"●".repeat(Math.max(1, Math.min(5, n)))}{" "}
      <span style={{ opacity: 0.4 }}>{"●".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );

  const StageBadge = ({ t }: { t: EstagioText }) => (
    <span style={{ background: `${STAGE_META[t].color}20`, color: STAGE_META[t].color, border: `1px solid ${STAGE_META[t].color}66`, padding: "2px 6px", borderRadius: 10, fontSize: 12, whiteSpace: "nowrap" }}>
      {STAGE_META[t].icon} {t}
    </span>
  );

  const WhatsappMenu = ({ lead }: { lead: Lead | undefined }) => {
    const num = phoneToWA(lead?.telefone);
    if (!num) return <span title="Sem telefone">—</span>;
    const base = `https://wa.me/${num}`;
    const templates = [
      `Olá ${lead?.nome?.split(" ")[0] || ""}! Aqui é da Consulmax. Podemos falar rapidinho sobre sua oportunidade?`,
      `Oi ${lead?.nome?.split(" ")[0] || ""}, acabei de enviar sua proposta. Consegue conferir?`,
      `Bom dia ${lead?.nome?.split(" ")[0] || ""}! Lembrando da assembleia/etapas — posso ajudar com documentos?`,
    ];
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <a href={base} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", border: "1px solid #e5e7eb", padding: "4px 8px", borderRadius: 8 }}>
          WhatsApp
        </a>
        <div style={{ display: "inline-block", marginLeft: 6 }}>
          <select
            onChange={(e) => {
              const encoded = encodeURIComponent(e.target.value);
              window.open(`${base}?text=${encoded}`, "_blank");
              e.currentTarget.selectedIndex = 0;
            }}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "4px 6px" }}
          >
            <option value="">Templates…</option>
            {templates.map((t, i) => (
              <option key={i} value={t}>
                {t.slice(0, 38)}…
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const LeadPreview = ({ lead }: { lead?: Lead }) => {
    if (!lead) return null;
    return (
      <div style={{ fontSize: 12, color: "#475569" }} title={`Telefone: ${lead.telefone || "-"}\nEmail: ${lead.email || "-"}\nOrigem: ${lead.origem || "-"}\nDono: ${users.find(u=>u.auth_user_id===lead.owner_id)?.nome || "-"}`}>
        {lead.nome}
      </div>
    );
  };

  const headerCell = (label: string, key: typeof sortBy) => (
    <th
      style={th}
      onClick={() => {
        if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
          setSortBy(key);
          setSortDir("desc");
        }
      }}
    >
      {label} {sortBy === key ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );

  const TableSkeleton = () => (
    <div style={card}>
      <div style={{ height: 10, width: 180, background: "#f1f5f9", borderRadius: 6, marginBottom: 12 }} />
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr 0.8fr 1.2fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
          {[...Array(8)].map((__, j) => (
            <div key={j} style={{ height: 12, background: "#f1f5f9", borderRadius: 6 }} />
          ))}
        </div>
      ))}
    </div>
  );

  /* =========================
     Render
  ========================= */
  return (
    <div style={{ maxWidth: 1280, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui" }}>
      {/* Topbar: busca + ações globais */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", padding: 12, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16, position: "sticky", top: 12, zIndex: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setAcOpen(true);
              setAcIndex(0);
            }}
            onKeyDown={onSearchKey}
            onFocus={() => setAcOpen(true)}
            onBlur={() => setTimeout(() => setAcOpen(false), 120)}
            placeholder="Buscar por lead, vendedor, estágio ou telefone (atalho: /)"
            style={{ ...input, padding: compact ? 8 : 10 }}
          />
          {acOpen && suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto" }}>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onMouseDown={() => setSearch(s)}
                  style={{ padding: "8px 10px", background: i === acIndex ? "#f1f5f9" : "#fff", cursor: "pointer" }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chips de filtro */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "todos", label: "Todos" },
            { id: "meus", label: "Meus" },
            { id: "mes", label: "Este mês" },
          ].map((c: any) => {
            const count =
              c.id === "todos"
                ? lista.length
                : c.id === "meus"
                ? lista.filter((o) => o.vendedor_id === meuId).length
                : lista.filter((o) => new Date(o.created_at) >= new Date(now.getFullYear(), now.getMonth(), 1)).length;
            const active = filterChip === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setFilterChip(c.id)}
                style={{ padding: compact ? "6px 10px" : "8px 12px", borderRadius: 999, border: `1px solid ${active ? "#A11C27" : "#e5e7eb"}`, background: active ? "#A11C27" : "#fff", color: active ? "#fff" : "#0f172a", cursor: "pointer" }}
              >
                {c.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Controles */}
        <button onClick={() => setKanbanMode((v) => !v)} style={btnGhost}>{kanbanMode ? "Tabela" : "Kanban"}</button>
        <button onClick={exportCSV} style={btnGhost}>Exportar CSV</button>
        <button onClick={() => setCreateOpen(true)} style={btnPrimary}>+ Nova</button>

        {/* Colunas */}
        <details>
          <summary style={{ cursor: "pointer", padding: "6px 10px" }}>Colunas</summary>
          <div style={{ position: "absolute", right: 16, marginTop: 6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, zIndex: 20 }}>
            {(Object.keys(cols) as (keyof typeof defaultCols)[]).map((k) => (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 2px" }}>
                <input type="checkbox" checked={cols[k]} onChange={(e) => setCols({ ...cols, [k]: e.target.checked })} /> {k}
              </label>
            ))}
            <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 2px", marginTop: 6, borderTop: "1px dashed #e5e7eb" }}>
              <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Modo compacto
            </label>
          </div>
        </details>
      </div>

      {/* Mini-dashboard + Pipeline (KPI) */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Mini-dashboard</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
          <div style={kpiCard}>Ticket médio: <b>{fmtBRL((visiveisBase.reduce((s, x) => s + (x.valor_credito || 0), 0) / Math.max(1, visiveisBase.length)))}</b></div>
          <div style={kpiCard}>Em aberto: <b>{visiveisBase.length}</b></div>
          <div style={kpiCard}>Com previsão: <b>{visiveisBase.filter((x) => x.expected_close_at).length}</b></div>
          <div style={kpiCard}>Valor total: <b>{fmtBRL(visiveisBase.reduce((s, x) => s + (x.valor_credito || 0), 0))}</b></div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 12 }}>
          {kpis.map((k, i) => {
            const t: EstagioText = (STAGE_ENUM_TO_TEXT as any)[k.stage] || (k.stage as EstagioText);
            return (
              <div key={i} style={card}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  <StageBadge t={t} />
                </div>
                <div>Qtd: <b>{k.qtd}</b></div>
                <div>Valor: <b>{fmtBRL(k.total)}</b></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista ou Kanban */}
      {loading ? (
        <TableSkeleton />
      ) : kanbanMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 12 }}>
          {stagesKanban.map((stage) => {
            const items = visiveisBase.filter((o) => o.estagio === stage);
            const soma = items.reduce((s, x) => s + (x.valor_credito || 0), 0);
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, stage)}
                style={{ ...card, minHeight: 180, background: "#fafafa" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <StageBadge t={stage} />
                  <span style={{ fontSize: 12, color: "#475569" }}>{items.length} • {fmtBRL(soma)}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((o) => {
                    const lead = leads.find((l) => l.id === o.lead_id);
                    return (
                      <div key={o.id} draggable onDragStart={(e) => onDragStart(e, o.id)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                          <span>{lead?.nome || "-"}</span>
                          <span>{fmtBRL(o.valor_credito)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                          <span><ScoreBolinhas n={o.score || 1} /></span>
                          <span>{fmtDateBR(o.expected_close_at)}</span>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button onClick={() => setEditing(o)} style={btnSmallPrimary}>Tratar</button>{" "}
                          <button onClick={() => openHistory(o.id)} style={btnGhost}>Histórico</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Oportunidades</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 5 }}>
                <tr>
                  {cols.lead && headerCell("Lead", "criado")}
                  {cols.vendedor && <th style={th}>Vendedor</th>}
                  {cols.segmento && <th style={th}>Segmento</th>}
                  {cols.valor && headerCell("Valor", "valor")}
                  {cols.score && headerCell("Score", "score")}
                  {cols.estagio && <th style={th}>Estágio</th>}
                  {cols.previsao && headerCell("Previsão", "previsao")}
                  {cols.acoes && <th style={th}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((o, idx) => {
                  const lead = leads.find((l) => l.id === o.lead_id);
                  const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
                  const slaDays = STAGE_META[o.estagio as EstagioText]?.slaDays;
                  const stale =
                    slaDays && o.stage_changed_at
                      ? (Date.now() - new Date(o.stage_changed_at).getTime()) / 86400000 > slaDays
                      : false;
                  const rowStyle: CSSProperties = { background: idx % 2 === 0 ? "#fafafa" : "#fff" };
                  return (
                    <tr key={o.id} style={rowStyle}>
                      {cols.lead && (
                        <td style={td}>
                          <LeadPreview lead={lead} />
                          <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                            <WhatsappMenu lead={lead} />
                          </div>
                        </td>
                      )}
                      {cols.vendedor && <td style={td}>{vend?.nome || "-"}</td>}
                      {cols.segmento && <td style={td}>{o.segmento}</td>}

                      {cols.valor && (
                        <td style={td}>
                          {editingCell?.id === o.id && editingCell.field === "valor" ? (
                            <input
                              autoFocus
                              defaultValue={o.valor_credito}
                              onBlur={(e) => commitInline(o, "valor", e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInline(o, "valor", (e.target as HTMLInputElement).value);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              style={input}
                            />
                          ) : (
                            <span onDoubleClick={() => setEditingCell({ id: o.id, field: "valor" })} style={{ cursor: "text" }}>
                              {fmtBRL(o.valor_credito)}
                            </span>
                          )}
                        </td>
                      )}

                      {cols.score && (
                        <td style={td}>
                          {editingCell?.id === o.id && editingCell.field === "score" ? (
                            <input
                              type="number"
                              min={1}
                              max={5}
                              autoFocus
                              defaultValue={o.score}
                              onBlur={(e) => commitInline(o, "score", e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInline(o, "score", (e.target as HTMLInputElement).value);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              style={{ ...input, width: 80 }}
                            />
                          ) : (
                            <span onDoubleClick={() => setEditingCell({ id: o.id, field: "score" })} style={{ cursor: "text" }}>
                              <ScoreBolinhas n={o.score || 1} />
                            </span>
                          )}
                        </td>
                      )}

                      {cols.estagio && (
                        <td style={{ ...td, color: stale ? "#ef4444" : undefined }} title={stale ? "Atrasado para este estágio" : ""}>
                          {editingCell?.id === o.id && editingCell.field === "estagio" ? (
                            <select
                              autoFocus
                              defaultValue={o.estagio}
                              onBlur={(e) => commitInline(o, "estagio", e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInline(o, "estagio", (e.target as HTMLSelectElement).value);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              style={input}
                            >
                              {(Object.keys(STAGE_TEXT_TO_ENUM) as EstagioText[]).map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span onDoubleClick={() => setEditingCell({ id: o.id, field: "estagio" })} style={{ cursor: "pointer" }}>
                              <StageBadge t={o.estagio as EstagioText} />
                            </span>
                          )}
                        </td>
                      )}

                      {cols.previsao && (
                        <td style={td}>
                          {editingCell?.id === o.id && editingCell.field === "previsao" ? (
                            <input
                              type="date"
                              autoFocus
                              defaultValue={o.expected_close_at || ""}
                              onBlur={(e) => commitInline(o, "previsao", e.currentTarget.value || null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInline(o, "previsao", (e.target as HTMLInputElement).value || null);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              style={input}
                            />
                          ) : (
                            <span onDoubleClick={() => setEditingCell({ id: o.id, field: "previsao" })} style={{ cursor: "text" }}>
                              {fmtDateBR(o.expected_close_at)}
                            </span>
                          )}
                        </td>
                      )}

                      {cols.acoes && (
                        <td style={td}>
                          <button onClick={() => setEditing(o)} style={btnSmallPrimary}>Tratar</button>{" "}
                          <button onClick={() => duplicateOpp(o)} style={btnGhost}>Duplicar</button>{" "}
                          <button onClick={() => openHistory(o.id)} style={btnGhost}>Histórico</button>{" "}
                          <details style={{ display: "inline-block", marginLeft: 6 }}>
                            <summary style={{ cursor: "pointer", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 8, display: "inline-block" }}>
                              ⋯
                            </summary>
                            <div style={{ position: "absolute", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                              <div style={{ marginBottom: 6, fontSize: 12, color: "#64748b" }}>Mudar estágio</div>
                              {(Object.keys(STAGE_TEXT_TO_ENUM) as EstagioText[]).map((t) => (
                                <button key={t} onClick={() => changeStage(o, t)} style={{ ...btnLink }}>
                                  {t}
                                </button>
                              ))}
                              <hr />
                              <button onClick={() => archiveOpp(o)} style={{ ...btnLink, color: "#ef4444" }}>
                                Arquivar
                              </button>
                            </div>
                          </details>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!visiveis.length && (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: "#64748b" }}>
                      Nenhuma oportunidade encontrada com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div ref={sentinelRef} style={{ height: 8 }} />
          </div>
        </div>
      )}

      {/* Modal: Nova oportunidade */}
      {createOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Lead</label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={input}>
                  <option value="">Selecione</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} {l.telefone ? "— " + onlyDigits(l.telefone) : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Vendedor</label>
                <select value={vendId} onChange={(e) => setVendId(e.target.value)} style={input}>
                  <option value="">Selecione</option>
                  {vendedores.map((v) => (
                    <option key={v.auth_user_id} value={v.auth_user_id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Segmento</label>
                <select value={segmento} onChange={(e) => setSegmento(e.target.value)} style={input}>
                  {SEGMENTOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Valor (R$)</label>
                <input value={valor} onChange={(e) => setValor(e.target.value)} style={input} placeholder="80.000,00" />
              </div>
              <div>
                <label style={label}>Observações</label>
                <input value={obs} onChange={(e) => setObs(e.target.value)} style={input} placeholder="Observação inicial (opcional)" />
              </div>
              <div>
                <label style={label}>Score</label>
                <select value={String(score)} onChange={(e) => setScore(Number(e.target.value))} style={input}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Estágio</label>
                <select value={stageText} onChange={(e) => setStageText(e.target.value as EstagioText)} style={input}>
                  {(Object.keys(STAGE_TEXT_TO_ENUM) as EstagioText[]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Previsão (dd/mm/aaaa)</label>
                <input value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={input} placeholder="dd/mm/aaaa" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarOportunidade} style={btnPrimary}>Criar</button>
              <button onClick={() => setCreateOpen(false)} style={btnGhost}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tratar */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Tratar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Segmento</label>
                <select
                  value={editing.segmento}
                  onChange={(e) => setEditing({ ...editing, segmento: e.target.value })}
                  style={input}
                >
                  {SEGMENTOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Valor (R$)</label>
                <input
                  value={String(editing.valor_credito)}
                  onChange={(e) => setEditing({ ...editing, valor_credito: moedaParaNumeroBR(e.target.value) })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>Score</label>
                <select
                  value={String(editing.score)}
                  onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })}
                  style={input}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Estágio</label>
                <select
                  value={String(editing.estagio)}
                  onChange={(e) => setEditing({ ...editing, estagio: e.target.value as EstagioText })}
                  style={input}
                >
                  {(Object.keys(STAGE_TEXT_TO_ENUM) as EstagioText[]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Previsão (aaaa-mm-dd)</label>
                <input
                  value={editing.expected_close_at || ""}
                  onChange={(e) => setEditing({ ...editing, expected_close_at: e.target.value || null })}
                  style={input}
                  placeholder="2025-09-20"
                />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>Observações</label>
                <textarea
                  value={editing.observacao || ""}
                  onChange={(e) => setEditing({ ...editing, observacao: e.target.value })}
                  style={{ ...input, minHeight: 100 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => saveEdit(editing)} style={btnPrimary}>Salvar</button>
              <button onClick={() => setEditing(null)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Histórico */}
      {historyOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Histórico de alterações</h3>
            <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 8 }}>
              {historyData.map((h) => (
                <div key={h.id} style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {fmtDateTime(h.changed_at)} — <b>{h.user_name}</b>
                  </div>
                  {renderAuditDiffs(h)}
                </div>
              ))}
              {!historyData.length && <div style={{ color: "#64748b" }}>(Nenhum histórico encontrado)</div>}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={() => setHistoryOpen(false)} style={btnGhost}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 16, right: 16, display: "grid", gap: 8, zIndex: 60 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: t.kind === "error" ? "#fee2e2" : t.kind === "success" ? "#dcfce7" : "#e0f2fe", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(0,0,0,.08)" }}>
            <div style={{ marginBottom: t.undo ? 6 : 0 }}>{t.msg}</div>
            {t.undo && (
              <button
                onClick={() => t.undo && t.undo()}
                style={{ ...btnLink, fontWeight: 700 }}
              >
                Desfazer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Estilos
========================= */
const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1E293F",
  marginBottom: 8,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,.06)",
  padding: 12,
};
const kpiCard: React.CSSProperties = {
  ...card,
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "1fr 1fr",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};
const th: React.CSSProperties = { textAlign: "left", padding: 8, fontSize: 12, color: "#475569", cursor: "pointer" };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #e5e7eb", verticalAlign: "top" };
const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};
const btnSmallPrimary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};
const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 700,
};
const btnLink: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: "4px 6px",
  cursor: "pointer",
  color: "#1E293F",
  textAlign: "left",
};
