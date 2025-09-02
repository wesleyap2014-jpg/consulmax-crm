// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DashboardKpis from "../components/DashboardKpis";
import KanbanBoard from "@/components/KanbanBoard"; // <-- IMPORTE AQUI, NO TOPO

type Lead = {
  id: string;
  nome: string;
  owner_id: string;
};

type Vendedor = {
  auth_user_id: string;
  nome: string;
};

type Estagio = "Novo" | "Qualificação" | "Proposta" | "Negociação" | "Convertido" | "Perdido";

// Enum novo do banco (kanban)
type Stage =
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
  owner_id?: string;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;               // 1..5
  estagio: Estagio;            // legado (texto com acento)
  stage?: Stage;               // enum novo (pode estar nulo em registros antigos)
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
};

const segmentos = ["Automóvel", "Imóvel", "Motocicleta", "Serviços", "Pesados", "Imóvel Estendido"] as const;

// aceita "12.345,67" ou "12345.67" e retorna Number
function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}

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
  const [estagio, setEstagio] = useState<Estagio>("Novo");
  const [expectedDate, setExpectedDate] = useState<string>(""); // yyyy-mm-dd

  const [loading, setLoading] = useState(false);

  // Carrega listas
  useEffect(() => {
    (async () => {
      // Leads
      const { data: l, error: lErr } = await supabase
        .from("leads")
        .select("id, nome, owner_id")
        .order("created_at", { ascending: false });
      if (lErr) {
        console.error(lErr);
        alert("Erro ao carregar leads: " + lErr.message);
      } else {
        setLeads(l || []);
      }

      // Vendedores via RPC segura
      const { data: v, error: vErr } = await supabase.rpc("listar_vendedores");
      if (vErr) {
        console.error(vErr);
        alert("Erro ao carregar vendedores: " + vErr.message);
      } else {
        setVendedores((v || []) as Vendedor[]);
      }

      // Oportunidades (inclua 'stage' para o Kanban)
      const { data: o, error: oErr } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, estagio, stage, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      if (oErr) {
        console.error(oErr);
        alert("Erro ao carregar oportunidades: " + oErr.message);
      } else {
        setLista((o || []) as Oportunidade[]);
      }
    })();
  }, []);

  const ativos = useMemo(
    () =>
      lista
        .filter((o) => o.estagio !== "Convertido" && o.estagio !== "Perdido")
        .filter((o) => (filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor)),
    [lista, filtroVendedor]
  );

  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    setLoading(true);
    const { data, error } = await supabase
      .from("opportunities")
      .insert([
        {
          lead_id: leadId,
          vendedor_id: vendId,
          owner_id: vendId, // <<< importante para RLS
          segmento,
          valor_credito: valorNum,
          observacao: obs || null,
          score,
          estagio, // "Novo", "Qualificação", ...
          // opcional: se quiser já colocar o enum:
          // stage: "novo" as Stage,
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
    setEstagio("Novo");
    setExpectedDate("");
    alert("Oportunidade criada!");
  }

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      <h2 style={{ marginBottom: 12 }}>Oportunidades</h2>

      {/* KPIs */}
      <div style={{ marginBottom: 16 }}>
        <DashboardKpis />
      </div>

      {/* KANBAN */}
      <div style={{ marginBottom: 16 }}>
        <KanbanBoard
          items={lista as any}
          onChanged={(updated) => setLista(updated as any)}
        />
      </div>

      {/* Filtro por vendedor */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option value="all">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.auth_user_id} value={v.auth_user_id}>
              {v.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Formulário */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 12 }}>Nova oportunidade</h3>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Selecione um Lead</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>

          <select
            value={vendId}
            onChange={(e) => setVendId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Selecione um Vendedor</option>
            {vendedores.map((v) => (
              <option key={v.auth_user_id} value={v.auth_user_id}>
                {v.nome}
              </option>
            ))}
          </select>

          <select
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {segmentos.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            placeholder="Valor do crédito (R$)"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <input
            placeholder="Observação"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <select
            value={String(score)}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>

          <select
            value={estagio}
            onChange={(e) => setEstagio(e.target.value as Estagio)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {["Novo", "Qualificação", "Proposta", "Negociação", "Convertido", "Perdido"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Data prevista para fechamento */}
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            placeholder="Data prevista para fechamento"
          />

          <button
            onClick={criarOportunidade}
            disabled={loading}
            style={{
              gridColumn: "1 / span 3",
              padding: "12px 16px",
              borderRadius: 12,
              background: "#A11C27",
              color: "#fff",
              border: 0,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Criando..." : "Criar oportunidade"}
          </button>
        </div>
      </div>

      {/* Lista (continua como estava) */}
      <div style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>Oportunidades</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Lead</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Segmento</th>
                <th style={th}>Valor</th>
                <th style={th}>Score</th>
                <th style={th}>Estágio</th>
                <th style={th}>Previsão</th>
              </tr>
            </thead>
            <tbody>
              {ativos.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{leads.find((l) => l.id === o.lead_id)?.nome || "-"}</td>
                  <td style={td}>{vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-"}</td>
                  <td style={td}>{o.segmento}</td>
                  <td style={td}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.valor_credito)}
                  </td>
                  <td style={td}>{"★".repeat(o.score)}</td>
                  <td style={td}>{o.estagio}</td>
                  <td style={td}>
                    {o.expected_close_at
                      ? new Date(o.expected_close_at + "T00:00:00").toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                </tr>
              ))}
              {!ativos.length && (
                <tr>
                  <td style={td} colSpan={7}>
                    Nenhuma oportunidade encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// estilos da tabela
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };
