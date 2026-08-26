import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

function replaceExact(from, to, label) {
  if (src.includes(to)) { console.log(`[agenda-v6] ${label}: já aplicado`); return; }
  if (!src.includes(from)) { console.log(`[agenda-v6] ${label}: trecho não encontrado`); return; }
  src = src.replace(from, to);
  console.log(`[agenda-v6] ${label}: aplicado`);
}

if (!src.includes("type MeetingArtifacts =")) {
  const marker = "type AgendaEvent = {";
  const types = `type MeetingArtifacts = {\n  report: null | { id: string; meeting_type?: string | null; executive_summary?: string | null; minutes_text?: string | null; report?: any; model?: string | null; status?: string | null; error?: string | null; generated_at?: string | null };\n  recordings: Array<{ id: string; recording_url?: string | null; status?: string | null; started_at?: string | null; ended_at?: string | null; created_at?: string | null }>;\n  transcript: Array<{ id: string; segment_index?: number | null; participant_name?: string | null; participant_role?: string | null; transcript_text?: string | null; created_at?: string | null }>;\n  has_ai?: boolean;\n  has_recording?: boolean;\n};\n`;
  if (src.includes(marker)) {
    src = src.replace(marker, `${types}${marker}`);
    console.log("[agenda-v6] tipos dos materiais: aplicado");
  }
}

replaceExact(
  `  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);\n  const [createOpen, setCreateOpen] = useState(false);`,
  `  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);\n  const [meetingArtifacts, setMeetingArtifacts] = useState<MeetingArtifacts | null>(null);\n  const [meetingArtifactsLoading, setMeetingArtifactsLoading] = useState(false);\n  const [meetingArtifactView, setMeetingArtifactView] = useState<"" | "analysis" | "transcript">("");\n  const [createOpen, setCreateOpen] = useState(false);`,
  "estado dos materiais",
);

if (!src.includes("async function loadMeetingArtifacts")) {
  const anchor = `  const todayBirthdays = useMemo(() => birthdays.filter((e) => eventDateKey(e) === toDateKey(new Date())), [birthdays]);`;
  const loader = `  async function loadMeetingArtifacts(eventId: string) {\n    setMeetingArtifactsLoading(true);\n    try {\n      const { data } = await supabase.auth.getSession();\n      const token = data?.session?.access_token;\n      const response = await fetch("/api/meeting-artifacts", {\n        method: "POST",\n        headers: { "Content-Type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },\n        body: JSON.stringify({ agenda_evento_id: eventId }),\n      });\n      const payload = await response.json().catch(() => ({}));\n      if (!response.ok) {\n        if (response.status !== 401 && response.status !== 403 && response.status !== 404) console.warn("[agenda] materiais da reunião indisponíveis", payload?.error || response.status);\n        setMeetingArtifacts(null);\n        return;\n      }\n      setMeetingArtifacts({ report: payload?.report || null, recordings: payload?.recordings || [], transcript: payload?.transcript || [], has_ai: Boolean(payload?.has_ai), has_recording: Boolean(payload?.has_recording) });\n    } catch (error) {\n      console.warn("[agenda] falha ao carregar materiais da reunião", error);\n      setMeetingArtifacts(null);\n    } finally {\n      setMeetingArtifactsLoading(false);\n    }\n  }\n\n  useEffect(() => {\n    setMeetingArtifactView("");\n    setMeetingArtifacts(null);\n    if (!selectedEvent?.id) return;\n    const isAdmin = normalizeText(me?.role || me?.user_role) === "admin";\n    if (selectedEvent.user_id !== me?.auth_user_id && !isAdmin) return;\n    void loadMeetingArtifacts(selectedEvent.id);\n  }, [selectedEvent?.id, selectedEvent?.user_id, me?.auth_user_id, me?.role, me?.user_role]);\n\n`;
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${loader}${anchor}`);
    console.log("[agenda-v6] carregamento dos materiais: aplicado");
  } else console.log("[agenda-v6] carregamento dos materiais: trecho não encontrado");
}

replaceExact(
  `onOpportunity={openOpportunity} canEdit={Boolean(selectedEvent && (selectedEvent.user_id === me?.auth_user_id || normalizeText(me?.role || me?.user_role) === "admin"))} onCancel={cancelEvent} onDelete={deleteEvent} />}`,
  `onOpportunity={openOpportunity} canEdit={Boolean(selectedEvent && (selectedEvent.user_id === me?.auth_user_id || normalizeText(me?.role || me?.user_role) === "admin"))} meetingArtifacts={meetingArtifacts} meetingArtifactsLoading={meetingArtifactsLoading} meetingArtifactView={meetingArtifactView} setMeetingArtifactView={setMeetingArtifactView} onCancel={cancelEvent} onDelete={deleteEvent} />}`,
  "materiais enviados ao drawer",
);

const drawerRegex = /function EventDrawer\([\s\S]*?\n}\n\nfunction Detail/;
const drawerMatch = src.match(drawerRegex);
if (drawerMatch && !drawerMatch[0].includes("Reunião realizada")) {
  let drawer = drawerMatch[0];
  drawer = drawer.replace(
    `videoLoading: boolean; canEdit: boolean; onClose: () => void;`,
    `videoLoading: boolean; canEdit: boolean; meetingArtifacts: MeetingArtifacts | null; meetingArtifactsLoading: boolean; meetingArtifactView: "" | "analysis" | "transcript"; setMeetingArtifactView: (v: "" | "analysis" | "transcript") => void; onClose: () => void;`,
  );

  const actionAnchor = `<div className="cx-action-grid">{wa &&`;
  const materialSection = `{props.canEdit && (props.meetingArtifactsLoading || props.meetingArtifacts?.report || props.meetingArtifacts?.recordings?.length || props.meetingArtifacts?.transcript?.length) && <section className="cx-drawer-section" style={{ background: "linear-gradient(180deg,#FFFDF7 0%,#fff 100%)", border: "1px solid #E0CE8C", borderRadius: 14, padding: 12 }}><div className="cx-section-title"><div><h3 style={{ marginBottom: 2 }}>Reunião realizada</h3><span>Materiais e inteligência pós-reunião</span></div></div>{props.meetingArtifactsLoading ? <div style={{ padding: "12px 0", color: C.muted, fontSize: 12 }}>Carregando materiais da reunião…</div> : <><div style={{ display: "grid", gap: 8 }}>{props.meetingArtifacts?.report && <button type="button" className="cx-action-btn" style={{ width: "100%", justifyContent: "flex-start", padding: "11px 12px", textAlign: "left" }} onClick={() => props.setMeetingArtifactView(props.meetingArtifactView === "analysis" ? "" : "analysis")}><FileText size={18} /><span style={{ display: "grid", gap: 1 }}><strong>Análise do Max IA</strong><small style={{ color: C.muted }}>{props.meetingArtifacts.report.status === "completed" ? \`Relatório concluído\${Number(props.meetingArtifacts.report.report?.score) >= 0 ? \` • Nota \${Math.round(Number(props.meetingArtifacts.report.report?.score))}/100\` : ""}\` : "Análise disponível"}</small></span></button>}{props.meetingArtifacts?.recordings?.map((recording, index) => recording.recording_url ? <a key={recording.id} className="cx-action-btn" style={{ width: "100%", justifyContent: "flex-start", padding: "11px 12px" }} href={recording.recording_url} target="_blank" rel="noreferrer"><Video size={18} /><span style={{ display: "grid", gap: 1 }}><strong>{props.meetingArtifacts!.recordings.length > 1 ? \`Gravação \${index + 1}\` : "Gravação da reunião"}</strong><small style={{ color: C.muted }}>{recording.ended_at ? \`Finalizada em \${fmtDateTime(recording.ended_at)}\` : "Abrir gravação"}</small></span><ExternalLink size={14} style={{ marginLeft: "auto" }} /></a> : <div key={recording.id} style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, color: C.muted, fontSize: 12 }}><strong style={{ color: C.navy }}>Gravação</strong><br />{recording.status === "recording" ? "Gravação em andamento" : recording.status === "processing" ? "Gravação sendo processada" : "Arquivo ainda não disponível"}</div>)}{Boolean(props.meetingArtifacts?.transcript?.length) && <button type="button" className="cx-action-btn" style={{ width: "100%", justifyContent: "flex-start", padding: "11px 12px", textAlign: "left" }} onClick={() => props.setMeetingArtifactView(props.meetingArtifactView === "transcript" ? "" : "transcript")}><FileText size={18} /><span style={{ display: "grid", gap: 1 }}><strong>Transcrição</strong><small style={{ color: C.muted }}>{props.meetingArtifacts?.transcript?.length || 0} trecho(s) registrados</small></span></button>}</div>{props.meetingArtifactView === "analysis" && props.meetingArtifacts?.report && (() => { const report = props.meetingArtifacts.report.report || {}; const list = (title: string, rows: any) => Array.isArray(rows) && rows.length ? <div style={{ display: "grid", gap: 5 }}><strong style={{ fontSize: 11, color: C.navy }}>{title}</strong><ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, color: C.text, fontSize: 12 }}>{rows.map((row: any, i: number) => <li key={i}>{typeof row === "string" ? row : row?.task ? \`\${row.task}\${row.owner ? \` — \${row.owner}\` : ""}\${row.due ? \` (\${row.due})\` : ""}\` : JSON.stringify(row)}</li>)}</ul></div> : null; return <div style={{ marginTop: 10, display: "grid", gap: 12, padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><strong style={{ color: C.navy, fontSize: 13 }}>Feedback do Max IA</strong>{Number(report.score) >= 0 && <span style={{ padding: "5px 9px", borderRadius: 999, background: C.navy, color: "#fff", fontWeight: 800, fontSize: 11 }}>{Math.round(Number(report.score))}/100</span>}</div>{props.meetingArtifacts.report.executive_summary && <div><strong style={{ display: "block", fontSize: 11, color: C.navy, marginBottom: 4 }}>Resumo executivo</strong><p style={{ margin: 0, whiteSpace: "pre-wrap", color: C.text, fontSize: 12, lineHeight: 1.55 }}>{props.meetingArtifacts.report.executive_summary}</p></div>}{report.sales_stage && <div><strong style={{ fontSize: 11, color: C.navy }}>Momento da venda</strong><div style={{ marginTop: 4, color: C.text, fontSize: 12 }}>{report.sales_stage}</div></div>}{list("Pontos fortes", report.strong_points)}{list("Pontos de atenção", report.attention_points)}{list("Dores identificadas", report.pains)}{list("Objeções", report.objections)}{list("Sinais de compra", report.buying_signals)}{list("Decisões", report.decisions)}{list("Tarefas e próximos passos", report.action_items)}{report.recommended_next_step && <div><strong style={{ display: "block", fontSize: 11, color: C.navy, marginBottom: 4 }}>Próximo passo recomendado</strong><p style={{ margin: 0, color: C.text, fontSize: 12, lineHeight: 1.5 }}>{report.recommended_next_step}</p></div>}{report.suggested_follow_up && <div><strong style={{ display: "block", fontSize: 11, color: C.navy, marginBottom: 4 }}>Follow-up sugerido</strong><p style={{ margin: 0, color: C.text, fontSize: 12, lineHeight: 1.5 }}>{report.suggested_follow_up}</p></div>}{props.meetingArtifacts.report.minutes_text && <details><summary style={{ cursor: "pointer", color: C.navy, fontSize: 11, fontWeight: 800 }}>Ver ata completa</summary><p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: C.text, fontSize: 12, lineHeight: 1.55 }}>{props.meetingArtifacts.report.minutes_text}</p></details>}</div>; })()}{props.meetingArtifactView === "transcript" && Boolean(props.meetingArtifacts?.transcript?.length) && <div style={{ marginTop: 10, maxHeight: 360, overflow: "auto", display: "grid", gap: 7, padding: 10, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12 }}>{props.meetingArtifacts!.transcript.map((row) => <div key={row.id} style={{ padding: "8px 9px", background: "#fff", borderRadius: 9, border: "1px solid #eef0f3" }}><strong style={{ display: "block", color: C.navy, fontSize: 10, marginBottom: 3 }}>{row.participant_name || (row.participant_role === "host" ? "Organizador" : "Participante")}</strong><p style={{ margin: 0, color: C.text, fontSize: 12, lineHeight: 1.45 }}>{row.transcript_text}</p></div>)}</div>}</>}</section>}`;
  if (drawer.includes(actionAnchor)) {
    drawer = drawer.replace(actionAnchor, `${materialSection}<div className="cx-action-grid">{wa &&`);
    src = src.replace(drawerMatch[0], drawer);
    console.log("[agenda-v6] seção de materiais no drawer: aplicado");
  } else console.log("[agenda-v6] seção de materiais no drawer: âncora não encontrada");
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v6] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
