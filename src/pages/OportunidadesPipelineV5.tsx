// src/pages/OportunidadesPipelineV5.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Lead = { id: string; nome: string; telefone?: string | null; email?: string | null; origem?: string | null; descricao?: string | null; owner_id?: string | null; created_at?: string | null };
type Vendedor = { id: string; auth_user_id: string; nome: string; role?: string | null; user_role?: string | null; unit_id?: string | null; hierarchy_level?: string | null };
type StageUI = "novo_lead" | "diagnostico" | "reuniao_agendada" | "proposta_negociacao" | "fechamento_programado" | "fechado_ganho" | "fechado_perdido";
type Opp = {
  id: string; lead_id: string; vendedor_id: string; owner_id?: string | null; segmento: string | null; valor_credito: number | null;
  observacao?: string | null; score?: number | null; estagio: string | null; expected_close_at?: string | null; created_at: string;
  credito_desejado?: number | null; parcela_desejada?: number | null; lance_disponivel?: number | null; prazo_contemplacao?: string | null;
  finalidade_recurso?: string | null; reuniao_at?: string | null; reuniao_tipo?: string | null; reuniao_link?: string | null; proposta_id?: string | null;
  fechamento_previsto_em?: string | null; documentos_pendentes?: string | null; lost_reason?: string | null; lost_details?: string | null; won_at?: string | null; lost_at?: string | null;
};
type Note = { id: string; opportunity_id: string; lead_id?: string | null; user_id?: string | null; note: string; kind: string; created_at: string };
type Proposal = { id: string; lead_id?: string | null; created_at?: string | null; modelo?: string | null; tipo?: string | null; segmento?: string | null; valor_credito?: number | null; credito?: number | null; [key: string]: any };

const C = { red: "#A11C27", navy: "#1E293F", gold: "#B5A573", goldLight: "#E0CE8C", off: "#F5F5F5", ink2: "#334155", ok: "#0f766e", warn: "#b45309", danger: "#991b1b", slate: "#64748b" };
const PAGE_SIZE = 5;
const segmentos = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"];
const chartColors = [C.red, C.navy, C.gold, C.goldLight, "#7f1d1d", "#475569", "#a16207", "#0f766e"];

const stageLabels: Record<StageUI, string> = {
  novo_lead: "Novo Lead",
  diagnostico: "Qualificando/Diagnóstico",
  reuniao_agendada: "Reunião Agendada",
  proposta_negociacao: "Proposta Apresentada/Negociação",
  fechamento_programado: "Fechamento Programado/Aguardando Documentos",
  fechado_ganho: "Fechado (Ganho)",
  fechado_perdido: "Fechado (Perdido)",
};
const oldToStage: Record<string, StageUI> = {
  Novo: "novo_lead", "Novo Lead": "novo_lead", Qualificando: "diagnostico", Qualificação: "diagnostico", Qualificacao: "diagnostico", "Qualificando/Diagnóstico": "diagnostico",
  "Reunião Agendada": "reuniao_agendada", Proposta: "proposta_negociacao", Negociação: "proposta_negociacao", Negociacao: "proposta_negociacao", "Proposta Apresentada/Negociação": "proposta_negociacao",
  "Fechamento Programado/Aguardando Documentos": "fechamento_programado", "Fechado (Ganho)": "fechado_ganho", "Fechado (Perdido)": "fechado_perdido",
};
const activeStages: StageUI[] = ["novo_lead", "diagnostico", "reuniao_agendada", "proposta_negociacao", "fechamento_programado"];
const allStages: StageUI[] = [...activeStages, "fechado_ganho", "fechado_perdido"];
const lostReasons = ["Sem renda", "Não respondeu", "Achou caro", "Comprou financiamento", "Consultou terceiro e travou", "Sem urgência", "Crédito/parcela incompatível", "Prazo de contemplação não atendia", "Outro"];

const onlyDigits = (v?: string | null) => String(v || "").replace(/\D/g, "");
const normalizeText = (v?: string | null) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const normalizeStage = (s?: string | null): StageUI => oldToStage[String(s || "").trim()] || "novo_lead";
const dbStage = (s: StageUI) => stageLabels[s];
const moneyBase = (o: Opp) => Number(o.valor_credito || o.credito_desejado || 0);
const fmtBRL = (n?: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(Number(n || 0));
const fmtBRLCompact = (n?: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(Number(n || 0));
const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysBetween = (iso?: string | null) => { if (!iso) return null; const a = new Date(`${todayYMD()}T00:00:00`).getTime(); const b = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime(); return Math.round((b - a) / 86400000); };
const fmtDateBR = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR"); };
const fmtDateTimeBR = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const formatPhoneBR = (phone?: string | null) => { const d = onlyDigits(phone); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return phone || "—"; };
const waNumber = (phone?: string | null) => { const d = onlyDigits(phone); if (!d) return null; if (d.startsWith("55")) return d; if (d.length >= 10 && d.length <= 11) return `55${d}`; return d; };
const formatBRLInput = (raw: string) => fmtBRL(Number(onlyDigits(raw) || "0") / 100);
const parseBRL = (raw: string) => Number(String(raw || "").replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".")) || 0;
const brlInputFromNumber = (n?: number | null) => fmtBRL(Number(n || 0));
const tempLabel = (score?: number | null) => { const s = Number(score || 1); if (s >= 4) return { label: "Quente", color: C.red }; if (s === 3) return { label: "Morno", color: C.warn }; return { label: "Frio", color: C.navy }; };
const urgencyLabel = (o: Opp) => { const d = daysBetween(o.expected_close_at || o.fechamento_previsto_em || null); if (d === null) return { label: "Sem data", color: C.slate }; if (d < 0) return { label: `${Math.abs(d)}d atraso`, color: C.danger }; if (d === 0) return { label: "Hoje", color: C.red }; if (d <= 3) return { label: `${d}d`, color: C.warn }; return { label: `${d}d`, color: C.ok }; };
function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <input style={inputStyle} value={value} placeholder={placeholder || "R$ 0,00"} onChange={(e) => onChange(formatBRLInput(e.target.value))} />; }

export default function OportunidadesPipelineV5() {
  const navigate = useNavigate();
  const [meId, setMeId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("__all__");
  const [segmentFilter, setSegmentFilter] = useState("__all__");
  const [tempFilter, setTempFilter] = useState("__all__");
  const [dueFilter, setDueFilter] = useState("__all__");
  const [dragOver, setDragOver] = useState<StageUI | null>(null);
  const [stagePages, setStagePages] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Opp | null>(null);
  const [newNote, setNewNote] = useState("");
  const [lostModal, setLostModal] = useState<Opp | null>(null);
  const [lostReason, setLostReason] = useState("Não respondeu");
  const [lostDetails, setLostDetails] = useState("");
  const [wonModal, setWonModal] = useState<Opp | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ nome: "", telefone: "", email: "", origem: "Instagram", descricao: "" });
  const [newOppOpen, setNewOppOpen] = useState(false);
  const [oppForm, setOppForm] = useState<any>({ lead_id: "", vendedor_id: "", segmento: "Automóvel", valor_credito: "R$ 0,00", score: 1, estagio: "novo_lead" as StageUI, expected_close_at: "" });

  async function loadAll() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id || null;
    setMeId(uid);
    if (!uid) { setLoading(false); return; }
    const { data: profile } = await supabase.from("users").select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level").eq("auth_user_id", uid).maybeSingle();
    if (!profile) { setLoading(false); return; }
    let unitType = "";
    if (profile.unit_id) { const { data: unit } = await supabase.from("units").select("tipo").eq("id", profile.unit_id).maybeSingle(); unitType = normalizeText(unit?.tipo); }
    const matrix = normalizeText(profile.hierarchy_level) === "matriz" || (normalizeText(profile.role || profile.user_role) === "admin" && unitType === "matriz");
    const branch = !matrix && normalizeText(profile.hierarchy_level) === "gestor_filial";
    let userQ = supabase.from("users").select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level").eq("is_active", true).order("nome");
    if (branch && profile.unit_id) userQ = userQ.eq("unit_id", profile.unit_id);
    if (!matrix && !branch) userQ = userQ.eq("id", profile.id);
    const { data: userRows } = await userQ;
    const scopedUsers = (userRows || [profile]) as Vendedor[];
    const authIds = Array.from(new Set(scopedUsers.map((u) => u.auth_user_id).filter(Boolean)));
    let oppQ = supabase.from("opportunities").select("id,lead_id,vendedor_id,owner_id,segmento,valor_credito,observacao,score,estagio,expected_close_at,created_at,credito_desejado,parcela_desejada,lance_disponivel,prazo_contemplacao,finalidade_recurso,reuniao_at,reuniao_tipo,reuniao_link,proposta_id,fechamento_previsto_em,documentos_pendentes,lost_reason,lost_details,won_at,lost_at").order("created_at", { ascending: false });
    if (!matrix) oppQ = authIds.length ? oppQ.in("vendedor_id", authIds) : oppQ.eq("vendedor_id", "00000000-0000-0000-0000-000000000000");
    const oppRes = await oppQ;
    const scopedOpps = (oppRes.data || []) as Opp[];
    let leadRows: Lead[] = [];
    if (matrix) {
      const { data } = await supabase.from("leads").select("id,nome,telefone,email,origem,descricao,owner_id,created_at").order("created_at", { ascending: false });
      leadRows = (data || []) as Lead[];
    } else {
      const linkedIds = Array.from(new Set(scopedOpps.map((o) => o.lead_id).filter(Boolean)));
      const [owned, linked] = await Promise.all([
        authIds.length ? supabase.from("leads").select("id,nome,telefone,email,origem,descricao,owner_id,created_at").in("owner_id", authIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
        linkedIds.length ? supabase.from("leads").select("id,nome,telefone,email,origem,descricao,owner_id,created_at").in("id", linkedIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      leadRows = Array.from(new Map([...(owned.data || []), ...(linked.data || [])].map((lead: any) => [lead.id, lead as Lead])).values());
    }
    setLeads(leadRows);
    setVendedores(scopedUsers);
    setOpps(scopedOpps);
    const ids = scopedOpps.map((o) => o.id);
    if (ids.length) {
      const nres = await supabase.from("opportunity_notes").select("id,opportunity_id,lead_id,user_id,note,kind,created_at").in("opportunity_id", ids).order("created_at", { ascending: false });
      if (!nres.error) setNotes((nres.data || []) as Note[]);
    } else setNotes([]);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const vendorMap = useMemo(() => new Map(vendedores.map((v) => [v.auth_user_id, v.nome])), [vendedores]);
  const noteMap = useMemo(() => { const m = new Map<string, Note[]>(); for (const n of notes) m.set(n.opportunity_id, [...(m.get(n.opportunity_id) || []), n]); return m; }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opps.filter((o) => {
      const lead = leadMap.get(o.lead_id); const vendor = vendorMap.get(o.vendedor_id) || ""; const temp = tempLabel(o.score).label.toLowerCase(); const due = urgencyLabel(o);
      const hay = `${lead?.nome || ""} ${lead?.telefone || ""} ${vendor} ${o.segmento || ""} ${o.estagio || ""} ${o.finalidade_recurso || ""}`.toLowerCase();
      if (vendorFilter !== "__all__" && o.vendedor_id !== vendorFilter) return false;
      if (segmentFilter !== "__all__" && o.segmento !== segmentFilter) return false;
      if (tempFilter !== "__all__" && temp !== tempFilter) return false;
      if (dueFilter === "late" && !due.label.includes("atraso")) return false;
      if (dueFilter === "today" && due.label !== "Hoje") return false;
      if (dueFilter === "nodate" && due.label !== "Sem data") return false;
      return !q || hay.includes(q);
    });
  }, [opps, leadMap, vendorMap, search, vendorFilter, segmentFilter, tempFilter, dueFilter]);

  const openPipeline = useMemo(() => filtered.filter((o) => !["fechado_ganho", "fechado_perdido"].includes(normalizeStage(o.estagio))), [filtered]);
  const wonOpps = useMemo(() => filtered.filter((o) => normalizeStage(o.estagio) === "fechado_ganho"), [filtered]);
  const lostOpps = useMemo(() => filtered.filter((o) => normalizeStage(o.estagio) === "fechado_perdido"), [filtered]);
  const stageData = useMemo(() => activeStages.map((s) => { const rows = openPipeline.filter((o) => normalizeStage(o.estagio) === s); return { stage: s, label: stageLabels[s], qtd: rows.length, total: rows.reduce((a, o) => a + moneyBase(o), 0) }; }), [openPipeline]);
  const wonBySegment = useMemo(() => groupBySegment(wonOpps), [wonOpps]);
  const lostBySegment = useMemo(() => groupBySegment(lostOpps), [lostOpps]);
  const lossReasonData = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of lostOpps) m.set(o.lost_reason || "Não informado", (m.get(o.lost_reason || "Não informado") || 0) + 1);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [lostOpps]);

  function byStage(stage: StageUI) { return openPipeline.filter((o) => normalizeStage(o.estagio) === stage).sort((a, b) => { const da = daysBetween(a.expected_close_at || a.fechamento_previsto_em || null); const db = daysBetween(b.expected_close_at || b.fechamento_previsto_em || null); const va = da === null ? 999999 : da; const vb = db === null ? 999999 : db; if (va !== vb) return va - vb; return Number(b.score || 0) - Number(a.score || 0); }); }
  const pageFor = (stage: StageUI) => Math.max(1, stagePages[stage] || 1);
  const setPageFor = (stage: StageUI, page: number, totalPages: number) => setStagePages((p) => ({ ...p, [stage]: Math.min(Math.max(1, page), Math.max(1, totalPages)) }));

  async function addNote(opportunity: Opp, text: string, kind = "manual") { const note = text.trim(); if (!note) return; const { data, error } = await supabase.from("opportunity_notes").insert({ opportunity_id: opportunity.id, lead_id: opportunity.lead_id, user_id: meId, note, kind }).select().single(); if (!error && data) setNotes((s) => [data as Note, ...s]); }
  async function updateOpp(op: Opp, patch: Partial<Opp>, noteText?: string, kind = "system") { setSaving(true); const { data, error } = await supabase.from("opportunities").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", op.id).select().single(); setSaving(false); if (error) return alert(error.message); setOpps((s) => s.map((x) => (x.id === op.id ? (data as Opp) : x))); if (noteText) await addNote(data as Opp, noteText, kind); return data as Opp; }
  async function createLead() { if (!leadForm.nome.trim()) return alert("Informe o nome do lead."); if (!meId) return alert("Usuário ainda não carregou."); setSaving(true); const { data: lead, error } = await supabase.from("leads").insert({ nome: leadForm.nome.trim(), telefone: onlyDigits(leadForm.telefone) || null, email: leadForm.email.trim().toLowerCase() || null, origem: leadForm.origem || null, descricao: leadForm.descricao || null, owner_id: meId }).select().single(); if (error) { setSaving(false); return alert(error.message); } const { data: opp, error: e2 } = await supabase.from("opportunities").insert({ lead_id: lead.id, vendedor_id: meId, owner_id: meId, segmento: "Automóvel", valor_credito: 0, score: 1, estagio: dbStage("novo_lead") }).select().single(); setSaving(false); if (e2) return alert("Lead criado, mas falhou ao criar oportunidade: " + e2.message); setLeads((s) => [lead as Lead, ...s]); setOpps((s) => [opp as Opp, ...s]); setLeadForm({ nome: "", telefone: "", email: "", origem: "Instagram", descricao: "" }); setNewLeadOpen(false); }
  async function createOpp() { if (!oppForm.lead_id) return alert("Selecione o lead."); const vendedor = oppForm.vendedor_id || meId; if (!vendedor) return alert("Selecione o vendedor."); setSaving(true); const payload = { lead_id: oppForm.lead_id, vendedor_id: vendedor, owner_id: vendedor, segmento: oppForm.segmento, valor_credito: parseBRL(oppForm.valor_credito), score: Number(oppForm.score || 1), estagio: dbStage(oppForm.estagio), expected_close_at: oppForm.expected_close_at || null }; const { data, error } = await supabase.from("opportunities").insert(payload).select().single(); setSaving(false); if (error) return alert(error.message); setOpps((s) => [data as Opp, ...s]); setNewOppOpen(false); }
  async function saveEditing() { if (!editing) return; const patch: Partial<Opp> = { segmento: editing.segmento, valor_credito: Number(editing.valor_credito || 0), score: Number(editing.score || 1), expected_close_at: editing.expected_close_at || null, credito_desejado: Number(editing.credito_desejado || 0), parcela_desejada: Number(editing.parcela_desejada || 0), lance_disponivel: Number(editing.lance_disponivel || 0), prazo_contemplacao: editing.prazo_contemplacao || null, finalidade_recurso: editing.finalidade_recurso || null, reuniao_at: editing.reuniao_at || null, reuniao_tipo: editing.reuniao_tipo || null, reuniao_link: editing.reuniao_link || null, proposta_id: editing.proposta_id || null, fechamento_previsto_em: editing.fechamento_previsto_em || null, documentos_pendentes: editing.documentos_pendentes || null }; const saved = await updateOpp(editing, patch, newNote, "manual"); if (saved) { setEditing(null); setNewNote(""); } }
  async function moveStage(op: Opp, target: StageUI) { if (target === "fechado_perdido") { setLostModal(op); setLostReason(op.lost_reason || "Não respondeu"); setLostDetails(op.lost_details || ""); return; } if (target === "fechado_ganho") { setWonModal(op); return; } await updateOpp(op, { estagio: dbStage(target) }, `Estágio alterado para ${stageLabels[target]}.`, "stage"); }
  async function confirmLost() { if (!lostModal) return; const msg = `Marcado como perdido. Motivo: ${lostReason}.${lostDetails ? ` Detalhes: ${lostDetails}` : ""}`; await updateOpp(lostModal, { estagio: dbStage("fechado_perdido"), lost_reason: lostReason, lost_details: lostDetails || null, lost_at: new Date().toISOString() }, msg, "lost"); setLostModal(null); setLostDetails(""); }
  async function confirmWon(goCarteira: boolean) { if (!wonModal) return; const saved = await updateOpp(wonModal, { estagio: dbStage("fechado_ganho"), won_at: new Date().toISOString() }, "Marcado como fechado ganho.", "won"); setWonModal(null); if (saved && goCarteira) navigate(`/carteira?lead_id=${saved.lead_id}&opportunity_id=${saved.id}`); }
  async function scheduleMeeting(op: Opp) { if (!op.reuniao_at) return alert("Informe data e hora da reunião."); const lead = leadMap.get(op.lead_id); const end = new Date(new Date(op.reuniao_at).getTime() + 60 * 60 * 1000).toISOString(); const { error } = await supabase.from("agenda_eventos").insert({ tipo: "reuniao", titulo: `Reunião • ${lead?.nome || "Lead"}`, lead_id: op.lead_id, user_id: op.vendedor_id, inicio_at: op.reuniao_at, fim_at: end, origem: "manual", opportunity_id: op.id, meeting_link: op.reuniao_link || null, descricao: `Oportunidade: ${op.segmento || "—"}. Tipo: ${op.reuniao_tipo || "Reunião"}` } as any); if (error) return alert(error.message); await addNote(op, `Reunião agendada para ${fmtDateTimeBR(op.reuniao_at)}${op.reuniao_link ? ` • Link: ${op.reuniao_link}` : ""}`, "meeting"); alert("Reunião criada na Agenda."); }
  async function loadProposalsForLead(leadId: string) { const { data, error } = await supabase.from("sim_simulations").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20); setProposals(!error ? ((data || []) as Proposal[]) : []); }
  function openEdit(op: Opp) { setEditing({ ...op }); setNewNote(""); loadProposalsForLead(op.lead_id); }
  function whatsappLink(op: Opp) { const lead = leadMap.get(op.lead_id); const phone = waNumber(lead?.telefone); if (!phone) return ""; const st = normalizeStage(op.estagio); const first = (lead?.nome || "Olá").split(" ")[0]; const messages: Record<StageUI, string> = { novo_lead: `${first}, vi seu interesse em consórcio. Posso te fazer 2 perguntas rápidas para entender seu objetivo e montar uma estratégia melhor?`, diagnostico: `${first}, com base no que você me passou, vou organizar crédito, parcela, lance e prazo de contemplação para te orientar melhor.`, reuniao_agendada: `${first}, nossa reunião está agendada. Segue o link: ${op.reuniao_link || "vou te enviar por aqui"}.`, proposta_negociacao: `${first}, preparei uma proposta alinhada com seu objetivo. Posso te explicar os pontos principais agora?`, fechamento_programado: `${first}, estamos na etapa final. Vou te orientar nos documentos para avançarmos com segurança.`, fechado_ganho: `${first}, parabéns pela conquista! Vamos acompanhar tudo até a entrega do bem.`, fechado_perdido: `${first}, obrigado pela conversa. Quando fizer sentido retomar seu planejamento, fico à disposição.` }; return `https://wa.me/${phone}?text=${encodeURIComponent(messages[st])}`; }

  return (
    <div style={pageStyle}>
      <div style={bgStyle} />
      <header style={headerStyle}>
        <div><div style={eyebrow}>CRM Consulmax</div><h1 style={titleStyle}>Oportunidades</h1><p style={subtitleStyle}>Esteira comercial com paginação por estágio e visual de gráficos no estilo V2.</p></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button style={btnGhost} onClick={loadAll}>Atualizar</button><button style={btnSecondary} onClick={() => setNewOppOpen(true)}>+ Oportunidade</button><button style={btnPrimary} onClick={() => setNewLeadOpen(true)}>+ Novo lead</button></div>
      </header>

      <section style={filterCard}>
        <input style={inputStyle} placeholder="Buscar por lead, telefone, vendedor, estágio..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={inputStyle} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}><option value="__all__">Todos vendedores</option>{vendedores.map((v) => <option key={v.auth_user_id} value={v.auth_user_id}>{v.nome}</option>)}</select>
        <select style={inputStyle} value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}><option value="__all__">Todos segmentos</option>{segmentos.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select style={inputStyle} value={tempFilter} onChange={(e) => setTempFilter(e.target.value)}><option value="__all__">Todas temperaturas</option><option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option></select>
        <select style={inputStyle} value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}><option value="__all__">Todas datas</option><option value="late">Atrasadas</option><option value="today">Hoje</option><option value="nodate">Sem data</option></select>
      </section>

      <section style={graphGridV2Style}>
        <div style={chartCard}><div style={chartTitle}>Funil em aberto</div><ResponsiveContainer width="100%" height={220}><BarChart data={stageData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" hide /><YAxis allowDecimals={false} /><Tooltip formatter={(v: any, n: any) => (n === "total" ? fmtBRL(v) : v)} /><Bar dataKey="qtd" fill={C.navy} radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <ClosedDonutsCard wonRows={wonBySegment} lostRows={lostBySegment} />
        <LossReasonCard rows={lossReasonData} />
      </section>

      {loading ? <div style={loadingStyle}>Carregando oportunidades…</div> : (
        <main style={boardStyleV5}>{activeStages.map((stage) => { const allRows = byStage(stage); const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE)); const current = Math.min(pageFor(stage), totalPages); const rows = allRows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE); return (
          <section key={stage} style={{ ...columnStyle, ...(dragOver === stage ? { outline: `2px solid ${C.gold}` } : {}) }} onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); const op = opps.find((x) => x.id === id); if (op) moveStage(op, stage); }}>
            <div style={columnHeader}><div style={columnTitle}>{stageLabels[stage]}</div><div style={pill}>{allRows.length}</div></div>
            <div style={columnTotal}>{fmtBRLCompact(allRows.reduce((a, o) => a + moneyBase(o), 0))}</div>
            <div style={{ display: "grid", gap: 10 }}>{rows.map((op) => <OppCard key={op.id} op={op} lead={leadMap.get(op.lead_id)} vendor={vendorMap.get(op.vendedor_id)} notes={noteMap.get(op.id) || []} onEdit={() => openEdit(op)} onDragStart={(e) => e.dataTransfer.setData("text/plain", op.id)} whatsapp={whatsappLink(op)} />)}{!rows.length && <div style={emptyCol}>Nenhuma oportunidade</div>}</div>
            <div style={pagerStyle}><button style={pagerBtn} disabled={current <= 1} onClick={() => setPageFor(stage, current - 1, totalPages)}>‹</button><span style={pagerText}>{current}/{totalPages}</span><button style={pagerBtn} disabled={current >= totalPages} onClick={() => setPageFor(stage, current + 1, totalPages)}>›</button></div>
          </section>); })}</main>
      )}

      {editing && <EditModal editing={editing} setEditing={setEditing} leadName={leadMap.get(editing.lead_id)?.nome} proposals={proposals} newNote={newNote} setNewNote={setNewNote} noteMap={noteMap} saving={saving} saveEditing={saveEditing} moveStage={moveStage} scheduleMeeting={scheduleMeeting} setLostModal={setLostModal} setWonModal={setWonModal} />}
      {lostModal && <Modal title="Marcar como Fechado Perdido" onClose={() => setLostModal(null)}><label style={labelStyle}>Motivo da perda</label><select style={inputStyle} value={lostReason} onChange={(e) => setLostReason(e.target.value)}>{lostReasons.map((r) => <option key={r}>{r}</option>)}</select><label style={labelStyle}>Mais informações</label><textarea style={textareaStyle} value={lostDetails} onChange={(e) => setLostDetails(e.target.value)} /><div style={footerActions}><button style={btnGhost} onClick={() => setLostModal(null)}>Cancelar</button><button style={btnPrimary} onClick={confirmLost}>Confirmar perda</button></div></Modal>}
      {wonModal && <Modal title="Fechado Ganho" onClose={() => setWonModal(null)}><p style={{ color: C.ink2 }}>Deseja realizar o lançamento da venda agora na Carteira?</p><div style={footerActions}><button style={btnGhost} onClick={() => confirmWon(false)}>Não, apenas marcar como ganho</button><button style={btnPrimary} onClick={() => confirmWon(true)}>Sim, lançar venda agora</button></div></Modal>}
      {newLeadOpen && <Modal title="Novo Lead" onClose={() => setNewLeadOpen(false)}><label style={labelStyle}>Nome</label><input style={inputStyle} value={leadForm.nome} onChange={(e) => setLeadForm({ ...leadForm, nome: e.target.value })} /><label style={labelStyle}>Telefone</label><input style={inputStyle} value={leadForm.telefone} onChange={(e) => setLeadForm({ ...leadForm, telefone: e.target.value })} /><label style={labelStyle}>E-mail</label><input style={inputStyle} value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} /><label style={labelStyle}>Origem</label><input style={inputStyle} value={leadForm.origem} onChange={(e) => setLeadForm({ ...leadForm, origem: e.target.value })} /><label style={labelStyle}>Descrição</label><textarea style={textareaStyle} value={leadForm.descricao} onChange={(e) => setLeadForm({ ...leadForm, descricao: e.target.value })} /><div style={footerActions}><button style={btnGhost} onClick={() => setNewLeadOpen(false)}>Cancelar</button><button style={btnPrimary} onClick={createLead}>Criar lead</button></div></Modal>}
      {newOppOpen && <Modal title="Nova Oportunidade" onClose={() => setNewOppOpen(false)}><label style={labelStyle}>Lead</label><select style={inputStyle} value={oppForm.lead_id} onChange={(e) => setOppForm({ ...oppForm, lead_id: e.target.value })}><option value="">Selecione</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select><label style={labelStyle}>Vendedor</label><select style={inputStyle} value={oppForm.vendedor_id} onChange={(e) => setOppForm({ ...oppForm, vendedor_id: e.target.value })}><option value="">Eu / responsável atual</option>{vendedores.map((v) => <option key={v.auth_user_id} value={v.auth_user_id}>{v.nome}</option>)}</select><label style={labelStyle}>Segmento</label><select style={inputStyle} value={oppForm.segmento} onChange={(e) => setOppForm({ ...oppForm, segmento: e.target.value })}>{segmentos.map((s) => <option key={s}>{s}</option>)}</select><label style={labelStyle}>Valor</label><MoneyInput value={oppForm.valor_credito} onChange={(v) => setOppForm({ ...oppForm, valor_credito: v })} /><label style={labelStyle}>Estágio</label><select style={inputStyle} value={oppForm.estagio} onChange={(e) => setOppForm({ ...oppForm, estagio: e.target.value as StageUI })}>{allStages.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}</select><label style={labelStyle}>Previsão</label><input style={inputStyle} type="date" value={oppForm.expected_close_at} onChange={(e) => setOppForm({ ...oppForm, expected_close_at: e.target.value })} /><div style={footerActions}><button style={btnGhost} onClick={() => setNewOppOpen(false)}>Cancelar</button><button style={btnPrimary} onClick={createOpp}>Criar oportunidade</button></div></Modal>}
    </div>
  );
}

function groupBySegment(rows: Opp[]) { const map = new Map<string, { name: string; value: number; total: number }>(); for (const o of rows) { const key = o.segmento || "Sem segmento"; const prev = map.get(key) || { name: key, value: 0, total: 0 }; prev.value += 1; prev.total += moneyBase(o); map.set(key, prev); } const ordered = [...segmentos, ...Array.from(map.keys()).filter((s) => !segmentos.includes(s))]; return ordered.map((s) => map.get(s)).filter(Boolean) as { name: string; value: number; total: number }[]; }
function ClosedDonutsCard({ wonRows, lostRows }: { wonRows: { name: string; value: number; total: number }[]; lostRows: { name: string; value: number; total: number }[] }) { return <div style={chartCard}><div style={chartTitle}>Fechados por segmento</div><div style={closedDonutGrid}><MiniDonut title="Ganho" rows={wonRows} /><MiniDonut title="Perdido" rows={lostRows} /></div></div>; }
function MiniDonut({ title, rows }: { title: string; rows: { name: string; value: number; total: number }[] }) { const totalQtd = rows.reduce((a, r) => a + r.value, 0); const totalValor = rows.reduce((a, r) => a + r.total, 0); return <div style={miniDonutBox}><div style={miniDonutTitle}>{title}</div>{rows.length ? <><div style={{ height: 126 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius={34} outerRadius={52} paddingAngle={3}>{rows.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}</Pie><Tooltip formatter={(v: any, _n: any, p: any) => [`${v} • ${fmtBRLCompact(p.payload.total)}`, p.payload.name]} /></PieChart></ResponsiveContainer></div><div style={miniDonutTotal}><b>{totalQtd}</b><span>{fmtBRLCompact(totalValor)}</span></div><div style={miniLegend}>{rows.slice(0, 4).map((r, i) => <div key={r.name} style={legendItem}><span style={{ ...legendDot, background: chartColors[i % chartColors.length] }} /> <span>{r.name}</span><b>{r.value}</b></div>)}</div></> : <div style={miniEmpty}>Sem dados</div>}</div>; }
function LossReasonCard({ rows }: { rows: { name: string; value: number }[] }) { return <div style={chartCard}><div style={chartTitle}>Motivos da perda</div>{rows.length ? <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={rows} dataKey="value" nameKey="name" outerRadius={78} label>{rows.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div style={emptyChart}>Sem perdas no filtro atual.</div>}</div>; }

function EditModal(props: { editing: Opp; setEditing: (o: Opp | null) => void; leadName?: string; proposals: Proposal[]; newNote: string; setNewNote: (v: string) => void; noteMap: Map<string, Note[]>; saving: boolean; saveEditing: () => void; moveStage: (op: Opp, stage: StageUI) => void; scheduleMeeting: (op: Opp) => void; setLostModal: (o: Opp) => void; setWonModal: (o: Opp) => void }) {
  const { editing, setEditing, leadName, proposals, newNote, setNewNote, noteMap, saving, saveEditing, moveStage, scheduleMeeting, setLostModal, setWonModal } = props;
  return <Modal title={`Tratar oportunidade • ${leadName || "Lead"}`} onClose={() => setEditing(null)} wide><div style={modalGrid}>
    <div style={modalSection}><h3 style={sectionTitle}>Dados comerciais</h3><label style={labelStyle}>Estágio atual</label><select style={inputStyle} value={normalizeStage(editing.estagio)} onChange={(e) => moveStage(editing, e.target.value as StageUI)}>{allStages.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}</select><label style={labelStyle}>Segmento</label><select style={inputStyle} value={editing.segmento || "Automóvel"} onChange={(e) => setEditing({ ...editing, segmento: e.target.value })}>{segmentos.map((s) => <option key={s} value={s}>{s}</option>)}</select><label style={labelStyle}>Valor do crédito</label><MoneyInput value={brlInputFromNumber(editing.valor_credito)} onChange={(v) => setEditing({ ...editing, valor_credito: parseBRL(v) })} /><label style={labelStyle}>Score / Temperatura</label><select style={inputStyle} value={String(editing.score || 1)} onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} • {tempLabel(n).label}</option>)}</select><label style={labelStyle}>Previsão de fechamento</label><input style={inputStyle} type="date" value={editing.expected_close_at || ""} onChange={(e) => setEditing({ ...editing, expected_close_at: e.target.value })} /></div>
    <div style={modalSection}><h3 style={sectionTitle}>Qualificando / Diagnóstico</h3><label style={labelStyle}>Crédito desejado</label><MoneyInput value={brlInputFromNumber(editing.credito_desejado)} onChange={(v) => setEditing({ ...editing, credito_desejado: parseBRL(v) })} /><label style={labelStyle}>Parcela desejada</label><MoneyInput value={brlInputFromNumber(editing.parcela_desejada)} onChange={(v) => setEditing({ ...editing, parcela_desejada: parseBRL(v) })} /><label style={labelStyle}>Valor disponível para lance</label><MoneyInput value={brlInputFromNumber(editing.lance_disponivel)} onChange={(v) => setEditing({ ...editing, lance_disponivel: parseBRL(v) })} /><label style={labelStyle}>Prazo pretendido para contemplação</label><input style={inputStyle} value={editing.prazo_contemplacao || ""} onChange={(e) => setEditing({ ...editing, prazo_contemplacao: e.target.value })} /><label style={labelStyle}>Finalidade do recurso</label><textarea style={textareaStyle} value={editing.finalidade_recurso || ""} onChange={(e) => setEditing({ ...editing, finalidade_recurso: e.target.value })} /></div>
    <div style={modalSection}><h3 style={sectionTitle}>Reunião agendada</h3><label style={labelStyle}>Data e hora</label><input style={inputStyle} type="datetime-local" value={editing.reuniao_at ? editing.reuniao_at.slice(0, 16) : ""} onChange={(e) => setEditing({ ...editing, reuniao_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /><label style={labelStyle}>Tipo</label><select style={inputStyle} value={editing.reuniao_tipo || "WhatsApp"} onChange={(e) => setEditing({ ...editing, reuniao_tipo: e.target.value })}><option>WhatsApp</option><option>Ligação</option><option>Presencial</option><option>Google Meet</option><option>Outro</option></select><label style={labelStyle}>Link da sala</label><input style={inputStyle} value={editing.reuniao_link || ""} onChange={(e) => setEditing({ ...editing, reuniao_link: e.target.value })} /><button style={btnSecondary} onClick={() => scheduleMeeting(editing)}>Criar na Agenda</button></div>
    <div style={modalSection}><h3 style={sectionTitle}>Proposta / Negociação</h3><label style={labelStyle}>Propostas salvas para este lead</label><select style={inputStyle} value={editing.proposta_id || ""} onChange={(e) => setEditing({ ...editing, proposta_id: e.target.value || null })}><option value="">Nenhuma proposta selecionada</option>{proposals.map((p) => <option key={p.id} value={p.id}>{p.modelo || p.tipo || "Proposta"} • {fmtDateBR(p.created_at)} • {fmtBRLCompact(p.valor_credito || p.credito)}</option>)}</select></div>
    <div style={modalSection}><h3 style={sectionTitle}>Fechamento programado</h3><label style={labelStyle}>Data prevista</label><input style={inputStyle} type="date" value={editing.fechamento_previsto_em || ""} onChange={(e) => setEditing({ ...editing, fechamento_previsto_em: e.target.value })} /><label style={labelStyle}>Documentos pendentes</label><textarea style={textareaStyle} value={editing.documentos_pendentes || ""} onChange={(e) => setEditing({ ...editing, documentos_pendentes: e.target.value })} /></div>
    <div style={modalSection}><h3 style={sectionTitle}>Histórico de anotações</h3><textarea style={textareaStyle} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Digite uma nova anotação..." /><div style={timelineStyle}>{(noteMap.get(editing.id) || []).map((n) => <div key={n.id} style={timelineItem}><strong>{fmtDateTimeBR(n.created_at)} • {n.kind}</strong><p>{n.note}</p></div>)}{!(noteMap.get(editing.id) || []).length && <div style={emptyCol}>Sem anotações ainda.</div>}</div></div>
  </div><div style={footerActions}><button style={btnGhost} onClick={() => setLostModal(editing)}>Marcar perdido</button><button style={btnGhost} onClick={() => setWonModal(editing)}>Marcar ganho</button><button style={btnGhost} onClick={() => setEditing(null)}>Cancelar</button><button style={btnPrimary} disabled={saving} onClick={saveEditing}>{saving ? "Salvando..." : "Salvar alterações"}</button></div></Modal>;
}

function OppCard({ op, lead, vendor, notes, onEdit, onDragStart, whatsapp }: { op: Opp; lead?: Lead; vendor?: string; notes: Note[]; onEdit: () => void; onDragStart: (e: React.DragEvent<HTMLDivElement>) => void; whatsapp: string }) { const t = tempLabel(op.score); const u = urgencyLabel(op); const last = notes[0]?.note || op.observacao || "Sem histórico recente."; return <div style={cardStyle} draggable onDragStart={onDragStart}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: C.navy }}>{lead?.nome || "Lead não localizado"}</strong><span style={{ ...tagStyle, background: `${u.color}18`, color: u.color }}>{u.label}</span></div><div style={muted}>{formatPhoneBR(lead?.telefone)} • {vendor || "—"}</div><div style={cardMoney}>{fmtBRLCompact(moneyBase(op))}</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span style={{ ...tagStyle, background: `${t.color}16`, color: t.color }}>{t.label}</span><span style={tagStyle}>{op.segmento || "—"}</span></div><p style={lastNote}>{last.length > 120 ? `${last.slice(0, 120)}...` : last}</p><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button style={miniBtn} onClick={onEdit}>Tratar</button>{whatsapp && <a style={miniBtnLink} href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}</div></div>; }
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div style={modalBackdrop} onMouseDown={onClose}><div style={{ ...modalCard, maxWidth: wide ? 1120 : 620 }} onMouseDown={(e) => e.stopPropagation()}><div style={modalHeader}><h2>{title}</h2><button style={xBtn} onClick={onClose}>×</button></div>{children}</div></div>; }

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 24, position: "relative", overflow: "hidden", background: C.off };
const bgStyle: React.CSSProperties = { position: "fixed", inset: 0, background: `radial-gradient(circle at 10% 10%, ${C.red}18, transparent 28%), radial-gradient(circle at 90% 15%, ${C.navy}1f, transparent 30%), radial-gradient(circle at 80% 90%, ${C.gold}22, transparent 28%)`, pointerEvents: "none" };
const headerStyle: React.CSSProperties = { position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18, flexWrap: "wrap" };
const eyebrow: React.CSSProperties = { color: C.gold, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", fontSize: 12 };
const titleStyle: React.CSSProperties = { margin: 0, color: C.navy, fontSize: 34, lineHeight: 1.1 };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: C.ink2, maxWidth: 760 };
const filterCard: React.CSSProperties = { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(240px, 1.4fr) repeat(4, minmax(150px, 1fr))", gap: 10, background: "rgba(255,255,255,.78)", border: "1px solid rgba(255,255,255,.7)", boxShadow: "0 20px 60px rgba(30,41,63,.12)", borderRadius: 24, padding: 14, marginBottom: 16 };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(30,41,63,.14)", borderRadius: 14, padding: "10px 12px", background: "rgba(255,255,255,.92)", color: C.navy, outline: "none", boxSizing: "border-box" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 86, resize: "vertical" };
const graphGridV2Style: React.CSSProperties = { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1.25fr 1fr 1fr", gap: 14, marginBottom: 16 };
const chartCard: React.CSSProperties = { background: "rgba(255,255,255,.82)", border: "1px solid rgba(255,255,255,.7)", boxShadow: "0 18px 50px rgba(30,41,63,.10)", borderRadius: 24, padding: 16, position: "relative" };
const chartTitle: React.CSSProperties = { fontWeight: 900, color: C.navy, marginBottom: 10 };
const emptyChart: React.CSSProperties = { height: 220, display: "grid", placeItems: "center", color: C.slate, fontSize: 13 };
const closedDonutGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const miniDonutBox: React.CSSProperties = { border: "1px solid rgba(30,41,63,.09)", borderRadius: 18, background: "#fff", padding: 10, position: "relative", minHeight: 218 };
const miniDonutTitle: React.CSSProperties = { color: C.navy, fontSize: 12, fontWeight: 900, textAlign: "center" };
const miniDonutTotal: React.CSSProperties = { position: "absolute", top: 74, left: "50%", transform: "translateX(-50%)", display: "grid", placeItems: "center", color: C.navy, fontSize: 12 };
const miniLegend: React.CSSProperties = { display: "grid", gap: 4, marginTop: 4 };
const miniEmpty: React.CSSProperties = { height: 180, display: "grid", placeItems: "center", color: C.slate, fontSize: 12 };
const legendItem: React.CSSProperties = { display: "grid", gridTemplateColumns: "10px 1fr auto", alignItems: "center", gap: 6, fontSize: 11, color: C.ink2 };
const legendDot: React.CSSProperties = { width: 9, height: 9, borderRadius: 999 };
const boardStyleV5: React.CSSProperties = { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(5, minmax(270px, 1fr))", gap: 12, overflowX: "auto", paddingBottom: 18 };
const columnStyle: React.CSSProperties = { background: "rgba(255,255,255,.70)", border: "1px solid rgba(255,255,255,.75)", borderRadius: 24, padding: 12, minHeight: 360, boxShadow: "0 20px 55px rgba(30,41,63,.09)" };
const columnHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 };
const columnTitle: React.CSSProperties = { color: C.navy, fontWeight: 900, fontSize: 14, lineHeight: 1.2 };
const pill: React.CSSProperties = { minWidth: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 999, background: C.navy, color: "white", fontWeight: 800, fontSize: 12 };
const columnTotal: React.CSSProperties = { color: C.gold, fontWeight: 900, margin: "8px 0 12px" };
const pagerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 };
const pagerBtn: React.CSSProperties = { border: 0, borderRadius: 10, width: 32, height: 30, background: C.navy, color: "white", fontWeight: 900, cursor: "pointer" };
const pagerText: React.CSSProperties = { fontSize: 12, color: C.ink2, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,.94)", border: "1px solid rgba(30,41,63,.08)", borderRadius: 18, padding: 12, boxShadow: "0 10px 25px rgba(30,41,63,.08)", cursor: "grab" };
const muted: React.CSSProperties = { color: C.slate, fontSize: 12, marginTop: 4 };
const tagStyle: React.CSSProperties = { borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800, background: "#f1f5f9", color: C.ink2 };
const cardMoney: React.CSSProperties = { color: C.red, fontSize: 20, fontWeight: 950, margin: "8px 0" };
const lastNote: React.CSSProperties = { color: C.ink2, fontSize: 12, lineHeight: 1.35, margin: "8px 0 0" };
const miniBtn: React.CSSProperties = { border: 0, borderRadius: 12, padding: "8px 10px", background: C.navy, color: "white", fontWeight: 800, cursor: "pointer", flex: 1 };
const miniBtnLink: React.CSSProperties = { ...miniBtn, textDecoration: "none", textAlign: "center", background: C.ok };
const btnPrimary: React.CSSProperties = { border: 0, borderRadius: 14, padding: "11px 14px", background: `linear-gradient(135deg, ${C.red}, ${C.navy})`, color: "white", fontWeight: 900, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { ...btnPrimary, background: C.navy };
const btnGhost: React.CSSProperties = { border: `1px solid rgba(30,41,63,.16)`, borderRadius: 14, padding: "10px 14px", background: "rgba(255,255,255,.78)", color: C.navy, fontWeight: 850, cursor: "pointer" };
const loadingStyle: React.CSSProperties = { position: "relative", zIndex: 1, padding: 30, color: C.navy, fontWeight: 800 };
const emptyCol: React.CSSProperties = { color: "#94a3b8", fontSize: 13, padding: 12, textAlign: "center" };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,.48)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 18 };
const modalCard: React.CSSProperties = { width: "100%", maxHeight: "88vh", overflow: "auto", background: "rgba(255,255,255,.96)", borderRadius: 26, padding: 18, boxShadow: "0 30px 90px rgba(0,0,0,.25)" };
const modalHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, color: C.navy };
const xBtn: React.CSSProperties = { border: 0, background: "#f1f5f9", color: C.navy, borderRadius: 12, width: 36, height: 36, fontSize: 24, cursor: "pointer" };
const modalGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const modalSection: React.CSSProperties = { border: "1px solid rgba(30,41,63,.10)", borderRadius: 20, padding: 14, background: "#fff" };
const sectionTitle: React.CSSProperties = { margin: "0 0 10px", color: C.navy, fontSize: 16 };
const labelStyle: React.CSSProperties = { display: "block", margin: "10px 0 6px", color: C.navy, fontWeight: 850, fontSize: 13 };
const timelineStyle: React.CSSProperties = { display: "grid", gap: 8, marginTop: 10, maxHeight: 260, overflow: "auto" };
const timelineItem: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 10, color: C.ink2, fontSize: 12 };
const footerActions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 16 };
