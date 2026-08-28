import fs from "node:fs";

const centerFile = "src/pages/MarketingContentCenter.tsx";
let center = fs.readFileSync(centerFile, "utf8");
let centerChanged = false;

function replaceCenter(from, to, label) {
  if (center.includes(to)) return;
  if (!center.includes(from)) {
    console.log(`[production-factory] ${label}: âncora não encontrada`);
    return;
  }
  center = center.replace(from, to);
  centerChanged = true;
  console.log(`[production-factory] ${label}: aplicado`);
}

replaceCenter(
  'import ContentStrategyWorkspace from "@/components/marketing/ContentStrategyWorkspace";\n',
  'import ContentStrategyWorkspace from "@/components/marketing/ContentStrategyWorkspace";\nimport ProductionWorkspace from "@/components/marketing/ProductionWorkspace";\n',
  "import ProductionWorkspace",
);

const productionStart = '          <TabsContent value="producao" className="space-y-4">';
const approvalsStart = '          <TabsContent value="aprovacoes" className="space-y-4">';
const pStart = center.indexOf(productionStart);
const pEnd = center.indexOf(approvalsStart, pStart >= 0 ? pStart : 0);
if (pStart >= 0 && pEnd > pStart && !center.slice(pStart, pEnd).includes("<ProductionWorkspace")) {
  const replacement = `          <TabsContent value="producao" className="space-y-4">\n            <ProductionWorkspace\n              userId={userId}\n              onChanged={loadAll}\n              onNotice={setNotice}\n              onError={setError}\n            />\n          </TabsContent>\n\n`;
  center = center.slice(0, pStart) + replacement + center.slice(pEnd);
  centerChanged = true;
  console.log("[production-factory] aba Produção substituída pela fábrica: aplicado");
}

if (centerChanged) fs.writeFileSync(centerFile, center);

const strategyFile = "src/components/marketing/ContentStrategyWorkspace.tsx";
let strategy = fs.readFileSync(strategyFile, "utf8");
let strategyChanged = false;

function replaceStrategy(from, to, label) {
  if (strategy.includes(to)) return;
  if (!strategy.includes(from)) {
    console.log(`[production-factory] ${label}: âncora não encontrada`);
    return;
  }
  strategy = strategy.replace(from, to);
  strategyChanged = true;
  console.log(`[production-factory] ${label}: aplicado`);
}

replaceStrategy(
  '  validation_status: "untested",\n',
  '  validation_status: "untested",\n  production_selection: ["test"],\n',
  "seleção padrão de produção",
);

const approveStart = strategy.indexOf('  async function approveEditorial() {');
const approveEnd = strategy.indexOf('  async function rejectEditorial() {', approveStart >= 0 ? approveStart : 0);
if (approveStart >= 0 && approveEnd > approveStart && !strategy.slice(approveStart, approveEnd).includes("ensureProductionOrder")) {
  const replacement = `  async function getDefaultBrandKitId() {\n    const { data } = await supabase\n      .from("marketing_content_settings")\n      .select("id,name")\n      .eq("setting_type", "brand_kit")\n      .eq("active", true)\n      .order("created_at", { ascending: true });\n    const rows = data || [];\n    return rows.find((item: any) => String(item.name || "").toLowerCase().includes("consulmax oficial"))?.id || rows[0]?.id || null;\n  }\n\n  function productionSpec(key: string, item: any) {\n    const map: Record<string, { provider: string; format: string; title: string }> = {\n      instagram_carousel: { provider: "instagram", format: "carrossel", title: item?.title || "Carrossel" },\n      instagram_stories: { provider: "instagram", format: "stories", title: item?.title || "Sequência de Stories" },\n      tiktok: { provider: "tiktok", format: "video", title: item?.title || "TikTok" },\n      youtube_short: { provider: "youtube", format: "short", title: item?.title || "YouTube Short" },\n      youtube_long: { provider: "youtube", format: "youtube_long", title: item?.title || "YouTube longo" },\n      linkedin: { provider: "linkedin", format: "post", title: item?.title || "LinkedIn" },\n      whatsapp: { provider: "whatsapp", format: "status", title: item?.title || "WhatsApp Status" },\n      facebook: { provider: "facebook", format: "post", title: item?.title || "Facebook" },\n    };\n    return map[key];\n  }\n\n  async function ensureDeepeningVariant(content: ContentRow, key: string, item: any) {\n    const spec = productionSpec(key, item);\n    if (!spec) return null;\n    const existing = (variantsByContent.get(content.id) || []).find((variant) =>\n      variant.ai_generation_metadata?.production_source_key === key &&\n      variant.ai_generation_metadata?.motor_version === "content_engine_v2",\n    );\n    const row = {\n      provider: spec.provider,\n      format: spec.format,\n      title: spec.title,\n      hook: item?.hook || item?.title || null,\n      body: item?.approach || item?.angle || item?.objective || null,\n      caption: item?.caption || item?.copy || null,\n      script: item?.script || item?.approach || null,\n      cta: item?.cta || null,\n      creative_brief: item?.visual_direction || null,\n      aspect_ratio: spec.format === "stories" || spec.format === "status" || spec.format === "video" || spec.format === "short" ? "9:16" : spec.format === "carrossel" ? "4:5" : null,\n      ai_generation_metadata: { motor_version: "content_engine_v2", stage: "aprofundamento", production_source_key: key, production_blueprint: item || {}, generated_at: new Date().toISOString() },\n      status: "producao",\n      updated_at: new Date().toISOString(),\n    };\n    if (existing) {\n      const { error } = await supabase.from("marketing_content_variants").update(row).eq("id", existing.id);\n      if (error) throw error;\n      return existing.id;\n    }\n    const { data, error } = await supabase.from("marketing_content_variants").insert({ content_id: content.id, ...row, created_by: userId }).select("id").single();\n    if (error) throw error;\n    return data.id as string;\n  }\n\n  async function ensureProductionOrder(content: ContentRow, variantId: string, provider: string, format: string, title: string, blueprint: any, brandKitId: string | null, now: string) {\n    const status = ["reel", "video", "short", "youtube_long"].includes(format) ? "aguardando_insumos" : "aguardando_producao";\n    const payload = {\n      content_id: content.id, variant_id: variantId, provider, format, title, status, brand_kit_setting_id: brandKitId,\n      blueprint: blueprint || {}, metadata: { source: "content_engine_v2", approved_selection: true }, created_by: userId, approved_editorially_at: now, updated_at: now,\n    };\n    const { data: existing } = await supabase.from("marketing_production_orders").select("id").eq("variant_id", variantId).maybeSingle();\n    if (existing?.id) {\n      const { error } = await supabase.from("marketing_production_orders").update(payload).eq("id", existing.id);\n      if (error) throw error;\n      return existing.id;\n    }\n    const { error } = await supabase.from("marketing_production_orders").insert(payload);\n    if (error) throw error;\n  }\n\n  async function approveEditorial() {\n    if (!selectedContent || !userId) return;\n    setSaving(true);\n    try {\n      const testVariantId = await persistStrategy(selectedContent, draft, true);\n      if (!testVariantId) throw new Error("Peça de teste não encontrada.");\n      const selected = Array.isArray(draft.production_selection) && draft.production_selection.length ? draft.production_selection : ["test"];\n      const now = new Date().toISOString();\n      const brandKitId = await getDefaultBrandKitId();\n      const approvedVariantIds: string[] = [];\n\n      if (selected.includes("test")) {\n        const { error: testError } = await supabase.from("marketing_content_variants").update({ status: "producao", updated_at: now }).eq("id", testVariantId);\n        if (testError) throw testError;\n        await ensureProductionOrder(selectedContent, testVariantId, draft.test?.provider || "instagram", draft.test?.format || "reel", draft.test?.title || selectedContent.title, draft.test || {}, brandKitId, now);\n        approvedVariantIds.push(testVariantId);\n      }\n\n      for (const key of selected.filter((item: string) => item !== "test")) {\n        const item = draft.deepening_plan?.[key];\n        if (!item) continue;\n        const spec = productionSpec(key, item);\n        if (!spec) continue;\n        const variantId = await ensureDeepeningVariant(selectedContent, key, item);\n        if (!variantId) continue;\n        await ensureProductionOrder(selectedContent, variantId, spec.provider, spec.format, spec.title, item, brandKitId, now);\n        approvedVariantIds.push(variantId);\n      }\n\n      if (!approvedVariantIds.length) throw new Error("Selecione ao menos uma peça para Produção.");\n      const { error: contentError } = await supabase.from("marketing_content_items").update({ status: "producao", approved_by: userId, approved_at: now, ai_context: { ...(selectedContent.ai_context || {}), content_strategy_v2: { ...draft, production_selection: selected } }, updated_at: now }).eq("id", selectedContent.id);\n      if (contentError) throw contentError;\n      const approvalRows = approvedVariantIds.map((variantId) => ({ variant_id: variantId, status: "approved", requested_by: userId, decided_by: userId, requested_at: now, decided_at: now, decision_note: "Aprovação editorial — peça liberada para a Fábrica de Produção." }));\n      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert(approvalRows);\n      if (approvalError) throw approvalError;\n      onNotice?.(\`\${approvedVariantIds.length} peça(s) aprovada(s) editorialmente e enviadas para Produção.\`);\n      setSelectedContentId(null);\n      await load();\n      await onChanged?.();\n    } catch (err: any) {\n      onError?.(err?.message || "Erro ao aprovar o conteúdo para Produção.");\n    } finally {\n      setSaving(false);\n    }\n  }\n\n`;
  strategy = strategy.slice(0, approveStart) + replacement + strategy.slice(approveEnd);
  strategyChanged = true;
  console.log("[production-factory] aprovação editorial cria ordens de produção: aplicado");
}

const derivationMarker = '              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">\n                <SectionTitle step="5" title="Derivações e próxima pauta"';
if (strategy.includes(derivationMarker) && !strategy.includes('title="Peças que seguirão para Produção"')) {
  const productionSelection = `              <section className="rounded-2xl border border-[#A11C27]/15 bg-white p-5">\n                <SectionTitle step="5" title="Peças que seguirão para Produção" description="O Reel de teste vem selecionado por padrão. Você pode aprovar outros formatos agora quando quiser produzir uma campanha completa sem esperar a validação do teste." />\n                <div className="grid gap-2 md:grid-cols-2">\n                  {[\n                    ["test", "Instagram · Reel de teste", draft.test],\n                    ["instagram_carousel", "Instagram · Carrossel", deepening.instagram_carousel],\n                    ["instagram_stories", "Instagram · Stories", deepening.instagram_stories],\n                    ["tiktok", "TikTok", deepening.tiktok],\n                    ["youtube_short", "YouTube · Short", deepening.youtube_short],\n                    ["youtube_long", "YouTube · Longo", deepening.youtube_long],\n                    ["linkedin", "LinkedIn", deepening.linkedin],\n                    ["whatsapp", "WhatsApp / Status", deepening.whatsapp],\n                    ["facebook", "Facebook", deepening.facebook],\n                  ].filter(([, , value]) => Boolean(value)).map(([key, label]) => {\n                    const selected = (draft.production_selection || ["test"]).includes(key as string);\n                    return <label key={key as string} className={\`flex cursor-pointer items-start gap-3 rounded-xl border p-3 \${selected ? "border-[#A11C27]/30 bg-[#A11C27]/5" : "border-slate-200"}\`}><input type="checkbox" className="mt-1" checked={selected} onChange={(e) => { const current = Array.isArray(draft.production_selection) ? draft.production_selection : ["test"]; const next = e.target.checked ? Array.from(new Set([...current, key])) : current.filter((item: string) => item !== key); setPath(["production_selection"], next); }} /><div><p className="text-sm font-semibold text-[#1E293F]">{label as string}</p><p className="mt-1 text-xs text-slate-500">{key === "test" ? "Peça inicial para testar a tese" : "Produzir agora junto com a campanha"}</p></div></label>;\n                  })}\n                </div>\n              </section>\n\n              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">\n                <SectionTitle step="6" title="Derivações e próxima pauta"`;
  strategy = strategy.replace(derivationMarker, productionSelection);
  strategyChanged = true;
  console.log("[production-factory] seletor de peças para produção: aplicado");
}

replaceStrategy(
  'Aprovar aqui significa liberar a peça de teste para Produção — não publicar.',
  'Aprovar aqui significa liberar as peças selecionadas para a Fábrica de Produção — não publicar.',
  "copy da aprovação editorial",
);

if (strategyChanged) fs.writeFileSync(strategyFile, strategy);
console.log(`[production-factory] ${centerChanged || strategyChanged ? "concluído com alterações" : "já aplicado"}`);
