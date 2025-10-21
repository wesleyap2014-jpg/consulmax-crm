// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================================================
   Tipos
========================================================= */
type Lead = {
  id: string;
  nome: string;
  owner_id: string | null;
  telefone?: string | null;
  email?: string | null;
};

type Vendedor = { auth_user_id: string; nome: string };

type StageUI = "novo" | "qualificando" | "proposta" | "negociacao";
type EstagioDB = "Novo" | "Qualificando" | "Proposta" | "Negociação" | "Fechado (Ganho)" | "Fechado (Perdido)";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  owner_id?: string | null;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;
  estagio: EstagioDB | string;
  expected_close_at: string | null; // ISO (YYYY-MM-DD) ou null
  created_at: string;
};

/* =========================================================
   Constantes / Cores
========================================================= */
const COLORS = {
  brand: "#A11C27",
  brandSoft: "#EED5D8",
  bg: "#F5F5F5",
  ink: "#1E293F",
  gold: "#B5A573",
  sand: "#E0CE8C",
  ok: "#16a34a",
  warn: "#f59e0b",
  danger: "#dc2626",
  neutral: "#64748b",
};

const BTN = {
  base: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: COLORS.ink,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  primary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: 0,
    background: COLORS.brand,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  ghost: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: COLORS.ink,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  secondary: {
    padding: "8px 12px",
    borderRadius: 10,
    background: "#f1f5f9",
    color: COLORS.ink,
    border: "1px solid #e2e8f0",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

/* =========================================================
   Helpers
========================================================= */
const uiToDB: Record<StageUI, EstagioDB> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  negociacao: "Negociação",
};

const dbToUI: Partial<Record<string, StageUI>> = {
  Novo: "novo",
  Qualificando: "qualificando",
  Qualificação: "qualificando",
  Qualificacao: "qualificando",
  Proposta: "proposta",
  Negociação: "negociacao",
  Negociacao: "negociacao",
};

const segmentos = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

const onlyDigits = (s?: string | null) => (s || "").replace(/\D+/g, "");
const formatPhoneBR = (telefone?: string | null) => {
  const d = onlyDigits(telefone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone || "";
};
const normalizePhoneToWa = (telefone?: string | null) => {
  const d = onlyDigits(telefone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  if (d.length >= 12 && !d.startsWith("55")) return "55" + d;
  return null;
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

// notação curta: 10,2 Mi / 1,2 Bi
const shortMoney = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")} Bi`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} Mi`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return fmtBRL(n);
};

// status por data de previsão
const dateStatus = (iso?: string | null): "overdue" | "today" | "soon" | null => {
  if (!iso) return null;
  const today = new Date();
  const d = new Date(iso + "T00:00:00");
  const diffDays = Math.floor((d.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays > 0 && diffDays <= 5) return "soon";
  return null;
};

// Ordenação por previsão: mais atrasado primeiro, sem data no fim
const tsOrInf = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").getTime() : Number.POSITIVE_INFINITY);

// Datas BR <-> ISO para máscara
const maskDateBR = (s: string) => {
  const d = s.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};
const isoToBR = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "");
const brToISO = (br: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/* =========================================================
   Componentes pequenos (ícones / botões)
========================================================= */
const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={muted ? "none" : "currentColor"} stroke={muted ? "currentColor" : "none"} strokeWidth="1.2" aria-hidden="true">
    <path d="M12.04 0C5.44 0 .1 5.34.1 11.94c0 2.06.54 4.08 1.57 5.87L0 24l6.39-1.8a12 12 0 0 0 5.65 1.4C18.64 23.6 24 18.26 24 11.96 24 5.36 18.64 0 12.04 0Zm0 21.2c-1.77 0-3.48-.46-4.97-1.34l-.36-.21-3.78 1.06 1.05-3.69-.22-.38A9.17 9.17 0 1 1 21.2 11.96c0 5.06-4.1 9.24-9.16 9.24Zm5.18-6.91c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.94-.93 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.44-2.33-1.42-.86-.76-1.44-1.69-1.61-1.98-.17-.29-.02-.45.13-.6.13-.12.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.64-1.57-.9-2.15-.24-.57-.49-.49-.66-.5h-.57c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.41s1.03 2.8 1.17 3.01c.14.2 2 3.18 4.84 4.34 2.39.94 2.88.76 3.4.71.52-.05 1.68-.69 1.93-1.36.25-.67.25-1.23.17-1.36-.07-.13-.26-.2-.55-.35Z" />
  </svg>
);

const IconPhone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.55.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.21.2 2.41.57 3.55a1 1 0 01-.24 1.01l-2.2 2.23z" />
  </svg>
);

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v.72l-10 6.25L2 6.72V6zm0 2.98V18a2 2 0 002 2h16a2 2 0 002-2V8.98l-9.38 5.86a2 2 0 01-2.24 0L2 8.98z" />
  </svg>
);

const IconEdit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

const IconSwap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 10l-5 5h3v4h4v-4h3l-5-5zm10-6v4h-3l5 5 5-5h-3V4h-4z" />
  </svg>
);

const Tag = ({ kind, children }: { kind: "overdue" | "today" | "soon"; children: React.ReactNode }) => {
  const map = {
    overdue: { bg: "#fee2e2", bd: "#fecaca", fg: COLORS.danger, label: "Atrasado" },
    today: { bg: "#dcfce7", bd: "#bbf7d0", fg: COLORS.ok, label: "Hoje" },
    soon: { bg: "#fff7ed", bd: "#ffedd5", fg: COLORS.warn, label: "Breve" },
  } as const;
  const c = map[kind];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
      }}
      title={c.label}
    >
      {children}
    </span>
  );
};

/* =========================================================
   Página
========================================================= */
export default function Oportunidades() {
  const PAGE_COL = 5; // até 5 por coluna
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);

  // paginação única
  const [page, setPage] = useState(1);

  // modal "Tratar Lead"
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");
  const [editDateBR, setEditDateBR] = useState("");

  // modal "Nova oportunidade"
  const [createOpen, setCreateOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDateBR, setExpectedDateBR] = useState("");

  // carregar dados
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: l } = await supabase.from("leads").select("id, nome, owner_id, telefone, email").order("created_at", { ascending: false });
        setLeads(l || []);

        const { data: v } = await supabase.rpc("listar_vendedores");
        setVendedores((v || []) as Vendedor[]);

        const { data: o } = await supabase
          .from("opportunities")
          .select(
            "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
          )
          .order("created_at", { ascending: false });

        setLista((o || []) as Oportunidade[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // filtro de busca
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;

    const match = (o: Oportunidade) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const vendedor = vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome?.toLowerCase() || "";
      const leadNome = lead?.nome?.toLowerCase() || "";
      const est = String(o.estagio).toLowerCase();
      const phone = lead?.telefone ? formatPhoneBR(lead.telefone).toLowerCase() : "";

      return leadNome.includes(q) || vendedor.includes(q) || est.includes(q) || phone.includes(q);
    };
    return lista.filter(match);
  }, [lista, leads, vendedores, search]);

  // listas por estágio + ordenação (mais atrasado primeiro; sem data no fim)
  const colNovo = useMemo(
    () =>
      visiveis
        .filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "novo")
        .sort((a, b) => tsOrInf(a.expected_close_at) - tsOrInf(b.expected_close_at)),
    [visiveis]
  );
  const colQualificando = useMemo(
    () =>
      visiveis
        .filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "qualificando")
        .sort((a, b) => tsOrInf(a.expected_close_at) - tsOrInf(b.expected_close_at)),
    [visiveis]
  );
  const colPropostas = useMemo(
    () =>
      visiveis
        .filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "proposta")
        .sort((a, b) => tsOrInf(a.expected_close_at) - tsOrInf(b.expected_close_at)),
    [visiveis]
  );
  const colNegociacao = useMemo(
    () =>
      visiveis
        .filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "negociacao")
        .sort((a, b) => tsOrInf(a.expected_close_at) - tsOrInf(b.expected_close_at)),
    [visiveis]
  );

  // total de páginas (única) baseado na maior coluna
  const totalPages = useMemo(() => {
    const maxLen = Math.max(colNovo.length, colQualificando.length, colPropostas.length, colNegociacao.length, 1);
    return Math.max(1, Math.ceil(maxLen / PAGE_COL));
  }, [colNovo.length, colQualificando.length, colPropostas.length, colNegociacao.length]);

  // KPI por estágio (apenas 4 boxes)
  const kpi = useMemo(() => {
    const base: Record<StageUI, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
    };
    for (const o of visiveis) {
      const k = dbToUI[o.estagio as string] ?? "novo";
      if (k in base) {
        base[k as StageUI].qtd += 1;
        base[k as StageUI].total += Number(o.valor_credito || 0);
      }
    }
    return base;
  }, [visiveis]);

  /* ==================== Actions ==================== */
  function openEdit(o: Oportunidade) {
    setEditing(o);
    setNewNote("");
    setEditDateBR(isoToBR(o.expected_close_at)); // máscara BR
  }
  function closeEdit() {
    setEditing(null);
    setNewNote("");
    setEditDateBR("");
  }

  async function saveEdit() {
    if (!editing) return;

    const historico =
      (editing.observacao ? editing.observacao + "\n\n" : "") +
      (newNote ? `[${new Date().toLocaleString("pt-BR")}]\n${newNote}` : "");

    const payload = {
      segmento: editing.segmento,
      valor_credito: editing.valor_credito,
      score: editing.score,
      estagio: ((): EstagioDB => {
        const s = String(editing.estagio);
        if (s === "Fechado (Ganho)" || s === "Fechado (Perdido)" || s === "Negociação" || s === "Proposta" || s === "Qualificando" || s === "Novo") {
          return s as EstagioDB;
        }
        // normaliza se veio "negociacao"/etc.
        const mapBack: Record<string, EstagioDB> = {
          negociacao: "Negociação",
          proposta: "Proposta",
          qualificando: "Qualificando",
          novo: "Novo",
        };
        return (mapBack[s] || "Novo") as EstagioDB;
      })(),
      expected_close_at: editDateBR ? brToISO(editDateBR) : null, // salva ISO
      observacao: historico || editing.observacao || null,
    };

    const { error, data } = await supabase.from("opportunities").update(payload).eq("id", editing.id).select().single();
    if (error) {
      alert("Falha ao salvar: " + error.message);
      return;
    }
    setLista((s) => s.map((x) => (x.id === editing.id ? (data as Oportunidade) : x)));
    closeEdit();
  }

  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = Number((valor || "0").replace(/[^\d]/g, "")) || 0;
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    const iso = expectedDateBR ? brToISO(expectedDateBR) : null;

    const payload = {
      lead_id: leadId,
      vendedor_id: vendId,
      owner_id: vendId,
      segmento,
      valor_credito: valorNum,
      observacao: obs ? `[${new Date().toLocaleString("pt-BR")}]\n${obs}` : null,
      score,
      estagio: uiToDB[stageUI] as EstagioDB,
      expected_close_at: iso,
    };

    const { data, error } = await supabase.from("opportunities").insert([payload]).select().single();
    if (error) {
      alert("Erro ao criar oportunidade: " + error.message);
      return;
    }
    setLista((s) => [data as Oportunidade, ...s]);
    // reset
    setCreateOpen(false);
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setObs("");
    setScore(1);
    setStageUI("novo");
    setExpectedDateBR("");
  }

  /* ==================== UI Helpers ==================== */
  const CardActions: React.FC<{ lead?: Lead; onEditLead?: () => void; onReassign?: () => void; onTratar?: () => void }> = ({
    lead,
    onEditLead,
    onReassign,
    onTratar,
  }) => {
    const wa = normalizePhoneToWa(lead?.telefone);
    const hasMail = !!lead?.email;
    const telHref = lead?.telefone ? `tel:${onlyDigits(lead.telefone)}` : undefined;
    return (
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <a
          href={telHref}
          onClick={(e) => {
            if (!telHref) e.preventDefault();
          }}
          style={{
            ...BTN.secondary,
            padding: "6px 10px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: COLORS.ink,
          }}
          title={lead?.telefone ? `Ligar para ${formatPhoneBR(lead?.telefone)}` : "Sem telefone"}
        >
          <IconPhone /> Ligar
        </a>

        <a
          href={wa ? `https://wa.me/${wa}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!wa) e.preventDefault();
          }}
          style={{
            ...BTN.secondary,
            padding: "6px 10px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: COLORS.ink,
          }}
          title={wa ? "Abrir WhatsApp" : "Sem telefone"}
        >
          <WhatsappIcon muted={!wa} /> WhatsApp
        </a>

        <a
          href={hasMail ? `mailto:${lead?.email}` : undefined}
          onClick={(e) => {
            if (!hasMail) e.preventDefault();
          }}
          style={{
            ...BTN.secondary,
            padding: "6px 10px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: hasMail ? COLORS.ink : COLORS.neutral,
            opacity: hasMail ? 1 : 0.5,
          }}
          title={hasMail ? "Enviar e-mail" : "Sem e-mail"}
        >
          <IconMail /> E-mail
        </a>

        <button
          style={{ ...BTN.secondary, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={onEditLead}
          title="Editar Lead"
        >
          <IconEdit /> Editar
        </button>

        <button
          style={{ ...BTN.secondary, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={onReassign}
          title="Reatribuir"
        >
          <IconSwap /> Reatribuir
        </button>

        <button style={{ ...BTN.primary, padding: "6px 10px" }} onClick={onTratar}>
          Tratar
        </button>
      </div>
    );
  };

  const LeadInlineEdit: React.FC<{ lead: Lead; onSaved: (lead: Lead) => void }> = ({ lead, onSaved }) => {
    const [nome, setNome] = useState(lead.nome);
    const [telefone, setTelefone] = useState(lead.telefone || "");
    const [email, setEmail] = useState(lead.email || "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
      setSaving(true);
      try {
        const payload = {
          nome: nome.trim(),
          telefone: onlyDigits(telefone) || null,
          email: email.trim().toLowerCase() || null,
        };
        const { data, error } = await supabase.from("leads").update(payload).eq("id", lead.id).select().single();
        if (error) {
          alert("Erro ao salvar lead: " + error.message);
          return;
        }
        onSaved(data as Lead);
      } finally {
        setSaving(false);
      }
    };

    return (
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr auto" }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={inputStyle} />
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} style={inputStyle} placeholder="Telefone" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="E-mail" />
        <button style={BTN.primary} onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    );
  };

  /* ==================== Donut simples (SVG) ==================== */
  const Donut: React.FC<{ title: string; segments: { label: string; value: number; color: string }[] }> = ({ title, segments }) => {
    const total = segments.reduce((a, b) => a + b.value, 0);
    let acc = 0;

    const [hover, setHover] = useState<number | null>(null);

    return (
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 16 }}>
        <div style={{ fontWeight: 800, color: COLORS.ink, marginBottom: 12 }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "center" }}>
          <svg width="180" height="180" viewBox="0 0 42 42" style={{ overflow: "visible" }}>
            <circle cx="21" cy="21" r="15.9155" fill="#fff" stroke="#e5e7eb" strokeWidth="6" />
            {segments.map((s, i) => {
              const val = total > 0 ? s.value / total : 0;
              const dash = `${(val * 100).toFixed(2)} ${100 - val * 100}`;
              const rotate = (acc / total) * 360;
              acc += s.value;
              const isHover = hover === i;
              return (
                <circle
                  key={i}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth={isHover ? 7 : 6}
                  strokeDasharray={dash}
                  strokeDashoffset="25"
                  transform={`rotate(${rotate} 21 21)`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "all .15s" }}
                />
              );
            })}
          </svg>
          <div style={{ display: "grid", gap: 6 }}>
            {segments.map((s, i) => (
              <div
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  background: hover === i ? "#f8fafc" : "transparent",
                  padding: "4px 6px",
                  borderRadius: 8,
                }}
              >
                <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
                <span style={{ color: COLORS.ink, fontWeight: 700 }}>{s.label}</span>
                <span style={{ color: COLORS.neutral, marginLeft: "auto" }}>{shortMoney(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* ==================== Render ==================== */
  const renderCol = (title: string, items: Oportunidade[]) => {
    const sliceFrom = (page - 1) * PAGE_COL;
    const sliceTo = sliceFrom + PAGE_COL;
    const rows = items.slice(sliceFrom, sliceTo);

    return (
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 14, minHeight: 360 }}>
        <div style={{ fontWeight: 800, color: COLORS.ink, marginBottom: 10 }}>{title}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((o) => {
            const lead = leads.find((l) => l.id === o.lead_id);
            const vendedor = vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-";
            const st = dateStatus(o.expected_close_at);
            return (
              <div key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800, color: COLORS.ink }}>{lead?.nome || "-"}</div>
                  {st === "overdue" && <Tag kind="overdue">Atrasado</Tag>}
                  {st === "today" && <Tag kind="today">Hoje</Tag>}
                  {st === "soon" && <Tag kind="soon">Breve</Tag>}
                  <div style={{ marginLeft: "auto", fontSize: 12, color: COLORS.neutral }}>Vendedor: <strong style={{ color: COLORS.ink }}>{vendedor}</strong></div>
                </div>

                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                  <div>
                    <div style={{ color: COLORS.neutral, fontSize: 12 }}>Segmento</div>
                    <div style={{ color: COLORS.ink }}>{o.segmento}</div>
                  </div>
                  <div>
                    <div style={{ color: COLORS.neutral, fontSize: 12 }}>Valor</div>
                    <div style={{ color: COLORS.ink }}>{fmtBRL(o.valor_credito)}</div>
                  </div>
                  <div>
                    <div style={{ color: COLORS.neutral, fontSize: 12 }}>Prob.</div>
                    <div style={{ color: COLORS.ink }}>{"★".repeat(Math.max(1, Math.min(5, o.score)))}</div>
                  </div>
                  <div>
                    <div style={{ color: COLORS.neutral, fontSize: 12 }}>Previsão</div>
                    <div style={{ color: COLORS.ink }}>
                      {o.expected_close_at ? new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                    </div>
                  </div>
                </div>

                <CardActions
                  lead={lead}
                  onEditLead={() => {
                    if (!lead) return;
                    const after = (updated: Lead) => {
                      setLeads((ls) => ls.map((x) => (x.id === updated.id ? updated : x)));
                    };
                    // inline editor simples
                    const host = document.createElement("div");
                    const row = document.getElementById(`row_${o.id}`);
                    (row || document.body).appendChild(host);
                    const unmount = () => {
                      if (host.parentNode) host.parentNode.removeChild(host);
                    };
                    const Inline = () => {
                      const [open, setOpen] = useState(true);
                      if (!open) return null;
                      return (
                        <div style={{ marginTop: 10 }}>
                          <LeadInlineEdit
                            lead={lead}
                            onSaved={(upd) => {
                              after(upd);
                              setOpen(false);
                              unmount();
                            }}
                          />
                        </div>
                      );
                    };
                    // render inline imperativamente
                    // (opção simples sem libs externas)
                    // @ts-ignore
                    ReactDOM.render(<Inline />, host);
                  }}
                  onReassign={() => {
                    alert("Para reatribuir por enquanto use a tela de Leads. (Podemos plugar um modal aqui se quiser.)");
                  }}
                  onTratar={() => openEdit(o)}
                />
              </div>
            );
          })}

          {!rows.length && (
            <div style={{ color: COLORS.neutral, fontSize: 13 }}>Sem itens nesta página.</div>
          )}
        </div>
      </div>
    );
  };

  // valores dos donuts (exemplo simples a partir de visiveis)
  const sumBy = (pred: (o: Oportunidade) => boolean) => visiveis.filter(pred).reduce((a, b) => a + (b.valor_credito || 0), 0);

  const donutGanho = [
    { label: "Automóvel", value: sumBy((o) => o.estagio === "Fechado (Ganho)" && o.segmento === "Automóvel"), color: COLORS.brand },
    { label: "Imóvel", value: sumBy((o) => o.estagio === "Fechado (Ganho)" && o.segmento === "Imóvel"), color: COLORS.gold },
    { label: "Motocicleta", value: sumBy((o) => o.estagio === "Fechado (Ganho)" && o.segmento === "Motocicleta"), color: COLORS.ink },
    { label: "Outros", value: sumBy((o) => o.estagio === "Fechado (Ganho)" && !["Automóvel", "Imóvel", "Motocicleta"].includes(o.segmento)), color: COLORS.sand },
  ];
  const donutPerdido = [
    { label: "Automóvel", value: sumBy((o) => o.estagio === "Fechado (Perdido)" && o.segmento === "Automóvel"), color: COLORS.brandSoft },
    { label: "Imóvel", value: sumBy((o) => o.estagio === "Fechado (Perdido)" && o.segmento === "Imóvel"), color: COLORS.gold },
    { label: "Motocicleta", value: sumBy((o) => o.estagio === "Fechado (Perdido)" && o.segmento === "Motocicleta"), color: COLORS.ink },
    { label: "Outros", value: sumBy((o) => o.estagio === "Fechado (Perdido)" && !["Automóvel", "Imóvel", "Motocicleta"].includes(o.segmento)), color: COLORS.sand },
  ];

  /* ==================== JSX ==================== */
  return (
    <div style={{ maxWidth: 1300, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      {/* Topbar */}
      <div
        style={{
          background: "#fff",
          padding: 12,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, margin: 0, flex: 1 }}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
        <button onClick={() => setCreateOpen(true)} style={BTN.primary}>
          + Nova Oportunidade
        </button>
      </div>

      {/* Pipeline por estágio */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.2 }}>
          Pipeline por estágio
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {(
            [
              { id: "novo", label: "Novo" },
              { id: "qualificando", label: "Qualificando" },
              { id: "proposta", label: "Proposta" },
              { id: "negociacao", label: "Negociação" },
            ] as { id: StageUI; label: string }[]
          ).map(({ id, label }) => (
            <div key={id} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 14 }}>
              <div style={{ fontWeight: 800, color: COLORS.ink, marginBottom: 6 }}>{label}</div>
              <div style={{ color: COLORS.ink }}>Qtd: {kpi[id].qtd}</div>
              <div style={{ color: COLORS.ink }}>Valor: {shortMoney(kpi[id].total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Oportunidades (4 colunas) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
        {renderCol("Novo", colNovo)}
        {renderCol("Qualificando", colQualificando)}
        {renderCol("Propostas", colPropostas)}
        {renderCol("Negociação", colNegociacao)}
      </div>

      {/* Paginação única */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          style={{ ...BTN.secondary, opacity: page <= 1 ? 0.5 : 1 }}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ‹ Anterior
        </button>
        <span style={{ fontSize: 12, color: "#475569" }}>
          Página {page} de {totalPages}
        </span>
        <button
          style={{ ...BTN.secondary, opacity: page >= totalPages ? 0.5 : 1 }}
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Próxima ›
        </button>
      </div>

      {/* Donuts Finalizados */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.2 }}>
          Finalizados
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Donut title="Fechado (Ganho)" segments={donutGanho} />
          <Donut title="Fechado (Perdido)" segments={donutPerdido} />
        </div>
      </div>

      {/* Modal: Tratar Lead */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Tratar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Segmento</label>
                <select
                  value={editing.segmento}
                  onChange={(e) => setEditing({ ...editing, segmento: e.target.value })}
                  style={inputStyle}
                >
                  {segmentos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Valor do crédito (R$)</label>
                <input
                  value={String(editing.valor_credito)}
                  onChange={(e) => setEditing({ ...editing, valor_credito: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Probabilidade</label>
                <select
                  value={String(editing.score)}
                  onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })}
                  style={inputStyle}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Estágio</label>
                <select
                  value={String(editing.estagio)}
                  onChange={(e) => setEditing({ ...editing, estagio: e.target.value })}
                  style={inputStyle}
                >
                  <option value="Novo">Novo</option>
                  <option value="Qualificando">Qualificando</option>
                  <option value="Proposta">Proposta</option>
                  <option value="Negociação">Negociação</option>
                  <option value="Fechado (Ganho)">Fechado (Ganho)</option>
                  <option value="Fechado (Perdido)">Fechado (Perdido)</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Previsão (dd/mm/aaaa)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={editDateBR}
                  onChange={(e) => setEditDateBR(maskDateBR(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>Adicionar observação</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ ...inputStyle, minHeight: 90 }}
                  placeholder="Escreva uma nova observação. O histórico anterior será mantido."
                />
                <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico</div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 8,
                      maxHeight: 180,
                      overflowY: "auto",
                    }}
                  >
                    {editing.observacao || "(sem anotações)"}
                  </pre>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveEdit} style={BTN.primary}>
                Salvar alterações
              </button>
              <button onClick={closeEdit} style={BTN.ghost}>
                Cancelar
              </button>
            </div>
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
                <label style={labelStyle}>Selecionar um Lead</label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={inputStyle}>
                  <option value="">Selecione um Lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} {l.telefone ? `— ${formatPhoneBR(l.telefone)}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Selecione um Vendedor</label>
                <select value={vendId} onChange={(e) => setVendId(e.target.value)} style={inputStyle}>
                  <option value="">Selecione um Vendedor</option>
                  {vendedores.map((v) => (
                    <option key={v.auth_user_id} value={v.auth_user_id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Selecione um Segmento</label>
                <select value={segmento} onChange={(e) => setSegmento(e.target.value)} style={inputStyle}>
                  {segmentos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Valor do crédito (R$)</label>
                <input value={valor} onChange={(e) => setValor(e.target.value)} style={inputStyle} placeholder="Ex.: 80.000" />
              </div>

              <div>
                <label style={labelStyle}>Observações</label>
                <input value={obs} onChange={(e) => setObs(e.target.value)} style={inputStyle} placeholder="Observação inicial (opcional)" />
              </div>

              <div>
                <label style={labelStyle}>Probabilidade de fechamento</label>
                <select value={String(score)} onChange={(e) => setScore(Number(e.target.value))} style={inputStyle}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Estágio</label>
                <select value={stageUI} onChange={(e) => setStageUI(e.target.value as StageUI)} style={inputStyle}>
                  <option value="novo">Novo</option>
                  <option value="qualificando">Qualificando</option>
                  <option value="proposta">Proposta</option>
                  <option value="negociacao">Negociação</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Data prevista (dd/mm/aaaa)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={expectedDateBR}
                  onChange={(e) => setExpectedDateBR(maskDateBR(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarOportunidade} disabled={loading} style={BTN.primary}>
                {loading ? "Criando..." : "Criar oportunidade"}
              </button>
              <button onClick={() => setCreateOpen(false)} style={BTN.ghost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   estilos locais
========================================================= */
const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.3)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};

const modalCard: React.CSSProperties = {
  width: "min(980px, 94vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "1fr 1fr",
};
