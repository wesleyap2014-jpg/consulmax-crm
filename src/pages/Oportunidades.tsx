// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Tipos */
type Lead = { id: string; nome: string; telefone?: string | null };
type Vendedor = { auth_user_id: string; nome: string };
type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;
  estagio: string;
  expected_close_at: string | null;
  created_at: string;
};
type KpiRow = { stage: string; qtd: number; total: number };
type AuditRow = {
  id: number;
  opportunity_id: string;
  changed_at: string;
  changed_by: string;
  old_data: Record<string, any>;
  new_data: Record<string, any>;
  user_name?: string;
};

/* Helpers */
function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

/* Página */
export default function Oportunidades() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Oportunidade | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<AuditRow[]>([]);

  /* Carregar dados */
  useEffect(() => {
    (async () => {
      const { data: l } = await supabase.from("leads").select("id, nome, telefone");
      setLeads(l || []);

      const { data: v } = await supabase.rpc("listar_vendedores");
      setVendedores((v || []) as Vendedor[]);

      const { data: o } = await supabase
        .from("opportunities")
        .select(
          "id, lead_id, vendedor_id, segmento, valor_credito, observacao, score, estagio, expected_close_at, created_at"
        )
        .order("created_at", { ascending: false });
      setLista((o || []) as Oportunidade[]);

      const { data: k } = await supabase.from("vw_opportunities_kpi").select("*");
      setKpis((k || []) as KpiRow[]);
    })();
  }, []);

  /* Filtro busca */
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((o) => {
      const lead = leads.find((l) => l.id === o.lead_id);
      const vend = vendedores.find((v) => v.auth_user_id === o.vendedor_id);
      return (
        lead?.nome?.toLowerCase().includes(q) ||
        vend?.nome?.toLowerCase().includes(q) ||
        o.estagio.toLowerCase().includes(q) ||
        (lead?.telefone || "").includes(q)
      );
    });
  }, [lista, leads, vendedores, search]);

  /* Abrir histórico */
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

    if (rows.length) {
      const ids = [...new Set(rows.map((r) => r.changed_by))];
      if (ids.length) {
        const { data: us } = await supabase
          .from("users")
          .select("auth_user_id, nome")
          .in("auth_user_id", ids);
        const map = new Map(us?.map((u) => [u.auth_user_id, u.nome]));
        rows.forEach((r) => {
          r.user_name = map.get(r.changed_by) || r.changed_by;
        });
      }
    }

    setHistoryData(rows);
    setHistoryOpen(true);
  }

  /* Modal Histórico */
  const ModalHistorico = () =>
    historyOpen && (
      <div style={modalBackdrop}>
        <div style={modalCard}>
          <h3>Histórico de alterações</h3>
          <div style={{ maxHeight: 400, overflowY: "auto", marginTop: 8 }}>
            {historyData.map((h) => {
              const diffs: string[] = [];
              for (const key of Object.keys(h.new_data || {})) {
                if (JSON.stringify(h.old_data?.[key]) !== JSON.stringify(h.new_data?.[key])) {
                  diffs.push(`${key}: ${h.old_data?.[key] ?? "—"} → ${h.new_data?.[key] ?? "—"}`);
                }
              }
              return (
                <div key={h.id} style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                    {fmtDate(h.changed_at)} — <b>{h.user_name}</b>
                  </div>
                  <ul style={{ margin: "0 0 8px 16px", fontSize: 14 }}>
                    {diffs.length ? diffs.map((d, i) => <li key={i}>{d}</li>) : <li>(sem alterações relevantes)</li>}
                  </ul>
                </div>
              );
            })}
            {!historyData.length && <div>(Nenhum histórico encontrado)</div>}
          </div>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button onClick={() => setHistoryOpen(false)} style={btnGhost}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    );

  /* Cards KPI */
  const CardsKPI = () => (
    <div style={{ marginBottom: 16 }}>
      <div style={sectionTitle}>Pipeline por estágio</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 16 }}>
        {kpis.map((k, idx) => (
          <div key={idx} style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{k.stage}</div>
            <div>Qtd: {k.qtd}</div>
            <div>Valor: {fmtBRL(k.total)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  /* Lista Oportunidades */
  const ListaOportunidades = () => {
    const rows = visiveis.filter(
      (o) => !["Fechado (Ganho)", "Fechado (Perdido)"].includes(o.estagio)
    );
    return (
      <div style={card}>
        <h3>Oportunidades</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Lead</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Segmento</th>
                <th style={th}>Valor</th>
                <th style={th}>Score</th>
                <th style={th}>Estágio</th>
                <th style={th}>Previsão</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{leads.find((l) => l.id === o.lead_id)?.nome || "-"}</td>
                  <td style={td}>{vendedores.find((v) => v.auth_user_id === o.vendedor_id)?.nome || "-"}</td>
                  <td style={td}>{o.segmento}</td>
                  <td style={td}>{fmtBRL(o.valor_credito)}</td>
                  <td style={td}>{o.score}</td>
                  <td style={td}>{o.estagio}</td>
                  <td style={td}>{o.expected_close_at || "-"}</td>
                  <td style={td}>
                    <button onClick={() => setEditing(o)} style={btnSmallPrimary}>Tratar</button>
                    <button onClick={() => openHistory(o.id)} style={btnGhost}>Histórico</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} style={td}>
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
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px" }}>
      {/* Busca */}
      <div style={{ background: "#fff", padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={input}
          placeholder="Buscar por lead, vendedor, estágio ou telefone"
        />
      </div>

      <CardsKPI />
      <ListaOportunidades />
      <ModalHistorico />
    </div>
  );
}

/* Estilos */
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, marginBottom: 10 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,.05)", padding: 12 };
const th: React.CSSProperties = { textAlign: "left", padding: 6, fontSize: 12, color: "#475569" };
const td: React.CSSProperties = { padding: 6, borderTop: "1px solid #e5e7eb" };
const input: React.CSSProperties = { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" };
const btnSmallPrimary: React.CSSProperties = { padding: "4px 8px", marginRight: 6, borderRadius: 8, background: "#A11C27", color: "#fff", border: "none", cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "4px 8px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "grid", placeItems: "center", zIndex: 50 };
const modalCard: React.CSSProperties = { width: "min(800px, 94vw)", background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 20px 40px rgba(0,0,0,.3)" };
