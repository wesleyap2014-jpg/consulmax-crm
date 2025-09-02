// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DashboardKpis from "../components/DashboardKpis";
import KanbanBoard from "@/components/KanbanBoard";

// ---------------- Tipos ----------------
type Lead = { id: string; nome: string; owner_id: string };
type Vendedor = { auth_user_id: string; nome: string };

type EstagioUi =
  | "novo"
  | "qualificando"
  | "proposta"
  | "negociacao"
  | "fechado_ganho"
  | "fechado_perdido";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento: string;
  valor_credito: number;
  observacao: string | null;     // histórico concatenado
  score: number;                 // 1..5
  estagio: string | null;        // texto legado ("Novo", "Qualificação", ...)
  stage?: EstagioUi | null;      // enum novo (minúsculo)
  expected_close_at: string | null;
  created_at: string;
};

// ---------------- Constantes ----------------
const segmentos = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

// ---------------- Helpers ----------------
function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}

// ui → banco (texto do CHECK + enum)
function mapUiEstagioToDb(estagioUi: EstagioUi) {
  switch (estagioUi) {
    case "novo":
      return { estagioText: "Novo", stageEnum: "novo" as const };
    case "qualificando":
      return { estagioText: "Qualificação", stageEnum: "qualificando" as const };
    case "proposta":
      return { estagioText: "Proposta", stageEnum: "proposta" as const };
    case "negociacao":
      return { estagioText: "Negociação", stageEnum: "negociacao" as const };
    case "fechado_ganho":
      return { estagioText: "Convertido", stageEnum: "fechado_ganho" as const };
    case "fechado_perdido":
      return { estagioText: "Perdido", stageEnum: "fechado_perdido" as const };
    default:
      return { estagioText: "Novo", stageEnum: "novo" as const };
  }
}

// banco → ui (se vier só o legado `estagio`)
function inferUiStage(o: Oportunidade): EstagioUi {
  if (o.stage) return o.stage as EstagioUi;
  const e = (o.estagio || "").toLowerCase();
  if (e === "novo") return "novo";
  if (e === "qualificação" || e === "qualificacao" || e === "qualificando")
    return "qualificando";
  if (e === "proposta") return "proposta";
  if (e === "negociação" || e === "negociacao") return "negociacao";
  if (e === "convertido") return "fechado_ganho";
  if (e === "perdido") return "fechado_perdido";
  return "novo";
}

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);
}

function starStr(n: number) {
  const s = Math.max(1, Math.min(5, Number(n) || 1));
  return "★".repeat(s);
}

function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------------- Página ----------------
export default function Oportunidades() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string>("all");

  // formulário
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(3);
  const [estagio, setEstagio] = useState<EstagioUi>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");

  const [loading, setLoading] = useState(false);

  // dados do usuário logado (para carimbar observações)
  const [meNome, setMeNome] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getUser();
      const sub = session.user?.id;
      if (sub) {
        const { data: u } = await supabase
          .from("users")
          .select("nome")
          .eq("auth_user_id", sub)
          .maybeSingle();
        setMeNome(u?.nome || session.user?.email || "Usuário");
      }
    })();
  }, []);

  // Carrega listas
  useEffect(() => {
    (async () => {
      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, owner_id")
        .order("created_at", { ascending: false });
      setLeads(l || []);

      const { data: v } = await supabase.rpc("listar_vendedores");
      setVendedores((v || []) as Vendedor[]);

      const { data: o } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, segmento, valor_credito, observacao, score, estagio, stage, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  const filtradas = useMemo(
    () =>
      lista.filter((o) =>
        filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor
      ),
    [lista, filtroVendedor]
  );

  // -------- Criar Oportunidade --------
  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    const { estagioText, stageEnum } = mapUiEstagioToDb(estagio);

    setLoading(true);
    const { data, error } = await supabase
      .from("opportunities")
      .insert([
        {
          lead_id: leadId,
          vendedor_id: vendId,
          owner_id: vendId,
          segmento,
          valor_credito: valorNum,
          observacao: obs ? `${todayIso()} ${meNome ?? ""}: ${obs}` : null,
          score,
          estagio: estagioText,
          stage: stageEnum,
          expected_close_at: expectedDate || null,
        },
      ])
      .select()
      .single();
    setLoading(false);

    if (error) {
      console.error(error);
      alert("Erro ao criar oportunidade: " + error.message);
      return;
    }

    setLista((s) => [data as Oportunidade, ...s]);

    // limpa form
    setLeadId("");
    setVendId("");
    setSegmento("Automóvel");
    setValor("");
    setObs("");
    setScore(3);
    setEstagio("novo");
    setExpectedDate("");
    alert("Oportunidade criada!");
  }

  // -------- Tratar Lead (editar) --------
  const [editing, setEditing] = useState<{
    id: string;
    segmento: string;
    valor_credito: string;
    score: number;
    estagioUi: EstagioUi;
    expected_close_at: string | "";
    historico: string;
    novaObs: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  function openEditar(o: Oportunidade) {
    setEditing({
      id: o.id,
      segmento: o.segmento,
      valor_credito: String(o.valor_credito ?? ""),
      score: Number(o.score || 1),
      estagioUi: inferUiStage(o),
      expected_close_at: o.expected_close_at || "",
      historico: o.observacao || "",
      novaObs: "",
    });
  }

  function closeEditar() {
    setEditing(null);
  }

  async function salvarEditar() {
    if (!editing) return;
    setSaving(true);

    try {
      // 1) atualiza campos gerais + observação (acrescenta no topo)
      const novaObsFinal = editing.novaObs?.trim()
        ? `${todayIso()} ${meNome ?? ""}: ${editing.novaObs.trim()}\n\n${editing.historico || ""}`
        : editing.historico || null;

      const valorNum = moedaParaNumeroBR(editing.valor_credito);
      const update = {
        segmento: editing.segmento,
        valor_credito: valorNum || null,
        score: Number(editing.score) || 1,
        expected_close_at: editing.expected_close_at || null,
        observacao: novaObsFinal,
      };

      const { error: upErr } = await supabase
        .from("opportunities")
        .update(update)
        .eq("id", editing.id);

      if (upErr) throw upErr;

      // 2) estágio via RPC (garante carimbo/validações da função)
      const { stageEnum } = mapUiEstagioToDb(editing.estagioUi);
      const { error: stErr } = await supabase.rpc("update_opportunity_stage", {
        p_id: editing.id,
        p_new_stage: stageEnum,
        p_reason: null,
      });
      if (stErr) throw stErr;

      // 3) recarrega lista (simples e robusto)
      const { data: o2, error: reloadErr } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, segmento, valor_credito, observacao, score, estagio, stage, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      if (reloadErr) throw reloadErr;

      setLista((o2 || []) as Oportunidade[]);
      closeEditar();
      alert("Oportunidade atualizada!");
    } catch (e: any) {
      console.error(e);
      alert("Falha ao salvar: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // -------- UI --------
  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      <h2 style={{ marginBottom: 12 }}>Oportunidades</h2>

      {/* KPIs */}
      <div style={{ marginBottom: 16 }}>
        <DashboardKpis />
      </div>

      {/* Kanban */}
      <div style={{ marginBottom: 16 }}>
        <KanbanBoard items={lista as any} onChanged={(updated) => setLista(updated as any)} />
      </div>

      {/* Filtro por vendedor */}
      <div style={card}>
        <label style={label}>Filtrar por vendedor</label>
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          style={input}
        >
          <option value="all">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.auth_user_id} value={v.auth_user_id}>
              {v.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Formulário de criação */}
      <div style={card}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>Nova oportunidade</h3>

        <div style={grid3}>
          <div>
            <label style={label}>Selecione um Lead</label>
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={input}>
              <option value="">Selecione um Lead</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
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
            <label style={label}>Valor do Crédito (R$)</label>
            <input
              placeholder="ex.: 80.000,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              style={input}
            />
          </div>

          <div>
            <label style={label}>Observações (opcional)</label>
            <input
              placeholder="Observação inicial"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              style={input}
            />
          </div>

          <div>
            <label style={label}>Probabilidade de fechamento</label>
            <select value={String(score)} onChange={(e) => setScore(Number(e.target.value))} style={input}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {starStr(n)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Estágio</label>
            <select value={estagio} onChange={(e) => setEstagio(e.target.value as EstagioUi)} style={input}>
              <option value="novo">Novo</option>
              <option value="qualificando">Qualificando</option>
              <option value="proposta">Proposta</option>
              <option value="negociacao">Negociação</option>
              <option value="fechado_ganho">Fechado (Ganho)</option>
              <option value="fechado_perdido">Fechado (Perdido)</option>
            </select>
          </div>

          <div>
            <label style={label}>Data prevista para fechamento</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              style={input}
            />
          </div>

          <div style={{ gridColumn: "1 / span 3" }}>
            <button onClick={criarOportunidade} disabled={loading} style={btnPrimaryFull}>
              {loading ? "Criando..." : "Criar oportunidade"}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de oportunidades (voltou!) */}
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
              {filtradas.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{leads.find((l) => l.id === o.lead_id)?.nome || "-"}</td>
                  <td style={td}>{vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-"}</td>
                  <td style={td}>{o.segmento}</td>
                  <td style={td}>{formatBRL(o.valor_credito)}</td>
                  <td style={td}>{starStr(o.score)}</td>
                  <td style={td}>{o.estagio || inferUiStage(o)}</td>
                  <td style={td}>
                    {o.expected_close_at
                      ? new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  <td style={td}>
                    <button onClick={() => openEditar(o)} style={btnPrimary}>
                      Tratar Lead
                    </button>
                  </td>
                </tr>
              ))}
              {!filtradas.length && (
                <tr>
                  <td style={td} colSpan={8}>Nenhuma oportunidade encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tratar Lead */}
      {editing && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Tratar Lead</h3>

            <div style={grid3}>
              <div>
                <label style={label}>Segmento</label>
                <select
                  value={editing.segmento}
                  onChange={(e) => setEditing((s) => s && { ...s, segmento: e.target.value })}
                  style={input}
                >
                  {segmentos.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Valor do crédito (R$)</label>
                <input
                  value={editing.valor_credito}
                  onChange={(e) => setEditing((s) => s && { ...s, valor_credito: e.target.value })}
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Probabilidade</label>
                <select
                  value={String(editing.score)}
                  onChange={(e) => setEditing((s) => s && { ...s, score: Number(e.target.value) })}
                  style={input}
                >
                  {[1,2,3,4,5].map((n) => (
                    <option key={n} value={n}>{starStr(n)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Estágio</label>
                <select
                  value={editing.estagioUi}
                  onChange={(e) => setEditing((s) => s && { ...s, estagioUi: e.target.value as EstagioUi })}
                  style={input}
                >
                  <option value="novo">Novo</option>
                  <option value="qualificando">Qualificando</option>
                  <option value="proposta">Proposta</option>
                  <option value="negociacao">Negociação</option>
                  <option value="fechado_ganho">Fechado (Ganho)</option>
                  <option value="fechado_perdido">Fechado (Perdido)</option>
                </select>
              </div>

              <div>
                <label style={label}>Data prevista</label>
                <input
                  type="date"
                  value={editing.expected_close_at || ""}
                  onChange={(e) => setEditing((s) => s && { ...s, expected_close_at: e.target.value })}
                  style={input}
                />
              </div>

              <div style={{ gridColumn: "1 / span 3" }}>
                <label style={label}>Histórico de observações</label>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    minHeight: 120,
                    maxHeight: 220,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    background: "#f8fafc",
                  }}
                >
                  {editing.historico || "(vazio)"}
                </div>
              </div>

              <div style={{ gridColumn: "1 / span 3" }}>
                <label style={label}>Nova observação</label>
                <textarea
                  value={editing.novaObs}
                  onChange={(e) => setEditing((s) => s && { ...s, novaObs: e.target.value })}
                  style={{ ...input, minHeight: 84, resize: "vertical" }}
                />
              </div>

              <div style={{ gridColumn: "1 / span 3", display: "flex", gap: 8 }}>
                <button onClick={salvarEditar} disabled={saving} style={btnPrimary}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
                <button onClick={closeEditar} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- estilos ----------------
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  padding: 16,
  marginBottom: 16,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
  alignItems: "start",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#334155",
  marginBottom: 6,
  fontWeight: 600,
};

const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  width: "100%",
  background: "#fff",
};

const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };

const btnPrimaryFull: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  cursor: "pointer",
  fontWeight: 800,
  width: "100%",
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
  background: "rgba(0,0,0,.3)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};

const modalCard: React.CSSProperties = {
  width: "min(980px, 92vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
