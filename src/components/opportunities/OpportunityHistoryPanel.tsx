import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HistoryOpportunity = {
  id: string;
  codigo: string;
  segmento?: string | null;
  valor_credito?: number | null;
  estagio?: string | null;
  created_at: string;
  updated_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  lost_details?: string | null;
  lost_destination?: string | null;
  last_follow_up_at?: string | null;
  next_follow_up_at?: string | null;
};

type HistoryNote = {
  id: string;
  opportunity_id: string;
  note: string;
  kind: string;
  created_at: string;
};

type HistorySimulation = {
  id: string;
  code?: number | null;
  admin_id?: string | null;
  grupo?: string | null;
  segmento?: string | null;
  credito?: number | null;
  created_at?: string | null;
};

type AdminRow = { id: string; name: string };

const C = {
  navy: "#1E293F",
  red: "#A11C27",
  gold: "#B5A573",
  slate: "#64748b",
  ok: "#0f766e",
  warn: "#b45309",
  border: "rgba(30,41,63,.10)",
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const money = (value?: number | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const stageOrder = [
  "Novo",
  "Contato em Andamento",
  "Qualificação e Diagnóstico",
  "Proposta Apresentada",
  "Negociação e Follow-up",
  "Fechamento e Documentação",
];

function outcome(op: HistoryOpportunity) {
  const stage = normalizeText(op.estagio);
  if (stage.includes("ganho")) return { label: "Ganho", color: C.ok };
  if (stage.includes("perdido")) return { label: "Perdido", color: C.red };
  return { label: op.estagio || "Em aberto", color: C.warn };
}

function highestStage(op: HistoryOpportunity, notes: HistoryNote[]) {
  let best = -1;
  const consider = (text?: string | null) => {
    const value = normalizeText(text);
    stageOrder.forEach((stage, index) => {
      if (value.includes(normalizeText(stage))) best = Math.max(best, index);
    });
  };
  consider(op.estagio);
  notes.filter((note) => normalizeText(note.kind) === "stage").forEach((note) => consider(note.note));
  return best >= 0 ? stageOrder[best] : "Não identificado";
}

export default function OpportunityHistoryPanel({
  leadId,
  currentOpportunityId,
}: {
  leadId: string;
  currentOpportunityId: string;
}) {
  const [opportunities, setOpportunities] = useState<HistoryOpportunity[]>([]);
  const [notes, setNotes] = useState<HistoryNote[]>([]);
  const [simulations, setSimulations] = useState<HistorySimulation[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [openId, setOpenId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const oppRes = await supabase
          .from("opportunities")
          .select(
            "id,codigo,segmento,valor_credito,estagio,created_at,updated_at,won_at,lost_at,lost_reason,lost_details,lost_destination,last_follow_up_at,next_follow_up_at",
          )
          .eq("lead_id", leadId)
          .order("created_at", { ascending: true });
        if (oppRes.error) throw oppRes.error;
        const rows = (oppRes.data || []) as HistoryOpportunity[];
        const ids = rows.map((row) => row.id);

        const [notesRes, simsRes] = await Promise.all([
          ids.length
            ? supabase
                .from("opportunity_notes")
                .select("id,opportunity_id,note,kind,created_at")
                .in("opportunity_id", ids)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("sim_simulations")
            .select("id,code,admin_id,grupo,segmento,credito,created_at")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false }),
        ]);
        if (notesRes.error) throw notesRes.error;
        if (simsRes.error) throw simsRes.error;

        const simRows = (simsRes.data || []) as HistorySimulation[];
        const adminIds = Array.from(
          new Set(simRows.map((sim) => sim.admin_id).filter(Boolean) as string[]),
        );
        let adminRows: AdminRow[] = [];
        if (adminIds.length) {
          const adminRes = await supabase
            .from("sim_admins")
            .select("id,name")
            .in("id", adminIds);
          if (!adminRes.error) adminRows = (adminRes.data || []) as AdminRow[];
        }

        if (!active) return;
        setOpportunities(rows);
        setNotes((notesRes.data || []) as HistoryNote[]);
        setSimulations(simRows);
        setAdmins(adminRows);
      } catch (err: any) {
        if (active) setError(err?.message || "Não foi possível carregar o histórico.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [leadId, currentOpportunityId]);

  const previous = useMemo(
    () =>
      opportunities
        .filter((op) => op.id !== currentOpportunityId)
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [opportunities, currentOpportunityId],
  );

  const noteMap = useMemo(() => {
    const map = new Map<string, HistoryNote[]>();
    for (const note of notes) map.set(note.opportunity_id, [...(map.get(note.opportunity_id) || []), note]);
    return map;
  }, [notes]);

  const adminMap = useMemo(() => new Map(admins.map((admin) => [admin.id, admin.name])), [admins]);

  function simulationsFor(op: HistoryOpportunity) {
    const ordered = opportunities.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const index = ordered.findIndex((item) => item.id === op.id);
    const start = new Date(op.created_at).getTime();
    const end = index >= 0 && ordered[index + 1] ? new Date(ordered[index + 1].created_at).getTime() : Number.POSITIVE_INFINITY;
    return simulations.filter((sim) => {
      if (!sim.created_at) return false;
      const at = new Date(sim.created_at).getTime();
      return at >= start && at < end;
    });
  }

  return (
    <>
      <h3 style={{ margin: "2px 0 4px", color: C.navy, fontSize: 16, fontWeight: 800 }}>Histórico</h3>
      <p style={{ margin: "0 0 10px", color: C.slate, fontSize: 12, lineHeight: 1.45 }}>
        Oportunidades anteriores deste lead, com desfecho, evolução no pipeline, follow-ups, anotações e simulações.
      </p>

      {loading && <div style={{ color: C.slate, fontSize: 12 }}>Carregando histórico…</div>}
      {!loading && error && <div style={{ color: C.red, fontSize: 12 }}>{error}</div>}
      {!loading && !error && previous.length === 0 && (
        <div style={{ color: C.slate, fontSize: 12 }}>Este lead ainda não possui oportunidades anteriores.</div>
      )}

      {!loading && !error && previous.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {previous.map((op) => {
            const opNotes = noteMap.get(op.id) || [];
            const opSims = simulationsFor(op);
            const result = outcome(op);
            const isOpen = openId === op.id;
            return (
              <div key={op.id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? "" : op.id)}
                  style={{ width: "100%", border: 0, background: "transparent", padding: 11, cursor: "pointer", textAlign: "left", display: "grid", gap: 7 }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ color: C.navy, fontSize: 13 }}>{op.codigo}</strong>
                    <span style={{ borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, background: `${result.color}18`, color: result.color }}>{result.label}</span>
                  </div>
                  <div style={{ color: C.slate, fontSize: 11 }}>
                    {dateTime(op.created_at)} • {op.segmento || "Sem segmento"} • {money(op.valor_credito)}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: 11, display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                      <div><small style={{ color: C.slate }}>Maior fase atingida</small><div style={{ color: C.navy, fontWeight: 800, fontSize: 12 }}>{highestStage(op, opNotes)}</div></div>
                      <div><small style={{ color: C.slate }}>Encerramento</small><div style={{ color: C.navy, fontWeight: 800, fontSize: 12 }}>{dateTime(op.won_at || op.lost_at || op.updated_at)}</div></div>
                      <div><small style={{ color: C.slate }}>Follow-ups registrados</small><div style={{ color: C.navy, fontWeight: 800, fontSize: 12 }}>{opNotes.filter((note) => normalizeText(note.kind).includes("follow")).length}</div></div>
                      <div><small style={{ color: C.slate }}>Simulações do período</small><div style={{ color: C.navy, fontWeight: 800, fontSize: 12 }}>{opSims.length}</div></div>
                    </div>

                    {normalizeText(op.estagio).includes("perdido") && (op.lost_reason || op.lost_details) && (
                      <div style={{ background: "rgba(161,28,39,.05)", borderRadius: 10, padding: 9, fontSize: 11, color: C.navy }}>
                        <strong>Motivo da perda:</strong> {op.lost_reason || "Não informado"}{op.lost_details ? ` • ${op.lost_details}` : ""}
                      </div>
                    )}

                    <div>
                      <strong style={{ display: "block", color: C.navy, fontSize: 12, marginBottom: 6 }}>Follow-ups e anotações</strong>
                      <div style={{ display: "grid", gap: 6, maxHeight: 190, overflow: "auto" }}>
                        {opNotes.map((note) => (
                          <div key={note.id} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: 8, fontSize: 11 }}>
                            <div style={{ color: C.slate }}>{dateTime(note.created_at)} • {note.kind}</div>
                            <div style={{ color: C.navy, lineHeight: 1.45 }}>{note.note}</div>
                          </div>
                        ))}
                        {!opNotes.length && <span style={{ color: C.slate, fontSize: 11 }}>Sem registros nesta oportunidade.</span>}
                      </div>
                    </div>

                    <div>
                      <strong style={{ display: "block", color: C.navy, fontSize: 12, marginBottom: 6 }}>Simulações realizadas</strong>
                      <div style={{ display: "grid", gap: 6 }}>
                        {opSims.map((sim) => (
                          <div key={sim.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", border: `1px solid ${C.border}`, borderRadius: 9, padding: 8, fontSize: 11 }}>
                            <span style={{ color: C.navy, fontWeight: 700 }}>
                              {sim.code ? `#${sim.code}` : "Simulação"} • {sim.admin_id ? adminMap.get(sim.admin_id) || "Consórcio" : "Consórcio"} {sim.grupo ? `• Grupo ${sim.grupo}` : ""}
                            </span>
                            <span style={{ color: C.slate }}>{money(sim.credito)} • {dateTime(sim.created_at)}</span>
                          </div>
                        ))}
                        {!opSims.length && <span style={{ color: C.slate, fontSize: 11 }}>Sem simulações neste período.</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
