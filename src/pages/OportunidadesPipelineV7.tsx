// src/pages/OportunidadesPipelineV7.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import OportunidadesPipelineV7Legacy from "./OportunidadesPipelineV7Legacy";

type QualificationData = {
  objetivo: string;
  valor_parcela: string;
  prazo: string;
  lance_entrada: string;
  renda_formal: string;
  decisao_contato: string;
};

type BreakdownItem = {
  categoria: string;
  pontos: number;
  maximo: number;
  justificativa?: string;
};

type QualificationAnalysis = {
  resumo_executivo?: string;
  aderencia_consorcio?: string;
  perfil_comercial?: string;
  pontos_fortes?: string[];
  pontos_atencao?: string[];
  abordagem_recomendada?: string;
  proximo_passo?: string;
  objecoes_provaveis?: string[];
  perguntas_aprofundamento?: string[];
  segmento_sugerido?: string;
  canal_preferido?: string;
  alertas?: string[];
};

type QualificationResult = {
  score: number;
  status: string;
  breakdown: Record<string, BreakdownItem>;
  analysis: QualificationAnalysis;
  qualified_at?: string;
  analyzed_at?: string;
};

type OppLookup = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento?: string | null;
  estagio?: string | null;
  valor_credito?: number | null;
  qualification_data?: QualificationData | null;
  qualification_score?: number | null;
  qualification_status?: string | null;
  qualification_breakdown?: Record<string, BreakdownItem> | null;
  qualification_ai_analysis?: QualificationAnalysis | null;
  qualified_at?: string | null;
  qualification_analyzed_at?: string | null;
  leads?: { id: string; nome: string; telefone?: string | null } | null;
};

type UserLookup = { auth_user_id: string; nome: string };

type Question = {
  key: keyof QualificationData;
  number: number;
  title: string;
  question: string;
  helper: string;
};

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  ink: "#334155",
  slate: "#64748b",
  ok: "#0f766e",
  warn: "#b45309",
};

const EMPTY_QUALIFICATION: QualificationData = {
  objetivo: "",
  valor_parcela: "",
  prazo: "",
  lance_entrada: "",
  renda_formal: "",
  decisao_contato: "",
};

const questions: Question[] = [
  {
    key: "objetivo",
    number: 1,
    title: "Objetivo",
    question:
      "O que você quer realizar com o dinheiro do consórcio? (imóvel, carro, quitar dívidas, investir, reserva...)",
    helper: "Resolve: destino do crédito, valor aproximado e prazo.",
  },
  {
    key: "valor_parcela",
    number: 2,
    title: "Valor e parcela",
    question:
      "Quanto você precisa e qual valor de parcela cabe confortavelmente no seu orçamento hoje?",
    helper: "Junta valor aproximado + parcela em uma só.",
  },
  {
    key: "prazo",
    number: 3,
    title: "Prazo",
    question: "Você tem um prazo ideal para realizar esse objetivo?",
    helper:
      "Define urgência e se cabe consórcio ou se precisa de alternativa.",
  },
  {
    key: "lance_entrada",
    number: 4,
    title: "Lance/entrada",
    question: "Tem algum valor disponível para dar de lance ou entrada?",
    helper: "Mede força financeira e velocidade de contemplação.",
  },
  {
    key: "renda_formal",
    number: 5,
    title: "Renda formal",
    question:
      "Consegue comprovar renda de forma formal (holerite, extrato, imposto de renda)?",
    helper:
      "Faz uma validação comercial preliminar; não representa aprovação de crédito.",
  },
  {
    key: "decisao_contato",
    number: 6,
    title: "Decisão e contato",
    question:
      "Quem mais participa da decisão e como prefere receber a proposta: ligação, WhatsApp, vídeo ou presencial?",
    helper: "Junta decisores + canal de contato.",
  },
];

const breakdownLabels: Record<string, string> = {
  objetivo: "Objetivo",
  valor_parcela: "Valor × parcela",
  prazo: "Prazo",
  lance_entrada: "Lance/entrada",
  renda_formal: "Renda/comprovação",
  decisao_contato: "Decisão/canal",
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function statusLabel(status?: string | null) {
  const value = normalizeText(status);
  if (value === "quente") return "Quente";
  if (value === "morno") return "Morno";
  return "Frio";
}

function statusColor(status?: string | null) {
  const value = normalizeText(status);
  if (value === "quente") return C.red;
  if (value === "morno") return C.warn;
  return C.navy;
}

export default function OportunidadesPipelineV7() {
  const [opps, setOpps] = useState<OppLookup[]>([]);
  const [users, setUsers] = useState<UserLookup[]>([]);
  const [qualifyingOppId, setQualifyingOppId] = useState("");
  const [draft, setDraft] = useState<QualificationData>(EMPTY_QUALIFICATION);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<QualificationResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const lastTreatOppIdRef = useRef("");

  const userMap = useMemo(
    () => new Map(users.map((user) => [user.auth_user_id, user.nome])),
    [users],
  );

  const qualifyingOpp = useMemo(
    () => opps.find((op) => op.id === qualifyingOppId) || null,
    [opps, qualifyingOppId],
  );

  async function loadLookup() {
    const [opportunities, activeUsers] = await Promise.all([
      supabase
        .from("opportunities")
        .select(
          "id,lead_id,vendedor_id,segmento,estagio,valor_credito,qualification_data,qualification_score,qualification_status,qualification_breakdown,qualification_ai_analysis,qualified_at,qualification_analyzed_at,leads:lead_id(id,nome,telefone)",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("users")
        .select("auth_user_id,nome")
        .eq("is_active", true),
    ]);

    if (!opportunities.error) {
      setOpps((opportunities.data || []) as unknown as OppLookup[]);
    }
    if (!activeUsers.error) {
      setUsers((activeUsers.data || []) as UserLookup[]);
    }
  }

  useEffect(() => {
    loadLookup();
  }, []);

  function existingResult(op: OppLookup): QualificationResult | null {
    if (
      op.qualification_score === null ||
      op.qualification_score === undefined ||
      !op.qualification_breakdown ||
      !op.qualification_ai_analysis
    ) {
      return null;
    }
    return {
      score: Number(op.qualification_score || 0),
      status: op.qualification_status || "frio",
      breakdown: op.qualification_breakdown,
      analysis: op.qualification_ai_analysis,
      qualified_at: op.qualified_at || undefined,
      analyzed_at: op.qualification_analyzed_at || undefined,
    };
  }

  function openQualification(opportunityId: string) {
    const op = opps.find((item) => item.id === opportunityId);
    if (!op) {
      alert("Não consegui localizar esta oportunidade para qualificar.");
      return;
    }
    setDraft({
      ...EMPTY_QUALIFICATION,
      ...(op.qualification_data || {}),
    });
    setResult(existingResult(op));
    setAnalysisError("");
    setQualifyingOppId(opportunityId);
  }

  useEffect(() => {
    const handleCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button) return;

      const text = normalizeText(button.textContent);

      if (text === "tratar") {
        const card = button.closest('[draggable="true"]') as HTMLElement | null;
        if (!card) return;

        const leadName = normalizeText(card.querySelector("strong")?.textContent);
        const cardText = normalizeText(card.textContent);
        const candidates = opps.filter(
          (op) => normalizeText(op.leads?.nome) === leadName,
        );

        const matched =
          candidates.find((op) => {
            const segmentOk =
              !op.segmento || cardText.includes(normalizeText(op.segmento));
            const vendorName = userMap.get(op.vendedor_id);
            const vendorOk =
              !vendorName || cardText.includes(normalizeText(vendorName));
            return segmentOk && vendorOk;
          }) || candidates[0];

        if (matched) lastTreatOppIdRef.current = matched.id;
        return;
      }

      const isQualificationButton =
        button.getAttribute("data-crm-qualification-button") === "true";
      if (text !== "qualificar" || !isQualificationButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let opportunityId = lastTreatOppIdRef.current;
      if (!opportunityId) {
        const treatTitle = Array.from(document.querySelectorAll("h2")).find((node) =>
          normalizeText(node.textContent).startsWith("tratar oportunidade"),
        );
        const leadName = String(treatTitle?.textContent || "")
          .split("•")
          .slice(1)
          .join("•")
          .trim();
        const candidates = opps.filter(
          (op) => normalizeText(op.leads?.nome) === normalizeText(leadName),
        );
        if (candidates.length === 1) opportunityId = candidates[0].id;
      }

      if (!opportunityId) {
        alert("Não consegui identificar a oportunidade selecionada.");
        return;
      }
      openQualification(opportunityId);
    };

    document.addEventListener("click", handleCapture, true);
    return () => document.removeEventListener("click", handleCapture, true);
  }, [opps, userMap]);

  async function refreshBaseCard() {
    await loadLookup();
    const updateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => normalizeText(button.textContent) === "atualizar",
    ) as HTMLButtonElement | undefined;
    updateButton?.click();
  }

  async function saveAndAnalyze() {
    if (!qualifyingOpp) return;
    const unanswered = questions.filter((question) => !draft[question.key].trim());
    if (unanswered.length) {
      alert(
        `Responda as ${unanswered.length} pergunta(s) restante(s) antes de salvar a qualificação.`,
      );
      return;
    }

    try {
      setSaving(true);
      setAnalysisError("");
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão inválida ou expirada.");

      const response = await fetch("/api/oportunidades/qualification-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          opportunity_id: qualifyingOpp.id,
          answers: draft,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.result) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível concluir a análise da qualificação.";
        if (payload?.saved) {
          setAnalysisError(message);
          await refreshBaseCard();
          return;
        }
        throw new Error(message);
      }

      const next = payload.result as QualificationResult;
      setResult(next);
      setOpps((current) =>
        current.map((op) =>
          op.id === qualifyingOpp.id
            ? {
                ...op,
                qualification_data: draft,
                qualification_score: next.score,
                qualification_status: next.status,
                qualification_breakdown: next.breakdown,
                qualification_ai_analysis: next.analysis,
                qualified_at: next.qualified_at || op.qualified_at,
                qualification_analyzed_at: next.analyzed_at || op.qualification_analyzed_at,
              }
            : op,
        ),
      );
      await refreshBaseCard();
    } catch (error: any) {
      setAnalysisError(
        error?.message || "Não foi possível concluir a qualificação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <OportunidadesPipelineV7Legacy />

      {qualifyingOpp && (
        <div style={backdrop} onMouseDown={() => setQualifyingOppId("")}>
          <div style={modal} onMouseDown={(event) => event.stopPropagation()}>
            <div style={header}>
              <div>
                <div style={eyebrow}>Qualificação comercial + IA</div>
                <h2 style={title}>
                  Qualificar • {qualifyingOpp.leads?.nome || "Lead"}
                </h2>
                <p style={opening}>
                  Vou te fazer umas perguntas rápidas para entender qual consórcio
                  faz sentido para você. Prometo ser breve.
                </p>
              </div>
              <button style={closeBtn} onClick={() => setQualifyingOppId("")}>
                ×
              </button>
            </div>

            <div style={questionGrid}>
              {questions.map((question) => (
                <section key={question.key} style={questionCard}>
                  <div style={numberBadge}>{question.number}</div>
                  <div>
                    <h3 style={questionTitle}>{question.title}</h3>
                    <p style={questionText}>{question.question}</p>
                    <textarea
                      style={textarea}
                      value={draft[question.key]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [question.key]: event.target.value,
                        }))
                      }
                      placeholder="Registre a resposta do cliente..."
                    />
                    <small style={helper}>{question.helper}</small>
                  </div>
                </section>
              ))}
            </div>

            {analysisError && <div style={errorBox}>{analysisError}</div>}

            {result && (
              <section style={resultSection}>
                <div style={scoreHeader}>
                  <div>
                    <div style={resultEyebrow}>Resultado da qualificação</div>
                    <strong style={scoreValue}>{result.score}/25</strong>
                  </div>
                  <div
                    style={{
                      ...statusBadge,
                      color: statusColor(result.status),
                      background: `${statusColor(result.status)}12`,
                      borderColor: `${statusColor(result.status)}35`,
                    }}
                  >
                    {statusLabel(result.status)}
                  </div>
                </div>

                <div style={breakdownGrid}>
                  {Object.entries(result.breakdown || {}).map(([key, item]) => (
                    <div key={key} style={breakdownCard}>
                      <div style={breakdownTop}>
                        <span>{breakdownLabels[key] || key}</span>
                        <b>
                          {item.pontos}/{item.maximo}
                        </b>
                      </div>
                      {item.justificativa && (
                        <small style={breakdownReason}>{item.justificativa}</small>
                      )}
                    </div>
                  ))}
                </div>

                <div style={aiPanel}>
                  <div style={aiTitleRow}>
                    <div>
                      <div style={resultEyebrow}>Leitura da IA</div>
                      <h3 style={aiTitle}>Como conduzir este lead</h3>
                    </div>
                    {result.analysis?.aderencia_consorcio && (
                      <span style={fitPill}>
                        Aderência: {result.analysis.aderencia_consorcio}
                      </span>
                    )}
                  </div>

                  {result.analysis?.resumo_executivo && (
                    <p style={analysisSummary}>{result.analysis.resumo_executivo}</p>
                  )}

                  <div style={analysisGrid}>
                    <InfoBlock
                      title="Pontos fortes"
                      items={result.analysis?.pontos_fortes}
                    />
                    <InfoBlock
                      title="Pontos de atenção"
                      items={result.analysis?.pontos_atencao}
                    />
                  </div>

                  {(result.analysis?.abordagem_recomendada ||
                    result.analysis?.proximo_passo) && (
                    <div style={recommendationGrid}>
                      <TextBlock
                        title="Abordagem recomendada"
                        text={result.analysis?.abordagem_recomendada}
                      />
                      <TextBlock
                        title="Próximo passo"
                        text={result.analysis?.proximo_passo}
                      />
                    </div>
                  )}

                  <div style={analysisGrid}>
                    <InfoBlock
                      title="Objeções prováveis"
                      items={result.analysis?.objecoes_provaveis}
                    />
                    <InfoBlock
                      title="Perguntas para aprofundar"
                      items={result.analysis?.perguntas_aprofundamento}
                    />
                  </div>

                  {(result.analysis?.segmento_sugerido ||
                    result.analysis?.canal_preferido) && (
                    <div style={metaLine}>
                      {result.analysis?.segmento_sugerido && (
                        <span>
                          <b>Segmento sugerido:</b> {result.analysis.segmento_sugerido}
                        </span>
                      )}
                      {result.analysis?.canal_preferido && (
                        <span>
                          <b>Canal:</b> {result.analysis.canal_preferido}
                        </span>
                      )}
                    </div>
                  )}

                  {!!result.analysis?.alertas?.length && (
                    <div style={alertBox}>
                      <b>Atenção</b>
                      <ul style={listStyle}>
                        {result.analysis.alertas.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div style={footer}>
              <button style={ghostBtn} onClick={() => setQualifyingOppId("")}>
                Fechar
              </button>
              <button style={primaryBtn} disabled={saving} onClick={saveAndAnalyze}>
                {saving
                  ? "Salvando e analisando..."
                  : result
                    ? "Reanalisar qualificação"
                    : "Salvar e analisar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={infoBlock}>
      <b style={infoTitle}>{title}</b>
      <ul style={listStyle}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div style={infoBlock}>
      <b style={infoTitle}>{title}</b>
      <p style={infoText}>{text}</p>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  background: "rgba(15,23,42,.52)",
  backdropFilter: "blur(8px)",
  display: "grid",
  placeItems: "center",
  padding: 18,
};
const modal: React.CSSProperties = {
  width: "min(1120px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "rgba(255,255,255,.98)",
  borderRadius: 28,
  padding: 20,
  boxShadow: "0 30px 90px rgba(0,0,0,.28)",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 14,
};
const eyebrow: React.CSSProperties = {
  color: C.gold,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  textTransform: "uppercase",
};
const title: React.CSSProperties = {
  margin: "2px 0",
  color: C.navy,
  fontSize: 24,
};
const opening: React.CSSProperties = {
  margin: "7px 0 0",
  color: C.ink,
  lineHeight: 1.45,
  maxWidth: 760,
};
const closeBtn: React.CSSProperties = {
  border: 0,
  background: "#f1f5f9",
  color: C.navy,
  borderRadius: 12,
  width: 38,
  height: 38,
  fontSize: 24,
  cursor: "pointer",
};
const questionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const questionCard: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr)",
  gap: 12,
  padding: 14,
  border: "1px solid rgba(30,41,63,.10)",
  borderRadius: 20,
  background: "white",
};
const numberBadge: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: C.navy,
  color: "white",
  fontWeight: 900,
};
const questionTitle: React.CSSProperties = {
  margin: 0,
  color: C.navy,
  fontSize: 15,
};
const questionText: React.CSSProperties = {
  margin: "5px 0 9px",
  color: C.ink,
  fontSize: 13,
  lineHeight: 1.45,
};
const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 76,
  resize: "vertical",
  border: "1px solid rgba(30,41,63,.14)",
  borderRadius: 14,
  padding: "10px 12px",
  outline: "none",
  color: C.navy,
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const helper: React.CSSProperties = {
  display: "block",
  marginTop: 7,
  color: C.slate,
  lineHeight: 1.35,
};
const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  fontSize: 13,
  fontWeight: 700,
};
const resultSection: React.CSSProperties = {
  marginTop: 18,
  borderTop: "1px solid rgba(30,41,63,.10)",
  paddingTop: 18,
};
const scoreHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  marginBottom: 12,
};
const resultEyebrow: React.CSSProperties = {
  color: C.gold,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: "uppercase",
};
const scoreValue: React.CSSProperties = {
  display: "block",
  marginTop: 2,
  color: C.navy,
  fontSize: 30,
  lineHeight: 1,
};
const statusBadge: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 900,
};
const breakdownGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 9,
};
const breakdownCard: React.CSSProperties = {
  border: "1px solid rgba(30,41,63,.09)",
  borderRadius: 14,
  padding: 10,
  background: "#f8fafc",
};
const breakdownTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: C.navy,
  fontSize: 12,
  fontWeight: 850,
};
const breakdownReason: React.CSSProperties = {
  display: "block",
  marginTop: 5,
  color: C.slate,
  lineHeight: 1.35,
};
const aiPanel: React.CSSProperties = {
  marginTop: 14,
  padding: 16,
  borderRadius: 20,
  border: `1px solid ${C.gold}55`,
  background: `${C.goldLight}16`,
};
const aiTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};
const aiTitle: React.CSSProperties = {
  margin: "2px 0 0",
  color: C.navy,
  fontSize: 18,
};
const fitPill: React.CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "white",
  color: C.navy,
  fontSize: 11,
  fontWeight: 850,
  border: "1px solid rgba(30,41,63,.10)",
};
const analysisSummary: React.CSSProperties = {
  margin: "10px 0 12px",
  color: C.ink,
  lineHeight: 1.5,
};
const analysisGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginTop: 10,
};
const recommendationGrid: React.CSSProperties = {
  ...analysisGrid,
};
const infoBlock: React.CSSProperties = {
  background: "white",
  border: "1px solid rgba(30,41,63,.09)",
  borderRadius: 14,
  padding: 11,
};
const infoTitle: React.CSSProperties = {
  color: C.navy,
  fontSize: 12,
};
const infoText: React.CSSProperties = {
  margin: "6px 0 0",
  color: C.ink,
  fontSize: 12,
  lineHeight: 1.45,
};
const listStyle: React.CSSProperties = {
  margin: "6px 0 0",
  paddingLeft: 18,
  color: C.ink,
  fontSize: 12,
  lineHeight: 1.5,
};
const metaLine: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  marginTop: 12,
  color: C.ink,
  fontSize: 12,
};
const alertBox: React.CSSProperties = {
  marginTop: 12,
  padding: 11,
  borderRadius: 14,
  background: "rgba(161,28,39,.06)",
  border: "1px solid rgba(161,28,39,.16)",
  color: C.red,
  fontSize: 12,
};
const footer: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid rgba(30,41,63,.16)",
  borderRadius: 14,
  padding: "10px 14px",
  background: "white",
  color: C.navy,
  fontWeight: 850,
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "11px 15px",
  background: `linear-gradient(135deg, ${C.red}, ${C.navy})`,
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
