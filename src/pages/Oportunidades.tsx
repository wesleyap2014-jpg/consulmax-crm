// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ================== Tipos ================== */
type Lead = {
  id: string;
  nome: string;
  owner_id: string | null;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  created_at?: string;
};

type Vendedor = { auth_user_id: string; nome: string };

type StageUI = "novo" | "qualificando" | "proposta" | "negociacao" | "fechado_ganho" | "fechado_perdido";

type EstagioDB =
  | "Novo"
  | "Qualificando"
  | "Proposta"
  | "Negociação"
  | "Fechado (Ganho)"
  | "Fechado (Perdido)";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string; // também usamos como owner_id visual
  owner_id?: string | null;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number; // 1..5
  estagio: EstagioDB | string;
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
};

/** ================== Constantes ================== */
const PAGE_WINDOW_PER_COLUMN = 5;

const SEGMENTOS = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

const uiToDB: Record<StageUI, EstagioDB> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado_ganho: "Fechado (Ganho)",
  fechado_perdido: "Fechado (Perdido)",
};

const dbToUI: Partial<Record<string, StageUI>> = {
  Novo: "novo",
  Qualificando: "qualificando",
  Qualificação: "qualificando",
  Qualificacao: "qualificando",
  Proposta: "proposta",
  Negociação: "negociacao",
  Negociacao: "negociacao",
  "Fechado (Ganho)": "fechado_ganho",
  "Fechado (Perdido)": "fechado_perdido",
};

// Cores oficiais + variações
const COLORS = {
  primary: "#A11C27",
  bg: "#F5F5F5",
  accent: "#B5A573",
  dark: "#1E293F",
  accent2: "#E0CE8C",
  // variações para donuts
  donut: ["#A11C27", "#B84B53", "#E0CE8C", "#B5A573", "#1E293F", "#6B7280"],
};

/** ================== Helpers ================== */
const onlyDigits = (s?: string | null) => (s || "").replace(/\D+/g, "");
const normalizePhoneToWa = (telefone?: string | null) => {
  const d = onlyDigits(telefone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  if (d.length >= 12 && !d.startsWith("55")) return "55" + d;
  return null;
};
const formatPhoneBR = (telefone?: string | null) => {
  const d = onlyDigits(telefone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone || "";
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

function abreviarBR(n: number): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Bi`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mi`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)} mil`;
  return fmtBRL(n).replace("R$ ", "R$ ");
}

// dd/mm/aaaa <-> yyyy-mm-dd
function ddmmyyyyToISO(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}
function isoToDDMMYYYY(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return "";
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

function badgeFromDate(iso: string | null): "atrasado" | "hoje" | "breve" | null {
  if (!iso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);

  const diff = Math.floor((d.getTime() - hoje.getTime()) / 86_400_000);
  if (diff < 0) return "atrasado";
  if (diff === 0) return "hoje";
  if (diff > 0 && diff <= 5) return "breve";
  return null;
}

function sortByUrgency(a: Oportunidade, b: Oportunidade) {
  // grupos: atrasado(0) -> hoje(1) -> breve(2) -> futuro(3) -> sem data(4)
  const rank = (o: Oportunidade) => {
    const iso = o.expected_close_at;
    if (!iso) return 4;
    const t = badgeFromDate(iso);
    if (t === "atrasado") return 0;
    if (t === "hoje") return 1;
    if (t === "breve") return 2;
    return 3;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;

  // dentro do grupo, mais antigo primeiro (data menor primeiro)
  const da = a.expected_close_at ? new Date(a.expected_close_at).getTime() : Number.POSITIVE_INFINITY;
  const db = b.expected_close_at ? new Date(b.expected_close_at).getTime() : Number.POSITIVE_INFINITY;
  return da - db;
}

/** ================== Página ================== */
export default function OportunidadesPage() {
  // Eu (para owner padrão ao criar lead)
  const [me, setMe] = useState<{ id: string; nome?: string } | null>(null);

  // Dados
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);

  // Busca + paginação (global)
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Tratamento (modal)
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");
  const [editingDateBR, setEditingDateBR] = useState<string>("");

  // Nova oportunidade (modal)
  const [createOpen, setCreateOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Novo lead (overlay)
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadNome, setLeadNome] = useState("");
  const [leadTel, setLeadTel] = useState("");
  const [leadEmail, setLeadEmail] = useState("");

  // Reatribuir
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>("");

  /** --------- Carregamento inicial --------- */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user?.id) setMe({ id: u.user.id, nome: (u.user.user_metadata as any)?.name });

      // leads
      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, owner_id, telefone, email, created_at")
        .order("created_at", { ascending: false });
      setLeads(l || []);

      // vendedores
      // -> pode ser uma tabela "users" ou rpc. Usei users simples
      const { data: v } = await supabase.from("users").select("auth_user_id, nome").order("nome", { ascending: true });
      setVendedores((v || []) as Vendedor[]);

      // opportunities
      const { data: o } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  /** --------- Busca / filtros --------- */
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;

    const match = (o: Oportunidade) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const leadNome = lead?.nome?.toLowerCase() || "";
      const vendNome =
        vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome?.toLowerCase() || "";
      const uiStage = dbToUI[o.estagio as string] ?? "novo";
      const stageLabel = {
        novo: "novo",
        qualificando: "qualificando",
        proposta: "proposta",
        negociacao: "negociação",
        fechado_ganho: "fechado (ganho)",
        fechado_perdido: "fechado (perdido)",
      }[uiStage];

      return (
        leadNome.includes(q) ||
        vendNome.includes(q) ||
        String(o.estagio).toLowerCase().includes(q) ||
        stageLabel.includes(q) ||
        (lead?.telefone ? formatPhoneBR(lead.telefone).toLowerCase().includes(q) : false)
      );
    };

    return lista.filter(match);
  }, [lista, leads, vendedores, search]);

  /** --------- Agrupamento por estágio --------- */
  const groups = useMemo(() => {
    const gs: Record<StageUI, Oportunidade[]> = {
      novo: [],
      qualificando: [],
      proposta: [],
      negociacao: [],
      fechado_ganho: [],
      fechado_perdido: [],
    };
    for (const o of visiveis) {
      const k = dbToUI[o.estagio as string] ?? "novo";
      gs[k].push(o);
    }
    // ordenar por urgência (mais atrasado -> sem data)
    (Object.keys(gs) as StageUI[]).forEach((k) => gs[k].sort(sortByUrgency));
    return gs;
  }, [visiveis]);

  /** --------- Paginação global (5 por coluna) --------- */
  const totalPages = useMemo(() => {
    const lengths = (["novo", "qualificando", "proposta", "negociacao"] as StageUI[]).map(
      (k) => groups[k].length
    );
    const perCol = PAGE_WINDOW_PER_COLUMN;
    const pagesPerCol = lengths.map((n) => Math.max(1, Math.ceil(n / perCol)));
    return Math.max(...pagesPerCol, 1);
  }, [groups]);

  const sliced = useMemo(() => {
    const start = (page - 1) * PAGE_WINDOW_PER_COLUMN;
    const end = start + PAGE_WINDOW_PER_COLUMN;
    return {
      novo: groups.novo.slice(start, end),
      qualificando: groups.qualificando.slice(start, end),
      proposta: groups.proposta.slice(start, end),
      negociacao: groups.negociacao.slice(start, end),
    };
  }, [groups, page]);

  /** --------- KPIs (apenas 4 colunas) --------- */
  const kpi = useMemo(() => {
    const ids: StageUI[] = ["novo", "qualificando", "proposta", "negociacao"];
    const res = ids.map((id) => {
      const arr = groups[id] || [];
      const total = arr.reduce((acc, o) => acc + (o.valor_credito || 0), 0);
      return { id, qtd: arr.length, total };
    });
    return res;
  }, [groups]);

  /** --------- Funções de ação --------- */

  // Abre modal "Tratar"
  function openEdit(o: Oportunidade) {
    setEditing(o);
    setNewNote("");
    setEditingDateBR(isoToDDMMYYYY(o.expected_close_at));
  }
  function closeEdit() {
    setEditing(null);
    setNewNote("");
    setEditingDateBR("");
  }

  // Salva edição
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
        // normaliza para os 6 estágios oficiais
        const s = String(editing.estagio);
        const mapped = uiToDB[(dbToUI[s] ?? "novo") as StageUI];
        return mapped ?? "Novo";
      })(),
      expected_close_at: ddmmyyyyToISO(editingDateBR),
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

    setLista((s) => s.map((x) => (x.id === editing.id ? (data as Oportunidade) : x)));
    closeEdit();
  }

  // Criar nova oportunidade
  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    const chosenLead = leads.find((l) => l.id === leadId);
    const vendedorDefault = chosenLead?.owner_id || me?.id || "";
    const vendedor = vendId || vendedorDefault;
    if (!vendedor) return alert("Selecione um Vendedor.");

    const valorNum = Number((valor || "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    let isoDate: string | null = null;
    if (expectedDate) isoDate = ddmmyyyyToISO(expectedDate);

    setLoading(true);
    const payload = {
      lead_id: leadId,
      vendedor_id: vendedor,
      owner_id: vendedor,
      segmento,
      valor_credito: valorNum,
      observacao: obs ? `[${new Date().toLocaleString("pt-BR")}]\n${obs}` : null,
      score,
      estagio: uiToDB[stageUI] as EstagioDB,
      expected_close_at: isoDate,
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

    setLista((s) => [data as Oportunidade, ...s]);

    // reset e fechar
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setObs("");
    setScore(1);
    setStageUI("novo");
    setExpectedDate("");
    setCreateOpen(false);
    alert("Oportunidade criada!");
  }

  // Criar lead (e já cair em "Novo")
  async function criarLead() {
    const nome = leadNome.trim();
    if (!nome) return alert("Informe o nome do lead.");
    const tel = onlyDigits(leadTel) || null;
    const email = leadEmail.trim().toLowerCase() || null;

    const payloadLead = {
      nome,
      telefone: tel,
      email,
      origem: "Site",
      descricao: null,
      owner_id: me?.id || null, // trigger pode setar também
    };

    setLoading(true);
    const { data: newLead, error: e1 } = await supabase.from("leads").insert([payloadLead]).select().single();
    if (e1) {
      setLoading(false);
      alert("Erro ao criar lead: " + e1.message);
      return;
    }

    // Atualiza lista de leads local
    setLeads((prev) => [newLead as Lead, ...prev]);

    // cria oportunidade "Novo" automaticamente
    const vendedor = (newLead as any).owner_id || me?.id;
    const payloadOpp = {
      lead_id: (newLead as any).id,
      vendedor_id: vendedor,
      owner_id: vendedor,
      segmento: "Automóvel",
      valor_credito: 0,
      observacao: `[${new Date().toLocaleString("pt-BR")}]\nOportunidade criada automaticamente ao cadastrar lead.`,
      score: 1,
      estagio: "Novo" as EstagioDB,
      expected_close_at: null,
    };
    const { data: opp, error: e2 } = await supabase
      .from("opportunities")
      .insert([payloadOpp])
      .select()
      .single();

    setLoading(false);

    if (e2) {
      alert("Lead criado, mas falhou criar oportunidade: " + e2.message);
    } else {
      setLista((s) => [opp as Oportunidade, ...s]);
    }

    setLeadOpen(false);
    setLeadNome("");
    setLeadTel("");
    setLeadEmail("");
  }

  // Reatribuir lead (corrigido)
  function openReassign(lead: Lead) {
    setReassignLead(lead);
    setNewOwnerId(lead.owner_id ?? "");
  }

  async function doReassign() {
    if (!reassignLead || !newOwnerId) {
      alert("Selecione o novo responsável.");
      return;
    }

    // 1) lead
    const { error: e1 } = await supabase
      .from("leads")
      .update({ owner_id: newOwnerId })
      .eq("id", reassignLead.id);

    if (e1) {
      alert("Erro ao reatribuir o lead: " + e1.message);
      return;
    }

    // 2) opportunities do lead
    const { error: e2 } = await supabase
      .from("opportunities")
      .update({ vendedor_id: newOwnerId, owner_id: newOwnerId })
      .eq("lead_id", reassignLead.id);

    if (e2) {
      alert("Lead atualizado, mas falhou ao reatribuir oportunidades: " + e2.message);
    }

    // 3) atualização otimista
    setLeads((prev) => prev.map((l) => (l.id === reassignLead.id ? { ...l, owner_id: newOwnerId } : l)));
    setLista((prev) =>
      prev.map((o) => (o.lead_id === reassignLead.id ? { ...o, vendedor_id: newOwnerId, owner_id: newOwnerId } : o))
    );

    setReassignLead(null);
    setNewOwnerId("");
    alert("Lead reatribuído!");
  }

  /** --------- Componentes auxiliares --------- */
  const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={muted ? "none" : "currentColor"} stroke={muted ? "currentColor" : "none"} strokeWidth="1.2">
      <path d="M12.04 0C5.44 0 .1 5.34.1 11.94c0 2.06.54 4.08 1.57 5.87L0 24l6.39-1.8a12 12 0 0 0 5.65 1.4C18.64 23.6 24 18.26 24 11.96 24 5.36 18.64 0 12.04 0Zm0 21.2c-1.77 0-3.48-.46-4.97-1.34l-.36-.21-3.78 1.06 1.05-3.69-.22-.38A9.17 9.17 0 1 1 21.2 11.96c0 5.06-4.1 9.24-9.16 9.24Zm5.18-6.91c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.94-.93 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.44-2.33-1.42-.86-.76-1.44-1.69-1.61-1.98-.17-.29-.02-.45.13-.6.13-.12.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.64-1.57-.9-2.15-.24-.57-.49-.49-.66-.5h-.57c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.41s1.03 2.8 1.17 3.01c.14.2 2 3.18 4.84 4.34 2.39.94 2.88.76 3.4.71.52-.05 1.68-.69 1.93-1.36.25-.67.25-1.23.17-1.36-.07-.13-.26-.2-.55-.35Z" />
    </svg>
  );

  const WaButton: React.FC<{ phone?: string | null; name?: string }> = ({ phone, name }) => {
    const wa = normalizePhoneToWa(phone);
    const [hover, setHover] = React.useState(false);

    if (!wa) {
      return (
        <span title="Sem telefone" style={{ ...waBtn, ...waBtnDisabled }}>
          <WhatsappIcon muted />
        </span>
      );
    }
    return (
      <a
        href={`https://wa.me/${wa}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Conversar com ${name || "o lead"} no WhatsApp`}
        aria-label={`Abrir WhatsApp para ${name || "lead"}`}
        style={{ ...waBtn, ...(hover ? waBtnHover : {}) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <WhatsappIcon />
      </a>
    );
  };

  /** --------- Render --------- */
  return (
    <div style={{ maxWidth: 1240, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", padding: 12, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ ...input, margin: 0, flex: 1 }}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
        <button onClick={() => setCreateOpen(true)} style={btnPrimary}>
          + Nova Oportunidade
        </button>
        <button onClick={() => setLeadOpen(true)} style={btnGhost}>
          + Novo Lead
        </button>
      </div>

      {/* Pipeline (4 cards) */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {kpi.map(({ id, qtd, total }) => (
            <div key={id} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 14 }}>
              <div style={{ fontWeight: 800, color: COLORS.dark, marginBottom: 8 }}>
                {id === "novo" && "Novo"}
                {id === "qualificando" && "Qualificando"}
                {id === "proposta" && "Propostas"}
                {id === "negociacao" && "Negociação"}
              </div>
              <div style={{ color: "#1f2937" }}>Qtd: {qtd}</div>
              <div style={{ color: "#1f2937" }}>Valor: {abreviarBR(total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Oportunidades em colunas */}
      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Oportunidades</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {(
            [
              ["novo", "Novo"],
              ["qualificando", "Qualificando"],
              ["proposta", "Propostas"],
              ["negociacao", "Negociação"],
            ] as [keyof typeof sliced, string][]
          ).map(([key, title]) => (
            <div key={key}>
              <div style={{ fontWeight: 800, color: COLORS.dark, marginBottom: 8 }}>{title}</div>
              {(sliced[key] as Oportunidade[]).map((o) => {
                const lead = leads.find((l) => l.id === o.lead_id);
                const vendedor = vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-";
                const badge = badgeFromDate(o.expected_close_at);

                return (
                  <div key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, marginBottom: 10, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 700, color: COLORS.dark }}>{lead?.nome || "-"}</div>
                      {badge && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background:
                              badge === "atrasado" ? "#fee2e2" : badge === "hoje" ? "#e0ce8c" : "#f1f5f9",
                            color: COLORS.dark,
                            border: "1px solid #e2e8f0",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge === "atrasado" ? "Atrasado" : badge === "hoje" ? "Hoje" : "Breve"}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
                      <div><strong>Vendedor:</strong> {vendedor}</div>
                      <div><strong>Segmento:</strong> {o.segmento}</div>
                      <div><strong>Valor:</strong> {fmtBRL(o.valor_credito)}</div>
                      <div><strong>Prob.:</strong> {"★".repeat(Math.max(1, Math.min(5, o.score)))}</div>
                      <div><strong>Previsão:</strong> {o.expected_close_at ? isoToDDMMYYYY(o.expected_close_at) : "-"}</div>
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {/* Ligar */}
                      <a
                        href={lead?.telefone ? `tel:${onlyDigits(lead.telefone!)}` : undefined}
                        onClick={(e) => {
                          if (!lead?.telefone) e.preventDefault();
                        }}
                        style={{ ...btnTiny, background: "#1E293F", color: "#fff", opacity: lead?.telefone ? 1 : 0.5 }}
                        title={lead?.telefone ? `Ligar para ${formatPhoneBR(lead.telefone)}` : "Sem telefone"}
                      >
                        Ligar
                      </a>

                      {/* WhatsApp */}
                      <WaButton phone={lead?.telefone} name={lead?.nome || undefined} />

                      {/* E-mail */}
                      <a
                        href={lead?.email ? `mailto:${lead.email}` : undefined}
                        onClick={(e) => {
                          if (!lead?.email) e.preventDefault();
                        }}
                        style={{ ...btnTiny, background: COLORS.accent, color: "#fff", opacity: lead?.email ? 1 : 0.45 }}
                        title={lead?.email ? `Enviar e-mail para ${lead.email}` : "Sem e-mail"}
                      >
                        E-mail
                      </a>

                      {/* Editar Lead (direto aqui) */}
                      <button
                        style={{ ...btnTiny, background: "#64748b", color: "#fff" }}
                        onClick={() => openEdit(o)}
                        title="Tratar / Editar oportunidade e observações"
                      >
                        Tratar
                      </button>

                      {/* Reatribuir */}
                      <button
                        style={{ ...btnTiny, background: COLORS.primary, color: "#fff" }}
                        onClick={() => openReassign(lead!)}
                        title="Reatribuir responsável"
                      >
                        Reatribuir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Paginação global */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            style={{ ...btnSecondary, opacity: page <= 1 ? 0.5 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: "#475569" }}>Página {page} de {totalPages}</span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.5 : 1 }}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Donuts (Fechado Ganho / Perdido) */}
      <DonutsBottom lista={lista} segmentoCores={COLORS.donut} />

      {/* ===== Modais / Overlays ===== */}

      {/* Modal: Tratar */}
      {editing && (
        <div style={modalBackdrop} onClick={(e) => e.target === e.currentTarget && closeEdit()}>
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
                  onChange={(e) => {
                    const num = Number(e.target.value.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
                    setEditing({ ...editing, valor_credito: isNaN(num) ? 0 : num });
                  }}
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
                  value={String(editing.estagio)}
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
                <input
                  value={editingDateBR}
                  onChange={(e) => setEditingDateBR(e.target.value)}
                  style={input}
                  placeholder="dd/mm/aaaa"
                />
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
              <button onClick={saveEdit} style={btnPrimary}>
                Salvar alterações
              </button>
              <button onClick={closeEdit} style={btnGhost}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nova oportunidade */}
      {createOpen && (
        <div style={modalBackdrop} onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Selecionar um Lead</label>
                <select
                  value={leadId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setLeadId(id);
                    // vendedor padrão = owner do lead
                    const lead = leads.find((l) => l.id === id);
                    setVendId(lead?.owner_id || "");
                  }}
                  style={input}
                >
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
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  style={input}
                  placeholder="Ex.: 80.000,00"
                />
              </div>

              <div>
                <label style={label}>Observações</label>
                <input
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  style={input}
                  placeholder="Observação inicial (opcional)"
                />
              </div>

              <div>
                <label style={label}>Probabilidade</label>
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
                  <option value="fechado_ganho">Fechado (Ganho)</option>
                  <option value="fechado_perdido">Fechado (Perdido)</option>
                </select>
              </div>

              <div>
                <label style={label}>Data prevista (dd/mm/aaaa)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  style={input}
                />
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

      {/* Overlay: Novo Lead */}
      {leadOpen && (
        <div style={modalBackdrop} onClick={(e) => e.target === e.currentTarget && setLeadOpen(false)}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={leadNome} onChange={(e) => setLeadNome(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={leadTel} onChange={(e) => setLeadTel(e.target.value)} style={input} />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>E-mail</label>
                <input value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} style={input} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarLead} disabled={loading} style={btnPrimary}>
                {loading ? "Salvando..." : "Criar lead"}
              </button>
              <button onClick={() => setLeadOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reatribuir */}
      {reassignLead && (
        <div style={modalBackdrop} onClick={(e) => e.target === e.currentTarget && setReassignLead(null)}>
          <div style={modalSmall}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reatribuir Lead</h3>
            <p style={{ margin: 0, color: "#475569" }}>
              <strong>Lead:</strong> {reassignLead.nome}
            </p>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <select
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                style={input}
              >
                <option value="">Selecionar usuário…</option>
                {vendedores.map((u) => (
                  <option key={u.auth_user_id} value={u.auth_user_id}>
                    {u.nome}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnSecondary} onClick={() => setReassignLead(null)}>
                  Cancelar
                </button>
                <button style={btnPrimary} onClick={doReassign} disabled={!newOwnerId}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ================== Donuts bottom ================== */
function DonutsBottom({
  lista,
  segmentoCores,
}: {
  lista: Oportunidade[];
  segmentoCores: string[];
}) {
  const ganhos = useMemo(
    () => lista.filter((o) => (dbToUI[o.estagio as string] ?? "") === "fechado_ganho"),
    [lista]
  );
  const perdidos = useMemo(
    () => lista.filter((o) => (dbToUI[o.estagio as string] ?? "") === "fechado_perdido"),
    [lista]
  );

  const grp = (arr: Oportunidade[]) => {
    const map = new Map<string, number>();
    for (const o of arr) {
      map.set(o.segmento, (map.get(o.segmento) || 0) + (o.valor_credito || 0));
    }
    return Array.from(map.entries()).map(([segmento, valor]) => ({ segmento, valor }));
  };

  const won = grp(ganhos);
  const lost = grp(perdidos);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
      <DonutCard title="Fechado (Ganho)" data={won} palette={segmentoCores} />
      <DonutCard title="Fechado (Perdido)" data={lost} palette={segmentoCores} />
    </div>
  );
}

function DonutCard({
  title,
  data,
  palette,
}: {
  title: string;
  data: { segmento: string; valor: number }[];
  palette: string[];
}) {
  const total = data.reduce((a, b) => a + b.valor, 0);
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const circ = 2 * Math.PI * radius;

  // arcos
  let acc = 0;
  const arcs = data.map((d, i) => {
    const frac = total ? d.valor / total : 0;
    const len = circ * frac;
    const dash = `${len} ${circ - len}`;
    const rot = (acc / total) * 360;
    acc += d.valor;
    return { ...d, dash, rot, color: palette[i % palette.length] };
  });

  const [hover, setHover] = useState<number | null>(null);

  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 16 }}>
      <div style={{ fontWeight: 800, color: COLORS.dark, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={18} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={18}
              strokeDasharray={a.dash}
              transform={`rotate(-90 ${cx} ${cy}) rotate(${a.rot} ${cx} ${cy})`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer", filter: hover === i ? "brightness(1.1)" : "none" }}
            />
          ))}
        </svg>

        <div style={{ flex: 1 }}>
          {data.length === 0 && <div style={{ color: "#64748b" }}>(sem dados)</div>}
          {data.map((d, i) => (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                background: hover === i ? "#f8fafc" : "transparent",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: palette[i % palette.length] }} />
              <span style={{ flex: 1 }}>{d.segmento}</span>
              <strong>{abreviarBR(d.valor)}</strong>
            </div>
          ))}

          {data.length > 0 && (
            <div style={{ marginTop: 8, borderTop: "1px dashed #e5e7eb", paddingTop: 8, color: COLORS.dark }}>
              <strong>Total:</strong> {abreviarBR(total)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ================== Estilos ================== */
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#1E293F",
  marginBottom: 10,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  padding: 16,
  marginBottom: 16,
};
const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "1fr 1fr",
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
  background: COLORS.primary,
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
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
const btnTiny: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};
const waBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#64748b",
  textDecoration: "none",
  cursor: "pointer",
  transition: "all .15s ease-in-out",
  fontWeight: 700,
  fontSize: 12,
};
const waBtnHover: React.CSSProperties = {
  background: "#f8fafc",
  borderColor: "#cbd5e1",
  color: "#1E293F",
  transform: "translateY(-1px)",
  boxShadow: "0 2px 6px rgba(0,0,0,.06)",
};
const waBtnDisabled: React.CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

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
const modalSmall: React.CSSProperties = {
  width: "min(460px, 94vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
