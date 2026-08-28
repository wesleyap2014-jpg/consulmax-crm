import fs from "node:fs";

const file = "src/pages/MarketingContentCenter.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

const importAnchor = 'import { Textarea } from "@/components/ui/textarea";\n';
const importLine = 'import { Textarea } from "@/components/ui/textarea";\nimport ContentStrategyWorkspace from "@/components/marketing/ContentStrategyWorkspace";\n';

if (!src.includes('ContentStrategyWorkspace from "@/components/marketing/ContentStrategyWorkspace"')) {
  if (src.includes(importAnchor)) {
    src = src.replace(importAnchor, importLine);
    changed = true;
    console.log("[content-engine-v2] import da bancada editorial: aplicado");
  } else {
    console.log("[content-engine-v2] import da bancada editorial: âncora não encontrada");
  }
}

const startMarker = '          <TabsContent value="conteudos" className="space-y-4">';
const endMarker = '          <TabsContent value="producao" className="space-y-4">';
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker, start >= 0 ? start : 0);

if (start >= 0 && end > start && !src.slice(start, end).includes("<ContentStrategyWorkspace")) {
  const replacement = `          <TabsContent value="conteudos" className="space-y-4">\n            <ContentStrategyWorkspace\n              userId={userId}\n              onNewContent={() => setModal("content")}\n              onChanged={loadAll}\n              onNotice={setNotice}\n              onError={setError}\n            />\n          </TabsContent>\n\n`;
  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
  console.log("[content-engine-v2] etapa Conteúdo substituída pela bancada editorial: aplicado");
} else if (start < 0 || end < 0) {
  console.log("[content-engine-v2] bloco Conteúdo: marcadores não encontrados");
}

if (changed) fs.writeFileSync(file, src);

const workspaceFile = "src/components/marketing/ContentStrategyWorkspace.tsx";
if (fs.existsSync(workspaceFile)) {
  let workspace = fs.readFileSync(workspaceFile, "utf8");
  const wrong = '{test?.provider || strategy.test?.provider || "Instagram"}';
  const right = '{strategy.test?.provider || "Instagram"}';
  if (workspace.includes(wrong)) {
    workspace = workspace.replace(wrong, right);
    fs.writeFileSync(workspaceFile, workspace);
    changed = true;
    console.log("[content-engine-v2] provedor da peça de teste por conteúdo: corrigido");
  }
}

console.log(`[content-engine-v2] ${changed ? "concluído com alterações" : "já aplicado"}`);
