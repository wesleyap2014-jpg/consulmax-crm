import fs from "node:fs";

const templatePath = "scripts/templates/CanvaProductionBridge.visual-prompt.tsx";
const bridgePath = "src/components/marketing/CanvaProductionBridge.tsx";
const workspacePath = "src/components/marketing/ProductionWorkspaceV2.tsx";

if (!fs.existsSync(templatePath)) throw new Error("[visual-prompt-studio-v1] template do bridge não encontrado");
if (!fs.existsSync(workspacePath)) throw new Error("[visual-prompt-studio-v1] ProductionWorkspaceV2 não encontrado");

fs.copyFileSync(templatePath, bridgePath);
console.log("[visual-prompt-studio-v1] bridge Canva substituído pelo Estúdio de Prompts Visuais");

let bridge = fs.readFileSync(bridgePath, "utf8");
let bridgeChanged = false;

const uploadStartOld = `  async function uploadFinal(files: FileList | null) {\n    if (!files?.length) return;\n    setBusy(true);`;
const uploadStartNew = `  async function uploadFinal(files: FileList | null) {\n    const selectedFiles = Array.from(files || []);\n    if (!selectedFiles.length) return;\n    setBusy(true);`;
if (bridge.includes(uploadStartOld)) {
  bridge = bridge.replace(uploadStartOld, uploadStartNew);
  bridgeChanged = true;
}

const uploadLoopOld = `      for (let index = 0; index < files.length; index += 1) {\n        const file = files[index];`;
const uploadLoopNew = `      for (let index = 0; index < selectedFiles.length; index += 1) {\n        const file = selectedFiles[index];`;
if (bridge.includes(uploadLoopOld)) {
  bridge = bridge.replace(uploadLoopOld, uploadLoopNew);
  bridgeChanged = true;
}

if (bridge.includes("external_visual_count: files.length,")) {
  bridge = bridge.replace("external_visual_count: files.length,", "external_visual_count: selectedFiles.length,");
  bridgeChanged = true;
}

if (bridge.includes("onNotice?.(`${files.length} imagem(ns) final(is) enviada(s). A peça está em revisão.`);")) {
  bridge = bridge.replace(
    "onNotice?.(`${files.length} imagem(ns) final(is) enviada(s). A peça está em revisão.`);",
    "onNotice?.(`${selectedFiles.length} imagem(ns) final(is) enviada(s). A peça está em revisão.`);",
  );
  bridgeChanged = true;
}

if (bridgeChanged) {
  fs.writeFileSync(bridgePath, bridge, "utf8");
  console.log("[visual-prompt-studio-v1] upload final usa snapshot estável dos arquivos selecionados");
} else {
  console.log("[visual-prompt-studio-v1] upload final já está estabilizado ou âncoras não foram encontradas");
}

let text = fs.readFileSync(workspacePath, "utf8");
let changed = false;

const oldInfo = '<p className="text-sm font-semibold text-[#1E293F]">Fallback local · Motor Visual V2</p><p className="mt-1 text-xs leading-5 text-slate-600">O Canva é a camada visual oficial. Este motor local permanece disponível apenas para prévias rápidas, contingência e comparação. A inteligência editorial continua sendo do Max.</p>';
const newInfo = '<p className="text-sm font-semibold text-[#1E293F]">Produção visual orientada pelo Max</p><p className="mt-1 text-xs leading-5 text-slate-600">O Max gera a direção criativa e os prompts profissionais. A execução visual acontece no Canva AI, Adobe Firefly ou com designer humano; depois, a peça final retorna ao CRM para revisão e aprovação.</p>';
if (text.includes(oldInfo)) {
  text = text.replace(oldInfo, newInfo);
  changed = true;
}

const localThumbButton = '<Button disabled={isBusy} variant="outline" onClick={() => generateThumbnail(order)}><ImageIcon className="mr-2 h-4 w-4" />{currentThumbVersion ? "Nova capa local" : "Capa local (fallback)"}</Button>\n                    {currentThumbVersion ? <Button disabled={isBusy} variant="outline" onClick={() => openAdjustment(order, "thumbnail")}><SlidersHorizontal className="mr-2 h-4 w-4" />Ajustar capa local</Button> : null}\n                    ';
if (text.includes(localThumbButton)) {
  text = text.replace(localThumbButton, "");
  changed = true;
}

const localStaticBlock = '{isStatic(order) && !currentVersion ? <Button disabled={isBusy} onClick={() => produceStatic(order)} className="bg-[#1E293F] hover:bg-[#26344f]">{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}Prévia local (fallback)</Button> : null}\n                  {isStatic(order) && currentVersion ? <>\n                    <Button disabled={isBusy} onClick={() => openAdjustment(order, "static")} className="bg-[#1E293F] hover:bg-[#26344f]"><WandSparkles className="mr-2 h-4 w-4" />Solicitar ajuste à IA</Button>\n                    <Button disabled={isBusy} variant="outline" onClick={() => createNewVariation(order)}><Sparkles className="mr-2 h-4 w-4" />Nova variação</Button>\n                  </> : null}\n\n                  ';
if (text.includes(localStaticBlock)) {
  text = text.replace(localStaticBlock, "");
  changed = true;
}

if (changed) {
  fs.writeFileSync(workspacePath, text, "utf8");
  console.log("[visual-prompt-studio-v1] ações antigas do renderizador local removidas do fluxo principal");
} else {
  console.log("[visual-prompt-studio-v1] workspace já está no novo fluxo ou âncoras não estavam presentes");
}

await import(`./patch-canva-brand-kit-name-v1.mjs?build=${Date.now()}`);
