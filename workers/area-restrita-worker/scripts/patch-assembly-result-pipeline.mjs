import fs from "node:fs";
import path from "node:path";

const serverFile = path.resolve("src/server.mjs");
let source = fs.readFileSync(serverFile, "utf8");

const stateAnchor = `    "price_tables_syncing",\n  ]);`;
if (source.includes(stateAnchor)) {
  source = source.replace(
    stateAnchor,
    `    "price_tables_syncing",\n    "assembly_results_syncing",\n    "assembly_results_synced",\n  ]);`,
  );
}
if (!source.includes('"assembly_results_syncing"')) {
  throw new Error("Não foi possível incluir a etapa de assembleias na reconciliação de status.");
}

const oldMessage = `message: \`\${Number(manifest.summary.updatedGroups || 0)} grupo(s) foram atualizados a partir das Tabelas de Preços e Aditamentos.\`,`;
const newMessage = `message: manifest?.summary?.assemblyGroupsUpdated !== undefined
          ? \`\${Number(manifest.summary.updatedGroups || 0)} grupo(s) foram atualizados pelos PDFs e \${Number(manifest.summary.assemblyGroupsUpdated || 0)} tiveram a assembleia mais recente analisada.\`
          : \`\${Number(manifest.summary.updatedGroups || 0)} grupo(s) foram atualizados a partir das Tabelas de Preços e Aditamentos.\`,`;
source = source.split(oldMessage).join(newMessage);

fs.writeFileSync(serverFile, source);
console.log("Etapa Resultado de Assembleias integrada à reconciliação e ao status final do worker.");
