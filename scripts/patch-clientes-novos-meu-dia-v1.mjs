import fs from "node:fs";

const homeFile = "src/pages/Inicio.tsx";
if (!fs.existsSync(homeFile)) throw new Error("[clientes-novos-meu-dia] Inicio.tsx não encontrado");

let home = fs.readFileSync(homeFile, "utf8");

// Sucesso do Cliente só vira tarefa quando o cadastro do cliente já existe.
// Antes disso, a tarefa correta é concluir o cadastro.
const csReturn = `      const record = payload?.customer_success_by_venda?.[v.id];\n      return normalizeText(record?.status || "pendente") === "pendente";`;
const csReturnWithClient = `      const record = payload?.customer_success_by_venda?.[v.id];\n      return Boolean(cliente?.id) && normalizeText(record?.status || "pendente") === "pendente";`;
if (home.includes(csReturn)) home = home.replace(csReturn, csReturnWithClient);

if (!home.includes("const clientRegistrationPendingRows =")) {
  const queryAnchor = `    }).map((v) => ({ ...v, cliente: csPendingClientMap.get(String(v.lead_id || "")) || null, lead: csPendingLeadMap.get(String(v.lead_id || "")) || null }));\n\n`;
  if (!home.includes(queryAnchor)) throw new Error("[clientes-novos-meu-dia] âncora das pendências de Sucesso do Cliente não encontrada");

  const registrationQuery = `    const { data: clientRegistrationSalesRaw, error: clientRegistrationSalesErr } = await supabase\n      .from("vendas")\n      .select("id,lead_id,created_at,vendedor_id,cpf,cpf_cnpj,telefone,email,grupo,administradora,codigo")\n      .not("lead_id", "is", null)\n      .order("created_at", { ascending: false })\n      .limit(20000);\n    if (clientRegistrationSalesErr) console.warn("[Inicio] Não foi possível carregar vendas para cadastros pendentes:", clientRegistrationSalesErr);\n    const clientRegistrationSales = (clientRegistrationSalesRaw || []) as any[];\n    const clientRegistrationLeadIds = Array.from(new Set(clientRegistrationSales.map((v) => String(v.lead_id || "")).filter(Boolean)));\n    let clientRegistrationClients: any[] = [];\n    let clientRegistrationLeads: any[] = [];\n    if (clientRegistrationLeadIds.length) {\n      const [clientsRes, leadsRes] = await Promise.all([\n        supabase.from("clientes").select("id,lead_id").in("lead_id", clientRegistrationLeadIds),\n        supabase.from("leads").select("id,nome,telefone,email").in("id", clientRegistrationLeadIds),\n      ]);\n      if (clientsRes.error) console.warn("[Inicio] Não foi possível conferir cadastros concluídos:", clientsRes.error);\n      if (leadsRes.error) console.warn("[Inicio] Não foi possível carregar leads com cadastro pendente:", leadsRes.error);\n      clientRegistrationClients = (clientsRes.data || []) as any[];\n      clientRegistrationLeads = (leadsRes.data || []) as any[];\n    }\n    const clientRegistrationConfirmed = new Set(clientRegistrationClients.map((c) => String(c.lead_id || "")).filter(Boolean));\n    const clientRegistrationLeadMap = new Map(clientRegistrationLeads.map((l) => [String(l.id || ""), l]));\n    const clientRegistrationLatestSale = new Map<string, any>();\n    const clientRegistrationHasDocument = new Set<string>();\n    for (const sale of clientRegistrationSales) {\n      const leadId = String(sale.lead_id || "");\n      if (!leadId) continue;\n      if (!clientRegistrationLatestSale.has(leadId)) clientRegistrationLatestSale.set(leadId, sale);\n      const cpfDigits = String(sale.cpf || "").replace(/\\D+/g, "");\n      if (cpfDigits.length > 0 || sale.cpf_cnpj != null) clientRegistrationHasDocument.add(leadId);\n    }\n    const clientRegistrationAllowedSellers = new Set(scope.vendedorIds.map((id) => String(id)));\n    const clientRegistrationPendingRows = clientRegistrationLeadIds\n      .filter((leadId) => clientRegistrationHasDocument.has(leadId) && !clientRegistrationConfirmed.has(leadId))\n      .filter((leadId) => {\n        if (scope.isGlobal) return true;\n        const sellerId = String(clientRegistrationLatestSale.get(leadId)?.vendedor_id || "");\n        return clientRegistrationAllowedSellers.has(sellerId);\n      })\n      .map((leadId) => ({\n        lead_id: leadId,\n        lead: clientRegistrationLeadMap.get(leadId) || null,\n        venda: clientRegistrationLatestSale.get(leadId) || null,\n      }))\n      .sort((a, b) => String(a.lead?.nome || "").localeCompare(String(b.lead?.nome || ""), "pt-BR", { sensitivity: "base" }));\n\n`;

  home = home.replace(queryAnchor, queryAnchor + registrationQuery);
}

if (!home.includes('id: "client-registration:" + item.lead_id')) {
  const dayAnchor = `    for (const v of csPendingSalesRows) {\n`;
  if (!home.includes(dayAnchor)) throw new Error("[clientes-novos-meu-dia] âncora do Meu Dia não encontrada");

  const dayBlock = `    for (const item of clientRegistrationPendingRows) {\n      const clientName = String(item.lead?.nome || "Cliente").trim() || "Cliente";\n      const sale = item.venda || {};\n      const saleInfo = [sale.administradora || null, sale.grupo ? "G " + sale.grupo : null].filter(Boolean).join(" • ");\n      myDay.push({\n        id: "client-registration:" + item.lead_id,\n        priority: 16,\n        icon: "alert",\n        title: "Cadastro do cliente pendente — " + clientName,\n        desc: (saleInfo ? saleInfo + ". " : "") + "Cliente novo aguardando o preenchimento do cadastro.",\n        action: { label: "Preencher cadastro", to: "/clientes" },\n      });\n    }\n`;

  home = home.replace(dayAnchor, dayBlock + dayAnchor);
}

fs.writeFileSync(homeFile, home);
console.log("[clientes-novos-meu-dia] clientes com Preencher Cadastro adicionados ao Meu Dia");
