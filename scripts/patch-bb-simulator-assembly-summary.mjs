import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("patch bb simulator assembly summary: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceAll(needle, replacement) {
  if (src.includes(needle)) {
    src = src.split(needle).join(replacement);
    changed = true;
  }
}

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

replaceOnce(
  "function assemblyRow(group?: BBGroup | null): AnyRow { const cfg = rawConfig(group); const assembly = cfg.assemblyResult || cfg.resultadoAssembleia || cfg.assembly || cfg.assemblies || cfg.resultados; return assembly && !Array.isArray(assembly) && typeof assembly === \"object\" ? assembly : {}; }",
  "function assemblyRow(group?: BBGroup | null): AnyRow { const cfg = rawConfig(group); const assembly = group?.assembly_result || cfg.assemblyResult || cfg.assembly_result || cfg.resultadoAssembleia || cfg.assembly || cfg.assemblies || cfg.resultados; return assembly && !Array.isArray(assembly) && typeof assembly === \"object\" ? assembly : {}; }",
  "group?.assembly_result || cfg.assemblyResult"
);

replaceOnce(
  "function normalizeConfig(group?: BBGroup | null): BBConfig {\n  const raw = rawConfig(group);\n  const ranges:",
  "function normalizeConfig(group?: BBGroup | null): BBConfig {\n  const raw = rawConfig(group);\n  if (!raw.creditRanges && raw.credit_ranges) raw.creditRanges = raw.credit_ranges;\n  if (!raw.prazoRules && raw.prazo_rules) raw.prazoRules = raw.prazo_rules;\n  if (!raw.lanceOptions && raw.lance_options) raw.lanceOptions = raw.lance_options;\n  if (!raw.assemblyResult && raw.assembly_result) raw.assemblyResult = raw.assembly_result;\n  const ranges:",
  "raw.credit_ranges) raw.creditRanges"
);

replaceAll(
  "assembly.proxima_assembleia || assembly.data_proxima_assembleia;",
  "assembly.proxima_assembleia || assembly.data_proxima_assembleia || assembly.dataAssembleia || assembly.data;"
);

replaceOnce(
  "const livre = selectedConfig.lanceOptions.find((l) => l.key === \"livre\"); setLanceLivrePct(formatPercentInput(livre?.pct || 0)); setSimCode(null);",
  "const livre = selectedConfig.lanceOptions.find((l) => l.key === \"livre\"); const medianaPct = groupMedianLancePercent(selectedGroup); setLanceLivrePct(formatPercentInput(medianaPct ? medianaPct / 100 : livre?.pct || 0)); setSimCode(null);",
  "const medianaPct = groupMedianLancePercent(selectedGroup);"
);

replaceAll(
  "<Label>Percentual do lance livre</Label>",
  "<Label>Lance Livre Sugerido</Label>"
);

replaceOnce(
  "ctx.moveTo(tableX + 238, tableY); ctx.lineTo(tableX + 238, tableY + headerH + rowH * rows.length); ctx.stroke(); ctx.fillStyle = \"#FFFFFF\"; ctx.font = \"900 30px Arial\"; ctx.fillText(\"CRÉDITO\", tableX + 42, tableY + 47); ctx.font = \"900 24px Arial\"; ctx.fillText(\"PARCELA\", tableX + 275, tableY + 37); ctx.font = \"800 15px Arial\"; ctx.fillText(rows[0]?.prazo || \"PRAZO\", tableX + 306, tableY + 58);",
  "[168, 306, 375].forEach((offset) => { ctx.moveTo(tableX + offset, tableY); ctx.lineTo(tableX + offset, tableY + headerH + rowH * rows.length); }); ctx.stroke(); ctx.fillStyle = \"#FFFFFF\"; ctx.font = \"900 22px Arial\"; ctx.fillText(\"CRÉDITO\", tableX + 18, tableY + 45); ctx.fillText(\"PARCELA\", tableX + 184, tableY + 45); ctx.fillText(\"PRAZO\", tableX + 318, tableY + 45); ctx.font = \"900 19px Arial\"; ctx.fillText(\"% LANCE\", tableX + 385, tableY + 45);",
  "% LANCE"
);

replaceOnce(
  "ctx.fillText(row.credito, tableX + 34, y + rowH * 0.68); ctx.fillText(row.parcela, tableX + 270, y + rowH * 0.68);",
  "ctx.fillText(row.credito, tableX + 14, y + rowH * 0.68); ctx.fillText(row.parcela, tableX + 182, y + rowH * 0.68); ctx.fillText(row.prazo, tableX + 320, y + rowH * 0.68); ctx.fillStyle = \"#FFFFFF\"; ctx.fillText(row.lance, tableX + 390, y + rowH * 0.68);",
  "ctx.fillText(row.lance, tableX + 390"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb simulator assembly summary: applied safe source fixes");
} else {
  console.log("patch bb simulator assembly summary: no changes");
}
