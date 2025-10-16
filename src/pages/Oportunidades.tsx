// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** =========================
 * Tipos
 * ========================= */
type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  owner_id: string | null;
};

type Vendedor = { auth_user_id: string; nome: string };

type StageUI = "novo" | "qualificando" | "proposta" | "negociacao";
type EstagioDB = "Novo" | "Qualificando" | "Proposta" | "Negociação" | "Fechado (Ganho)" | "Fechado (Perdido)";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string; // responsável “comercial”
  owner_id?: string | null; // compat. (igual vendedor_id)
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number; // 1..5
  estagio: EstagioDB | string;
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
};

/** =========================
 * Constantes/Helpers
 * ========================= */
const SEGMENTOS = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

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

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n || 0);

const onlyDigits = (s?: string | null) => (s || "").replace(/\D+/g, "");
const normPhoneToTel = (t?: string | null) => {
  const d = onlyDigits(t);
  return d ? `tel:+55${d.startsWith("55") ? d.slice(2) : d}` : "";
};
const normPhoneToWa = (t?: string | null) => {
  const d = onlyDigits(t);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  if (d.length >= 12 && !d.startsWith("55")) return "55" + d;
  return null;
};
const formatPhoneBR = (t?: string | null) => {
  const d = onlyDigits(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || "";
};
const moedaParaNumeroBR = (valor: string) =>
  Number(valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".") || 0);

const toISOFromBR = (ddmmyyyy: string) => {
  const [d, m, y] = ddmmyyyy.split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
const toBRFromISO = (yyyymmdd?: string | null) => {
  if (!yyyymmdd) return "";
  const [y, m, d] = yyyymmdd.split("-");
  if (!y || !m || !d) return "";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
};

/** =========================
 * Component
 * ========================= */
export default function Oportunidades() {
  const MAX_PER_STAGE = 5;

  // contexto usuário (para dono default)
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);

  // dados
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [ops, setOps] = useState<Oportunidade[]>([]);

  // filtros/ui
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // paginação por coluna de estágio
  const [pageByStage, setPageByStage] = useState<Record<StageUI, number>>({
    novo: 1,
    qualificando: 1,
    proposta: 1,
    negociacao: 1,
  });

  // modal tratar
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");
  const [editDateBR, setEditDateBR] = useState("");

  // modal nova oportunidade
  const [createOpen, setCreateOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDateBR, setExpectedDateBR] = useState("");

  // modal novo lead (overlay)
  const [leadOpen, setLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState<{ nome: string; telefone: string; email: string; descricao: string }>({
    nome: "",
    telefone: "",
    email: "",
    descricao: "",
  });

  // modal reatribuir
  const [reassign, setReassign] = useState<{ op?: Oportunidade; open: boolean }>({ open: false });

  /** ---------- bootstrap ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: l } = await supabase
          .from("leads")
          .select("id, nome, owner_id, telefone, email")
          .order("created_at", { ascending: false });
        setLeads((l || []) as Lead[]);

        const { data: v } = await supabase.rpc("listar_vendedores");
        setVendedores((v || []) as Vendedor[]);

        const { data: o } = await supabase
          .from("opportunities")
          .select(
            "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
          )
          .order("created_at", { ascending: false });
        setOps((o || []) as Oportunidade[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** ---------- busca/filtragem ---------- */
  const opsVisiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ops;

    const match = (o: Oportunidade) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const leadNome = lead?.nome?.toLowerCase() || "";
      const vendNome =
        vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome?.toLowerCase() || "";
      const ui = dbToUI[o.estagio as string] ?? "novo";
      const stageLabel =
        ui === "novo"
          ? "novo"
          : ui === "qualificando"
          ? "qualificando"
          : ui === "proposta"
          ? "proposta"
          : "negociação";
      const tel = lead?.telefone ? formatPhoneBR(lead.telefone).toLowerCase() : "";

      return (
        leadNome.includes(q) ||
        vendNome.includes(q) ||
        String(o.estagio).toLowerCase().includes(q) ||
        stageLabel.includes(q) ||
        tel.includes(q)
      );
    };

    return ops.filter(match);
  }, [ops, leads, vendedores, search]);

  /** ---------- KPI (4 estágios) ---------- */
  const kpi = useMemo(() => {
    const base: Record<StageUI, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
    };
    for (const o of opsVisiveis) {
      const ui = dbToUI[o.estagio as string];
      if (ui && base[ui]) {
        base[ui].qtd += 1;
        base[ui].total += Number(o.valor_credito || 0);
      }
    }
    return base;
  }, [opsVisiveis]);

  /** ---------- agrupamento por estágio (com paginação por coluna) ---------- */
  const porEstagio = useMemo(() => {
    const map: Record<StageUI, Oportunidade[]> = {
      novo: [],
      qualificando: [],
      proposta: [],
      negociacao: [],
    };
    for (const o of opsVisiveis) {
      const ui = dbToUI[o.estagio as string];
      if (ui) map[ui].push(o);
    }
    // ordenar por previsão (mais antigos primeiro)
    (Object.keys(map) as StageUI[]).forEach((k) => {
      map[k].sort((a, b) => {
        const aa = a.expected_close_at || "";
        const bb = b.expected_close_at || "";
        return aa.localeCompare(bb);
      });
    });
    return map;
  }, [opsVisiveis]);

  const paginadas = (k: StageUI) => {
    const page = pageByStage[k] ?? 1;
    const start = (page - 1) * MAX_PER_STAGE;
    return porEstagio[k].slice(start, start + MAX_PER_STAGE);
  };
  const totalPages = (k: StageUI) => Math.max(1, Math.ceil(porEstagio[k].length / MAX_PER_STAGE));
  const setPage = (k: StageUI, p: number) =>
    setPageByStage((s) => ({ ...s, [k]: Math.max(1, Math.min(totalPages(k), p)) }));

  /** ---------- badges de prazo (Atrasado/Hoje/Próx. 5 dias/OK) ---------- */
  const prazoBadge = (iso?: string | null) => {
    if (!iso) return null;
    const today = new Date();
    const d = new Date(iso + "T00:00:00");
    const diffDays = Math.floor((d.getTime() - new Date(today.toDateString()).getTime()) / 86400000);

    if (diffDays < 0) return <span style={badgeDanger}>Atrasado</span>;
    if (diffDays === 0) return <span style={badgeWarn}>Hoje</span>;
    if (diffDays > 0 && diffDays <= 5) return <span style={badgeInfo}>Próx. 5 dias</span>;
    return <span style={badgeOk}>OK</span>;
  };

  /** ---------- ações ---------- */
  function openEdit(o: Oportunidade) {
    setEditing(o);
    setNewNote("");
    setEditDateBR(toBRFromISO(o.expected_close_at));
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
      score: Math.max(1, Math.min(5, editing.score || 1)),
      estagio: normalizeStageDB(String(editing.estagio)),
      expected_close_at: editDateBR ? toISOFromBR(editDateBR) : null,
      observacao: historico || editing.observacao || null,
    };

    const { error, data } = await supabase
      .from("opportunities")
      .update(payload)
      .eq("id", editing.id)
      .select()
      .single();

    if (error) {
      alert("Falha ao salvar: " + error.message);
      return;
    }
    setOps((s) => s.map((x) => (x.id === editing.id ? (data as Oportunidade) : x)));
    closeEdit();
  }

  function normalizeStageDB(label: string): EstagioDB {
    const v = (label || "").toLowerCase();
    if (v.startsWith("qualifica")) return "Qualificando";
    if (v.startsWith("proposta")) return "Proposta";
    if (v.startsWith("negocia")) return "Negociação";
    if (v.startsWith("novo")) return "Novo";
    if (v.includes("fechado") && v.includes("ganho")) return "Fechado (Ganho)";
    if (v.includes("fechado") && v.includes("perdido")) return "Fechado (Perdido)";
    return "Novo";
  }

  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");
    const iso = expectedDateBR ? toISOFromBR(expectedDateBR) : null;

    setLoading(true);
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

    const { data, error } = await supabase
      .from("opportunities")
      .insert([payload])
      .select()
      .single();

    setLoading(false);

    if (error) {
      alert("Erro ao criar oportunidade: " + error.message);
      return;
    }

    setOps((s) => [data as Oportunidade, ...s]);
    // reset
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setObs("");
    setScore(1);
    setStageUI("novo");
    setExpectedDateBR("");
    setCreateOpen(false);
    alert("Oportunidade criada!");
  }

  async function criarLeadEEntrarNoPipeline() {
    const nome = newLead.nome.trim();
    if (!nome) return alert("Informe o nome do lead.");
    setLoading(true);
    try {
      // cria lead
      const { data: leadData, error: e1 } = await supabase
        .from("leads")
        .insert([
          {
            nome,
            telefone: onlyDigits(newLead.telefone) || null,
            email: newLead.email.trim().toLowerCase() || null,
            descricao: newLead.descricao?.trim() || null,
          },
        ])
        .select("id, owner_id")
        .single();

      if (e1 || !leadData) {
        alert("Erro ao criar lead: " + (e1?.message || "desconhecido"));
        return;
      }

      // cria oportunidade padrão em "Novo"
      const vendedor = leadData.owner_id || me?.id;
      const { data: op, error: e2 } = await supabase
        .from("opportunities")
        .insert([
          {
            lead_id: leadData.id,
            vendedor_id: vendedor,
            owner_id: vendedor,
            segmento: "Automóvel",
            valor_credito: 0,
            observacao: `[${new Date().toLocaleString("pt-BR")}]\nOportunidade criada a partir de novo lead.`,
            score: 1,
            estagio: "Novo" as EstagioDB,
            expected_close_at: null,
          },
        ])
        .select()
        .single();

      if (e2) {
        alert("Lead criado, mas falhou ao criar oportunidade: " + e2.message);
      } else {
        setOps((s) => [op as Oportunidade, ...s]);
      }

      // reset
      setNewLead({ nome: "", telefone: "", email: "", descricao: "" });
      setLeadOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function openReassign(op: Oportunidade) {
    setReassign({ open: true, op });
  }
  async function doReassign(newOwnerId: string) {
    if (!reassign.op) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("opportunities")
        .update({ vendedor_id: newOwnerId, owner_id: newOwnerId })
        .eq("id", reassign.op.id);
      if (error) {
        alert("Erro ao reatribuir: " + error.message);
      } else {
        setOps((s) =>
          s.map((o) => (o.id === reassign.op!.id ? { ...o, vendedor_id: newOwnerId, owner_id: newOwnerId } : o))
        );
        setReassign({ open: false });
      }
    } finally {
      setLoading(false);
    }
  }

  /** ---------- donuts fechados ---------- */
  const dadosDonuts = useMemo(() => {
    const fechadoG: Record<string, number> = {};
    const fechadoP: Record<string, number> = {};
    for (const o of ops) {
      if (o.estagio === "Fechado (Ganho)") {
        fechadoG[o.segmento] = (fechadoG[o.segmento] || 0) + (o.valor_credito || 0);
      } else if (o.estagio === "Fechado (Perdido)") {
        fechadoP[o.segmento] = (fechadoP[o.segmento] || 0) + (o.valor_credito || 0);
      }
    }
    return { fechadoG, fechadoP };
  }, [ops]);

  /** ---------- UI Aux ---------- */
  const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={muted ? "none" : "currentColor"} stroke={muted ? "currentColor" : "none"} strokeWidth="1.2" aria-hidden="true">
      <path d="M12.04 0C5.44 0 .1 5.34.1 11.94c0 2.06.54 4.08 1.57 5.87L0 24l6.39-1.8a12 12 0 0 0 5.65 1.4C18.64 23.6 24 18.26 24 11.96 24 5.36 18.64 0 12.04 0Zm0 21.2c-1.77 0-3.48-.46-4.97-1.34l-.36-.21-3.78 1.06 1.05-3.69-.22-.38A9.17 9.17 0 1 1 21.2 11.96c0 5.06-4.1 9.24-9.16 9.24Zm5.18-6.91c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.94-.93 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.44-2.33-1.42-.86-.76-1.44-1.69-1.61-1.98-.17-.29-.02-.45.13-.6.13-.12.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.64-1.57-.9-2.15-.24-.57-.49-.49-.66-.5h-.57c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.41s1.03 2.8 1.17 3.01c.14.2 2 3.18 4.84 4.34 2.39.94 2.88.76 3.4.71.52-.05 1.68-.69 1.93-1.36.25-.67.25-1.23.17-1.36-.07-.13-.26-.2-.55-.35Z" />
    </svg>
  );

  const Icon = ({
    name,
    title,
    disabled,
    onClick,
  }: {
    name: "phone" | "mail" | "edit" | "swap" | "treat";
    title: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => {
    const style: React.CSSProperties = {
      width: 28,
      height: 28,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      background: disabled ? "#f8fafc" : "#fff",
      color: disabled ? "#94a3b8" : "#1e293b",
      cursor: disabled ? "not-allowed" : "pointer",
    };
    const path = {
      phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7 2 2 0 0 1 1.72 2.03Z",
      mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm16 3-8 5-8-5",
      edit: "M12 20h9",
      swap: "M7 10l-3 3 3 3 M17 14l3-3-3-3 M4 13h16",
      treat: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-14h-2v6h2V8Zm0 8h-2v2h2v-2Z",
    }[name];

    return (
      <span title={title} style={style} onClick={disabled ? undefined : onClick} aria-disabled={disabled}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d={path} />
        </svg>
      </span>
    );
  };

  /** ---------- donuts (SVG) ---------- */
  const Donut = ({
    data,
    title,
  }: {
    data: Record<string, number>;
    title: string;
  }) => {
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const [hover, setHover] = useState<string | null>(null);

    let prev = 0;
    const radius = 60;
    const cx = 80,
      cy = 80,
      stroke = 24;
    const circumference = 2 * Math.PI * radius;

    const segs = entries.map(([label, value], i) => {
      const frac = value / total;
      const len = circumference * frac;
      const dasharray = `${len} ${circumference - len}`;
      const dashoffset = -prev;
      prev += len;
      const active = hover === label;
      return (
        <circle
          key={label}
          r={radius}
          cx={cx}
          cy={cy}
          fill="transparent"
          stroke={active ? "#A11C27" : "#e2e8f0"}
          strokeWidth={stroke}
          strokeDasharray={dasharray}
          strokeDashoffset={dashoffset}
          style={{ transition: "all .2s" }}
          onMouseEnter={() => setHover(label)}
          onMouseLeave={() => setHover(null)}
        />
      );
    });

    return (
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,.06)", padding: 16 }}>
        <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{title}</div>
        {total === 0 ? (
          <div style={{ color: "#64748b" }}>Sem valores</div>
        ) : (
          <div style={{ position: "relative", width: 160, height: 160 }}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              <g transform={`rotate(-90 ${cx} ${cy})`}>{segs}</g>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>{hover || "Total"}</div>
                <div style={{ fontWeight: 800 }}>{fmtBRL(hover ? data[hover] : total)}</div>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {entries.map(([k, v]) => (
            <div
              key={k}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: hover === k ? "#0f172a" : "#475569",
                cursor: "default",
              }}
            >
              <span>{k}</span>
              <span>{fmtBRL(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** ---------- UI: Header ---------- */
  const HeaderBar = () => (
    <div style={{ background: "#fff", padding: 12, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
      <button onClick={() => setLeadOpen(true)} style={btnSecondary}>+ Novo Lead</button>
      <button onClick={() => setCreateOpen(true)} style={btnPrimary}>+ Nova Oportunidade</button>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...input, margin: 0, flex: 1 }}
        placeholder="Buscar por lead, vendedor, estágio ou telefone"
      />
    </div>
  );

  /** ---------- UI: Pipeline KPI ---------- */
  const PipelineCards = () => {
    const order: { id: StageUI; label: string }[] = [
      { id: "novo", label: "Novo" },
      { id: "qualificando", label: "Qualificando" },
      { id: "proposta", label: "Proposta" },
      { id: "negociacao", label: "Negociação" },
    ];
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {order.map(({ id, label }) => (
            <div key={id} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 14 }}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{label}</div>
              <div style={{ color: "#1f2937" }}>Qtd: {kpi[id].qtd}</div>
              <div style={{ color: "#1f2937" }}>Valor: {fmtBRL(kpi[id].total)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** ---------- UI: Colunas de Oportunidades ---------- */
  const Coluna = ({ id, label }: { id: StageUI; label: string }) => {
    const lista = paginadas(id);
    const pages = totalPages(id);

    return (
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 12 }}>
        <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{label}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {lista.map((o) => {
            const lead = leads.find((l) => l.id === o.lead_id);
            const vendName = vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-";
            const tel = normPhoneToTel(lead?.telefone);
            const wa = normPhoneToWa(lead?.telefone);
            const mail = lead?.email || "";

            return (
              <div key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{lead?.nome || "-"}</div>
                <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>Resp.: {vendName}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                  <div><div style={label}>Segmento</div><div>{o.segmento}</div></div>
                  <div><div style={label}>Valor</div><div>{fmtBRL(o.valor_credito || 0)}</div></div>
                  <div><div style={label}>Prob.</div><div>{"★".repeat(Math.max(1, Math.min(5, o.score || 1)))}</div></div>
                  <div><div style={label}>Previsão</div><div style={{ display: "flex", gap: 6, alignItems: "center" }}>{toBRFromISO(o.expected_close_at) || "-"} {prazoBadge(o.expected_close_at)}</div></div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={tel} title="Ligar" style={iconLink}><Icon name="phone" title="Ligar" /></a>
                  {wa ? (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" title="WhatsApp" style={iconLink}>
                      <span style={{ ...iconLink }}>
                        <WhatsappIcon />
                      </span>
                    </a>
                  ) : (
                    <span title="Sem telefone" style={{ ...iconLink, opacity: 0.5, cursor: "not-allowed" }}>
                      <WhatsappIcon muted />
                    </span>
                  )}
                  <a
                    href={mail ? `mailto:${mail}` : undefined}
                    onClick={(e) => {
                      if (!mail) e.preventDefault();
                    }}
                    style={{ textDecoration: "none" }}
                  >
                    <Icon name="mail" title={mail ? "Enviar e-mail" : "Sem e-mail"} disabled={!mail} />
                  </a>
                  <Icon name="edit" title="Editar oportunidade" onClick={() => openEdit(o)} />
                  {me?.role === "admin" && <Icon name="swap" title="Reatribuir" onClick={() => openReassign(o)} />}
                  <Icon name="treat" title="Tratar lead" onClick={() => openEdit(o)} />
                </div>
              </div>
            );
          })}
          {lista.length === 0 && <div style={{ color: "#64748b" }}>Sem itens nesta página.</div>}
        </div>

        {/* paginação por coluna */}
        {pages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <button style={btnSmall} onClick={() => setPage(id, pageByStage[id] - 1)} disabled={pageByStage[id] <= 1}>
              ‹ Anterior
            </button>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Página {pageByStage[id]} de {pages}
            </div>
            <button style={btnSmall} onClick={() => setPage(id, pageByStage[id] + 1)} disabled={pageByStage[id] >= pages}>
              Próxima ›
            </button>
          </div>
        )}
      </div>
    );
  };

  /** ---------- render ---------- */
  return (
    <div style={{ maxWidth: 1280, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      <HeaderBar />
      <PipelineCards />

      {/* grade das 4 colunas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, marginBottom: 16 }}>
        <Coluna id="novo" label="Novo" />
        <Coluna id="qualificando" label="Qualificando" />
        <Coluna id="proposta" label="Propostas" />
        <Coluna id="negociacao" label="Negociação" />
      </div>

      {/* Finalizados (donuts) */}
      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <div style={sectionTitle}>Finalizados</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Donut data={dadosDonuts.fechadoG} title="Fechado (Ganho)" />
          <Donut data={dadosDonuts.fechadoP} title="Fechado (Perdido)" />
        </div>
      </div>

      {/* Modal Tratar */}
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
                <label style={label}>Valor do crédito (R$)</label>
                <input
                  value={String(editing.valor_credito)}
                  onChange={(e) => setEditing({ ...editing, valor_credito: moedaParaNumeroBR(e.target.value) })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>Probabilidade</label>
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
                  value={normalizeStageDB(String(editing.estagio))}
                  onChange={(e) => setEditing({ ...editing, estagio: e.target.value })}
                  style={input}
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
                <label style={label}>Previsão (dd/mm/aaaa)</label>
                <input value={editDateBR} onChange={(e) => setEditDateBR(e.target.value)} style={input} placeholder="dd/mm/aaaa" />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>Adicionar observação</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ ...input, minHeight: 90 }}
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
              <button onClick={saveEdit} style={btnPrimary} disabled={loading}>
                Salvar alterações
              </button>
              <button onClick={closeEdit} style={btnGhost}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova oportunidade */}
      {createOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Selecionar um Lead</label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={input}>
                  <option value="">Selecione um Lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} {l.telefone ? `— ${formatPhoneBR(l.telefone)}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Selecione um Vendedor</label>
                <select value={vendId} onChange={(e) => setVendId(e.target.value)} style={input}>
                  <option value="">Selecione um Vendedor</option>
                  {vendedores.map((v) => (
                    <option key={v.auth_user_id} value={v.auth_user_id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Selecione um Segmento</label>
                <select value={segmento} onChange={(e) => setSegmento(e.target.value)} style={input}>
                  {SEGMENTOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Valor do crédito (R$)</label>
                <input value={valor} onChange={(e) => setValor(e.target.value)} style={input} placeholder="Ex.: 80.000,00" />
              </div>

              <div>
                <label style={label}>Observações</label>
                <input value={obs} onChange={(e) => setObs(e.target.value)} style={input} placeholder="Observação inicial (opcional)" />
              </div>

              <div>
                <label style={label}>Probabilidade de fechamento</label>
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
                <select value={stageUI} onChange={(e) => setStageUI(e.target.value as StageUI)} style={input}>
                  <option value="novo">Novo</option>
                  <option value="qualificando">Qualificando</option>
                  <option value="proposta">Proposta</option>
                  <option value="negociacao">Negociação</option>
                </select>
              </div>

              <div>
                <label style={label}>Data prevista (dd/mm/aaaa)</label>
                <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={expectedDateBR} onChange={(e) => setExpectedDateBR(e.target.value)} style={input} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarOportunidade} disabled={loading} style={btnPrimary}>
                {loading ? "Criando..." : "Criar oportunidade"}
              </button>
              <button onClick={() => setCreateOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Lead */}
      {leadOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={newLead.nome} onChange={(e) => setNewLead({ ...newLead, nome: e.target.value })} style={input} />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={newLead.telefone} onChange={(e) => setNewLead({ ...newLead, telefone: e.target.value })} style={input} />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} style={input} />
              </div>
              <div>
                <label style={label}>Descrição</label>
                <input value={newLead.descricao} onChange={(e) => setNewLead({ ...newLead, descricao: e.target.value })} style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarLeadEEntrarNoPipeline} disabled={loading} style={btnPrimary}>
                {loading ? "Salvando..." : "Salvar e entrar no pipeline"}
              </button>
              <button onClick={() => setLeadOpen(false)} style={btnGhost}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reatribuir (simples) */}
      {reassign.open && reassign.op && (
        <div style={modalBackdrop}>
          <div style={modalCardSmall}>
            <h3 style={{ marginTop: 0 }}>Reatribuir Oportunidade</h3>
            <p style={{ marginTop: 0, color: "#475569" }}>
              <strong>Lead:</strong>{" "}
              {leads.find((l) => l.id === reassign.op!.lead_id)?.nome || "-"}
            </p>
            <div>
              <label style={label}>Novo responsável</label>
              <select
                style={input}
                onChange={(e) => doReassign(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>
                  Selecionar usuário…
                </option>
                {vendedores.map((u) => (
                  <option key={u.auth_user_id} value={u.auth_user_id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 12 }}>
              <button style={btnGhost} onClick={() => setReassign({ open: false })}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** =========================
 * Estilos
 * ========================= */
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#1E293F",
  marginBottom: 10,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
  fontWeight: 700,
};
const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 700,
};
const btnSmall: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
  fontWeight: 600,
};

const iconLink: React.CSSProperties = { textDecoration: "none" };

const grid2: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" };

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
const modalCardSmall: React.CSSProperties = {
  width: "min(520px, 94vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};

const badgeBase: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 800,
};
const badgeDanger: React.CSSProperties = { ...badgeBase, background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
const badgeWarn: React.CSSProperties = { ...badgeBase, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
const badgeInfo: React.CSSProperties = { ...badgeBase, background: "#cffafe", color: "#155e75", border: "1px solid #a5f3fc" };
const badgeOk: React.CSSProperties = { ...badgeBase, background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
