// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DashboardKpis from "../components/DashboardKpis";
import KanbanBoard, { DbStage, KanbanItem } from "../components/KanbanBoard";

type Lead = {
  id: string;
  nome: string;
  owner_id: string;
};

type Vendedor = {
  auth_user_id: string;
  nome: string;
};

type EstagioTxt =
  | "Novo"
  | "Qualificação"
  | "Proposta"
  | "Negociação"
  | "Convertido"
  | "Perdido";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  owner_id?: string | null;
  segmento: string | null;
  valor_credito: number | null;
  observacao: string | null;
  score: number; // 1..5
  // colunas
  stage?: DbStage | null;   // enum novo
  estagio?: EstagioTxt | null; // legado em texto
  expected_close_at: string | null; // yyyy-mm-dd
  created_at: string;
};

const segmentos = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

// aceita "12.345,67" ou "12345.67" e retorna Number
function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}

function toLegacyText(stage: EstagioTxt | DbStage): EstagioTxt {
  const s = String(stage).toLowerCase();
  switch (s) {
    case "novo":
      return "Novo";
    case "qualificação":
    case "qualificacao":
    case "qualificando":
      return "Qualificação";
    case "proposta":
      return "Proposta";
    case "negociação":
    case "negociacao":
      return "Negociação";
    case "convertido":
    case "fechado_ganho":
      return "Convertido";
    case "perdido":
    case "fechado_perdido":
      return "Perdido";
    default:
      return "Novo";
  }
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
  const [estagio, setEstagio] = useState<EstagioTxt>("Novo");
  const [expectedDate, setExpectedDate] = useState<string>(""); // yyyy-mm-dd
  const [loading, setLoading] = useState(false);

  async function carregarTudo() {
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

    // Oportunidades — traga as duas colunas (stage e estagio) para compat.
    const { data: o, error: oErr } = await supabase
      .from("opportunities")
      .select(
        "id, lead_id, vendedor_id, owner_id, segmento, valor_credito, observacao, score, stage, estagio, expected_close_at, created_at"
      )
      .order("created_at", { ascending: false });
    if (oErr) {
      console.error(oErr);
      alert("Erro ao carregar oportunidades: " + oErr.message);
    } else {
      setLista((o || []) as Oportunidade[]);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  const ativos = useMemo(
    () =>
      lista
        .filter(
          (o) => toLegacyText(o.stage || (o.estagio as any) || "Novo") !== "Convertido" &&
                 toLegacyText(o.stage || (o.estagio as any) || "Novo") !== "Perdido"
        )
        .filter((o) => (filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor)),
    [lista, filtroVendedor]
  );

  async function criarOportunidade() {
    if (!leadId) return alert("Selecione um Lead.");
    if (!vendId) return alert("Selecione um Vendedor.");
    const valorNum = moedaParaNumeroBR(valor);
    if (!valorNum || valorNum <= 0) return alert("Informe o valor do crédito.");

    // guarda em enum (stage) e também no texto legado (estagio)
    const newStage: DbStage =
      estagio === "Novo"
        ? "novo"
        : estagio === "Qualificação"
        ? "qualificando"
        : estagio === "Proposta"
        ? "proposta"
        : estagio === "Negociação"
        ? "negociacao"
        : estagio === "Convertido"
        ? "fechado_ganho"
        : "fechado_perdido";

    setLoading(true);
    const { data, error } = await supabase
      .from("opportunities")
      .insert([
        {
          lead_id: leadId,
          vendedor_id: vendId,
          owner_id: vendId, // importante para passar nas RLS/policies
          segmento,
          valor_credito: valorNum,
          observacao: obs || null,
          score,
          stage: newStage,
          estagio, // mantém legado
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

  // itens para o kanban
  const kanbanItems: KanbanItem[] = useMemo(
    () =>
      lista.map((o) => ({
        id: o.id,
        stage: o.stage || null,
        estagio: (o.estagio as any) || null,
        lead_id: o.lead_id,
        vendedor_id: o.vendedor_id,
        valor_credito: o.valor_credito,
        segmento: o.segmento || undefined,
      })),
    [lista]
  );

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
          items={kanbanItems}
          onChanged={(updated) => {
            // atualiza só visualmente; se você quiser refetch, chame carregarTudo()
            const map = new Map(updated.map((u) => [u.id, u]));
            setLista((prev) =>
              prev.map((p) => {
                const u = map.get(p.id);
                return u ? { ...p, stage: u.stage ?? p.stage } : p;
              })
            );
          }}
        />
      </div>

      {/* Formulário de criação */}
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
            onChange={(e) => setEstagio(e.target.value as EstagioTxt)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {["Novo", "Qualificação", "Proposta", "Negociação", "Convertido", "Perdido"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

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

      {/* Lista simples (opcional) */}
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
                  <td style={td}>{o.segmento || "-"}</td>
                  <td style={td}>
                    {o.valor_credito
                      ? new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(o.valor_credito)
                      : "-"}
                  </td>
                  <td style={td}>{"★".repeat(o.score || 0)}</td>
                  <td style={td}>{toLegacyText(o.stage || (o.estagio as any) || "Novo")}</td>
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

const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };
