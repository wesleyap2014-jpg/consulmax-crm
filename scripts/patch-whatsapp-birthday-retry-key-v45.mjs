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

if (!home.includes("const csPendingSalesRows =")) {
  const pendingAnchor = `    const csFollowUpRows = (csFollowUpRaw || []) as any[];\n\n`;
  if (!home.includes(pendingAnchor)) throw new Error("[cs-pending-home] âncora do follow-up não encontrada");
  const pendingQuery = `    let csPendingSalesQ = supabase\n      .from("vendas")\n      .select("id,lead_id,data_venda,vendedor_id,administradora,grupo,cota,valor_venda,cancelada_em")\n      .gte("data_venda", "2026-08-01")\n      .is("cancelada_em", null)\n      .not("lead_id", "is", null)\n      .order("data_venda", { ascending: true })\n      .limit(500);\n    csPendingSalesQ = scope.isGlobal\n      ? csPendingSalesQ\n      : scope.vendedorIds.length\n        ? csPendingSalesQ.in("vendedor_id", scope.vendedorIds)\n        : csPendingSalesQ.eq("vendedor_id", noRowsId);\n    const { data: csPendingSalesRaw, error: csPendingSalesErr } = await csPendingSalesQ;\n    if (csPendingSalesErr) console.warn("[Inicio] Não foi possível carregar vendas pendentes do Sucesso do Cliente:", csPendingSalesErr);\n    const csPendingSalesBase = (csPendingSalesRaw || []) as any[];\n    const csPendingLeadIds = Array.from(new Set(csPendingSalesBase.map((v) => String(v.lead_id || "")).filter(Boolean)));\n    let csPendingClients: any[] = [];\n    let csPendingLeads: any[] = [];\n    if (csPendingLeadIds.length) {\n      const [clientsRes, leadsRes] = await Promise.all([\n        supabase.from("clientes").select("id,lead_id,nome,observacoes").in("lead_id", csPendingLeadIds),\n        supabase.from("leads").select("id,nome").in("id", csPendingLeadIds),\n      ]);\n      if (clientsRes.error) console.warn("[Inicio] Não foi possível carregar clientes do Sucesso do Cliente:", clientsRes.error);\n      if (leadsRes.error) console.warn("[Inicio] Não foi possível carregar leads do Sucesso do Cliente:", leadsRes.error);\n      csPendingClients = (clientsRes.data || []) as any[];\n      csPendingLeads = (leadsRes.data || []) as any[];\n    }\n    const csPendingClientMap = new Map(csPendingClients.map((c) => [String(c.lead_id || ""), c]));\n    const csPendingLeadMap = new Map(csPendingLeads.map((l) => [String(l.id || ""), l]));\n    const csPendingSalesRows = csPendingSalesBase.filter((v) => {\n      const cliente = csPendingClientMap.get(String(v.lead_id || ""));\n      const raw = String(cliente?.observacoes || "").trim();\n      const json = raw.startsWith("CMX_JSON:") ? raw.slice(9).trim() : raw;\n      let payload: any = {};\n      if (json) { try { payload = JSON.parse(json); } catch { payload = {}; } }\n      const record = payload?.customer_success_by_venda?.[v.id];\n      return normalizeText(record?.status || "pendente") === "pendente";\n    }).map((v) => ({ ...v, cliente: csPendingClientMap.get(String(v.lead_id || "")) || null, lead: csPendingLeadMap.get(String(v.lead_id || "")) || null }));\n\n`;
  home = home.replace(pendingAnchor, pendingAnchor + pendingQuery);
}

if (!home.includes('id: "cs-followup:" + e.id')) {
  const myDayAnchor = `    const myDay: MeuDiaAlert[] = [];\n`;
  if (!home.includes(myDayAnchor)) throw new Error("[cs-followup-home] âncora Meu Dia não encontrada");
  const myDayBlock = `    for (const e of csFollowUpRows) {\n      const dueYmd = ymdFromDateInOffset(new Date(e.inicio_at), PV_OFFSET_MIN);\n      const overdue = dueYmd < today;\n      const detail = String(e.descricao || "").trim();\n      myDay.push({\n        id: "cs-followup:" + e.id,\n        priority: 15,\n        icon: "bell",\n        title: e.titulo || "Follow-up Sucesso do Cliente",\n        desc: (overdue ? "Follow-up vencido em " + fmtDateBRFromYMD(dueYmd) + "." : "Retorno agendado para hoje.") + (detail ? " " + detail : ""),\n        action: { label: "Abrir Sucesso do Cliente", to: "/clientes" },\n      });\n    }\n`;
  home = home.replace(myDayAnchor, myDayAnchor + myDayBlock);
}

if (!home.includes('id: "cs-pending:" + v.id')) {
  const pendingDayAnchor = `    for (const e of csFollowUpRows) {\n      const dueYmd = ymdFromDateInOffset(new Date(e.inicio_at), PV_OFFSET_MIN);\n      const overdue = dueYmd < today;\n      const detail = String(e.descricao || "").trim();\n      myDay.push({\n        id: "cs-followup:" + e.id,\n        priority: 15,\n        icon: "bell",\n        title: e.titulo || "Follow-up Sucesso do Cliente",\n        desc: (overdue ? "Follow-up vencido em " + fmtDateBRFromYMD(dueYmd) + "." : "Retorno agendado para hoje.") + (detail ? " " + detail : ""),\n        action: { label: "Abrir Sucesso do Cliente", to: "/clientes" },\n      });\n    }\n`;
  if (!home.includes(pendingDayAnchor)) throw new Error("[cs-pending-home] bloco de follow-up no Meu Dia não encontrado");
  const pendingDayBlock = `    for (const v of csPendingSalesRows) {\n      const clientName = String(v.cliente?.nome || v.lead?.nome || "Cliente").trim() || "Cliente";\n      const saleDate = toYMD(v.data_venda);\n      const saleInfo = [v.administradora || null, v.grupo ? "G " + v.grupo : null, v.cota ? "C " + v.cota : null].filter(Boolean).join(" • ");\n      myDay.push({\n        id: "cs-pending:" + v.id,\n        priority: 14,\n        icon: "bell",\n        title: "Sucesso do Cliente pendente — " + clientName,\n        desc: (saleInfo ? saleInfo + ". " : "") + "Venda registrada" + (saleDate ? " em " + fmtDateBRFromYMD(saleDate) : "") + ".",\n        action: { label: "Realizar Sucesso do Cliente", to: "/clientes" },\n      });\n    }\n`;
  home = home.replace(pendingDayAnchor, pendingDayAnchor + pendingDayBlock);
}

fs.writeFileSync(homeFile, home);
console.log("[cs-followup-home] follow-ups e pendências adicionados ao Meu Dia");
