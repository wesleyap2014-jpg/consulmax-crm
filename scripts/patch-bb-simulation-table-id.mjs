import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("[patch-bb-simulation-table-id] arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");

if (src.includes("table_id: selectedGroup.id")) {
  console.log("[patch-bb-simulation-table-id] table_id já existe");
  process.exit(0);
}

const needle = "const payload: any = {\n      lead_id: leadId || null,";
const replacement = "const payload: any = {\n      table_id: selectedGroup.id,\n      lead_id: leadId || null,";

if (!src.includes(needle)) {
  console.log("[patch-bb-simulation-table-id] ponto de inserção não encontrado");
  process.exit(0);
}

src = src.replace(needle, replacement);
fs.writeFileSync(file, src);
console.log("[patch-bb-simulation-table-id] aplicado");
