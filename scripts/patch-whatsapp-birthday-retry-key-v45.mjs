import fs from "node:fs";

const file = "api/whatsapp/send.ts";
if (!fs.existsSync(file)) {
  throw new Error("[patch-whatsapp-birthday-retry-key-v45] api/whatsapp/send.ts não encontrado");
}

let src = fs.readFileSync(file, "utf8");
const from = `    automation_type: raw.automation_type || null,
    agenda_event_id: raw.agenda_event_id || null,`;
const to = `    automation_type: raw.automation_type || null,
    automation_key: raw.automation_key || null,
    agenda_event_id: raw.agenda_event_id || null,`;

if (!src.includes("automation_key: raw.automation_key || null")) {
  if (!src.includes(from)) {
    throw new Error("[patch-whatsapp-birthday-retry-key-v45] ponto de preservação da automação não encontrado");
  }
  src = src.replace(from, to);
  fs.writeFileSync(file, src);
  console.log("[patch-whatsapp-birthday-retry-key-v45] automation_key preservada no reenvio");
} else {
  console.log("[patch-whatsapp-birthday-retry-key-v45] já aplicado");
}

await import("./patch-carteira-sale-seller-profile-v1.mjs");
await import("./patch-carteira-sale-seller-visibility-v1.mjs");
await import("./patch-carteira-sale-seller-save-v1.mjs");
await import("./patch-carteira-sale-seller-button-v1.mjs");
await import("./patch-carteira-sale-seller-field-v1.mjs");
await import("./patch-customer-success-final-clean-v1.mjs");

const homeFile = "src/pages/Inicio.tsx";
let home = fs.readFileSync(homeFile, "utf8");

if (!home.includes("const csFollowUpRows =")) {
  const agendaAnchor = `    const todayEventsCount = agRows.filter((e) => {\n      const nominalDate = normalizeText(e.tipo) === "aniversario";\n      return nominalDate ? toYMD(e.inicio_at) === today : ymdFromDateInOffset(new Date(e.inicio_at), PV_OFFSET_MIN) === today;\n    }).length;\n\n`;
  if (!home.includes(agendaAnchor)) throw new Error("[cs-followup-home] âncora da agenda não encontrada");
  const followQuery = `    let csFollowUpQ = supabase\n      .from("agenda_eventos")\n      .select("id,tipo,titulo,inicio_at,fim_at,user_id,descricao,relacao_id,completed_at,cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone),lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone)")\n      .eq("tipo", "contato")\n      .eq("origem", "auto")\n      .is("completed_at", null)\n      .ilike("titulo", "Follow-up Sucesso do Cliente%")\n      .gte("inicio_at", rangeISOForDayInOffset(addDaysYMD(today, -90), PV_OFFSET_MIN).startISO)\n      .lte("inicio_at", rangeISOForDayInOffset(today, PV_OFFSET_MIN).endISO)\n      .order("inicio_at", { ascending: true })\n      .limit(200);\n    csFollowUpQ = scope.isGlobal\n      ? csFollowUpQ\n      : scope.authIds.length\n        ? csFollowUpQ.in("user_id", scope.authIds)\n        : csFollowUpQ.eq("user_id", noRowsId);\n    const { data: csFollowUpRaw, error: csFollowUpErr } = await csFollowUpQ;\n    if (csFollowUpErr) console.warn("[Inicio] Não foi possível carregar follow-ups de Sucesso do Cliente:", csFollowUpErr);\n    const csFollowUpRows = (csFollowUpRaw || []) as any[];\n\n`;
  home = home.replace(agendaAnchor, agendaAnchor + followQuery);
}

if (!home.includes('id: "cs-followup:" + e.id')) {
  const myDayAnchor = `    const myDay: MeuDiaAlert[] = [];\n`;
  if (!home.includes(myDayAnchor)) throw new Error("[cs-followup-home] âncora Meu Dia não encontrada");
  const myDayBlock = `    for (const e of csFollowUpRows) {\n      const dueYmd = ymdFromDateInOffset(new Date(e.inicio_at), PV_OFFSET_MIN);\n      const overdue = dueYmd < today;\n      const detail = String(e.descricao || "").trim();\n      myDay.push({\n        id: "cs-followup:" + e.id,\n        priority: 15,\n        icon: "bell",\n        title: e.titulo || "Follow-up Sucesso do Cliente",\n        desc: (overdue ? "Follow-up vencido em " + fmtDateBRFromYMD(dueYmd) + "." : "Retorno agendado para hoje.") + (detail ? " " + detail : ""),\n        action: { label: "Abrir Sucesso do Cliente", to: "/clientes" },\n      });\n    }\n`;
  home = home.replace(myDayAnchor, myDayAnchor + myDayBlock);
}

fs.writeFileSync(homeFile, home);
console.log("[cs-followup-home] follow-ups adicionados ao Meu Dia");
