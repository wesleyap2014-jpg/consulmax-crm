// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import KanbanBoard from "@/components/KanbanBoard";

// tipos
type Lead = { id: string; nome: string };
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
  score: number;
  estagio: string | null;
  stage?: EstagioUi | null;
  expected_close_at: string | null;
  created_at: string;
};

// helpers
function inferUiStage(o: Oportunidade): EstagioUi {
  if (o.stage) return o.stage as EstagioUi;
  const e = (o.estagio || "").toLowerCase();
  if (e.includes("novo")) return "novo";
  if (e.includes("qual")) return "qualificando";
  if (e.includes("prop")) return "proposta";
  if (e.includes("negoc")) return "negociacao";
  if (e.includes("ganho") || e.includes("convertido")) return "fechado_ganho";
  if (e.includes("perdido")) return "fechado_perdido";
  return "novo";
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// cards de estágios principais (sem fechados)
const STAGES: { id: EstagioUi; title: string }[] = [
  { id: "novo", title: "Novo" },
  { id: "qualificando", title: "Qualificando" },
  { id: "proposta", title: "Proposta" },
  { id: "negociacao", title: "Negociação" },
];

export default function Oportunidades() {
  const [lista, setLista] = useState<Oportunidade[]>([]);

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase
        .from("opportunities")
        .select("id, lead_id, vendedor_id, segmento, valor_credito, score, estagio, stage, expected_close_at, created_at")
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);
    })();
  }, []);

  // separa abertas e fechadas
  const abertas = useMemo(() => lista.filter(o => {
    const s = inferUiStage(o);
    return s !== "fechado_ganho" && s !== "fechado_perdido";
  }), [lista]);

  const fechadas = useMemo(() => lista.filter(o => {
    const s = inferUiStage(o);
    return s === "fechado_ganho" || s === "fechado_perdido";
  }), [lista]);

  // soma qtd + valor por estágio
  const resumo = useMemo(() => {
    const m: Record<EstagioUi, { qtd: number; total: number }> = {
      novo: { qtd: 0, total: 0 },
      qualificando: { qtd: 0, total: 0 },
      proposta: { qtd: 0, total: 0 },
      negociacao: { qtd: 0, total: 0 },
      fechado_ganho: { qtd: 0, total: 0 },
      fechado_perdido: { qtd: 0, total: 0 },
    };
    for (const o of lista) {
      const s = inferUiStage(o);
      m[s].qtd++;
      m[s].total += o.valor_credito || 0;
    }
    return m;
  }, [lista]);

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px", fontFamily: "Inter, system-ui, Arial" }}>
      <h2 style={{ marginBottom: 16 }}>Oportunidades</h2>

      {/* Kanban principal */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginBottom: 32 }}>
        {STAGES.map(col => (
          <div
            key={col.id}
            style={{
              minWidth: 240,
              background: "#fff",
              borderRadius: 12,
              padding: 12,
              boxShadow: "0 2px 12px rgba(0,0,0,.06)"
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{col.title}</h3>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Qtd: {resumo[col.id].qtd} <br />
              Valor: {formatBRL(resumo[col.id].total)}
            </div>
            <KanbanBoard
              items={abertas.filter(o => inferUiStage(o) === col.id)}
              onChanged={(upd) => setLista(upd as any)}
            />
          </div>
        ))}
      </div>

      {/* Quadro de Fechadas */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Oportunidades Fechadas</h3>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, background: "#f8fafc", borderRadius: 12, padding: 12 }}>
            <h4 style={{ margin: "0 0 8px" }}>Ganhos</h4>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Qtd: {resumo.fechado_ganho.qtd} <br />
              Valor: {formatBRL(resumo.fechado_ganho.total)}
            </div>
            {fechadas.filter(o => inferUiStage(o) === "fechado_ganho").map(o => (
              <div key={o.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                {o.segmento} — {formatBRL(o.valor_credito)}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, background: "#f8fafc", borderRadius: 12, padding: 12 }}>
            <h4 style={{ margin: "0 0 8px" }}>Perdidos</h4>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Qtd: {resumo.fechado_perdido.qtd} <br />
              Valor: {formatBRL(resumo.fechado_perdido.total)}
            </div>
            {fechadas.filter(o => inferUiStage(o) === "fechado_perdido").map(o => (
              <div key={o.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                {o.segmento} — {formatBRL(o.valor_credito)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
