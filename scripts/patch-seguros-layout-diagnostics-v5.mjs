import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
const src = fs.readFileSync(file, "utf8");
const probes = ["InsuranceSale[]", "sales.map", "visibleSales.map", "filteredSales.map", "insuranceSales.map", "rows.map", ".map((sale", ".map((item", "useMemo(() =>"];
for (const probe of probes) {
  const idx = src.indexOf(probe);
  if (idx >= 0) console.log(`[seguros-layout-v5] probe ${probe}: ${src.slice(Math.max(0, idx - 700), idx + 2500)}`);
}
console.log("[seguros-layout-v5] diagnóstico concluído");
