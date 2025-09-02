// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ------------- Tipos ------------- */
type Lead = { id: string; nome: string; owner_id: string };
type Vendedor = { auth_user_id: string; nome: string };

type StageUI =
  | "novo"
  | "qualificando"
  | "proposta"
  | "negociacao"
  | "fechado_ganho"
  | "fechado_perdido";

type EstagioDB =
  | "Novo"
  | "Qualificação"
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
  estagio: EstagioDB | string; // <- pode vir “diferente”, por isso deixei string também
  expected_close_at: string | null;
  created_at: string;
};

/** ------------- Helpers ------------- */
const segmentos = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

const uiToDB: Record<StageUI, EstagioDB> = {
  novo: "Novo",
  qualificando: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado_ganho: "Fechado (Ganho)",
  fechado_perdido: "Fechado (Perdido)",
};

const dbToUI: Partial<Record<string, StageUI>> = {
  Novo: "novo",
  Qualificação: "qualificando",
  Qualificacao: "qualificando",
  Proposta: "proposta",
  Negociação: "negociacao",
  Negociacao: "negociacao",
  "Fechado (Ganho)": "fechado_ganho",
  "Fechado (Perdido)": "fechado_perdido",
};

function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}
function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n || 0
  );
}

/** Converte rótulos/valores variados para o que o CHECK da tabela aceita */
function normalizeEstagioDB(label: string): EstagioDB {
  const v = (label || "").toLowerCase();

  if (v.includes("fechado") && v.includes("ganho")) return "Fechado (Ganho)";
  if (v.includes("fechado") && v.includes("perdido")) return "Fechado (Perdido)";

  if (v.startsWith("qualifica")) return "Qualificação";
  if (v.startsWith("proposta")) return "Proposta";
  if (v.startsWith("negocia")) return "Negociação";
  if (v.startsWith("novo")) return "Novo";

  // fallback seguro
  // (se vier um texto inesperado, prefira "Novo" para não violar o CHECK)
  return "Novo";
}

/** ------------- Página ------------- */
export default function Oportunidades() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string>("all");

  // formulário - Nova oportunidade
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // modal "Tratar Lead"
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");

  /** Carregar listas iniciais */
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
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });

      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  /** Filtro por vendedor (aplicado nas seções abaixo do filtro) */
  const visiveis = useMemo(
    () =>
      lista.filter((o) =>
        filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor
      ),
    [lista, filtroVendedor]
  );

  /** KPI por estágio — com fallback seguro */
  const kpi = useMemo(() => {
    const base: Record<StageUI, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
      fechado_ganho: { qtd: 0, total: 0 },
      fechado_perdido: { qtd: 0, total: 0 },
    };
    for (const o of lista || []) {
      const k = dbToUI[o.estagio as string] ?? "novo"; // fallback p/ valores inesperados
      base[k].qtd += 1;
      base[k].total += Number(o.valor_credito || 0);
    }
    return base;
  }, [lista]);

  /** Criar oportunidade */
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

    setLoading(true);
    const payload = {
      lead_id: leadId,
      vendedor_id: vendId,
      owner_id: vendId,
      segmento,
      valor_credito: valorNum,
      observacao: obs ? `[${new Date().toLocaleString("pt-BR")}]\n${obs}` : null,
      score,
      estagio: uiToDB[stageUI] as EstagioDB, // compatível com o CHECK
      expected_close_at: isoDate,
    };

    const { data, error } = await supabase
      .from("opportunities")
      .insert([payload])
      .select()
      .single();

    setLoading(false);

    if (error) {
      console.error(error);
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

  /** Abrir/Salvar modal Tratar Lead */
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
      score: editing.score,
      // -> aqui está o pulo do gato: normaliza para o que o CHECK aceita
      estagio: normalizeEstagioDB(String(editing.estagio)),
      expected_close_at: editing.expected_close_at,
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

  /** ------------- UI ------------- */

  // Cards KPI
  const CardsKPI = () => {
    const ORDER: { id: StageUI; label: string }[] = [
      { id: "novo", label: "Novo" },
      { id: "qualificando", label: "Qualificando" },
      { id: "proposta", label: "Proposta" },
      { id: "negociacao", label: "Negociação" },
      { id: "fechado_ganho", label: "Fechado (Ganho)" },
      { id: "fechado_perdido", label: "Fechado (Perdido)" },
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 16 }}>
        {ORDER.map(({ id, label }) => {
          const safe = kpi[id] ?? { qtd: 0, total: 0 };
          return (
            <div
              key={id}
              style={{
                background: "#fff",
                borderRadius: 14,
                boxShadow: "0 2px 10px rgba(0,0,0,.06)",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{label}</div>
              <div style={{ color: "#1f2937" }}>Qtd: {safe.qtd}</div>
              <div style={{ color: "#1f2937" }}>Valor: {fmtBRL(safe.total)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const ListaOportunidades = () => {
    const linhas = visiveis.filter(
      (o) =>
        dbToUI[o.estagio as string] !== "fechado_ganho" &&
        dbToUI[o.estagio as string] !== "fechado_perdido"
    );
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
              {linhas.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{leads.find((l) => l.id === o.lead_id)?.nome || "-"}</td>
                  <td style={td}>
                    {vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-"}
                  </td>
                  <td style={td}>{o.segmento}</td>
                  <td style={td}>{fmtBRL(o.valor_credito)}</td>
                  <td style={td}>{"★".repeat(Math.max(1, Math.min(5, o.score)))}</td>
                  <td style={td}>{String(o.estagio)}</td>
                  <td style={td}>
                    {o.expected_close_at
                      ? new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  <td style={td}>
                    <button onClick={() => openEdit(o)} style={btnPrimary}>
                      Tratar Lead
                    </button>
                  </td>
                </tr>
              ))}
              {!linhas.length && (
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

  const CardsFechadas = () => {
    const ganhos = visiveis.filter((o) => dbToUI[o.estagio as string] === "fechado_ganho");
    const perdidos = visiveis.filter((o) => dbToUI[o.estagio as string] === "fechado_perdido");
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Oportunidades Fechadas</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={subCard}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Ganhos</div>
            <div style={{ color: "#475569", marginBottom: 8 }}>
              Qtd: {ganhos.length} — Valor:{" "}
              {fmtBRL(ganhos.reduce((s, x) => s + (x.valor_credito || 0), 0))}
            </div>
            {ganhos.map((g) => (
              <div key={g.id} style={pill}>
                {g.segmento} — {fmtBRL(g.valor_credito)}
              </div>
            ))}
            {!ganhos.length && <div style={{ color: "#94a3b8" }}>(vazio)</div>}
          </div>
          <div style={subCard}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Perdidos</div>
            <div style={{ color: "#475569", marginBottom: 8 }}>
              Qtd: {perdidos.length} — Valor:{" "}
              {fmtBRL(perdidos.reduce((s, x) => s + (x.valor_credito || 0), 0))}
            </div>
            {perdidos.map((g) => (
              <div key={g.id} style={pill}>
                {g.segmento} — {fmtBRL(g.valor_credito)}
              </div>
            ))}
            {!perdidos.length && <div style={{ color: "#94a3b8" }}>(vazio)</div>}
          </div>
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
      <CardsKPI />

      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          margin: "16px 0",
        }}
      >
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

      <ListaOportunidades />
      <CardsFechadas />

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Nova oportunidade</h3>
        <div style={grid2}>
          <div>
            <label style={label}>Selecionar um Lead</label>
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
              <option value="fechado_ganho">Fechado (Ganho)</option>
              <option value="fechado_perdido">Fechado (Perdido)</option>
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

        <button
          onClick={criarOportunidade}
          disabled={loading}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            background: "#A11C27",
            color: "#fff",
            border: 0,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "Criando..." : "Criar oportunidade"}
        </button>
      </div>

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
                  onChange={(e) => setEditing({ ...editing, estagio: e.target.value })}
                  style={input}
                >
                  <option value="Novo">Novo</option>
                  <option value="Qualificação">Qualificação</option>
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
                  onChange={(e) => setEditing({ ...editing, expected_close_at: e.target.value })}
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
    </div>
  );
}

/** ------------- estilos ------------- */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  padding: 16,
  marginBottom: 16,
};
const subCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
};
const pill: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  marginBottom: 8,
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
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };
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
  width: "min(980px, 94vw)",
  background: "#fff",
  padding: 16,
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
