import fs from "node:fs";

function replaceOnce(source, label, pattern, replacement, marker) {
  if (marker && source.includes(marker)) {
    console.log(`[patch-oportunidades-v50] ${label}: já aplicado`);
    return source;
  }
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) {
      throw new Error(`[patch-oportunidades-v50] âncora não encontrada: ${label}`);
    }
    console.log(`[patch-oportunidades-v50] ${label}: aplicado`);
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) {
    throw new Error(`[patch-oportunidades-v50] padrão não encontrado: ${label}`);
  }
  console.log(`[patch-oportunidades-v50] ${label}: aplicado`);
  return source.replace(pattern, replacement);
}

const v5File = "src/pages/OportunidadesPipelineV5.tsx";
let v5 = fs.readFileSync(v5File, "utf8");

v5 = replaceOnce(
  v5,
  "importar histórico de oportunidades",
  'import { supabase } from "@/lib/supabaseClient";',
  'import { supabase } from "@/lib/supabaseClient";\nimport OpportunityHistoryPanel from "@/components/opportunities/OpportunityHistoryPanel";',
  "OpportunityHistoryPanel from",
);

v5 = replaceOnce(
  v5,
  "campo de próximo follow-up no tipo",
  "  expected_close_at?: string | null;\n  created_at: string;",
  "  expected_close_at?: string | null;\n  next_follow_up_at?: string | null;\n  created_at: string;",
  "next_follow_up_at?: string | null;",
);

v5 = replaceOnce(
  v5,
  "carregar próximo follow-up",
  "expected_close_at,created_at,credito_desejado",
  "expected_close_at,next_follow_up_at,created_at,credito_desejado",
  "expected_close_at,next_follow_up_at,created_at",
);

v5 = replaceOnce(
  v5,
  "urgência baseada no próximo follow-up",
  `const urgencyLabel = (o: Opp) => {
  const d = daysBetween(
    o.expected_close_at || o.fechamento_previsto_em || null,
  );`,
  `const urgencyLabel = (o: Opp) => {
  const d = daysBetween(o.next_follow_up_at || null);`,
  "const d = daysBetween(o.next_follow_up_at || null);",
);

v5 = replaceOnce(
  v5,
  "ordenar pipeline por próximo follow-up",
  `      .sort((a, b) => {
        const da = daysBetween(
          a.expected_close_at || a.fechamento_previsto_em || null,
        );
        const db = daysBetween(
          b.expected_close_at || b.fechamento_previsto_em || null,
        );
        const va = da === null ? 999999 : da;
        const vb = db === null ? 999999 : db;
        if (va !== vb) return va - vb;
        return Number(b.score || 0) - Number(a.score || 0);
      });`,
  `      .sort((a, b) => {
        const aFollowUp = a.next_follow_up_at
          ? new Date(a.next_follow_up_at).getTime()
          : Number.POSITIVE_INFINITY;
        const bFollowUp = b.next_follow_up_at
          ? new Date(b.next_follow_up_at).getTime()
          : Number.POSITIVE_INFINITY;
        if (aFollowUp !== bFollowUp) return aFollowUp - bFollowUp;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });`,
  "const aFollowUp = a.next_follow_up_at",
);

v5 = replaceOnce(
  v5,
  "registrar data de oportunidade perdida",
  `        lost_reason: discarded ? lostReason : null,
        lost_details: discarded ? details : null,`,
  `        lost_reason: discarded ? lostReason : null,
        lost_details: discarded ? details : null,
        lost_at: new Date().toISOString(),
        won_at: null,`,
  "lost_at: new Date().toISOString(),",
);

v5 = replaceOnce(
  v5,
  "registrar data de oportunidade ganha",
  '      { estagio: dbStage("fechado_ganho") },',
  '      { estagio: dbStage("fechado_ganho"), won_at: new Date().toISOString(), lost_at: null },',
  'won_at: new Date().toISOString(), lost_at: null',
);

v5 = replaceOnce(
  v5,
  "helpers seguros de data e hora da reunião",
  `const storedPhone = (phone?: string | null) => {`,
  `const meetingLocalParts = (iso?: string | null) => {
  if (!iso) return { date: "", hour: "09", minute: "00" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", hour: "09", minute: "00" };
  return {
    date:
      String(value.getFullYear()) +
      "-" +
      String(value.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(value.getDate()).padStart(2, "0"),
    hour: String(value.getHours()).padStart(2, "0"),
    minute: String(value.getMinutes()).padStart(2, "0"),
  };
};
const meetingIsoWithPart = (
  iso: string | null | undefined,
  part: "date" | "hour" | "minute",
  nextValue: string,
) => {
  const current = meetingLocalParts(iso);
  const date = part === "date" ? nextValue : current.date;
  const hour = part === "hour" ? nextValue : current.hour;
  const minute = part === "minute" ? nextValue : current.minute;
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(year, month - 1, day, Number(hour), Number(minute), 0, 0);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
};

const storedPhone = (phone?: string | null) => {`,
  "const meetingLocalParts =",
);

v5 = replaceOnce(
  v5,
  "estado local visual da reunião",
  `  } = props;
  return (`,
  `  } = props;
  const meeting = meetingLocalParts(editing.reuniao_at);
  return (`,
  "const meeting = meetingLocalParts(editing.reuniao_at);",
);

v5 = replaceOnce(
  v5,
  "controles independentes de data hora e minuto",
  /          <label style=\{labelStyle\}>Data e hora<\/label>\s*<input\s*style=\{inputStyle\}\s*type="datetime-local"\s*value=\{editing\.reuniao_at \? editing\.reuniao_at\.slice\(0, 16\) : ""\}\s*onChange=\{\(e\) =>\s*setEditing\(\{\s*\.\.\.editing,\s*reuniao_at: e\.target\.value\s*\? new Date\(e\.target\.value\)\.toISOString\(\)\s*: null,\s*\}\)\s*\}\s*\/>/,
  `          <div data-crm-meeting-controls="true" style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.5fr) minmax(90px,.75fr) minmax(90px,.75fr)", gap: 8, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Data</label>
              <input
                style={inputStyle}
                type="date"
                value={meeting.date}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    reuniao_at: meetingIsoWithPart(editing.reuniao_at, "date", e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Hora</label>
              <select
                style={inputStyle}
                value={meeting.hour}
                disabled={!meeting.date}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    reuniao_at: meetingIsoWithPart(editing.reuniao_at, "hour", e.target.value),
                  })
                }
              >
                {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Minuto</label>
              <select
                style={inputStyle}
                value={meeting.minute}
                disabled={!meeting.date}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    reuniao_at: meetingIsoWithPart(editing.reuniao_at, "minute", e.target.value),
                  })
                }
              >
                {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0")).map((minute) => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 5, marginBottom: 4, color: C.slate, fontSize: 11 }}>
            Data, hora e minuto são independentes para evitar alterações involuntárias no agendamento.
          </div>`,
  'data-crm-meeting-controls="true"',
);

v5 = replaceOnce(
  v5,
  "histórico do lead abaixo da reunião",
  `          <button style={btnSecondary} onClick={() => scheduleMeeting(editing)}>
            Criar na Agenda
          </button>
        </div>
        <div style={modalSection}>
          <h3 style={sectionTitle}>Proposta e follow-up</h3>`,
  `          <button style={btnSecondary} onClick={() => scheduleMeeting(editing)}>
            Criar na Agenda
          </button>
        </div>
        <div style={modalSection} data-crm-lead-history="true">
          <OpportunityHistoryPanel
            leadId={editing.lead_id}
            currentOpportunityId={editing.id}
          />
        </div>
        <div style={modalSection}>
          <h3 style={sectionTitle}>Proposta e follow-up</h3>`,
  'data-crm-lead-history="true"',
);

v5 = replaceOnce(
  v5,
  "card usando próximo follow-up",
  "  const followUpAt = op.expected_close_at || op.fechamento_previsto_em || null;",
  "  const followUpAt = op.next_follow_up_at || null;",
  "const followUpAt = op.next_follow_up_at || null;",
);

fs.writeFileSync(v5File, v5);

const v9File = "src/pages/OportunidadesPipelineV9.tsx";
let v9 = fs.readFileSync(v9File, "utf8");

v9 = replaceOnce(
  v9,
  "localizar histórico do lead",
  '      const meetingCard = findSection(modal, "Agendamento de reunião");',
  '      const meetingCard = findSection(modal, "Agendamento de reunião");\n      const leadHistoryCard = findSection(modal, "Histórico");',
  'const leadHistoryCard = findSection(modal, "Histórico");',
);

v9 = replaceOnce(
  v9,
  "estilizar histórico do lead",
  "      applyCardStyle(meetingCard);",
  "      applyCardStyle(meetingCard);\n      applyCardStyle(leadHistoryCard);",
  "applyCardStyle(leadHistoryCard);",
);

v9 = replaceOnce(
  v9,
  "posicionar histórico abaixo do agendamento",
  `        simulationsCard,
        ...(meetingCard ? [meetingCard] : []),
      ];`,
  `        simulationsCard,
        ...(meetingCard ? [meetingCard] : []),
        ...(leadHistoryCard ? [leadHistoryCard] : []),
      ];`,
  "...(leadHistoryCard ? [leadHistoryCard] : []),",
);

fs.writeFileSync(v9File, v9);

for (const [file, checks] of [
  [v5File, [
    "OpportunityHistoryPanel",
    "next_follow_up_at?: string | null",
    "const aFollowUp = a.next_follow_up_at",
    'data-crm-meeting-controls="true"',
    'data-crm-lead-history="true"',
    "lost_at: new Date().toISOString()",
  ]],
  [v9File, ["leadHistoryCard", "applyCardStyle(leadHistoryCard)"]],
]) {
  const source = fs.readFileSync(file, "utf8");
  for (const check of checks) {
    if (!source.includes(check)) {
      throw new Error(`[patch-oportunidades-v50] validação falhou em ${file}: ${check}`);
    }
  }
}

console.log("[patch-oportunidades-v50] concluído");
