// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import KanbanBoard from "@/components/KanbanBoard";

type Lead = {
  id: string;
  nome: string;
  owner_id: string;
};

type Vendedor = {
  auth_user_id: string;
  nome: string;
};

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
  observacao: string | null;
  score: number;
  estagio: string | null; // legado texto (pode existir)
  stage?: EstagioUi | null; // enum novo (se já existir no banco)
  expected_close_at: string | null;
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

// helpers
function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}
function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
function normalizeStage(o: Oportunidade): EstagioUi {
  if (o.stage) return o.stage;
  const e = (o.estagio || "").toLowerCase();
  if (e.includes("novo")) return "novo";
  if (e.includes("qual")) return "qualificando";
  if (e.includes("proposta")) return "proposta";
  if (e.includes("negoc")) return "negociacao";
  if (e.includes("ganho") || e.includes("convertido")) return "fechado_ganho";
  if (e.includes("perdido")) return "fechado_perdido";
  return "novo";
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
  const [estagio, setEstagio] = useState<EstagioUi>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");

  const [loading, setLoading] = useState(false);

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

  // dados do Kanban (somente abertas)
  const abertas = useMemo(
    () =>
      lista
        .filter((o) => {
          const s = normalizeStage(o);
          return s !== "fechado_ganho" && s !== "fechado_perdido";
        })
        .filter((o) => (filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor)),
    [lista, filtroVendedor]
  );

  // KPIs para os 6 cards
  const kpis = useMemo(() => {
    const base = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
      fechado_ganho: { qtd: 0, total: 0 },
      fechado_perdido: { qtd: 0, total: 0 },
    } as Record<EstagioUi, { qtd: number; total: number }>;

    for (const o of lista) {
      const s = normalizeStage(o);
      base[s].qtd += 1;
      base[s].total += o.valor_credito || 0;
    }
    return base;
  }, [lista]);

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
          owner_id: vendId, // compatível com RLS
          segmento,
          valor_credito: valorNum,
          observacao: obs || null,
          score,
          stage: estagio, // grave o enum moderno
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

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "24px auto",
        padding: "0 16px",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {/* CARDS DE KPI (6 colunas, como no seu modelo) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0,1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {(
          [
            ["novo", "Novo"],
            ["qualificando", "Qualificando"],
            ["proposta", "Proposta"],
            ["negociacao", "Negociação"],
            ["fechado_ganho", "Fechado (Ganho)"],
            ["fechado_perdido", "Fechado (Perdido)"],
          ] as const
        ).map(([key, label]) => (
          <div
            key={key}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 14,
              boxShadow: "0 2px 12px rgba(0,0,0,.06)",
            }}
          >
            <div style={{ fontWeight: 800, color: "#1f2937", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 13, color: "#111827" }}>
              <div>Qtd: {kpis[key as EstagioUi].qtd}</div>
              <div>Valor: {formatBRL(kpis[key as EstagioUi].total)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* FILTRO POR VENDEDOR (com rótulo, igual ao mock) */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Filtrar por vendedor</div>
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            outline: "none",
          }}
        >
          <option value="all">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.auth_user_id} value={v.auth_user_id}>
              {v.nome}
            </option>
          ))}
        </select>
      </div>

      {/* KANBAN (o mesmo de antes) */}
      <div style={{ marginBottom: 16 }}>
        <KanbanBoard items={abertas as any} onChanged={(updated) => setLista(updated as any)} />
      </div>

      {/* FORMULÁRIO DE NOVA OPORTUNIDADE */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 24,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 12 }}>Nova oportunidade</h3>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            title="Selecionar um Lead"
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
            title="Selecione um Vendedor"
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
            title="Selecione um Segmento"
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
            title="Valor do crédito"
          />

          <input
            placeholder="Observações"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            title="Observações"
          />

          <select
            value={String(score)}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            title="Probabilidade de fechamento"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>

          <select
            value={estagio}
            onChange={(e) => setEstagio(e.target.value as EstagioUi)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            title="Estágio"
          >
            <option value="novo">Novo</option>
            <option value="qualificando">Qualificando</option>
            <option value="proposta">Proposta</option>
            <option value="negociacao">Negociação</option>
            <option value="fechado_ganho">Fechado (Ganho)</option>
            <option value="fechado_perdido">Fechado (Perdido)</option>
          </select>

          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            title="Data prevista para fechamento"
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
    </div>
  );
}
