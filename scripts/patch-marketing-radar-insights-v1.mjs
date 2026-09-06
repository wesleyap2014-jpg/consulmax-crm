import fs from "node:fs";

const file = "api/marketing/radar-run.ts";
let src = fs.readFileSync(file, "utf8");
let changed = false;

const scopeFrom = `    if (!scopes.includes("pages_read_engagement") || !scopes.includes("instagram_basic")) continue;`;
const scopeTo = `    if (!scopes.includes("pages_read_engagement") || !scopes.includes("instagram_basic") || !scopes.includes("instagram_manage_insights")) continue;`;
if (!src.includes(scopeTo)) {
  if (!src.includes(scopeFrom)) throw new Error("[patch-marketing-radar-insights-v1] âncora de escopos não encontrada");
  src = src.replace(scopeFrom, scopeTo);
  changed = true;
}

const errorFrom = `  throw new Error("Para monitorar perfis do Instagram, conecte uma Página do Facebook vinculada ao Instagram da Consulmax com as permissões pages_read_engagement e instagram_basic.");`;
const errorTo = `  throw new Error("Para monitorar perfis do Instagram, reconecte a Página do Facebook da Consulmax com pages_read_engagement, instagram_basic e instagram_manage_insights autorizados.");`;
if (!src.includes(errorTo)) {
  if (!src.includes(errorFrom)) throw new Error("[patch-marketing-radar-insights-v1] âncora da mensagem não encontrada");
  src = src.replace(errorFrom, errorTo);
  changed = true;
}

if (changed) fs.writeFileSync(file, src);
console.log(`[patch-marketing-radar-insights-v1] ${changed ? "aplicado" : "já aplicado"}`);
