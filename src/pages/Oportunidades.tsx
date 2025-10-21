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

/** ===================== Página ===================== */
export default function Oportunidades() {
  const PAGE_BLOCK = 5; // até 5 por coluna
  const [page, setPage] = useState(1);

  // dados
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);

  // busca
  const [search, setSearch] = useState("");

  // modais
  const [createOpen, setCreateOpen] = useState(false); // novo lead + oportunidade na sequência
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

  // criar oportunidade (select lead + vendedor)
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
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
        const u = await supabase.from("users").select("auth_user_id, nome").order("nome");
        setVendedores((u.data || []) as Vendedor[]);
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
    const from = (page - 1) * PAGE_BLOCK;
    const to = from + PAGE_BLOCK;
    return arr.slice(from, to);
    // se a coluna tiver menos de 5 nesta página, ela fica menor — é esperado.
  };

  const colNovo = sliceByPage(colNovoAll);
  const colQualificando = sliceByPage(colQualAll);
  const colPropostas = sliceByPage(colPropAll);
  const colNegociacao = sliceByPage(colNegAll);

  /** ===================== Ações ===================== */
  // Novo Lead (overlay)
  async function criarLeadENaSequencia() {
    const payload = {
      nome: nlNome.trim(),
      telefone: onlyDigits(nlTel) || null,
      email: nlEmail.trim().toLowerCase() || null,
      origem: nlOrigem || null,
      descricao: nlDesc.trim() || null,
    };
    if (!payload.nome) return alert("Informe o nome do lead.");

    setLoading(true);
    const { data, error } = await supabase.from("leads").insert([payload]).select().single();
    setLoading(false);
    if (error) {
      alert("Erro ao criar lead: " + error.message);
      return;
    }
    // seleciona para criar oportunidade rapidamente
    setLeadId(data.id);
    setVendId("");
    setCreateOpen(false);
    alert("Lead criado! Agora selecione o vendedor e crie a oportunidade.");
  }

  // Criar oportunidade
  function moedaParaNumeroBR(valor: string) {
    const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(limpo || 0);
  }
  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");

    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

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
      valor_credito: valorNum,
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
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setObs("");
    setScore(1);
    setStageUI("novo");
    setExpectedDate("");
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

  // Reatribuir Lead (admin simples)
  async function doReassign(newOwnerId: string) {
    if (!reassignLead || !newOwnerId) return;
    const { error } = await supabase.from("leads").update({ owner_id: newOwnerId }).eq("id", reassignLead.id);
    if (error) {
      alert("Erro ao reatribuir: " + error.message);
      return;
    }
    setLeads((s) => s.map((l) => (l.id === reassignLead.id ? { ...l, owner_id: newOwnerId } : l)));
    setReassignLead(null);
  }

  /** ===================== UI Aux ===================== */
  const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={muted ? "none" : "currentColor"} stroke={muted ? "currentColor" : "none"} strokeWidth="1.2" aria-hidden="true">
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

  /** ===================== Render ===================== */
  const StageCard = ({ id, label, qtd, total }: { id: StageUI; label: string; qtd: number; total: number }) => (
    <div style={kpiCard}>
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
      <div key={o.id} style={cardRow}>
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
          <IconBtn
            title={lead?.email ? "E-mail" : "Sem e-mail"}
            disabled={!lead?.email}
            href={lead?.email ? `mailto:${lead.email}` : undefined}
          >
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

  const Column = ({ title, items }: { title: string; items: Oportunidade[] }) => (
    <div style={stageCol}>
      <div style={stageTitle}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {items.length ? items.map((o) => <Card key={o.id} {...o} />) : <div style={emptyCol}>—</div>}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      {/* Topbar */}
      <div style={topbar}>
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
          + Novo Lead
        </button>
        <button onClick={criarOportunidade} style={btnGhost}>
          + Nova Oportunidade
        </button>
      </div>

      {/* Pipeline por estágio (apenas 4 colunas) */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          <StageCard id="novo" label="Novo" qtd={kpi.novo.qtd} total={kpi.novo.total} />
          <StageCard id="qualificando" label="Qualificando" qtd={kpi.qualificando.qtd} total={kpi.qualificando.total} />
          <StageCard id="proposta" label="Propostas" qtd={kpi.proposta.qtd} total={kpi.proposta.total} />
          <StageCard id="negociacao" label="Negociação" qtd={kpi.negociacao.qtd} total={kpi.negociacao.total} />
        </div>
      </div>

      {/* Board (4 blocos) */}
      <div style={card}>
        <div style={{ ...sectionTitle, marginTop: 0, marginBottom: 14 }}>Oportunidades</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          <Column title="Novo" items={colNovo} />
          <Column title="Qualificando" items={colQualificando} />
          <Column title="Propostas" items={colPropostas} />
          <Column title="Negociação" items={colNegociacao} />
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

      {/* ===== Modal: Tratar ===== */}
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
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={editDateBR}
                  onChange={(e) => setEditDateBR(maskDateBR(e.target.value))}
                  style={input}
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

      {/* ===== Modal: Novo Lead ===== */}
      {createOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={nlNome} onChange={(e) => setNlNome(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={nlTel} onChange={(e) => setNlTel(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Origem</label>
                <select value={nlOrigem} onChange={(e) => setNlOrigem(e.target.value)} style={input}>
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
                <input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarLeadENaSequencia} disabled={loading} style={btnPrimary}>
                {loading ? "Salvando..." : "Salvar lead"}
              </button>
              <button onClick={() => setCreateOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Editar Lead ===== */}
      {editLead && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Editar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input
                  value={editLead.nome || ""}
                  onChange={(e) => setEditLead({ ...editLead, nome: e.target.value })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input
                  value={editLead.telefone || ""}
                  onChange={(e) => setEditLead({ ...editLead, telefone: e.target.value })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input
                  value={editLead.email || ""}
                  onChange={(e) => setEditLead({ ...editLead, email: e.target.value })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>Origem</label>
                <select
                  value={editLead.origem || "Site"}
                  onChange={(e) => setEditLead({ ...editLead, origem: e.target.value })}
                  style={input}
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
                  style={input}
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
          <div style={modalCardSmall}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reatribuir Lead</h3>
            <p style={{ margin: "0 0 8px", color: "#475569" }}>
              <strong>Lead:</strong> {reassignLead.nome}
            </p>
            <select
              style={input}
              defaultValue={reassignLead.owner_id || ""}
              onChange={(e) => doReassign(e.target.value)}
            >
              <option value="">Selecionar usuário…</option>
              {vendedores.map((u) => (
                <option key={u.auth_user_id} value={u.auth_user_id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={() => setReassignLead(null)} style={btnSecondary}>
                Fechar
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
const topbar: React.CSSProperties = {
  background: "#fff",
  padding: 12,
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
  display: "flex",
  gap: 12,
  alignItems: "center",
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  padding: 16,
  marginBottom: 16,
};
const kpiCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,.06)",
  padding: 14,
};
const stageCol: React.CSSProperties = {
  background: CONS.grayBg,
  borderRadius: 12,
  padding: 12,
  minHeight: 120,
};
const stageTitle: React.CSSProperties = {
  fontWeight: 800,
  color: CONS.ink,
  marginBottom: 8,
};
const cardRow: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  boxShadow: "0 1px 3px rgba(0,0,0,.04)",
};
const emptyCol: React.CSSProperties = {
  padding: 12,
  fontSize: 12,
  color: "#94a3b8",
  textAlign: "center",
  background: "#fff",
  borderRadius: 10,
  border: "1px dashed #e5e7eb",
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
  background: "#fff",
  color: CONS.ink,
  border: "1px solid #e5e7eb",
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
const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#64748b",
  textDecoration: "none",
  cursor: "pointer",
  transition: "all .15s ease-in-out",
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
