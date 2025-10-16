// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================================
   Tipos
========================================= */
type Lead = {
  id: string;
  nome: string;
  owner_id: string | null;
  telefone?: string | null;
  email?: string | null;
};

type Vendedor = { auth_user_id: string; nome: string };

type StageUI = "novo" | "qualificando" | "proposta" | "negociacao";
type EstagioDB =
  | "Novo"
  | "Qualificando"
  | "Proposta"
  | "Negociação"
  | "Fechado (Ganho)"
  | "Fechado (Perdido)";

type Opportunity = {
  id: string;
  lead_id: string;
  vendedor_id: string; // compat
  owner_id?: string | null; // atual
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number; // 1..5
  estagio: EstagioDB | string;
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
};

type Me = { id: string; role: string } | null;

/* =========================================
   Constantes + helpers
========================================= */
const SEGMENTOS = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

const toDB: Record<StageUI, EstagioDB> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  negociacao: "Negociação",
};

const toUI: Partial<Record<string, StageUI>> = {
  Novo: "novo",
  Qualificando: "qualificando",
  Qualificação: "qualificando",
  Qualificacao: "qualificando",
  Proposta: "proposta",
  Negociação: "negociacao",
  Negociacao: "negociacao",
  "Fechado (Ganho)": "fechado_ganho" as any,
  "Fechado (Perdido)": "fechado_perdido" as any,
};

const fmtBRL = (n?: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

const soDigitos = (s?: string | null) => (s || "").replace(/\D+/g, "");
const toWa = (tel?: string | null) => {
  const d = soDigitos(tel);
  if (!d) return null;
  return d.startsWith("55") ? d : `55${d}`;
};
const telHref = (tel?: string | null) => {
  const d = soDigitos(tel);
  if (!d) return null;
  return `tel:${d}`;
};
const fmtTel = (tel?: string | null) => {
  const d = soDigitos(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel || "";
};

const BRtoISO = (ddmmaa?: string) => {
  const v = (ddmmaa || "").trim();
  if (!v) return null;
  const [d, m, y] = v.split("/");
  if (!d || !m || !y) return null;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const ISOtoBR = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
};

const parseBRMoeda = (valor: string) => {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
};

/* =========================================
   Component
========================================= */
export default function Oportunidades() {
  /* ---- estado base ---- */
  const [me, setMe] = useState<Me>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState("");

  // modais
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [editNote, setEditNote] = useState("");

  const [newOppOpen, setNewOppOpen] = useState(false);
  const [newOppLeadId, setNewOppLeadId] = useState("");
  const [newOppVend, setNewOppVend] = useState("");
  const [newOppSegmento, setNewOppSegmento] = useState<string>("Automóvel");
  const [newOppValor, setNewOppValor] = useState("");
  const [newOppObs, setNewOppObs] = useState("");
  const [newOppScore, setNewOppScore] = useState(1);
  const [newOppStage, setNewOppStage] = useState<StageUI>("novo");
  const [newOppDateBR, setNewOppDateBR] = useState("");
  const [loading, setLoading] = useState(false);

  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [leadNome, setLeadNome] = useState("");
  const [leadTel, setLeadTel] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadOrigem, setLeadOrigem] = useState("Site");
  const [leadDescricao, setLeadDescricao] = useState("");

  // reatribuição
  const [reassignOpen, setReassignOpen] = useState<Opportunity | null>(null);
  const [newOwnerId, setNewOwnerId] = useState("");

  // paginação por coluna (5 por página)
  const PAGE = 5;
  const [pageByStage, setPageByStage] = useState<Record<StageUI, number>>({
    novo: 1,
    qualificando: 1,
    proposta: 1,
    negociacao: 1,
  });

  /* ---- usuário atual ---- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  /* ---- carga inicial ---- */
  useEffect(() => {
    (async () => {
      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, owner_id, telefone, email")
        .order("created_at", { ascending: false });
      setLeads(l || []);

      const { data: v } = await supabase.rpc("listar_vendedores");
      setVendedores((v || []) as Vendedor[]);

      const { data: o } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      setLista((o || []) as Opportunity[]);
    })();
  }, []);

  /* ---- derive: KPI + filtros + grupos ---- */
  const kpi = useMemo(() => {
    const stages: StageUI[] = ["novo", "qualificando", "proposta", "negociacao"];
    const base: Record<StageUI, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
    };
    for (const o of lista) {
      const ui = toUI[o.estagio as string];
      if (ui && stages.includes(ui)) {
        base[ui].qtd += 1;
        base[ui].total += Number(o.valor_credito || 0);
      }
    }
    return base;
  }, [lista]);

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((o) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const leadNome = lead?.nome?.toLowerCase() || "";
      const vendNome =
        vendedores.find((v) => v.auth_user_id === (o.owner_id || o.vendedor_id))?.nome?.toLowerCase() ||
        "";
      const estagio = String(o.estagio).toLowerCase();
      const tel = lead?.telefone ? fmtTel(lead.telefone).toLowerCase() : "";
      return leadNome.includes(q) || vendNome.includes(q) || estagio.includes(q) || tel.includes(q);
    });
  }, [lista, leads, vendedores, search]);

  const grupos = useMemo(() => {
    const out: Record<StageUI, Opportunity[]> = {
      novo: [],
      qualificando: [],
      proposta: [],
      negociacao: [],
    };
    for (const o of visiveis) {
      const ui = toUI[o.estagio as string];
      if (!ui) continue;
      if (ui in out) out[ui as StageUI].push(o);
    }
    return out;
  }, [visiveis]);

  /* ---- ações ---- */

  // criar oportunidade
  async function criarOportunidade() {
    if (!newOppLeadId) return alert("Selecione um Lead.");
    const valorNum = parseBRMoeda(newOppValor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    const iso = BRtoISO(newOppDateBR);

    setLoading(true);
    const payload = {
      lead_id: newOppLeadId,
      vendedor_id: newOppVend || (me?.id as string),
      owner_id: newOppVend || (me?.id as string),
      segmento: newOppSegmento,
      valor_credito: valorNum,
      observacao: newOppObs ? `[${new Date().toLocaleString("pt-BR")}]\n${newOppObs}` : null,
      score: newOppScore,
      estagio: toDB[newOppStage] as EstagioDB,
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

    setLista((s) => [data as Opportunity, ...s]);
    setNewOppOpen(false);
    // reset
    setNewOppLeadId("");
    setNewOppVend("");
    setNewOppSegmento("Automóvel");
    setNewOppValor("");
    setNewOppObs("");
    setNewOppScore(1);
    setNewOppStage("novo");
    setNewOppDateBR("");
    alert("Oportunidade criada!");
  }

  // editar oportunidade
  function openEdit(o: Opportunity) {
    setEditOpp(o);
    setEditNote("");
  }
  function closeEdit() {
    setEditOpp(null);
    setEditNote("");
  }
  async function saveEdit() {
    if (!editOpp) return;

    const hist =
      (editOpp.observacao ? editOpp.observacao + "\n\n" : "") +
      (editNote ? `[${new Date().toLocaleString("pt-BR")}]\n${editNote}` : "");

    const payload = {
      segmento: editOpp.segmento,
      valor_credito: Number(editOpp.valor_credito || 0),
      score: Number(editOpp.score || 1),
      estagio: normalizeEstagioDB(String(editOpp.estagio)),
      expected_close_at: BRtoISO(ISOtoBR(editOpp.expected_close_at)),
      observacao: hist || editOpp.observacao || null,
    };

    const { error, data } = await supabase
      .from("opportunities")
      .update(payload)
      .eq("id", editOpp.id)
      .select()
      .single();

    if (error) {
      alert("Falha ao salvar: " + error.message);
      return;
    }
    setLista((s) => s.map((x) => (x.id === editOpp.id ? (data as Opportunity) : x)));
    closeEdit();
  }

  // novo lead -> já cria opportunity em "Novo"
  async function criarLeadENovaOpp() {
    const nome = leadNome.trim();
    const telefone = soDigitos(leadTel);
    const email = (leadEmail || "").trim().toLowerCase() || null;
    if (!nome) return alert("Informe o nome.");

    setLoading(true);
    // cria lead
    const { data: insLead, error: e1 } = await supabase
      .from("leads")
      .insert([
        {
          nome,
          telefone: telefone || null,
          email,
          origem: leadOrigem,
          descricao: leadDescricao ? leadDescricao.trim() : null,
        },
      ])
      .select("id, owner_id")
      .single();

    if (e1 || !insLead) {
      setLoading(false);
      alert("Não foi possível criar o lead: " + (e1?.message || ""));
      return;
    }

    // cria oportunidade automática
    const { error: e2, data: opp } = await supabase
      .from("opportunities")
      .insert([
        {
          lead_id: insLead.id,
          vendedor_id: (me?.id as string),
          owner_id: (me?.id as string),
          segmento: "Automóvel",
          valor_credito: 0,
          observacao: null,
          score: 1,
          estagio: "Novo" as EstagioDB,
          expected_close_at: null,
        },
      ])
      .select()
      .single();

    setLoading(false);

    if (e2) {
      alert("Lead criado, mas falhou ao criar oportunidade: " + e2.message);
    } else if (opp) {
      setLista((s) => [opp as Opportunity, ...s]);
    }

    // reset + fechar
    setLeadNome("");
    setLeadTel("");
    setLeadEmail("");
    setLeadOrigem("Site");
    setLeadDescricao("");
    setNewLeadOpen(false);
  }

  // reatribuir
  async function doReassign() {
    if (!reassignOpen || !newOwnerId) return;
    const { error, data } = await supabase
      .from("opportunities")
      .update({ owner_id: newOwnerId, vendedor_id: newOwnerId })
      .eq("id", reassignOpen.id)
      .select()
      .single();
    if (error) {
      alert("Falha ao reatribuir: " + error.message);
      return;
    }
    setLista((s) => s.map((x) => (x.id === reassignOpen.id ? (data as Opportunity) : x)));
    setReassignOpen(null);
    setNewOwnerId("");
  }

  // util: status de data (atrasado / hoje / próximos 5 dias)
  function dateBadge(iso?: string | null) {
    if (!iso) return null;
    const today = new Date();
    const dt = new Date(iso + "T00:00:00");
    const diff = Math.floor((dt.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
    if (diff < 0) return <Badge color="#dc2626">Atrasado</Badge>;
    if (diff === 0) return <Badge color="#0ea5e9">Hoje</Badge>;
    if (diff > 0 && diff <= 5) return <Badge color="#f59e0b">Próx. 5 dias</Badge>;
    return null;
  }

  /* =========================================
     UI
  ========================================= */

  /* ---------- Ícones simples (SVG inline) ---------- */
  const PhoneIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V21a1 1 0 01-1 1C10.4 22 2 13.6 2 3a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.24 1.01l-2.2 2.2z" />
    </svg>
  );
  const WhatsappIcon = ({ muted = false }: { muted?: boolean }) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={muted ? "none" : "currentColor"}
      stroke={muted ? "currentColor" : "none"}
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M12.04 0C5.44 0 .1 5.34.1 11.94c0 2.06.54 4.08 1.57 5.87L0 24l6.39-1.8a12 12 0 0 0 5.65 1.4C18.64 23.6 24 18.26 24 11.96 24 5.36 18.64 0 12.04 0Zm5.18 14.29c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.94-.93 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.44-2.33-1.42-.86-.76-1.44-1.69-1.61-1.98-.17-.29-.02-.45.13-.6.13-.12.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.64-1.57-.9-2.15-.24-.57-.49-.49-.66-.5h-.57c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.41s1.03 2.8 1.17 3.01c.14.2 2 3.18 4.84 4.34 2.39.94 2.88.76 3.4.71.52-.05 1.68-.69 1.93-1.36.25-.67.25-1.23.17-1.36-.07-.13-.26-.2-.55-.35Z" />
    </svg>
  );
  const MailIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v.2l-10 6.25L2 6.2V6zm0 2.55V18a2 2 0 002 2h16a2 2 0 002-2V8.55l-9.38 5.86a2 2 0 01-2.24 0L2 8.55z" />
    </svg>
  );
  const EditIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
  const SwapIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h11l-4-4 1.4-1.4L22.8 8l-7.4 6.4L14 13l4-4H7V7zm10 10H6l4 4-1.4 1.4L1.2 16l7.4-6.4L10 11l-4 4h11v2z" />
    </svg>
  );
  const TreatIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h12v2H3v-2z" />
    </svg>
  );

  /* ---------- Donuts simples com tooltip ---------- */
  const Donut: React.FC<{
    title: string;
    data: { label: string; value: number }[];
  }> = ({ title, data }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    const [hover, setHover] = useState<number | null>(null);
    let acc = 0;

    return (
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <svg width="160" height="160" viewBox="0 0 42 42" role="img" aria-label={title}>
            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e5e7eb" strokeWidth="8" />
            {data.map((d, i) => {
              const pct = total ? (d.value / total) * 100 : 0;
              const dash = `${pct} ${100 - pct}`;
              const rot = (acc / 100) * 360;
              acc += pct;
              return (
                <circle
                  key={i}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={hover === i ? "#A11C27" : "#94a3b8"}
                  strokeWidth={hover === i ? 9 : 8}
                  strokeDasharray={dash}
                  strokeDashoffset="25"
                  transform={`rotate(${rot} 21 21)`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer", transition: "all .15s ease" }}
                />
              );
            })}
            <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="6" fill="#0f172a">
              {fmtBRL(total)}
            </text>
          </svg>

          <div style={{ display: "grid", gap: 6 }}>
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
                  background: hover === i ? "#f1f5f9" : "transparent",
                  cursor: "default",
                }}
              >
                <div
                  style={{ width: 10, height: 10, borderRadius: 2, background: hover === i ? "#A11C27" : "#94a3b8" }}
                />
                <div style={{ color: "#0f172a", minWidth: 160 }}>{d.label}</div>
                <div style={{ color: "#334155", fontWeight: 700 }}>{fmtBRL(d.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Cabeçalho / KPIs ---------- */
  const CardsKPI = () => {
    const ORDER: { id: StageUI; title: string }[] = [
      { id: "novo", title: "Novo" },
      { id: "qualificando", title: "Qualificando" },
      { id: "proposta", title: "Propostas" },
      { id: "negociacao", title: "Negociação" },
    ];
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {ORDER.map(({ id, title }) => (
            <div key={id} style={kpiCard}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{title}</div>
              <div style={{ color: "#1f2937" }}>Qtd: {kpi[id]?.qtd || 0}</div>
              <div style={{ color: "#1f2937" }}>Valor: {fmtBRL(kpi[id]?.total || 0)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ---------- Coluna de oportunidades (com paginação) ---------- */
  const Coluna = ({ id, title }: { id: StageUI; title: string }) => {
    const items = grupos[id] || [];
    const page = pageByStage[id] || 1;
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    const from = (page - 1) * PAGE;
    const rows = items.slice(from, from + PAGE);

    function goto(p: number) {
      setPageByStage((s) => ({ ...s, [id]: Math.min(Math.max(1, p), pages) }));
    }

    return (
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((o) => {
            const lead = leads.find((l) => l.id === o.lead_id);
            const vendedor =
              vendedores.find((v) => v.auth_user_id === (o.owner_id || o.vendedor_id))?.nome || "-";
            return (
              <div key={o.id} style={itemCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{lead?.nome || "-"}</div>
                  <div style={{ color: "#334155", fontSize: 12 }}>{vendedor}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <span style={muted}>Segmento</span>
                    <div>{o.segmento || "-"}</div>
                  </div>
                  <div>
                    <span style={muted}>Valor</span>
                    <div>{fmtBRL(o.valor_credito)}</div>
                  </div>
                  <div>
                    <span style={muted}>Probabilidade</span>
                    <div>{"★".repeat(Math.max(1, Math.min(5, o.score || 1)))}</div>
                  </div>
                  <div>
                    <span style={muted}>Previsão</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {o.expected_close_at ? ISOtoBR(o.expected_close_at) : "-"}
                      {dateBadge(o.expected_close_at)}
                    </div>
                  </div>
                </div>

                <div style={iconBar}>
                  {/* Telefone */}
                  {telHref(lead?.telefone) ? (
                    <a href={telHref(lead?.telefone) as string} title="Ligar" style={iconBtn}>
                      <PhoneIcon />
                    </a>
                  ) : (
                    <span title="Sem telefone" style={{ ...iconBtn, ...iconDisabled }}>
                      <PhoneIcon />
                    </span>
                  )}

                  {/* WhatsApp */}
                  {toWa(lead?.telefone) ? (
                    <a
                      href={`https://wa.me/${toWa(lead?.telefone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp"
                      style={iconBtn}
                    >
                      <WhatsappIcon />
                    </a>
                  ) : (
                    <span title="Sem WhatsApp" style={{ ...iconBtn, ...iconDisabled }}>
                      <WhatsappIcon muted />
                    </span>
                  )}

                  {/* E-mail (desabilita quando não tem) */}
                  {lead?.email ? (
                    <a href={`mailto:${lead.email}`} title="E-mail" style={iconBtn}>
                      <MailIcon />
                    </a>
                  ) : (
                    <span
                      title="Cadastrar e-mail"
                      onClick={() => alert("Cadastre o e-mail do lead na tela de edição.")}
                      style={{ ...iconBtn, ...iconDisabled, cursor: "not-allowed" }}
                    >
                      <MailIcon />
                    </span>
                  )}

                  {/* Editar lead -> levamos para Leads ou abrimos um futuro modal; por ora, alerta */}
                  <button
                    title="Editar Lead"
                    style={iconBtn}
                    onClick={() => alert("Abra a guia Leads para editar os dados do Lead.")}
                  >
                    <EditIcon />
                  </button>

                  {/* Reatribuir (apenas admin) */}
                  {me?.role === "admin" && (
                    <button title="Reatribuir" style={iconBtn} onClick={() => setReassignOpen(o)}>
                      <SwapIcon />
                    </button>
                  )}

                  {/* Tratar lead (editar opp) */}
                  <button title="Tratar Lead" style={iconBtn} onClick={() => openEdit(o)}>
                    <TreatIcon />
                  </button>
                </div>
              </div>
            );
          })}

          {!rows.length && <div style={muted}>Nenhuma oportunidade neste estágio.</div>}

          {/* Paginação */}
          {pages > 1 && (
            <div style={pager}>
              <button
                style={{ ...btnSecondary, opacity: page <= 1 ? 0.5 : 1 }}
                disabled={page <= 1}
                onClick={() => goto(page - 1)}
              >
                ‹ Anterior
              </button>
              <span style={{ color: "#475569", fontSize: 12 }}>
                Página {page} de {pages}
              </span>
              <button
                style={{ ...btnSecondary, opacity: page >= pages ? 0.5 : 1 }}
                disabled={page >= pages}
                onClick={() => goto(page + 1)}
              >
                Próxima ›
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- dados dos donuts ---------- */
  const donutsData = useMemo(() => {
    const ganhos = lista.filter((o) => String(o.estagio) === "Fechado (Ganho)");
    const perdidos = lista.filter((o) => String(o.estagio) === "Fechado (Perdido)");

    const sumBySeg = (arr: Opportunity[]) => {
      const m = new Map<string, number>();
      for (const o of arr) {
        m.set(o.segmento, (m.get(o.segmento) || 0) + Number(o.valor_credito || 0));
      }
      return Array.from(m.entries()).map(([label, value]) => ({ label, value }));
    };

    return {
      ganhos: sumBySeg(ganhos),
      perdidos: sumBySeg(perdidos),
    };
  }, [lista]);

  /* ---------- render ---------- */
  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      {/* Topbar */}
      <div style={{ ...card, display: "flex", gap: 12, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...input, margin: 0, flex: 1 }}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
        <button onClick={() => setNewOppOpen(true)} style={btnPrimary}>
          + Nova Oportunidade
        </button>
        <button onClick={() => setNewLeadOpen(true)} style={btnGhost}>
          + Novo Lead
        </button>
      </div>

      <CardsKPI />

      {/* Grade de oportunidades por estágio */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
        <Coluna id="novo" title="Novo" />
        <Coluna id="qualificando" title="Qualificando" />
        <Coluna id="proposta" title="Propostas" />
        <Coluna id="negociacao" title="Negociação" />
      </div>

      {/* Finalizados (donuts) */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Donut title="Fechado (Ganho)" data={donutsData.ganhos} />
        <Donut title="Fechado (Perdido)" data={donutsData.perdidos} />
      </div>

      {/* Modal: Tratar Lead (editar opp) */}
      {editOpp && (
        <div style={modalBackdrop} onClick={closeEdit}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Tratar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Segmento</label>
                <select
                  value={editOpp.segmento}
                  onChange={(e) => setEditOpp({ ...editOpp, segmento: e.target.value })}
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
                <label style={labelStyle}>Valor do crédito (R$)</label>
                <input
                  value={String(editOpp.valor_credito ?? 0)}
                  onChange={(e) => setEditOpp({ ...editOpp, valor_credito: parseBRMoeda(e.target.value) })}
                  style={input}
                />
              </div>
              <div>
                <label style={labelStyle}>Probabilidade</label>
                <select
                  value={String(editOpp.score)}
                  onChange={(e) => setEditOpp({ ...editOpp, score: Number(e.target.value) })}
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
                <label style={labelStyle}>Estágio</label>
                <select
                  value={String(editOpp.estagio)}
                  onChange={(e) => setEditOpp({ ...editOpp, estagio: e.target.value })}
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
                <label style={labelStyle}>Previsão (dd/mm/aaaa)</label>
                <input
                  value={ISOtoBR(editOpp.expected_close_at)}
                  onChange={(e) =>
                    setEditOpp({
                      ...editOpp,
                      expected_close_at: BRtoISO(e.target.value),
                    })
                  }
                  style={input}
                  placeholder="dd/mm/aaaa"
                />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>Adicionar observação</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
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
                    {editOpp.observacao || "(sem anotações)"}
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
      {newOppOpen && (
        <div style={modalBackdrop} onClick={() => setNewOppOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Selecionar um Lead</label>
                <select value={newOppLeadId} onChange={(e) => setNewOppLeadId(e.target.value)} style={input}>
                  <option value="">Selecione um Lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} {l.telefone ? `— ${fmtTel(l.telefone)}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Selecione um Vendedor</label>
                <select value={newOppVend} onChange={(e) => setNewOppVend(e.target.value)} style={input}>
                  <option value="">(você)</option>
                  {vendedores.map((v) => (
                    <option key={v.auth_user_id} value={v.auth_user_id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Segmento</label>
                <select value={newOppSegmento} onChange={(e) => setNewOppSegmento(e.target.value)} style={input}>
                  {SEGMENTOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Valor do crédito (R$)</label>
                <input
                  value={newOppValor}
                  onChange={(e) => setNewOppValor(e.target.value)}
                  style={input}
                  placeholder="Ex.: 80.000,00"
                />
              </div>

              <div>
                <label style={labelStyle}>Observações</label>
                <input
                  value={newOppObs}
                  onChange={(e) => setNewOppObs(e.target.value)}
                  style={input}
                  placeholder="Observação inicial (opcional)"
                />
              </div>

              <div>
                <label style={labelStyle}>Probabilidade</label>
                <select value={String(newOppScore)} onChange={(e) => setNewOppScore(Number(e.target.value))} style={input}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Estágio</label>
                <select value={newOppStage} onChange={(e) => setNewOppStage(e.target.value as StageUI)} style={input}>
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
                  value={newOppDateBR}
                  onChange={(e) => setNewOppDateBR(e.target.value)}
                  style={input}
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

      {/* Modal: Novo Lead (que já cria oportunidade em Novo) */}
      {newLeadOpen && (
        <div style={modalBackdrop} onClick={() => setNewLeadOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>Nome</label>
                <input value={leadNome} onChange={(e) => setLeadNome(e.target.value)} style={input} autoFocus />
              </div>

              <div>
                <label style={labelStyle}>Telefone</label>
                <input value={leadTel} onChange={(e) => setLeadTel(e.target.value)} style={input} />
              </div>

              <div>
                <label style={labelStyle}>E-mail</label>
                <input type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} style={input} />
              </div>

              <div>
                <label style={labelStyle}>Origem</label>
                <select value={leadOrigem} onChange={(e) => setLeadOrigem(e.target.value)} style={input}>
                  <option value="Site">Site</option>
                  <option value="Redes Sociais">Redes Sociais</option>
                  <option value="Indicação">Indicação</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="Parceria">Parceria</option>
                  <option value="Relacionamento">Relacionamento</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Descrição</label>
                <input value={leadDescricao} onChange={(e) => setLeadDescricao(e.target.value)} style={input} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={criarLeadENovaOpp} disabled={loading} style={btnPrimary}>
                {loading ? "Salvando..." : "Criar Lead + Oportunidade"}
              </button>
              <button onClick={() => setNewLeadOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reatribuir */}
      {reassignOpen && (
        <div style={modalBackdrop} onClick={() => setReassignOpen(null)}>
          <div style={modalSmall} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Reatribuir Oportunidade</h3>
            <p style={{ margin: "4px 0 12px", color: "#475569" }}>
              <strong>Lead:</strong>{" "}
              {leads.find((l) => l.id === reassignOpen.lead_id)?.nome || "(desconhecido)"}
            </p>
            <select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)} style={input}>
              <option value="">Selecionar usuário…</option>
              {vendedores.map((u) => (
                <option key={u.auth_user_id} value={u.auth_user_id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setReassignOpen(null)}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={doReassign} disabled={!newOwnerId}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================
   Estilos
========================================= */
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

const kpiCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,.06)",
  padding: 14,
};

const itemCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 8,
};

const muted: React.CSSProperties = { color: "#64748b", fontSize: 12 };

const iconBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginTop: 6,
};
const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
};
const iconDisabled: React.CSSProperties = { opacity: 0.5 };

const pager: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
};

const input: React.CSSProperties = {
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

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "1fr 1fr",
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

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.35)",
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
  width: "min(460px, 92vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    style={{
      fontSize: 11,
      color: "#fff",
      background: color,
      borderRadius: 999,
      padding: "2px 8px",
      fontWeight: 700,
    }}
  >
    {children}
  </span>
);

/* ---------- helpers locais ---------- */
function normalizeEstagioDB(label: string): EstagioDB {
  const v = (label || "").toLowerCase();
  if (v.includes("fechado") && v.includes("ganho")) return "Fechado (Ganho)";
  if (v.includes("fechado") && v.includes("perdido")) return "Fechado (Perdido)";
  if (v.startsWith("qualifica")) return "Qualificando";
  if (v.startsWith("proposta")) return "Proposta";
  if (v.startsWith("negocia")) return "Negociação";
  if (v.startsWith("novo")) return "Novo";
  return "Novo";
}
