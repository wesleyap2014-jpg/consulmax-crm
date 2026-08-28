import fs from "node:fs";

const wrapper = "src/components/marketing/ProductionWorkspace.tsx";
const expected = 'export { default } from "./ProductionWorkspaceV2";\n';
if (fs.existsSync(wrapper)) {
  const current = fs.readFileSync(wrapper, "utf8");
  if (current !== expected) fs.writeFileSync(wrapper, expected);
}
console.log("[production-visual-v2] workspace de Produção V2 ativo");
