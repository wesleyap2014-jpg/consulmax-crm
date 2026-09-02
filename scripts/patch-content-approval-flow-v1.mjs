import fs from "node:fs";

const bridgeTemplatePath = "scripts/templates/CanvaProductionBridge.visual-prompt.tsx";
const bridgeRuntimePath = "src/components/marketing/CanvaProductionBridge.tsx";
const productionPath = "src/components/marketing/ProductionWorkspaceV2.tsx";
const centerPath = "src/pages/MarketingContentCenter.tsx";

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[approval-flow-v1] ${label}: anchor not found`);
  return text.replace(from, to);
}

function patchBridge(path) {
  if (!fs.existsSync(path)) return;
  let text = fs.readFileSync(path, "utf8");
  const from = `      const { error: updateError } = await supabase.from("marketing_production_orders").update({\n        status: "pronto_aprovacao",\n        updated_at: new Date().toISOString(),\n      }).eq("id", order.id);\n      if (updateError) throw updateError;\n      onNotice?.("Peça encaminhada para aprovação final.");`;
  const to = `      if (!order.variant_id) throw new Error("Esta ordem não está vinculada a uma versão editorial.");\n      const { data: userData } = await supabase.auth.getUser();\n      const user = userData.user;\n      if (!user) throw new Error("Usuário não identificado.");\n      const now = new Date().toISOString();\n\n      const { error: variantError } = await supabase.from("marketing_content_variants").update({\n        status: "aprovacao",\n        updated_at: now,\n      }).eq("id", order.variant_id);\n      if (variantError) throw variantError;\n\n      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({\n        variant_id: order.variant_id,\n        status: "pending",\n        requested_by: user.id,\n        requested_at: now,\n        decision_note: "Peça final externa enviada pelo Estúdio Visual e aguardando aprovação de publicação.",\n      });\n      if (approvalError) throw approvalError;\n\n      const { error: updateError } = await supabase.from("marketing_production_orders").update({\n        status: "pronto_aprovacao",\n        sent_for_approval_at: now,\n        updated_at: now,\n      }).eq("id", order.id);\n      if (updateError) throw updateError;\n      onNotice?.("Peça encaminhada para Aprovações e removida da fila de Produção.");`;
  text = replaceOnce(text, from, to, `${path} requestApproval`);
  fs.writeFileSync(path, text, "utf8");
}

patchBridge(bridgeTemplatePath);
patchBridge(bridgeRuntimePath);

if (fs.existsSync(productionPath)) {
  let text = fs.readFileSync(productionPath, "utf8");
  const memoAnchor = `  const variantById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);\n  const assetsByOrder = useMemo(() => {`;
  const memoReplacement = `  const variantById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);\n  const productionOrders = useMemo(() => orders.filter((item) => !["pronto_aprovacao", "aprovado"].includes(item.status)), [orders]);\n  const assetsByOrder = useMemo(() => {`;
  text = replaceOnce(text, memoAnchor, memoReplacement, "production queue memo");
  text = replaceOnce(text, `{orders.map((order) => {`, `{productionOrders.map((order) => {`, "production queue map");
  text = replaceOnce(text, `{!orders.length ? <div`, `{!productionOrders.length ? <div`, "production queue empty state");
  fs.writeFileSync(productionPath, text, "utf8");
}

if (fs.existsSync(centerPath)) {
  let text = fs.readFileSync(centerPath, "utf8");
  const approveAnchor = `      const { error: updateError } = await supabase.from("marketing_content_variants").update({ status: "aprovado" }).eq("id", variant.id);\n      if (updateError) throw updateError;\n      await supabase\n        .from("marketing_content_approvals")\n        .update({ status: "approved", decided_by: userId, decided_at: now })\n        .eq("variant_id", variant.id)\n        .eq("status", "pending");`;
  const approveReplacement = `      const { error: updateError } = await supabase.from("marketing_content_variants").update({ status: "aprovado" }).eq("id", variant.id);\n      if (updateError) throw updateError;\n      await supabase\n        .from("marketing_content_approvals")\n        .update({ status: "approved", decided_by: userId, decided_at: now })\n        .eq("variant_id", variant.id)\n        .eq("status", "pending");\n      const { error: orderError } = await supabase\n        .from("marketing_production_orders")\n        .update({ status: "aprovado", approved_at: now, updated_at: now })\n        .eq("variant_id", variant.id)\n        .eq("status", "pronto_aprovacao");\n      if (orderError) throw orderError;`;
  text = replaceOnce(text, approveAnchor, approveReplacement, "approval finalizes production order");
  fs.writeFileSync(centerPath, text, "utf8");
}

console.log("[approval-flow-v1] produção → aprovações sincronizado");
