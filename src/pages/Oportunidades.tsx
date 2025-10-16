// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ------------ Tipos ------------ */
type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  descricao?: string | null;
  owner_id?: string | null;
};

type Vendedor = { auth_user_id: string; nome: string; role?: string };

type StageUI = "novo" | "qualificando" | "proposta" | "negociacao";
type EstagioDB = "Novo" | "Qualificando" | "Proposta" | "Negociação" | "Fechado (Ganho)" | "Fechado (Perdido)";

type Oportunidade = {
  id: string;
  lead_id: string;
  owner_id?: string | null;      // verdade
  vendedor_id?: string | null;   // legado (compat)
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;
  estagio: EstagioDB | string;
  expected_close_at: string | null;
  created_at: string;
};

/** ------------ Consts/Helpers ------------ */
const STAGES: { id: StageUI; label: EstagioDB }[] = [
  { id: "novo",          label: "Novo" },
  { id: "qualificando",  label: "Qualificando" },
  { id: "proposta",      label: "Proposta" },
  { id: "negociacao",    label: "Negociação" },
];

const SEGMENTOS = ["Automóvel","Imóvel","Motocicleta","Serviços","Pesados","Imóvel Estendido"] as const;

const dbToUI: Partial<Record<string, StageUI>> = {
  "Novo": "novo",
  "Qualificando": "qualificando",
  "Qualificação": "qualificando",
  "Qualificacao": "qualificando",
  "Proposta": "proposta",
  "Negociação": "negociacao",
  "Negociacao": "negociacao",
};
const uiToDB: Record<StageUI, EstagioDB> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  negociacao: "Negociação",
};

const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n||0);
const onlyDigits = (s?: string | null) => (s || "").replace(/\D+/g, "");
const normalizePhoneToWa = (telefone?: string | null) => {
  const d = onlyDigits(telefone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length>=10 && d.length<=11) return "55"+d;
  if (d.length>=12 && !d.startsWith("55")) return "55"+d;
  return null;
};
const telHref = (tel?: string | null) => {
  const d = onlyDigits(tel);
  return d ? `tel:${d}` : null;
};
const mailHref = (email?: string | null) => (email ? `mailto:${email}` : null);
const moedaParaNumeroBR = (v: string) => Number(v.replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".") || 0);

/** ------------ Component ------------ */
export default function Oportunidades() {
  /** sessão/usuário para permissões e owner padrão */
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);

  /** dados */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);

  /** filtros/UX */
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState<string>(""); // “Selecionar vendedor”
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  /** modais */
  const [editingOpp, setEditingOpp] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");
  const [createOppOpen, setCreateOppOpen] = useState(false);
  const [leadForOpp, setLeadForOpp] = useState("");
  const [vendForOpp, setVendForOpp] = useState("");
  const [segmentoOpp, setSegmentoOpp] = useState("Automóvel");
  const [valorOpp, setValorOpp] = useState("");
  const [scoreOpp, setScoreOpp] = useState(1);
  const [stageOpp, setStageOpp] = useState<StageUI>("novo");
  const [expectedOpp, setExpectedOpp] = useState("");
  const [loading, setLoading] = useState(false);

  // modal Novo Lead
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadNome, setLeadNome] = useState("");
  const [leadTel, setLeadTel] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadOrigem, setLeadOrigem] = useState("Site");
  const [leadDesc, setLeadDesc] = useState("");

  // modal Edit Lead
  const [editLeadOpen, setEditLeadOpen] = useState<Lead | null>(null);

  // modal Reassign
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [newOwnerId, setNewOwnerId] = useState("");

  const isAdmin = me?.role === "admin";

  /** bootstrap */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });

      const { data: l } = await supabase
        .from("leads")
        .select("id,nome,telefone,email,origem,descricao,owner_id")
        .order("created_at",{ascending:false});
      setLeads(l || []);

      const { data: v } = await supabase.rpc("listar_vendedores");
      setVendedores((v || []) as Vendedor[]);

      const { data: o } = await supabase
        .from("opportunities")
        .select("id,lead_id,owner_id,vendedor_id,segmento,valor_credito,observacao,score,estagio,expected_close_at,created_at")
        .order("created_at",{ascending:false});
      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  /** buscar/filtrar/paginar */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lista || []).filter(o => {
      // filtro por vendedor selecionado
      const sellerId = (o.owner_id || o.vendedor_id || "") as string;
      if (sellerFilter && sellerId !== sellerFilter) return false;

      if (!q) return true;
      const lead = leads.find(l => l.id === o.lead_id);
      const vname = vendedores.find(v => v.auth_user_id === sellerId)?.nome?.toLowerCase() || "";
      const lname = (lead?.nome || "").toLowerCase();
      const stage = String(o.estagio).toLowerCase();
      const tel = lead?.telefone ? onlyDigits(lead.telefone) : "";
      return lname.includes(q) || vname.includes(q) || stage.includes(q) || tel.includes(q);
    });
  }, [lista, leads, vendedores, search, sellerFilter]);

  const openByStage = useMemo(() => {
    const map: Record<StageUI, Oportunidade[]> = { novo:[], qualificando:[], proposta:[], negociacao:[] };
    for (const o of filtered) {
      const s = dbToUI[o.estagio as string];
      if (!s || !(s in map)) continue; // ignora fechados aqui
      map[s as StageUI].push(o);
    }
    return map;
  }, [filtered]);

  // KPIs dos quatro estágios
  const kpi = useMemo(() => {
    const r = {
      novo: {qtd:0,total:0},
      qualificando: {qtd:0,total:0},
      proposta: {qtd:0,total:0},
      negociacao: {qtd:0,total:0},
    } as Record<StageUI,{qtd:number,total:number}>;
    for (const s of STAGES) {
      for (const o of openByStage[s.id]) {
        r[s.id].qtd++;
        r[s.id].total += Number(o.valor_credito || 0);
      }
    }
    return r;
  }, [openByStage]);

  // donuts de finalizados por segmento
  const donuts = useMemo(() => {
    const ganho: Record<string, number> = {};
    const perdido: Record<string, number> = {};
    for (const o of filtered) {
      if (o.estagio === "Fechado (Ganho)") ganho[o.segmento] = (ganho[o.segmento]||0) + 1;
      if (o.estagio === "Fechado (Perdido)") perdido[o.segmento] = (perdido[o.segmento]||0) + 1;
    }
    return { ganho, perdido };
  }, [filtered]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered.length]);
  const pageSlice = useMemo(() => {
    const from = (page-1)*PAGE_SIZE;
    return filtered.slice(from, from+PAGE_SIZE);
  }, [filtered, page]);

  /** Ações: criar oportunidade */
  async function criarOportunidade() {
    if (!leadForOpp) return alert("Selecione um Lead.");
    if (!vendForOpp) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valorOpp);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    let expected: string | null = null;
    if (expectedOpp) {
      const [d,m,y] = expectedOpp.split("/");
      if (d && m && y) expected = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }

    setLoading(true);
    const payload: any = {
      lead_id: leadForOpp,
      owner_id: vendForOpp,
      vendedor_id: vendForOpp, // compat
      segmento: segmentoOpp,
      valor_credito: valorNum,
      score: scoreOpp,
      estagio: uiToDB[stageOpp],
      expected_close_at: expected,
      observacao: null,
    };
    const { data, error } = await supabase.from("opportunities").insert([payload]).select().single();
    setLoading(false);
    if (error) return alert("Erro ao criar oportunidade: " + error.message);
    setLista(s => [data as Oportunidade, ...s]);
    setCreateOppOpen(false);
    setLeadForOpp(""); setVendForOpp(""); setSegmentoOpp("Automóvel"); setValorOpp(""); setScoreOpp(1); setStageOpp("novo"); setExpectedOpp("");
  }

  /** Ações: tratar oportunidade (update campos de negócio) */
  async function salvarTratamento() {
    if (!editingOpp) return;
    const historico =
      (editingOpp.observacao ? editingOpp.observacao + "\n\n" : "") +
      (newNote ? `[${new Date().toLocaleString("pt-BR")}]\n${newNote}` : "");
    const payload = {
      segmento: editingOpp.segmento,
      valor_credito: editingOpp.valor_credito,
      score: editingOpp.score,
      estagio: ((): EstagioDB => {
        const label = String(editingOpp.estagio).toLowerCase();
        if (label.startsWith("prop")) return "Proposta";
        if (label.startsWith("nego")) return "Negociação";
        if (label.startsWith("qual")) return "Qualificando";
        return "Novo";
      })(),
      expected_close_at: editingOpp.expected_close_at?.trim() || null,
      observacao: historico || editingOpp.observacao || null,
    };
    const { data, error } = await supabase.from("opportunities").update(payload).eq("id", editingOpp.id).select().single();
    if (error) return alert("Falha ao salvar: " + error.message);
    setLista(s => s.map(x => x.id === editingOpp.id ? (data as Oportunidade) : x));
    setEditingOpp(null); setNewNote("");
  }

  /** Ações: criar novo lead (overlay) + criar oportunidade "Novo" imediatamente */
  async function criarLeadENovaOpp() {
    if (!leadNome.trim()) return alert("Informe o nome.");
    setLoading(true);
    // 1) cria o lead
    const insertLead = {
      nome: leadNome.trim(),
      telefone: onlyDigits(leadTel) || null,
      email: (leadEmail||"").trim().toLowerCase() || null,
      origem: leadOrigem || null,
      descricao: leadDesc?.trim() || null,
    };
    const { data: ld, error: eLead } = await supabase.from("leads").insert([insertLead]).select().single();
    if (eLead) { setLoading(false); return alert("Erro ao criar lead: " + eLead.message); }
    const newLead = ld as Lead;

    // 2) cria oportunidade estágio "Novo" com owner = usuário atual
    const owner = me?.id || (newLead.owner_id || "");
    const { data: o, error: eOpp } = await supabase.from("opportunities").insert([{
      lead_id: newLead.id,
      owner_id: owner,
      vendedor_id: owner, // compat
      segmento: "Automóvel",
      valor_credito: 0,
      score: 1,
      estagio: "Novo" as EstagioDB,
      expected_close_at: null,
      observacao: null,
    }]).select().single();

    setLoading(false);

    if (eOpp) return alert("Lead criado, mas falhou ao criar a oportunidade: "+eOpp.message);

    // atualiza listas locais
    setLeads(s => [newLead, ...s]);
    setLista(s => [o as Oportunidade, ...s]);

    // limpa/fecha modal
    setLeadOpen(false);
    setLeadNome(""); setLeadTel(""); setLeadEmail(""); setLeadOrigem("Site"); setLeadDesc("");
  }

  /** Ações: editar lead */
  async function salvarLeadEdit() {
    if (!editLeadOpen) return;
    const payload = {
      nome: editLeadOpen.nome?.trim(),
      telefone: onlyDigits(editLeadOpen.telefone) || null,
      email: (editLeadOpen.email||"").trim().toLowerCase() || null,
      origem: editLeadOpen.origem || null,
      descricao: editLeadOpen.descricao || null,
    };
    const { data, error } = await supabase.from("leads").update(payload).eq("id", editLeadOpen.id).select().single();
    if (error) return alert("Falha ao salvar: "+error.message);
    setLeads(s => s.map(l => l.id === editLeadOpen.id ? (data as Lead) : l));
    setEditLeadOpen(null);
  }

  /** Ações: reatribuir (admin) */
  async function reatribuirLead() {
    if (!reassignLead || !newOwnerId) return;
    const { error } = await supabase.from("leads").update({ owner_id: newOwnerId }).eq("id", reassignLead.id);
    if (error) return alert("Erro ao reatribuir: "+error.message);
    setLeads(s => s.map(l => l.id === reassignLead.id ? {...l, owner_id: newOwnerId} : l));
    setReassignLead(null); setNewOwnerId("");
  }

  /** ---------- UI helpers ---------- */
  const SellerName = (o: Oportunidade) => {
    const sid = (o.owner_id || o.vendedor_id || "") as string;
    return vendedores.find(v => v.auth_user_id === sid)?.nome || "-";
  };

  const ActionBar: React.FC<{ lead: Lead; opp: Oportunidade }> = ({ lead, opp }) => {
    const tel = telHref(lead.telefone);
    const wa = normalizePhoneToWa(lead.telefone);
    const mail = mailHref(lead.email);

    const iconBtn: React.CSSProperties = { display:"inline-flex", alignItems:"center", justifyContent:"center", width:28, height:28, border:"1px solid #e5e7eb", borderRadius:8, background:"#fff", color:"#1E293F", cursor:"pointer" };
    const iconMute: React.CSSProperties = { opacity:.45, cursor:"not-allowed" };

    return (
      <div style={{ display:"flex", gap:6 }}>
        {/* Telefone */}
        {tel ? (
          <a title="Ligar" href={tel} style={iconBtn}>📞</a>
        ) : (
          <span title="Sem telefone" style={{...iconBtn, ...iconMute}}>📞</span>
        )}
        {/* WhatsApp */}
        {wa ? (
          <a title="WhatsApp" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={iconBtn}>🟢</a>
        ) : (
          <span title="Sem WhatsApp" style={{...iconBtn, ...iconMute}}>🟢</span>
        )}
        {/* E-mail */}
        {mail ? (
          <a title="E-mail" href={mail} style={iconBtn}>✉️</a>
        ) : (
          <span title="Sem e-mail" style={{...iconBtn, ...iconMute}} onClick={() => alert("Este lead não possui e-mail cadastrado.")}>✉️</span>
        )}
        {/* Editar Lead */}
        <button title="Editar Lead" style={iconBtn} onClick={() => setEditLeadOpen(lead)}>✏️</button>
        {/* Reatribuir (admin) */}
        {isAdmin ? (
          <button title="Reatribuir" style={iconBtn} onClick={() => { setReassignLead(lead); setNewOwnerId(""); }}>↔️</button>
        ) : null}
        {/* Tratar (oportunidade) */}
        <button title="Tratar" style={iconBtn} onClick={() => setEditingOpp(opp)}>🧰</button>
      </div>
    );
  };

  const Column: React.FC<{ stage: StageUI; items: Oportunidade[] }> = ({ stage, items }) => (
    <div style={{ display:"grid", gap:10 }}>
      {items.map(opp => {
        const lead = leads.find(l => l.id === opp.lead_id);
        return (
          <div key={opp.id} style={{ background:"#fff", borderRadius:12, padding:12, boxShadow:"0 2px 10px rgba(0,0,0,.06)" }}>
            <div style={{ fontWeight:800, marginBottom:6 }}>{lead?.nome || "-"}</div>
            <div style={{ color:"#475569", fontSize:12, marginBottom:4 }}>Segmento: <strong style={{ color:"#0f172a" }}>{opp.segmento}</strong></div>
            <div style={{ color:"#475569", fontSize:12, marginBottom:8 }}>Valor: <strong style={{ color:"#0f172a" }}>{fmtBRL(opp.valor_credito)}</strong></div>
            <ActionBar lead={lead as Lead} opp={opp} />
          </div>
        );
      })}
      {!items.length && <div style={{ color:"#94a3b8", fontSize:12 }}>Sem itens</div>}
    </div>
  );

  const Donut: React.FC<{ data: Record<string, number>; title: string }> = ({ data, title }) => {
    const entries = Object.entries(data);
    const total = entries.reduce((s, [,v]) => s+v, 0) || 1;
    let acc = 0;
    const radius = 48;
    const c = 2*Math.PI*radius;
    return (
      <div style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 10px rgba(0,0,0,.06)" }}>
        <div style={{ fontWeight:800, marginBottom:8 }}>{title}</div>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <g transform="translate(70,70)">
            <circle r={radius} fill="none" stroke="#e5e7eb" strokeWidth="18" />
            {entries.map(([k,v], idx) => {
              const frac = v/total;
              const dash = c*frac;
              const gap = c - dash;
              const rot = (acc/total)*360;
              acc += v;
              return (
                <circle
                  key={k}
                  r={radius}
                  fill="none"
                  strokeWidth="18"
                  stroke={["#A11C27","#6366F1","#10B981","#F59E0B","#0EA5E9","#EF4444"][idx%6]}
                  strokeDasharray={`${dash} ${gap}`}
                  transform={`rotate(${rot-90})`}
                />
              );
            })}
          </g>
        </svg>
        <div style={{ marginTop:8, fontSize:12, color:"#475569", display:"grid", gap:4 }}>
          {entries.map(([k,v], idx)=>(
            <div key={k} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ width:10, height:10, borderRadius:2, background: ["#A11C27","#6366F1","#10B981","#F59E0B","#0EA5E9","#EF4444"][idx%6] }} />
              <span style={{ flex:1 }}>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
          {!entries.length && <span>Sem dados</span>}
        </div>
      </div>
    );
  };

  /** -------------- Render -------------- */
  return (
    <div style={{ maxWidth: 1280, margin: "24px auto", padding: "0 16px" }}>
      {/* Top bar */}
      <div style={{ background:"#fff", padding:12, borderRadius:12, boxShadow:"0 2px 12px rgba(0,0,0,.06)", marginBottom:16, display:"grid", gridTemplateColumns:"240px 1fr auto auto", gap:12, alignItems:"center" }}>
        {/* Selecionar vendedor */}
        <select value={sellerFilter} onChange={e=>{ setSellerFilter(e.target.value); setPage(1); }} style={input}>
          <option value="">Clique para Selecionar um vendedor</option>
          {vendedores.map(v=>(
            <option key={v.auth_user_id} value={v.auth_user_id}>{v.nome}</option>
          ))}
        </select>

        {/* Busca */}
        <input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1); }} style={input} placeholder="Buscar por lead, vendedor, estágio ou telefone" />

        {/* Nova Oportunidade */}
        <button onClick={()=>setCreateOppOpen(true)} style={btnPrimary}>+ Nova Oportunidade</button>
        {/* Novo Lead */}
        <button onClick={()=>setLeadOpen(true)} style={btnGhost}>+ Novo Lead</button>
      </div>

      {/* Pipeline por Estágio (4 cards) */}
      <div style={{ marginBottom:16 }}>
        <div style={sectionTitle}>Pipeline por estágio</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:16 }}>
          {STAGES.map(s=>(
            <div key={s.id} style={{ background:"#fff", borderRadius:14, boxShadow:"0 2px 10px rgba(0,0,0,.06)", padding:14 }}>
              <div style={{ fontWeight:800, color:"#0f172a", marginBottom:8 }}>{s.label}</div>
              <div style={{ color:"#1f2937" }}>Qtd: {kpi[s.id].qtd}</div>
              <div style={{ color:"#1f2937" }}>Valor: {fmtBRL(kpi[s.id].total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Oportunidades em 4 colunas */}
      <div style={card}>
        <h3 style={{ marginTop:0 }}>Oportunidades</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:16 }}>
          {STAGES.map(s=>(
            <div key={s.id}>
              <div style={{ fontWeight:800, marginBottom:10 }}>{s.label}</div>
              <Column stage={s.id} items={openByStage[s.id]} />
            </div>
          ))}
        </div>

        {/* paginação */}
        <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"flex-end", marginTop:12 }}>
          <button style={btnSecondary} disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Anterior</button>
          <span style={{ fontSize:12, color:"#475569" }}>página {page} de {totalPages}</span>
          <button style={btnSecondary} disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Próxima ›</button>
        </div>
      </div>

      {/* Finalizados (donuts) */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Donut data={donuts.ganho} title="Fechado (Ganho) por Segmento" />
        <Donut data={donuts.perdido} title="Fechado (Perdido) por Segmento" />
      </div>

      {/* -------- Modais -------- */}

      {/* Tratar Oportunidade */}
      {editingOpp && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop:0 }}>Tratar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Segmento</label>
                <select value={editingOpp.segmento} onChange={e=>setEditingOpp({...editingOpp, segmento: e.target.value})} style={input}>
                  {SEGMENTOS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Valor do crédito (R$)</label>
                <input value={String(editingOpp.valor_credito)} onChange={e=>setEditingOpp({...editingOpp, valor_credito: moedaParaNumeroBR(e.target.value)})} style={input}/>
              </div>
              <div>
                <label style={label}>Probabilidade</label>
                <select value={String(editingOpp.score)} onChange={e=>setEditingOpp({...editingOpp, score: Number(e.target.value)})} style={input}>
                  {[1,2,3,4,5].map(n=> <option key={n} value={n}>{"★".repeat(n)}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Estágio</label>
                <select value={String(editingOpp.estagio)} onChange={e=>setEditingOpp({...editingOpp, estagio: e.target.value})} style={input}>
                  <option value="Novo">Novo</option>
                  <option value="Qualificando">Qualificando</option>
                  <option value="Proposta">Proposta</option>
                  <option value="Negociação">Negociação</option>
                  <option value="Fechado (Ganho)">Fechado (Ganho)</option>
                  <option value="Fechado (Perdido)">Fechado (Perdido)</option>
                </select>
              </div>
              <div>
                <label style={label}>Previsão (aaaa-mm-dd)</label>
                <input value={editingOpp.expected_close_at || ""} onChange={e=>setEditingOpp({...editingOpp, expected_close_at: e.target.value})} style={input} placeholder="2025-10-15" />
              </div>
              <div style={{ gridColumn:"1 / span 2" }}>
                <label style={label}>Adicionar observação</label>
                <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} style={{ ...input, minHeight: 90 }} placeholder="Escreva uma nova observação." />
                <div style={{ marginTop:8, color:"#64748b", fontSize:12 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>Histórico</div>
                  <pre style={{ whiteSpace:"pre-wrap", background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:8, padding:8, maxHeight:180, overflowY:"auto" }}>
                    {editingOpp.observacao || "(sem anotações)"}
                  </pre>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={salvarTratamento} style={btnPrimary}>Salvar alterações</button>
              <button onClick={()=>{ setEditingOpp(null); setNewNote(""); }} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Nova Oportunidade */}
      {createOppOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop:0 }}>Nova oportunidade</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Selecionar um Lead</label>
                <select value={leadForOpp} onChange={e=>setLeadForOpp(e.target.value)} style={input}>
                  <option value="">Selecione um Lead</option>
                  {leads.map(l=> <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Selecione um Vendedor</label>
                <select value={vendForOpp} onChange={e=>setVendForOpp(e.target.value)} style={input}>
                  <option value="">Selecione um Vendedor</option>
                  {vendedores.map(v=> <option key={v.auth_user_id} value={v.auth_user_id}>{v.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Segmento</label>
                <select value={segmentoOpp} onChange={e=>setSegmentoOpp(e.target.value)} style={input}>
                  {SEGMENTOS.map(s=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Valor do crédito (R$)</label>
                <input value={valorOpp} onChange={e=>setValorOpp(e.target.value)} style={input} placeholder="Ex.: 80.000,00" />
              </div>
              <div>
                <label style={label}>Probabilidade</label>
                <select value={String(scoreOpp)} onChange={e=>setScoreOpp(Number(e.target.value))} style={input}>
                  {[1,2,3,4,5].map(n=> <option key={n} value={n}>{"★".repeat(n)}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Estágio</label>
                <select value={stageOpp} onChange={e=>setStageOpp(e.target.value as StageUI)} style={input}>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Data prevista (dd/mm/aaaa)</label>
                <input value={expectedOpp} onChange={e=>setExpectedOpp(e.target.value)} style={input} placeholder="dd/mm/aaaa" />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={criarOportunidade} disabled={loading} style={btnPrimary}>{loading ? "Criando..." : "Criar oportunidade"}</button>
              <button onClick={()=>setCreateOppOpen(false)} style={btnGhost}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Novo Lead (overlay) */}
      {leadOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop:0 }}>Novo Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={leadNome} onChange={e=>setLeadNome(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={leadTel} onChange={e=>setLeadTel(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input type="email" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Origem</label>
                <select value={leadOrigem} onChange={e=>setLeadOrigem(e.target.value)} style={input}>
                  {["Site","Redes Sociais","Indicação","Whatsapp","Parceria","Relacionamento"].map(o=> <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"1 / span 2" }}>
                <label style={label}>Descrição</label>
                <input value={leadDesc} onChange={e=>setLeadDesc(e.target.value)} style={input} />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={criarLeadENovaOpp} disabled={loading} style={btnPrimary}>{loading ? "Salvando..." : "Salvar e criar oportunidade (Novo)"}</button>
              <button onClick={()=>setLeadOpen(false)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Editar Lead */}
      {editLeadOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop:0 }}>Editar Lead</h3>
            <div style={grid2}>
              <div>
                <label style={label}>Nome</label>
                <input value={editLeadOpen.nome || ""} onChange={e=>setEditLeadOpen({...editLeadOpen, nome:e.target.value})} style={input}/>
              </div>
              <div>
                <label style={label}>Telefone</label>
                <input value={editLeadOpen.telefone || ""} onChange={e=>setEditLeadOpen({...editLeadOpen, telefone:e.target.value})} style={input}/>
              </div>
              <div>
                <label style={label}>E-mail</label>
                <input value={editLeadOpen.email || ""} onChange={e=>setEditLeadOpen({...editLeadOpen, email:e.target.value})} style={input}/>
              </div>
              <div>
                <label style={label}>Origem</label>
                <input value={editLeadOpen.origem || ""} onChange={e=>setEditLeadOpen({...editLeadOpen, origem:e.target.value})} style={input}/>
              </div>
              <div style={{ gridColumn:"1 / span 2" }}>
                <label style={label}>Descrição</label>
                <input value={editLeadOpen.descricao || ""} onChange={e=>setEditLeadOpen({...editLeadOpen, descricao:e.target.value})} style={input}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={salvarLeadEdit} style={btnPrimary}>Salvar</button>
              <button onClick={()=>setEditLeadOpen(null)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reatribuir Lead (admin) */}
      {reassignLead && isAdmin && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop:0 }}>Reatribuir Lead</h3>
            <p style={{ marginTop:0, marginBottom:8, color:"#475569" }}><strong>Lead:</strong> {reassignLead.nome}</p>
            <select value={newOwnerId} onChange={e=>setNewOwnerId(e.target.value)} style={input}>
              <option value="">Selecionar usuário…</option>
              {vendedores.map(u=>(
                <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome}</option>
              ))}
            </select>
            <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end" }}>
              <button style={btnGhost} onClick={()=>{ setReassignLead(null); setNewOwnerId(""); }}>Cancelar</button>
              <button style={btnPrimary} onClick={reatribuirLead} disabled={!newOwnerId}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ------------ estilos ------------ */
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

const grid2: React.CSSProperties = { display:"grid", gap:12, gridTemplateColumns:"1fr 1fr" };
const input: React.CSSProperties = { width:"100%", padding:10, borderRadius:12, border:"1px solid #e5e7eb", outline:"none" };
const label: React.CSSProperties = { display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 };
const btnPrimary: React.CSSProperties = { padding:"10px 14px", borderRadius:12, background:"#A11C27", color:"#fff", border:0, cursor:"pointer", fontWeight:700 };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:12, background:"#fff", color:"#1E293F", border:"1px solid #e5e7eb", cursor:"pointer", fontWeight:700 };
const btnSecondary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, background:"#f1f5f9", color:"#0f172a", border:"1px solid #e2e8f0", fontWeight:600, cursor:"pointer" };
const modalBackdrop: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,.3)", display:"grid", placeItems:"center", zIndex:50 };
const modalCard: React.CSSProperties = { width:"min(980px, 94vw)", background:"#fff", padding:16, borderRadius:16, boxShadow:"0 20px 60px rgba(0,0,0,.3)" };
