import fs from "node:fs";

const editorFile = "src/components/marketing/ContentSettingsEditor.tsx";
const orchestratorFile = "api/marketing/content-orchestrator.ts";
let changed = false;

function replaceOnce(file, label, from, to) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[brand-kit-logo-context-v2] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  fs.writeFileSync(file, src);
  changed = true;
  console.log(`[brand-kit-logo-context-v2] ${label}: aplicado`);
}

replaceOnce(
  editorFile,
  "componente de ativos v2",
  'import BrandKitAssets from "@/components/marketing/BrandKitAssets";\n',
  'import BrandKitAssetsV2 from "@/components/marketing/BrandKitAssetsV2";\n',
);

replaceOnce(
  editorFile,
  "uso do componente de ativos v2",
  '<BrandKitAssets settingId={editingId} userId={userId} />',
  '<BrandKitAssetsV2 settingId={editingId} userId={userId} />',
);

replaceOnce(
  orchestratorFile,
  "contexto explícito de formato e fundo",
  '        is_primary: asset.is_primary,\n        metadata: asset.metadata || {},\n',
  '        is_primary: asset.is_primary,\n        logo_format: asset.asset_type === "logo" ? (asset.metadata?.logo_format || asset.role) : null,\n        background_context: asset.asset_type === "logo" ? (asset.metadata?.background_context || "any") : null,\n        metadata: asset.metadata || {},\n',
);

replaceOnce(
  orchestratorFile,
  "regra de seleção da logo",
  '- Quando o Brand Kit tiver arquivos oficiais cadastrados, trate-os como fonte de verdade: nunca redesenhe a logo com IA e nunca substitua uma fonte cadastrada por uma fonte “parecida”.\n',
  '- Quando o Brand Kit tiver arquivos oficiais cadastrados, trate-os como fonte de verdade: nunca redesenhe a logo com IA e nunca substitua uma fonte cadastrada por uma fonte “parecida”.\n- Para logos oficiais, escolha sempre pela combinação de logo_format (vertical, horizontal ou icon) + background_context (light ou dark). O campo is_primary é apenas a preferência padrão e nunca deve substituir uma versão incompatível com o fundo da peça.\n',
);

console.log(`[brand-kit-logo-context-v2] ${changed ? "concluído com alterações" : "já aplicado"}`);
