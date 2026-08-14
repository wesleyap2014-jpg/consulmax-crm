import fs from "node:fs";

const V8 = "src/pages/OportunidadesPipelineV8.tsx";
const V9 = "src/pages/OportunidadesPipelineV9.tsx";
const INICIO = "src/pages/Inicio.tsx";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[patch-crm-oportunidades-inicio-v1] trecho não encontrado: ${label}`);
  }
  return source.replace(before, after);
}

function patchV8() {
  let source = fs.readFileSync(V8, "utf8");
  if (source.includes("crm-followup-date-only-v1")) return;

  source = source.replace(
    'import OportunidadesPipelineV7 from "./OportunidadesPipelineV7";\n',
    'import OportunidadesPipelineV7 from "./OportunidadesPipelineV7";\n// crm-followup-date-only-v1\n',
  );

  source = replaceOnce(
    source,
    `const toLocalInput = (iso?: string | null) => {\n  if (!iso) return "";\n  const d = new Date(iso);\n  if (Number.isNaN(d.getTime())) return "";\n  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);\n  return local.toISOString().slice(0, 16);\n};`,
    `const toDateInput = (iso?: string | null) => {\n  if (!iso) return "";\n  const match = String(iso).match(/^(\\d{4}-\\d{2}-\\d{2})/);\n  if (match) return match[1];\n  const d = new Date(iso);\n  if (Number.isNaN(d.getTime())) return "";\n  return d.toISOString().slice(0, 10);\n};`,
    "helper de data do follow-up",
  );

  source = replaceOnce(
    source,
    `setNextFollowUpLocal(toLocalInput(op.next_follow_up_at));`,
    `setNextFollowUpLocal(toDateInput(op.next_follow_up_at));`,
    "carregamento do próximo follow-up",
  );

  source = replaceOnce(
    source,
    `  async function registerFollowUp() {\n    if (!activeOpp) return;\n    if (!nextFollowUpLocal) return alert("Informe a data e hora do próximo follow-up.");\n    const next = new Date(nextFollowUpLocal);\n    if (Number.isNaN(next.getTime())) return alert("Informe uma data válida para o próximo follow-up.");\n    if (next.getTime() <= Date.now()) return alert("O próximo follow-up deve ser agendado para uma data futura.");\n\n    setFollowUpSaving(true);\n    try {\n      const now = new Date().toISOString();\n      const nextIso = next.toISOString();\n      const { error } = await supabase\n        .from("opportunities")\n        .update({\n          last_follow_up_at: now,\n          next_follow_up_at: nextIso,\n          expected_close_at: nextIso.slice(0, 10),\n          updated_at: now,\n        })\n        .eq("id", activeOpp.id);\n      if (error) throw error;\n\n      const detail = followUpNote.trim();\n      await supabase.from("opportunity_notes").insert({\n        opportunity_id: activeOpp.id,\n        lead_id: activeOpp.lead_id,\n        user_id: currentUserId.current,\n        kind: "follow_up",\n        note: \`Follow-up realizado. Próximo follow-up: \${dateTime(nextIso)}.\${detail ? \` \${detail}\` : ""}\`,\n      });\n\n      await supabase\n        .from("agenda_eventos")\n        .update({\n          completed_at: now,\n          completion_notes: detail || "Follow-up realizado pela tela de Oportunidades.",\n        })\n        .eq("opportunity_id", activeOpp.id)\n        .eq("tipo", "contato")\n        .is("completed_at", null)\n        .lte("inicio_at", now);\n\n      const end = new Date(next.getTime() + 30 * 60000).toISOString();\n      const agenda = await supabase.from("agenda_eventos").insert({\n        tipo: "contato",\n        titulo: \`Follow-up • \${activeOpp.leads?.nome || "Lead"}\`,\n        lead_id: activeOpp.lead_id,\n        user_id: activeOpp.vendedor_id,\n        inicio_at: nextIso,\n        fim_at: end,\n        origem: "manual",\n        opportunity_id: activeOpp.id,\n        descricao: detail || "Próximo follow-up da oportunidade.",\n      } as any);\n\n      setOpps((current) =>\n        current.map((op) =>\n          op.id === activeOpp.id\n            ? { ...op, last_follow_up_at: now, next_follow_up_at: nextIso }\n            : op,\n        ),\n      );\n      setFollowUpNote("");\n      await refreshUnderlyingBoard();\n      if (agenda.error) {\n        alert(\`Follow-up registrado, mas não foi possível criar o compromisso na Agenda: \${agenda.error.message}\`);\n      } else {\n        alert("Follow-up registrado e próximo contato criado na Agenda.");\n      }\n    } catch (error: any) {\n      alert(error?.message || "Não foi possível registrar o follow-up.");\n    } finally {\n      setFollowUpSaving(false);\n    }\n  }`,
    `  async function registerFollowUp() {\n    if (!activeOpp) return;\n    if (!nextFollowUpLocal) return alert("Informe a data do próximo follow-up.");\n\n    const today = new Date();\n    const todayYmd = \`${'${today.getFullYear()}'}-\${String(today.getMonth() + 1).padStart(2, "0")}-\${String(today.getDate()).padStart(2, "0")}\`;\n    if (nextFollowUpLocal <= todayYmd) {\n      return alert("O próximo follow-up deve ser agendado para uma data futura.");\n    }\n\n    setFollowUpSaving(true);\n    try {\n      const now = new Date().toISOString();\n      // O horário abaixo é apenas técnico para persistência em timestamptz; o CRM trata o follow-up somente por data.\n      const nextIso = new Date(\`${'${nextFollowUpLocal}'}T12:00:00-04:00\`).toISOString();\n      const { error } = await supabase\n        .from("opportunities")\n        .update({\n          last_follow_up_at: now,\n          next_follow_up_at: nextIso,\n          updated_at: now,\n        })\n        .eq("id", activeOpp.id);\n      if (error) throw error;\n\n      const detail = followUpNote.trim();\n      await supabase.from("opportunity_notes").insert({\n        opportunity_id: activeOpp.id,\n        lead_id: activeOpp.lead_id,\n        user_id: currentUserId.current,\n        kind: "follow_up",\n        note: \`Follow-up realizado. Próximo follow-up: \${shortDate(nextIso)}.\${detail ? \` \${detail}\` : ""}\`,\n      });\n\n      setOpps((current) =>\n        current.map((op) =>\n          op.id === activeOpp.id\n            ? { ...op, last_follow_up_at: now, next_follow_up_at: nextIso }\n            : op,\n        ),\n      );\n      setFollowUpNote("");\n      await refreshUnderlyingBoard();\n      alert("Follow-up registrado e próximo follow-up salvo.");\n    } catch (error: any) {\n      alert(error?.message || "Não foi possível registrar o follow-up.");\n    } finally {\n      setFollowUpSaving(false);\n    }\n  }`,
    "registro de follow-up sem agenda",
  );

  source = replaceOnce(
    source,
    `            type="datetime-local"`,
    `            type="date"`,
    "input do próximo follow-up",
  );

  source = replaceOnce(
    source,
    `{saving ? "Registrando..." : "Registrar follow-up realizado e agendar próximo"}`,
    `{saving ? "Registrando..." : "Registrar follow-up realizado e salvar próximo"}`,
    "texto do botão de follow-up",
  );

  fs.writeFileSync(V8, source);
}

function patchV9() {
  let source = fs.readFileSync(V9, "utf8");
  if (source.includes("crm-context-before-commercial-v1")) return;
  source = source.replace(
    'import OportunidadesPipelineV8 from "./OportunidadesPipelineV8";\n',
    'import OportunidadesPipelineV8 from "./OportunidadesPipelineV8";\n// crm-context-before-commercial-v1\n',
  );
  source = replaceOnce(
    source,
    `      const desired: HTMLElement[] = [\n        directionCard,\n        ...(dataCard ? [dataCard] : []),\n        contextCard,\n        followRow,`,
    `      const desired: HTMLElement[] = [\n        directionCard,\n        contextCard,\n        ...(dataCard ? [dataCard] : []),\n        followRow,`,
    "ordem contexto antes de dados comerciais",
  );
  fs.writeFileSync(V9, source);
}

function patchInicio() {
  let source = fs.readFileSync(INICIO, "utf8");
  if (source.includes("crm-inicio-followup-scope-v1")) return;
  source = source.replace(
    '// src/pages/Inicio.tsx\n',
    '// src/pages/Inicio.tsx\n// crm-inicio-followup-scope-v1\n',
  );

  source = replaceOnce(
    source,
    `type OppRow = { id: string; segmento: string | null; valor_credito: number | null; estagio: string | null; score: number | null; expected_close_at: string | null; fechamento_previsto_em?: string | null; vendedor_id: string; lead_id: string };`,
    `type OppRow = { id: string; segmento: string | null; valor_credito: number | null; estagio: string | null; score: number | null; expected_close_at: string | null; fechamento_previsto_em?: string | null; next_follow_up_at?: string | null; vendedor_id: string; lead_id: string };`,
    "tipo OppRow com próximo follow-up",
  );

  source = replaceOnce(
    source,
    `    mode: matrix ? "matrix" : branch ? "branch" : "seller",`,
    `    mode: selected ? "seller" : matrix ? "matrix" : branch ? "branch" : "seller",`,
    "escopo efetivo ao selecionar vendedor",
  );

  source = replaceOnce(
    source,
    `function isOpenOpportunityStage(v?: string | null) { const s = normalizeText(v); return ["novo", "novo lead", "qualificando", "qualificacao", "qualificando/diagnostico", "reuniao agendada", "proposta", "negociacao", "proposta apresentada/negociacao", "fechamento programado/aguardando documentos"].includes(s); }`,
    `function isOpenOpportunityStage(v?: string | null) { const s = normalizeText(v); return ["novo", "novo lead", "contato em andamento", "qualificacao e diagnostico", "qualificando", "qualificacao", "qualificando/diagnostico", "reuniao agendada", "proposta", "proposta apresentada", "negociacao", "negociacao e follow-up", "negociacao e follow up", "proposta apresentada/negociacao", "fechamento e documentacao", "fechamento programado/aguardando documentos"].includes(s); }`,
    "estágios abertos do funil",
  );

  source = replaceOnce(
    source,
    `  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null; daysWaiting?: number })[]>([]);`,
    `  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null; daysWaiting?: number; followUpYMD?: string })[]>([]);`,
    "estado da lista de follow-ups",
  );

  source = replaceOnce(
    source,
    `    let openOppQ = supabase.from("opportunities").select("id,segmento,valor_credito,estagio,score,expected_close_at,fechamento_previsto_em,vendedor_id,lead_id").limit(5000);`,
    `    let openOppQ = supabase.from("opportunities").select("id,segmento,valor_credito,estagio,score,expected_close_at,fechamento_previsto_em,next_follow_up_at,vendedor_id,lead_id").limit(5000);`,
    "consulta de oportunidades com follow-up",
  );

  source = replaceOnce(
    source,
    `    const overdueComputed = openOppRows\n      .map((o) => ({ row: o, due: toYMD(o.expected_close_at || o.fechamento_previsto_em) }))\n      .filter((o) => Boolean(o.due) && (o.due as string) < today)\n      .map(({ row, due }) => ({ ...row, daysWaiting: Math.max(0, daysDiffYMD(today, due as string)) }))\n      .sort((a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0))\n      .slice(0, 10);`,
    `    const overdueComputed = openOppRows\n      .map((o) => ({ row: o, due: toYMD(o.next_follow_up_at) }))\n      .filter((o) => Boolean(o.due))\n      .sort((a, b) => String(a.due).localeCompare(String(b.due)))\n      .slice(0, 10)\n      .map(({ row, due }) => ({ ...row, followUpYMD: due as string, daysWaiting: daysDiffYMD(today, due as string) }));`,
    "lista de follow-ups por data crescente",
  );

  source = replaceOnce(
    source,
    `<AlertTriangle className="h-5 w-5 text-[#A11C27]" /> Oportunidades atrasadas`,
    `<Calendar className="h-5 w-5 text-[#A11C27]" /> Follow-Up`,
    "título do card de follow-up",
  );

  source = replaceOnce(
    source,
    `                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">Nada atrasado por aqui. 👏</div>`,
    `                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">Nenhum follow-up agendado no momento. 👏</div>`,
    "estado vazio de follow-up",
  );

  source = replaceOnce(
    source,
    `                        <div className="mt-0.5 text-xs text-slate-500">\n                          {(o.estagio || "—") as any} • {typeof o.daysWaiting === "number" ? \`${'${o.daysWaiting}'} dia(s) aguardando\` : "—"}\n                        </div>`,
    `                        <div className="mt-0.5 text-xs text-slate-500">\n                          {(o.estagio || "—") as any} • Próximo follow-up: {fmtDateBRFromYMD(o.followUpYMD)}\n                          {typeof o.daysWaiting === "number" ? (o.daysWaiting > 0 ? \` • \${o.daysWaiting} dia(s) em atraso\` : o.daysWaiting === 0 ? " • Hoje" : \` • em \${Math.abs(o.daysWaiting)} dia(s)\`) : ""}\n                        </div>`,
    "detalhe do próximo follow-up",
  );

  fs.writeFileSync(INICIO, source);
}

patchV8();
patchV9();
patchInicio();
console.log("[patch-crm-oportunidades-inicio-v1] aplicado");
