import fs from "node:fs";

const path = "api/marketing/visual-prompt.ts";
if (!fs.existsSync(path)) throw new Error("[canva-brand-kit-name-v1] visual-prompt.ts não encontrado");

let text = fs.readFileSync(path, "utf8");
let changed = false;

const oldName = '    name: input.kitName || "Consulmax Oficial",';
const newName = '    name: /consulmax/i.test(input.kitName || "") ? "Consulmax" : (input.kitName || "Consulmax"),';
if (text.includes(oldName)) {
  text = text.replace(oldName, newName);
  changed = true;
}

const oldKitFallback = '      kitName: String(kitRes.data?.name || "Consulmax Oficial"),';
const newKitFallback = '      kitName: String(kitRes.data?.name || "Consulmax"),';
if (text.includes(oldKitFallback)) {
  text = text.replace(oldKitFallback, newKitFallback);
  changed = true;
}

const oldPrompt = '\\n\\nMARCA: ${input.identity.name}\\nCORES OBRIGATÓRIAS:';
const newPrompt = '\\n\\nBRAND KIT NO CANVA: Consulmax. Use o Brand Kit existente com este nome exato.\\nMARCA: ${input.identity.name}\\nCORES OBRIGATÓRIAS:';
if (text.includes(oldPrompt)) {
  text = text.replace(oldPrompt, newPrompt);
  changed = true;
}

if (changed) {
  fs.writeFileSync(path, text, "utf8");
  console.log("[canva-brand-kit-name-v1] Brand Kit do Canva normalizado para Consulmax");
} else {
  console.log("[canva-brand-kit-name-v1] nome do Brand Kit já está correto");
}
