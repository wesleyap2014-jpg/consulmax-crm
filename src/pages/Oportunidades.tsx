// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ===================== Tipos ===================== */
type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  descricao?: string | null;
  owner_id?: string | null;
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
  vendedor_id: string;
  owner_id?: string | null;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;
  estagio: EstagioDB | string;
  expected_close_at: string | null;
  created_at: string;
};

/** ===================== Helpers ===================== */
const CONS = {
  red: "#A11C27",
  ink: "#1E293F",
  sand: "#E0CE8C",
  tan: "#B5A573",
  grayBg: "#F5F5F5",
  // paleta para os donuts (derivada das cores oficiais)
  donut: ["#A11C27", "#B5A573", "#1E293F", "#E0CE8C", "#8B1F2A", "#9C8B58", "#2B3B5A", "#F5E9B6"],
};

const segmentos = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

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

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

const fmtCompact = (n: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

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

// Datas: máscara dd/mm/aaaa ↔ ISO yyyy-mm-dd
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
// ordenar: mais atrasado primeiro; sem data no fim
const tsOrInf = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").getTime() : Number.POSITIVE_INFINITY);

/** ===================== Liquid BG (blobs animados) ===================== */
const LiquidBG: React.FC = () => {
  return (
    <div style={liquidCanvas}>
      <style>{liquidKeyframes}</style>
      <span style={{ ...blob, ...blob1 }} />
      <span style={{ ...blob, ...blob2 }} />
      <span style={{ ...blob, ...blob3 }} />
      {/* brilho dourado sutil no canto inferior direito */}
      <span style={{ ...goldGlow }} />
    </div>
  );
};

/** ===================== Página ===================== */
export default function Oportunidades() {
  const PAGE_BLOCK = 5; // até 5 por coluna
  const [page, setPage] = useState(1);

  // usuário atual
  const [meId, setMeId] = useState<string | null>(null);

  // dados
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);

  // busca
  const [search, setSearch] = useState("");

  // modais
  const [newLeadOpen, setNewLeadOpen] = useState(false); // modal Novo Lead
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);

  // tratar oportunidade
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");
  const [editDateBR, setEditDateBR] = useState("");

  // novo lead (overlay rápido)
  const [nlNome, setNlNome] = useState("");
  const [nlTel, setNlTel] = useState("");
  const [nlEmail, setNlEmail] = useState("");
  const [nlOrigem, setNlOrigem] = useState<string>("Site");
  const [nlDesc, setNlDesc] = useState("");

  // criar oportunidade (modal próprio)
  const [newOppOpen, setNewOppOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  // donuts hover state
  const [hoverWon, setHoverWon] = useState<string | null>(null);
  const [hoverLost, setHoverLost] = useState<string | null>(null);

  // Reatribuir Lead
  const [newOwnerId, setNewOwnerId] = useState<string>("");

  // Drag & Drop: qual coluna está com "drag over"
  const [dragOverStage, setDragOverStage] = useState<StageUI | null>(null);

  useEffect(() => {
    if (reassignLead) setNewOwnerId(reassignLead.owner_id || "");
  }, [reassignLead]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user?.id) setMeId(u.user.id);

      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, owner_id, telefone, email, origem, descricao, created_at")
        .order("created_at", { ascending: false });
      setLeads(l || []);

      // vendedores
      const rpc = await supabase.rpc("listar_vendedores");
      if (!rpc.error && rpc.data?.length) {
        setVendedores((rpc.data || []) as Vendedor[]);
      } else {
        const users = await supabase.from("users").select("auth_user_id, nome").order("nome");
        setVendedores((users.data || []) as Vendedor[]);
      }

      const { data: o } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  /** ===================== KPI ===================== */
  const kpi = useMemo(() => {
    const base: Record<StageUI, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
      fechado_ganho: { qtd: 0, total: 0 },
      fechado_perdido: { qtd: 0, total: 0 },
    };
    for (const o of lista) {
      const stage = dbToUI[o.estagio as string] ?? "novo";
      base[stage].qtd += 1;
      base[stage].total += Number(o.valor_credito || 0);
    }
    return base;
  }, [lista]);

  /** ===================== Busca / Filtro ===================== */
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;

    return lista.filter((o) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const leadNome = (lead?.nome || "").toLowerCase();
      const vendNome = (vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "").toLowerCase();
      const uiStage = dbToUI[o.estagio as string] ?? "novo";
      const stageLabel =
        {
          novo: "novo",
          qualificando: "qualificando",
          proposta: "proposta",
          negociacao: "negociação",
          fechado_ganho: "fechado (ganho)",
          fechado_perdido: "fechado (perdido)",
        }[uiStage] || "";

      const phone = lead?.telefone ? formatPhoneBR(lead.telefone).toLowerCase() : "";
      return (
        leadNome.includes(q) ||
        vendNome.includes(q) ||
        String(o.estagio).toLowerCase().includes(q) ||
        stageLabel.includes(q) ||
        phone.includes(q)
      );
    });
  }, [lista, leads, vendedores, search]);

  /** ===================== Colunas (ordenadas por atraso) ===================== */
  const orderByDue = (arr: Oportunidade[]) =>
    [...arr].sort((a, b) => tsOrInf(a.expected_close_at) - tsOrInf(b.expected_close_at));

  const colNovoAll = useMemo(
    () => orderByDue(visiveis.filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "novo")),
    [visiveis]
  );
  const colQualAll = useMemo(
    () => orderByDue(visiveis.filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "qualificando")),
    [visiveis]
  );
  const colPropAll = useMemo(
    () => orderByDue(visiveis.filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "proposta")),
    [visiveis]
  );
  const colNegAll = useMemo(
    () => orderByDue(visiveis.filter((o) => (dbToUI[o.estagio as string] ?? "novo") === "negociacao")),
    [visiveis]
  );

  // paginação única (5 por coluna)
  const totalPages = useMemo(() => {
    const pages = [
      Math.max(1, Math.ceil(colNovoAll.length / PAGE_BLOCK)),
      Math.max(1, Math.ceil(colQualAll.length / PAGE_BLOCK)),
      Math.max(1, Math.ceil(colPropAll.length / PAGE_BLOCK)),
      Math.max(1, Math.ceil(colNegAll.length / PAGE_BLOCK)),
    ];
    return Math.max(...pages);
  }, [colNovoAll.length, colQualAll.length, colPropAll.length, colNegAll.length]);

  const sliceByPage = (arr: Oportunidade[]) => {
    theLoop: {
      /* este label evita warnings do TS quando colamos código gerado */
    }
    const from = (page - 1) * PAGE_BLOCK;
    const to = from + PAGE_BLOCK;
    return arr.slice(from, to);
  };

  const colNovo = sliceByPage(colNovoAll);
  const colQualificando = sliceByPage(colQualAll);
  const colPropostas = sliceByPage(colPropAll);
  const colNegociacao = sliceByPage(colNegAll);

  /** ===================== Ações ===================== */
  // Novo Lead → cria oportunidade “Novo” automaticamente
  async function criarLead() {
    const payloadLead = {
      nome: nlNome.trim(),
      telefone: onlyDigits(nlTel) || null,
      email: nlEmail.trim().toLowerCase() || null,
      origem: nlOrigem || null,
      descricao: nlDesc.trim() || null,
    };
    if (!payloadLead.nome) return alert("Informe o nome do lead.");

    setLoading(true);
    const { data: lead, error: e1 } = await supabase.from("leads").insert([payloadLead]).select().single();
    if (e1) {
      setLoading(false);
      alert("Erro ao criar lead: " + e1.message);
      return;
    }

    // cria oportunidade automaticamente no estágio "Novo"
    const payloadOpp = {
      lead_id: (lead as any).id,
      vendedor_id: meId as string,
      owner_id: meId as string,
      segmento: "Automóvel",
      valor_credito: 0,
      observacao: null,
      score: 1,
      estagio: "Novo" as EstagioDB,
      expected_close_at: null,
    };

    const { data: opp, error: e2 } = await supabase.from("opportunities").insert([payloadOpp]).select().single();
    setLoading(false);
    if (e2) {
      alert("Lead criado, mas falhou ao criar oportunidade: " + e2.message);
    } else {
      setLista((s) => [opp as Oportunidade, ...s]);
    }

    // atualizar leads (responsável pode ser o próprio)
    setLeads((s) => [lead as Lead, ...s]);

    // reset
    setNlNome("");
    setNlTel("");
    setNlEmail("");
    setNlOrigem("Site");
    setNlDesc("");
    setNewLeadOpen(false);
    alert("Lead criado e oportunidade adicionada ao estágio 'Novo'.");
  }

  // Modal Nova Oportunidade
  function abrirModalNovaOpp() {
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setScore(1);
    setStageUI("novo");
    setExpectedDate("");
    setObs("");
    setNewOppOpen(true);
  }

  function moedaParaNumeroBR(valor: string) {
    const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(limpo || 0);
  }

  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");

    const valorNum = moedaParaNumeroBR(valor);
    if (isNaN(valorNum)) return alert("Valor inválido.");

    let isoDate: string | null = null;
    if (expectedDate) {
      const [d, m, y] = expectedDate.split("/");
      if (d && m && y) isoDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    setLoading(true);
    const payload = {
      lead_id: leadId,
      vendedor_id: vendId,
      owner_id: vendId,
      segmento,
      valor_credito: valorNum || 0,
      observacao: obs ? `[${new Date().toLocaleString("pt-BR")}]\n${obs}` : null,
      score,
      estagio: uiToDB[stageUI] as EstagioDB,
      expected_close_at: isoDate,
    };
    const { data, error } = await supabase.from("opportunities").insert([payload]).select().single();
    setLoading(false);
    if (error) {
      alert("Erro ao criar oportunidade: " + error.message);
      return;
    }
    setLista((s) => [data as Oportunidade, ...s]);
    setNewOppOpen(false);
    alert("Oportunidade criada!");
  }

  // Tratar (editar oportunidade)
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
        if (s === "Negociacao") return "Negociação";
        if (s === "Qualificacao" || s === "Qualificação") return "Qualificando";
        if (s === "Fechado (Ganho)" || s === "Fechado (Perdido)" || s === "Proposta" || s === "Novo") return s as EstagioDB;
        if (s.toLowerCase().startsWith("negocia")) return "Negociação";
        if (s.toLowerCase().startsWith("qualifica")) return "Qualificando";
        if (s.toLowerCase().startsWith("proposta")) return "Proposta";
        if (s.toLowerCase().startsWith("novo")) return "Novo";
        return "Novo";
      })(),
      expected_close_at: editDateBR ? brToISO(editDateBR) : null,
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

  // Editar Lead direto aqui
  async function saveLead() {
    if (!editLead) return;
    const payload = {
      nome: editLead.nome?.trim(),
      telefone: onlyDigits(editLead.telefone) || null,
      email: (editLead.email || "").trim().toLowerCase() || null,
      origem: editLead.origem || null,
      descricao: editLead.descricao?.trim() || null,
    };
    const { error } = await supabase.from("leads").update(payload).eq("id", editLead.id);
    if (error) {
      alert("Não foi possível salvar o lead: " + error.message);
      return;
    }
    setLeads((s) => s.map((l) => (l.id === editLead.id ? { ...l, ...payload } : l)));
    setEditLead(null);
  }

  // Reatribuir Lead (com botão salvar)
  async function doReassign() {
    if (!reassignLead || !newOwnerId) {
      alert("Selecione o novo responsável.");
      return;
    }

    // 1) Atualiza o lead
    const { error: e1 } = await supabase.from("leads").update({ owner_id: newOwnerId }).eq("id", reassignLead.id);

    if (e1) {
      alert("Erro ao reatribuir: " + e1.message);
      return;
    }

    // 2) Atualiza TODAS as oportunidades do lead (vendedor_id e owner_id)
    const { error: e2 } = await supabase
      .from("opportunities")
      .update({ vendedor_id: newOwnerId, owner_id: newOwnerId })
      .eq("lead_id", reassignLead.id);

    if (e2) {
      // Mesmo se der erro aqui, o lead já foi reatribuído.
      alert("Lead atualizado, mas falhou ao reatribuir oportunidades: " + e2.message);
    }

    // 3) Atualização otimista no estado
    setLeads((prev) => prev.map((l) => (l.id === reassignLead.id ? { ...l, owner_id: newOwnerId } : l)));
    setLista((prev) =>
      prev.map((o) => (o.lead_id === reassignLead.id ? { ...o, vendedor_id: newOwnerId, owner_id: newOwnerId } : o))
    );

    setReassignLead(null);
    setNewOwnerId("");
    alert("Lead reatribuído!");
  }

  /** ===================== Drag & Drop ===================== */
  const getUIStageForOpp = (o: Oportunidade): StageUI => dbToUI[o.estagio as string] ?? "novo";

  function onCardDragStart(e: React.DragEvent<HTMLDivElement>, oppId: string) {
    e.dataTransfer.setData("text/plain", oppId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onColumnDragOver(e: React.DragEvent<HTMLDivElement>, target: StageUI) {
    e.preventDefault(); // permite drop
    setDragOverStage(target);
  }

  function onColumnDragLeave() {
    setDragOverStage(null);
  }

  async function onColumnDrop(e: React.DragEvent<HTMLDivElement>, target: StageUI) {
    e.preventDefault();
    const oppId = e.dataTransfer.getData("text/plain");
    setDragOverStage(null);
    if (!oppId) return;

    const opp = lista.find((o) => o.id === oppId);
    if (!opp) return;

    const fromStage = getUIStageForOpp(opp);
    if (fromStage === target) return;

    // Otimista
    const prevLista = [...lista];
    const nextLista = lista.map((o) => (o.id === oppId ? { ...o, estagio: uiToDB[target] } : o));
    setLista(nextLista);

    // Persistir
    const { error, data } = await supabase
      .from("opportunities")
      .update({ estagio: uiToDB[target] })
      .eq("id", oppId)
      .select()
      .single();

    if (error) {
      setLista(prevLista); // rollback
      alert("Não foi possível mover a oportunidade: " + error.message);
      return;
    }

    // Confirmar com retorno do banco (caso exista trigger/normalização)
    setLista((s) => s.map((o) => (o.id === oppId ? (data as Oportunidade) : o)));
  }

  /** ===================== UI Aux ===================== */
  const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={muted ? "none" : "currentColor"}
      stroke={muted ? "currentColor" : "none"}
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M12.04 0C5.44 0 .1 5.34.1 11.94c0 2.06.54 4.08 1.57 5.87L0 24l6.39-1.8a12 12 0 0 0 5.65 1.4C18.64 23.6 24 18.26 24 11.96 24 5.36 18.64 0 12.04 0Zm0 21.2c-1.77 0-3.48-.46-4.97-1.34l-.36-.21-3.78 1.06 1.05-3.69-.22-.38A9.17 9.17 0 1 1 21.2 11.96c0 5.06-4.1 9.24-9.16 9.24Zm5.18-6.91c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.94-.93 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.44-2.33-1.42-.86-.76-1.44-1.69-1.61-1.98-.17-.29-.02-.45.13-.6.13-.12.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.64-1.57-.9-2.15-.24-.57-.49-.49-.66-.5h-.57c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.41s1.03 2.8 1.17 3.01c.14.2 2 3.18 4.84 4.34 2.39.94 2.88.76 3.4.71.52-.05 1.68-.69 1.93-1.36.25-.67.25-1.23.17-1.36-.07-.13-.26-.2-.55-.35Z" />
    </svg>
  );

  const IconBtn: React.FC<
    React.PropsWithChildren<{ title?: string; disabled?: boolean; onClick?: () => void; href?: string }>
  > = ({ children, title, disabled, onClick, href }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        style={{ ...iconBtn, ...(disabled ? iconBtnDisabled : {}) }}
        onClick={(e) => disabled && e.preventDefault()}
      >
        {children}
      </a>
    ) : (
      <button title={title} onClick={onClick} disabled={disabled} style={{ ...iconBtn, ...(disabled ? iconBtnDisabled : {}) }}>
        {children}
      </button>
    );

  /** ===================== Donuts ===================== */
  const sumBySegment = (items: Oportunidade[]) => {
    const m = new Map<string, number>();
    for (const o of items) {
      const seg = o.segmento || "Outros";
      m.set(seg, (m.get(seg) || 0) + Number(o.valor_credito || 0));
    }
    return Array.from(m.entries()); // [segmento, total]
  };

  const wonPairs = useMemo(
    () => sumBySegment(lista.filter((o) => dbToUI[o.estagio as string] === "fechado_ganho")),
    [lista]
  );
  const lostPairs = useMemo(
    () => sumBySegment(lista.filter((o) => dbToUI[o.estagio as string] === "fechado_perdido")),
    [lista]
  );

  const Donut: React.FC<{
    data: [string, number][];
    title: string;
    hoverKey: string | null;
    setHover: (s: string | null) => void;
  }> = ({ data, title, hoverKey, setHover }) => {
    const total = data.reduce((a, [, v]) => a + v, 0);
    const cx = 80,
      cy = 80,
      r = 58,
      circ = 2 * Math.PI * r;

    let acc = 0;
    return (
      <div style={glassCard}>
        <div style={{ fontWeight: 800, color: CONS.ink, marginBottom: 6 }}>{title}</div>
        <svg width="160" height="160" viewBox="0 0 160 160" style={{ display: "block", margin: "0 auto" }}>
          {/* fundo */}
          <circle cx={cx} cy={cy} r={r} stroke="rgba(0,0,0,.06)" strokeWidth="18" fill="none" />
          {data.map(([label, value], i) => {
            const frac = total ? value / total : 0;
            const len = frac * circ;
            const dasharray = `${len} ${circ - len}`;
            const dashoffset = -acc * circ;
            acc += frac;

            const color = CONS.donut[i % CONS.donut.length];
            const isHover = hoverKey === label;

            return (
              <g key={label}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={color}
                  strokeWidth={isHover ? 22 : 18}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  strokeLinecap="butt"
                  fill="none"
                  onMouseEnter={() => setHover(label)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "all .15s ease" }}
                />
              </g>
            );
          })}
          {/* centro */}
          <text x="80" y="86" textAnchor="middle" fontSize="14" fill={CONS.ink} fontWeight={800}>
            {fmtCompact(total)}
          </text>
        </svg>

        {/* legenda */}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {data.map(([label, value], i) => {
            const color = CONS.donut[i % CONS.donut.length];
            const isHover = hoverKey === label;
            return (
              <div
                key={label}
                onMouseEnter={() => setHover(label)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isHover ? "rgba(255,255,255,.5)" : "transparent",
                  borderRadius: 8,
                  padding: "4px 6px",
                  cursor: "default",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                    display: "inline-block",
                  }}
                />
                <span style={{ flex: 1, color: CONS.ink, fontWeight: 700 }}>{label}</span>
                <span style={{ color: "#475569" }}>{fmtCompact(value)}</span>
              </div>
            );
          })}
          {!data.length && <div style={{ color: "#94a3b8", fontSize: 12 }}>Sem dados</div>}
        </div>
      </div>
    );
  };

  /** ===================== Render ===================== */
  const StageCard = ({ label, qtd, total }: { label: string; qtd: number; total: number }) => (
    <div style={glassSmallCard}>
      <div style={{ fontWeight: 800, color: CONS.ink, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#1f2937" }}>Qtd: {qtd}</div>
      <div style={{ color: "#1f2937" }}>Valor: {fmtBRL(total)}</div>
    </div>
  );

  const Card = (o: Oportunidade) => {
    const lead = leads.find((l) => l.id === o.lead_id);
    const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
    const due = o.expected_close_at ? new Date(o.expected_close_at + "T00:00:00") : null;

    const statusTag = (() => {
      if (!due) return null;
      const today = new Date();
      const onlyDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = (onlyDate(due) - onlyDate(today)) / (1000 * 60 * 60 * 24);
      if (diff < 0) return <span style={tagDanger}>Atrasado</span>;
      if (diff === 0) return <span style={tagWarn}>Hoje</span>;
      if (diff <= 5) return <span style={tagSoft}>Breve</span>;
      return null;
    })();

    return (
      <div
        key={o.id}
        style={cardRowGlass}
        draggable
        onDragStart={(e) => onCardDragStart(e, o.id)}
        title="Arraste para mudar de coluna"
      >
        <div style={{ fontWeight: 700, color: CONS.ink, marginBottom: 4 }}>{lead?.nome || "-"}</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
          <strong>Vendedor:</strong> {vend?.nome || "-"}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>
          <strong>Segmento:</strong> {o.segmento}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>
          <strong>Valor:</strong> {fmtBRL(Number(o.valor_credito || 0))}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
          <strong>Prob.:</strong> {"★".repeat(Math.max(1, Math.min(5, o.score)))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Ligar */}
          <IconBtn
            title="Ligar"
            disabled={!lead?.telefone}
            href={lead?.telefone ? `tel:${onlyDigits(lead.telefone)}` : undefined}
          >
            📞
          </IconBtn>
          {/* WhatsApp */}
          <IconBtn
            title="WhatsApp"
            disabled={!normalizePhoneToWa(lead?.telefone)}
            href={normalizePhoneToWa(lead?.telefone) ? `https://wa.me/${normalizePhoneToWa(lead?.telefone)}` : undefined}
          >
            <WhatsappIcon />
          </IconBtn>
          {/* Email */}
          <IconBtn title={lead?.email ? "E-mail" : "Sem e-mail"} disabled={!lead?.email} href={lead?.email ? `mailto:${lead.email}` : undefined}>
            ✉️
          </IconBtn>
          {/* Editar lead */}
          <IconBtn title="Editar lead" onClick={() => setEditLead(lead!)}>
            ✏️
          </IconBtn>
          {/* Reatribuir */}
          <IconBtn title="Reatribuir" onClick={() => setReassignLead(lead!)}>
            ⇄
          </IconBtn>
          {/* Tratar */}
          <button onClick={() => openEdit(o)} style={btnSmallPrimary}>
            Tratar
          </button>
          {statusTag}
          {o.expected_close_at && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
              {new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </div>
    );
  };

  const Column = ({ title, items, stageUIKey }: { title: string; items: Oportunidade[]; stageUIKey: StageUI }) => (
    <div
      style={{
        ...stageColGlass,
        ...(dragOverStage === stageUIKey ? stageColActive : {}),
      }}
      onDragOver={(e) => onColumnDragOver(e, stageUIKey)}
      onDragLeave={onColumnDragLeave}
      onDrop={(e) => onColumnDrop(e, stageUIKey)}
    >
      <div style={stageTitle}>{title}</div>
      <div style={{ display: "grid", gap: 10, minHeight: 40 }}>
        {items.length ? items.map((o) => <Card key={o.id} {...o} />) : <div style={emptyColGlass}>—</div>}
      </div>
    </div>
  );

  return (
    <div style={pageWrap}>
      <LiquidBG />

      {/* Topbar */}
      <div style={topbarGlass}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ ...input, ...inputGlass, margin: 0, flex: 1 }}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
        <button onClick={() => setNewLeadOpen(true)} style={btnPrimary}>
          + Novo Lead
        </button>
        <button onClick={abrirModalNovaOpp} style={btnGhost}>
          + Nova Oportunidade
        </button>
      </div>

      {/* Pipeline por estágio (4 colunas) */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          <StageCard label="Novo" qtd={kpi.novo.qtd} total={kpi.novo.total} />
          <StageCard label="Qualificando" qtd={kpi.qualificando.qtd} total={kpi.qualificando.total} />
          <StageCard label="Propostas" qtd={kpi.proposta.qtd} total={kpi.proposta.total} />
          <StageCard label="Negociação" qtd={kpi.negociacao.qtd} total={kpi.negociacao.total} />
        </div>
      </div>

      {/* Board (4 blocos) */}
      <div style={glassCard}>
        <div style={{ ...sectionTitle, marginTop: 0, marginBottom: 14 }}>Oportunidades</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          <Column title="Novo" items={colNovo} stageUIKey="novo" />
          <Column title="Qualificando" items={colQualificando} stageUIKey="qualificando" />
          <Column title="Propostas" items={colPropostas} stageUIKey="proposta" />
          <Column title="Negociação" items={colNegociacao} stageUIKey="negociacao" />
        </div>

        {/* paginação única */}
        <div style={pager}>
          <button
            style={{ ...btnSecondary, opacity: page <= 1 ? 0.6 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Página {page} de {totalPages}
          </span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Finalizados – Donuts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Donut data={wonPairs} title="Fechado (Ganho)" hoverKey={hoverWon} setHover={setHoverWon} />
        <Donut data={lostPairs} title="Fechado (Perdido)" hoverKey={hoverLost} setHover={setHoverLost} />
      </div>

      {/* ===== Modal: Tratar ===== */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCardGlass}>
            <h3 style={{ marginTop: 0 }}>Tratar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Segmento</label>
                <select
                  value={editing.segmento}
                  onChange={(e) => setEditing({ ...editing, segmento: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                >
                  {segmentos.map((s) => (
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
                  onChange={(e) => setEditing({ ...editing, valor_credito: Number(e.target.value.replace(/\D/g, "")) })}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
              <div>
                <label style={label}>Probabilidade</label>
                <select
                  value={String(editing.score)}
                  onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })}
                  style={{ ...input, ...inputGlass }}
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
                  style={{ ...input, ...inputGlass }}
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
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={editDateBR}
                  onChange={(e) => setEditDateBR(maskDateBR(e.target.value))}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>Adicionar observação</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ ...input, ...inputGlass, minHeight: 90 }}
                  placeholder="Escreva uma nova observação. O histórico anterior será mantido."
                />
                <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico</div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "rgba(255,255,255,.55)",
                      border: "1px solid rgba(255,255,255,.35)",
                      borderRadius: 12,
                      padding: 8,
                      maxHeight: 180,
                      overflowY: "auto",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
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

      {/* ===== Modal: Novo Lead ===== */}
      {newLeadOpen && (
        <div style={modalBackdrop}>
          <div style={modalCardGlass}>
            <h3 style={{ marginTop: 0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={nlNome} onChange={(e) => setNlNome(e.target.value)} style={{ ...input, ...inputGlass }} />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={nlTel} onChange={(e) => setNlTel(e.target.value)} style={{ ...input, ...inputGlass }} />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} style={{ ...input, ...inputGlass }} />
              </div>
              <div>
                <label style={label}>Origem</label>
                <select value={nlOrigem} onChange={(e) => setNlOrigem(e.target.value)} style={{ ...input, ...inputGlass }}>
                  <option value="Site">Site</option>
                  <option value="Redes Sociais">Redes Sociais</option>
                  <option value="Indicação">Indicação</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="Parceria">Parceria</option>
                  <option value="Relacionamento">Relacionamento</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>Descrição</label>
                <input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} style={{ ...input, ...inputGlass }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarLead} disabled={loading} style={btnPrimary}>
                {loading ? "Salvando..." : "Salvar lead"}
              </button>
              <button onClick={() => setNewLeadOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Nova Oportunidade ===== */}
      {newOppOpen && (
        <div style={modalBackdrop}>
          <div style={modalCardGlass}>
            <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Selecionar um Lead</label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={{ ...input, ...inputGlass }}>
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
                <select value={vendId} onChange={(e) => setVendId(e.target.value)} style={{ ...input, ...inputGlass }}>
                  <option value="">Selecione um Vendedor</option>
                  {vendedores.map((v) => (
                    <option key={v.auth_user_id} value={v.auth_user_id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Segmento</label>
                <select value={segmento} onChange={(e) => setSegmento(e.target.value)} style={{ ...input, ...inputGlass }}>
                  {segmentos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Valor do crédito (R$)</label>
                <input value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...input, ...inputGlass }} placeholder="Ex.: 80.000,00" />
              </div>

              <div>
                <label style={label}>Observações</label>
                <input value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...input, ...inputGlass }} placeholder="Observação (opcional)" />
              </div>

              <div>
                <label style={label}>Probabilidade</label>
                <select value={String(score)} onChange={(e) => setScore(Number(e.target.value))} style={{ ...input, ...inputGlass }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Estágio</label>
                <select value={stageUI} onChange={(e) => setStageUI(e.target.value as StageUI)} style={{ ...input, ...inputGlass }}>
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
                  onChange={(e) => setExpectedDate(maskDateBR(e.target.value))}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarOportunidade} disabled={loading} style={btnPrimary}>
                {loading ? "Criando..." : "Criar oportunidade"}
              </button>
              <button onClick={() => setNewOppOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Editar Lead ===== */}
      {editLead && (
        <div style={modalBackdrop}>
          <div style={modalCardGlassSmall}>
            <h3 style={{ marginTop: 0 }}>Editar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input
                  value={editLead.nome || ""}
                  onChange={(e) => setEditLead({ ...editLead, nome: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input
                  value={editLead.telefone || ""}
                  onChange={(e) => setEditLead({ ...editLead, telefone: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input
                  value={editLead.email || ""}
                  onChange={(e) => setEditLead({ ...editLead, email: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
              <div>
                <label style={label}>Origem</label>
                <select
                  value={editLead.origem || "Site"}
                  onChange={(e) => setEditLead({ ...editLead, origem: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                >
                  <option value="Site">Site</option>
                  <option value="Redes Sociais">Redes Sociais</option>
                  <option value="Indicação">Indicação</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="Parceria">Parceria</option>
                  <option value="Relacionamento">Relacionamento</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={label}>Descrição</label>
                <input
                  value={editLead.descricao || ""}
                  onChange={(e) => setEditLead({ ...editLead, descricao: e.target.value })}
                  style={{ ...input, ...inputGlass }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveLead} style={btnPrimary}>
                Salvar
              </button>
              <button onClick={() => setEditLead(null)} style={btnGhost}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Reatribuir ===== */}
      {reassignLead && (
        <div style={modalBackdrop}>
          <div style={modalCardGlassSmall}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reatribuir Lead</h3>
            <p style={{ margin: "0 0 8px", color: "#475569" }}>
              <strong>Lead:</strong> {reassignLead.nome}
            </p>
            <select style={{ ...input, ...inputGlass }} value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}>
              <option value="">Selecionar usuário…</option>
              {vendedores.map((u) => (
                <option key={u.auth_user_id} value={u.auth_user_id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={() => setReassignLead(null)} style={btnGhost}>
                Cancelar
              </button>
              <button onClick={doReassign} style={btnPrimary}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ===================== Estilos ===================== */
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: CONS.ink,
  marginBottom: 10,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const pageWrap: React.CSSProperties = {
  position: "relative",
  maxWidth: 1200,
  margin: "24px auto",
  padding: "0 16px 24px 16px",
  fontFamily: "Inter, system-ui, Arial",
  // leve gradiente de fundo para ajudar o glass
  background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
  borderRadius: 16,
  overflow: "hidden",
};

/** ===== Liquid Glass base ===== */
const glassBase: React.CSSProperties = {
  background: "rgba(255,255,255,.55)",
  border: "1px solid rgba(255,255,255,.35)",
  boxShadow:
    "0 2px 14px rgba(0,0,0,.06), inset 0 -8px 30px rgba(181,165,115,.12)", // brilho dourado (B5A573) sutil
  backdropFilter: "saturate(160%) blur(10px)",
  WebkitBackdropFilter: "saturate(160%) blur(10px)",
};

const topbarGlass: React.CSSProperties = {
  ...glassBase,
  padding: 12,
  borderRadius: 14,
  marginBottom: 16,
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const glassCard: React.CSSProperties = {
  ...glassBase,
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};

const glassSmallCard: React.CSSProperties = {
  ...glassBase,
  borderRadius: 14,
  padding: 14,
};

const stageColGlass: React.CSSProperties = {
  ...glassBase,
  borderRadius: 14,
  padding: 12,
  minHeight: 120,
  transition: "border-color .12s ease, background-color .12s ease, box-shadow .12s ease",
};

const stageColActive: React.CSSProperties = {
  border: "1px dashed rgba(181,165,115,.8)", // dourado
  background: "rgba(255,255,255,.7)",
  boxShadow: "0 0 0 3px rgba(224,206,140,.15) inset",
};

const stageTitle: React.CSSProperties = {
  fontWeight: 800,
  color: CONS.ink,
  marginBottom: 8,
};

const cardRowGlass: React.CSSProperties = {
  ...glassBase,
  borderRadius: 12,
  padding: 10,
};

const emptyColGlass: React.CSSProperties = {
  ...glassBase,
  padding: 12,
  fontSize: 12,
  color: "#64748b",
  textAlign: "center",
  borderRadius: 10,
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

const inputGlass: React.CSSProperties = {
  background: "rgba(255,255,255,.7)",
  border: "1px solid rgba(255,255,255,.35)",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,.04)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
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
  background: CONS.red,
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
};

const btnSmallPrimary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: CONS.red,
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,.6)",
  color: CONS.ink,
  border: "1px solid rgba(255,255,255,.35)",
  cursor: "pointer",
  fontWeight: 700,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(241,245,249,.7)",
  color: "#0f172a",
  border: "1px solid rgba(255,255,255,.35)",
  fontWeight: 600,
  cursor: "pointer",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.35)",
  background: "rgba(255,255,255,.65)",
  color: "#64748b",
  textDecoration: "none",
  cursor: "pointer",
  transition: "all .15s ease-in-out",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};
const iconBtnDisabled: React.CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

const pager: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  marginTop: 12,
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const modalCardGlass: React.CSSProperties = {
  width: "min(980px, 94vw)",
  background: "rgba(255,255,255,.7)",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.28), inset 0 -10px 30px rgba(181,165,115,.12)",
  border: "1px solid rgba(255,255,255,.35)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const modalCardGlassSmall: React.CSSProperties = {
  width: "min(520px, 94vw)",
  background: "rgba(255,255,255,.7)",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.28), inset 0 -10px 30px rgba(181,165,115,.12)",
  border: "1px solid rgba(255,255,255,.35)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const tagDanger: React.CSSProperties = {
  background: "#fee2e2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};
const tagWarn: React.CSSProperties = {
  background: "#fef3c7",
  border: "1px solid #fde68a",
  color: "#92400e",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};
const tagSoft: React.CSSProperties = {
  background: "#ecfeff",
  border: "1px solid #a5f3fc",
  color: "#155e75",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

/** ====== Liquid canvas styles ====== */
const liquidCanvas: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const blob: React.CSSProperties = {
  position: "absolute",
  width: 420,
  height: 420,
  borderRadius: "50%",
  filter: "blur(60px)",
  opacity: 0.55,
};

const blob1: React.CSSProperties = {
  left: -120,
  top: -80,
  background: "radial-gradient(closest-side, #A11C27, rgba(161,28,39,0))",
  animation: "blobFloat1 26s ease-in-out infinite",
};

const blob2: React.CSSProperties = {
  right: -140,
  top: 60,
  background: "radial-gradient(closest-side, #1E293F, rgba(30,41,63,0))",
  animation: "blobFloat2 30s ease-in-out infinite",
};

const blob3: React.CSSProperties = {
  left: "30%",
  bottom: -160,
  background: "radial-gradient(closest-side, #E0CE8C, rgba(224,206,140,0))",
  animation: "blobFloat3 34s ease-in-out infinite",
};

const goldGlow: React.CSSProperties = {
  position: "absolute",
  right: -80,
  bottom: -80,
  width: 260,
  height: 260,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(181,165,115,.35), rgba(181,165,115,0))",
  filter: "blur(40px)",
  opacity: 0.6,
  transform: "rotate(15deg)",
};

const liquidKeyframes = `
@keyframes blobFloat1 {
  0% { transform: translate(0,0) scale(1); }
  50% { transform: translate(40px, 30px) scale(1.08); }
  100% { transform: translate(0,0) scale(1); }
}
@keyframes blobFloat2 {
  0% { transform: translate(0,0) scale(1); }
  50% { transform: translate(-30px, 20px) scale(1.05); }
  100% { transform: translate(0,0) scale(1); }
}
@keyframes blobFloat3 {
  0% { transform: translate(0,0) scale(1); }
  50% { transform: translate(20px, -30px) scale(1.06); }
  100% { transform: translate(0,0) scale(1); }
}
`;
