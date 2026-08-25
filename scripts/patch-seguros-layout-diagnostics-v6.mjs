import fs from "node:fs";
const src = fs.readFileSync("src/pages/Seguros.tsx", "utf8");
const idx = src.indexOf("filteredSales.map");
if (idx < 0) throw new Error("[seguros-layout-v6] filteredSales.map não encontrado");
console.log(`[seguros-layout-v6] TABLE_CONTEXT_START\n${src.slice(Math.max(0, idx - 4500), idx + 8000)}\n[seguros-layout-v6] TABLE_CONTEXT_END`);
