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

function moedaParaNumeroBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo || 0);
}
function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

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

/** ------------- Página ------------- */
export default function Oportunidades() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string>("all");

  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<string>("Automóvel");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState(1);
  const [stageUI, setStageUI] = useState<StageUI>("novo");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [newNote, setNewNote] = useState("");

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

  const visiveis = useMemo(
    () => lista.filter((o) => (filtroVendedor === "all" ? true : o.vendedor_id === filtroVendedor)),
    [lista, filtroVendedor]
  );

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
      const k = dbToUI[o.estagio as string] ?? "novo";
      base[k].qtd += 1;
      base[k].total += Number(o.valor_credito || 0);
    }
    return base;
  }, [lista]);

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

  /** ------------- UI ------------- */
  // (todo o restante da UI permanece igual, sem mudanças)

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "24px auto",
        padding: "0 16px",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {/* ...CardsKPI, ListaOportunidades, CardsFechadas, Formulário Nova oportunidade, Modal... */}
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
