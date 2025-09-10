// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ------------ Tipos ------------ */
type Lead = { id: string; nome: string; owner_id?: string | null; telefone?: string | null; email?: string | null; origem?: string | null };
type Vendedor = { auth_user_id: string; nome: string };

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
  estagio: EstagioDB;
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
  updated_at?: string | null;
};

type AuditRow = {
  id: number;
  opportunity_id: string;
  changed_at: string;
  changed_by: string; // auth_user_id
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  user_name?: string;
};

type KpiRow = { stage: string; qtd: number; total: number };

/** ------------ Helpers ------------ */
const segmentos = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const moedaParaNumeroBR = (valor: string) => {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
};

const soDigitos = (s?: string | null) => (s || "").replace(/\D+/g, "");
const phoneToWA = (t?: string | null) => {
  const d = soDigitos(t);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return "55" + d;
};

function normalizeEstagioDB(label: string): EstagioDB {
  const v = (label || "").toLowerCase();
  if (v.includes("fechado") && v.includes("ganho")) return "Fechado (Ganho)";
  if (v.includes("fechado") && v.includes("perdido")) return "Fechado (Perdido)";
  if (v.startsWith("qualifica")) return "Qualificando";
  if (v.startsWith("proposta")) return "Proposta";
  if (v.startsWith("negocia")) return "Negociação";
  return "Novo";
}

/** ------------ Página ------------ */
export default function Oportunidades() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);

  // Busca
  const [search, setSearch] = useState("");

  // Modal editar
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");

  // Modal histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<AuditRow[]>([]);

  // Nova oportunidade (overlay separado)
  const [createOpen, setCreateOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>(segmentos[0]);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageText, setStageText] = useState<EstagioDB>("Novo");
  const [expectedDate, setExpectedDate] = useState<string>(""); // dd/mm/aaaa
  const [loadingCreate, setLoadingCreate] = useState(false);

  /** Carregar dados essenciais (robusto a falhas) */
  useEffect(() => {
    (async () => {
      // Leads (com telefone/email/origem se existirem)
      const { data: l, error: el } = await supabase
        .from("leads")
        .select("id, nome, owner_id, telefone, email, origem")
        .order("created_at", { ascending: false });
      if (el) console.error("Leads error:", el);
      setLeads(l || []);

      // Vendedores via RPC; se falhar, tentar public.users
      let vend: Vendedor[] = [];
      const rpc = await supabase.rpc("listar_vendedores").catch(() => null);
      if (rpc && (rpc as any).data) vend = (rpc as any).data as Vendedor[];
      if (!vend?.length) {
        const { data: us } = await supabase.from("users").select("auth_user_id, nome");
        vend = (us || []) as Vendedor[];
      }
      setVendedores(vend || []);

      // Oportunidades
      const { data: o, error: eo } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false });
      if (eo) console.error("Opp error:", eo);
      setLista((o || []) as Oportunidade[]);

      // KPIs pela view (se não existir, não quebra a tela)
      const { data: k } = await supabase.from("vw_opportunities_kpi").select("*").catch(() => ({ data: [] as any }));
      setKpis(((k as any) || []) as KpiRow[]);
    })();
  }, []);

  /** Busca (lead, vendedor, estágio, telefone) + esconder fechados */
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = lista.filter((o) => !["Fechado (Ganho)", "Fechado (Perdido)"].includes(o.estagio));
    if (!q) return arr;

    return arr.filter((o) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
      const tel = soDigitos(lead?.telefone || "");
      return (
        (lead?.nome || "").toLowerCase().includes(q) ||
        (vend?.nome || "").toLowerCase().includes(q) ||
        (o.estagio || "").toLowerCase().includes(q) ||
        tel.includes(q)
      );
    });
  }, [lista, leads, vendedores, search]);

  /** ---------- Criar oportunidade ---------- */
  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    // dd/mm/aaaa -> yyyy-mm-dd
    let isoDate: string | null = null;
    if (expectedDate) {
      const [d, m, y] = expectedDate.split("/");
      if (d && m && y) isoDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    setLoadingCreate(true);
    const payload = {
      lead_id: leadId,
      vendedor_id: vendId,
      owner_id: vendId,
      segmento,
      valor_credito: valorNum,
      observacao: obs ? `[${new Date().toLocaleString("pt-BR")}]\n${obs}` : null,
      score,
      estagio: stageText as EstagioDB,
      expected_close_at: isoDate,
    };

    const { data, error } = await supabase
      .from("opportunities")
      .insert([payload])
      .select()
      .single();

    setLoadingCreate(false);

    if (error) {
      console.error(error);
      alert("Erro ao criar oportunidade: " + error.message);
      return;
    }

    setLista((s) => [data as Oportunidade, ...s]);

    // reset
    setLeadId("");
    setVendId("");
    setSegmento(segmentos[0]);
    setValor("");
    setObs("");
    setScore(1);
    setStageText("Novo");
    setExpectedDate("");
    setCreateOpen(false);
    alert("Oportunidade criada!");
  }

  /** ---------- Tratar (editar) ---------- */
  function openEdit(o: Oportunidade) {
    setEditing(o);
    setNewNote("");
  }
  function closeEdit() {
    setEditing(null);
    setNewNote("");
  }
  async function saveEdit() {
    if (!editing) return;

    const historico =
      (editing.observacao ? editing.observacao + "\n\n" : "") +
      (newNote ? `[${new Date().toLocaleString("pt-BR")}]\n${newNote}` : "");

    const payload = {
      segmento: editing.segmento,
      valor_credito: editing.valor_credito,
      score: Math.max(1, Math.min(5, editing.score)),
      estagio: normalizeEstagioDB(String(editing.estagio)),
      expected_close_at: editing.expected_close_at?.trim() ? editing.expected_close_at : null,
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

  /** ---------- Histórico ---------- */
  async function openHistory(opportunityId: string) {
    const { data, error } = await supabase
      .from("opportunity_audit")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("changed_at", { ascending: false });

    if (error) {
      alert("Erro ao carregar histórico");
      return;
    }

    const rows = (data || []) as AuditRow[];

    // Resolve nomes dos usuários (public.users)
    const ids = [...new Set(rows.map((r) => r.changed_by))];
    if (ids.length) {
      const { data: us } = await supabase
        .from("users")
        .select("auth_user_id, nome")
        .in("auth_user_id", ids);
      const map = new Map(us?.map((u) => [u.auth_user_id, u.nome]));
      rows.forEach((r) => (r.user_name = map.get(r.changed_by) || r.changed_by));
    }

    setHistoryData(rows);
    setHistoryOpen(true);
  }

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

  /** ------------ UI ------------ */

  // KPI via view
  const CardsKPI = () => {
    // ordem sugerida
    const order = ["Novo", "Qualificando", "Proposta", "Negociação", "Fechado (Ganho)", "Fechado (Perdido)"];
    const rows = [...kpis].sort((a, b) => order.indexOf(String(a.stage)) - order.indexOf(String(b.stage)));
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={sectionSubtitle}>Pipeline por estágio</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 16 }}>
          {rows.map((k, idx) => (
            <div key={idx} style={card}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{String(k.stage)}</div>
              <div style={{ color: "#1f2937" }}>Qtd: {k.qtd}</div>
              <div style={{ color: "#1f2937" }}>Valor: {fmtBRL(k.total)}</div>
            </div>
          ))}
          {!rows.length && (
            <div style={{ gridColumn: "1 / span 6", color: "#64748b" }}>
              (Sem dados na view <code>vw_opportunities_kpi</code>)
            </div>
          )}
        </div>
      </div>
    );
  };

  const ListaOportunidades = () => {
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Oportunidades</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Lead</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Segmento</th>
                <th style={th}>Valor</th>
                <th style={th}>Prob.</th>
                <th style={th}>Estágio</th>
                <th style={th}>Previsão</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((o) => {
                const lead = leads.find((l) => l.id === o.lead_id);
                const vendedor = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
                const waNum = phoneToWA(lead?.telefone);
                return (
                  <tr key={o.id}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span title={`Telefone: ${lead?.telefone || "-"}\nEmail: ${lead?.email || "-"}\nOrigem: ${lead?.origem || "-"}`}>
                          {lead?.nome || "-"}
                        </span>
                        {waNum && (
                          <a
                            href={`https://wa.me/${waNum}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Iniciar WhatsApp"
                            style={waBtn}
                          >
                            WA
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={td}>{vendedor?.nome || "-"}</td>
                    <td style={td}>{o.segmento}</td>
                    <td style={td}>{fmtBRL(o.valor_credito)}</td>
                    <td style={td}>{"●".repeat(Math.max(1, Math.min(5, o.score || 1)))}</td>
                    <td style={td}>{o.estagio}</td>
                    <td style={td}>{o.expected_close_at ? new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                    <td style={td}>
                      <button onClick={() => openEdit(o)} style={btnSmallPrimary}>
                        Tratar
                      </button>
                      <button onClick={() => openHistory(o.id)} style={btnGhost}>
                        Histórico
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visiveis.length && (
                <tr>
                  <td style={td} colSpan={8}>
                    Nenhuma oportunidade encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "24px auto",
        padding: "0 16px",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {/* Barra de busca + botão Nova oportunidade em overlay */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          margin: "16px 0",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...input, flex: 1 }}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
        <button onClick={() => setCreateOpen(true)} style={btnPrimary}>
          + Nova oportunidade
        </button>
      </div>

      <CardsKPI />

      {/* Espaçamento extra entre KPI e tabela (pedido) */}
      <div style={{ height: 12 }} />

      <ListaOportunidades />

      {/* -------- Modal Nova oportunidade -------- */}
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
                      {l.nome} {l.telefone ? `— ${soDigitos(l.telefone)}` : ""}
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
                  {segmentos.map((s) => (
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
                <select value={stageText} onChange={(e) => setStageText(e.target.value as EstagioDB)} style={input}>
                  <option value="Novo">Novo</option>
                  <option value="Qualificando">Qualificando</option>
                  <option value="Proposta">Proposta</option>
                  <option value="Negociação">Negociação</option>
                  <option value="Fechado (Ganho)">Fechado (Ganho)</option>
                  <option value="Fechado (Perdido)">Fechado (Perdido)</option>
                </select>
              </div>

              <div>
                <label style={label}>Data prevista para fechamento</label>
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
              <button onClick={criarOportunidade} disabled={loadingCreate} style={btnPrimary}>
                {loadingCreate ? "Criando..." : "Criar"}
              </button>
              <button onClick={() => setCreateOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Modal Tratar Lead -------- */}
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
                  onChange={(e) =>
                    setEditing({ ...editing, valor_credito: moedaParaNumeroBR(e.target.value) })
                  }
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
                  onChange={(e) => setEditing({ ...editing, estagio: e.target.value as EstagioDB })}
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
                <label style={label}>Previsão (aaaa-mm-dd)</label>
                <input
                  value={editing.expected_close_at || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      expected_close_at: e.target.value || null,
                    })
                  }
                  style={input}
                  placeholder="2025-09-20"
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

      {/* -------- Modal Histórico -------- */}
      {historyOpen && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Histórico de alterações</h3>
            <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 8 }}>
              {historyData.map((h) => (
                <div
                  key={h.id}
                  style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 }}
                >
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {new Date(h.changed_at).toLocaleString("pt-BR")} — <b>{h.user_name}</b>
                  </div>
                  {renderAuditDiffs(h)}
                </div>
              ))}
              {!historyData.length && <div style={{ color: "#64748b" }}>(Nenhum histórico encontrado)</div>}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={() => setHistoryOpen(false)} style={btnGhost}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ------------ estilos ------------ */
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
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee", verticalAlign: "top" };
const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 800,
};
const btnSmallPrimary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 700,
  marginRight: 6,
};
const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 700,
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
const sectionSubtitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1E293F",
  marginBottom: 8,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};
const waBtn: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "2px 6px",
  textDecoration: "none",
  color: "#1E293F",
  fontSize: 12,
};
