import fs from "node:fs";

const editorFile = "src/components/marketing/ContentSettingsEditor.tsx";
const orchestratorFile = "api/marketing/content-orchestrator.ts";
let changed = false;

function replaceOnce(file, label, from, to) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[brand-kit-assets] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  fs.writeFileSync(file, src);
  changed = true;
  console.log(`[brand-kit-assets] ${label}: aplicado`);
}

replaceOnce(
  editorFile,
  "import BrandKitAssets",
  'import { Textarea } from "@/components/ui/textarea";\n',
  'import { Textarea } from "@/components/ui/textarea";\nimport BrandKitAssets from "@/components/marketing/BrandKitAssets";\n',
);

replaceOnce(
  editorFile,
  "arquivos oficiais no formulário do Brand Kit",
  '                      <Textarea rows={5} placeholder="Regras visuais: logos, fotografia, composição, proibições..." value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />\n',
  '                      <Textarea rows={5} placeholder="Regras visuais: logos, fotografia, composição, proibições..." value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />\n                      <BrandKitAssets settingId={editingId} userId={userId} />\n',
);

replaceOnce(
  editorFile,
  "descrição do Brand Kit",
  '    description: "Identidade visual, voz, cores, fontes e regras da marca.",',
  '    description: "Identidade visual, voz, cores, logos, arquivos de fontes e regras da marca.",',
);

replaceOnce(
  orchestratorFile,
  "inventário de ativos oficiais",
  `async function loadEditorialSettings() {\n  const { data, error } = await supabaseAdmin\n    .from("marketing_content_settings")\n    .select("setting_type,name,payload")\n    .eq("active", true)\n    .order("setting_type", { ascending: true });\n\n  if (error) {\n    console.warn("[content-orchestrator] não foi possível carregar configurações editoriais", error.message);\n    return [] as EditorialSetting[];\n  }\n\n  return (data || []) as EditorialSetting[];\n}`,
  `async function loadEditorialSettings() {\n  const { data, error } = await supabaseAdmin\n    .from("marketing_content_settings")\n    .select("id,setting_type,name,payload")\n    .eq("active", true)\n    .order("setting_type", { ascending: true });\n\n  if (error) {\n    console.warn("[content-orchestrator] não foi possível carregar configurações editoriais", error.message);\n    return [] as EditorialSetting[];\n  }\n\n  const settings = (data || []) as Array<EditorialSetting & { id?: string }>;\n  const brandIds = settings.filter((item) => item.setting_type === "brand_kit" && item.id).map((item) => String(item.id));\n  if (!brandIds.length) return settings;\n\n  const { data: assets, error: assetsError } = await supabaseAdmin\n    .from("marketing_brand_assets")\n    .select("setting_id,asset_type,role,file_name,file_path,mime_type,metadata,is_primary,active")\n    .in("setting_id", brandIds)\n    .eq("active", true)\n    .order("is_primary", { ascending: false });\n\n  if (assetsError) {\n    console.warn("[content-orchestrator] inventário de ativos do Brand Kit indisponível", assetsError.message);\n    return settings;\n  }\n\n  return settings.map((setting) => {\n    if (setting.setting_type !== "brand_kit") return setting;\n    const officialAssets = (assets || [])\n      .filter((asset: any) => String(asset.setting_id) === String(setting.id))\n      .map((asset: any) => ({\n        asset_type: asset.asset_type,\n        role: asset.role,\n        file_name: asset.file_name,\n        file_path: asset.file_path,\n        mime_type: asset.mime_type,\n        is_primary: asset.is_primary,\n        metadata: asset.metadata || {},\n      }));\n    return { ...setting, payload: { ...(setting.payload || {}), official_assets: officialAssets } };\n  });\n}`,
);

replaceOnce(
  orchestratorFile,
  "regra de fonte da verdade",
  '- Quando houver informação financeira, não invente números, taxas ou resultados.\n',
  '- Quando houver informação financeira, não invente números, taxas ou resultados.\n- Quando o Brand Kit tiver arquivos oficiais cadastrados, trate-os como fonte de verdade: nunca redesenhe a logo com IA e nunca substitua uma fonte cadastrada por uma fonte “parecida”.\n',
);

console.log(`[brand-kit-assets] ${changed ? "concluído com alterações" : "já aplicado"}`);

await import("./patch-brand-kit-logo-context-v2.mjs");
