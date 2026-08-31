import fs from "node:fs";

const path = "src/components/marketing/ProductionWorkspaceV2.tsx";
if (!fs.existsSync(path)) throw new Error("[canva-first-v1] ProductionWorkspaceV2.tsx não encontrado");
let text = fs.readFileSync(path, "utf8");
let changed = false;

function replaceOnce(before, after, label) {
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`[canva-first-v1] âncora não encontrada: ${label}`);
  text = text.replace(before, after);
  changed = true;
}

replaceOnce(
  '} from "./productionVisualRenderer";',
  '} from "./productionVisualRenderer";\nimport { CanvaOrderActions, CanvaProductionStatusBar } from "./CanvaProductionBridge";',
  "import Canva bridge",
);

const outputAnchor = `  function currentOutputAssets(order: ProductionOrder) {\n    const orderAssets = assetsByOrder.get(order.id) || [];`;
const outputReplacement = `  function currentOutputAssets(order: ProductionOrder) {\n    const orderAssets = assetsByOrder.get(order.id) || [];\n    const canvaRevision = Number(order.metadata?.canva_revision || 0);\n    const canvaAssets = orderAssets.filter((asset) => {\n      if (asset.metadata?.source !== "canva") return false;\n      if (canvaRevision && Number(asset.metadata?.canva_revision || 0) !== canvaRevision) return false;\n      return OUTPUT_ROLES.has(asset.asset_role || "");\n    });\n    if (canvaAssets.length) {\n      if (isVideo(order)) {\n        return [\n          ...orderAssets.filter((asset) => asset.asset_role === "final_video"),\n          ...canvaAssets,\n        ];\n      }\n      return canvaAssets;\n    }`;
replaceOnce(outputAnchor, outputReplacement, "preferência por outputs Canva");

const statusAnchor = `      <div className="rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4">`;
const statusReplacement = `      <CanvaProductionStatusBar\n        onNotice={onNotice}\n        onError={onError}\n        onChanged={async () => { await load(); await onChanged?.(); }}\n      />\n\n      <div className="rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4">`;
replaceOnce(statusAnchor, statusReplacement, "status Canva no topo");

text = text.replace(
  '<p className="text-sm font-semibold text-[#1E293F]">Motor Visual V2</p><p className="mt-1 text-xs leading-5 text-slate-600">Carrossel é tratado como sequência editorial; Stories como conversa; Status como mensagem curta; post estático como uma ideia forte; capas como hook visual. O motor evita repetir o mesmo layout e não usa mais o modelo de “título + subtítulo” em todas as telas.</p>',
  '<p className="text-sm font-semibold text-[#1E293F]">Fallback local · Motor Visual V2</p><p className="mt-1 text-xs leading-5 text-slate-600">O Canva é a camada visual oficial. Este motor local permanece disponível apenas para prévias rápidas, contingência e comparação. A inteligência editorial continua sendo do Max.</p>',
);

const actionsAnchor = `                <div className="mt-4 flex flex-wrap gap-2">\n                  {isVideo(order) ? <>`;
const actionsReplacement = `                <div className="mt-4 flex flex-wrap gap-2">\n                  <CanvaOrderActions\n                    order={order}\n                    onNotice={onNotice}\n                    onError={onError}\n                    onChanged={async () => { await load(); await onChanged?.(); }}\n                  />\n\n                  {isVideo(order) ? <>`;
replaceOnce(actionsAnchor, actionsReplacement, "ações Canva por ordem");

const labelReplacements = [
  ['currentThumbVersion ? "Nova capa" : "Gerar capa"', 'currentThumbVersion ? "Nova capa local" : "Capa local (fallback)"'],
  ['Produzir com Motor Visual V2', 'Prévia local (fallback)'],
  ['Ajustar capa com IA', 'Ajustar capa local'],
];
for (const [before, after] of labelReplacements) {
  if (text.includes(before)) {
    text = text.replaceAll(before, after);
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(path, text, "utf8");
  console.log("[canva-first-v1] Produção migrada para arquitetura Canva-first");
} else {
  console.log("[canva-first-v1] arquitetura Canva-first já aplicada");
}
