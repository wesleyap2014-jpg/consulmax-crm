import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/maggiAvailableGroups.ts");
let source = fs.readFileSync(filePath, "utf8");

const normalizerPattern = /function normalizeGroupCode\(value: unknown\) \{[\s\S]*?\n\}/;
const canonicalNormalizer = `function normalizeGroupCode(value: unknown) {
  const match = String(value || "").match(/\\b\\d{3,6}\\b/);
  if (!match) return "";
  const digits = match[0].trim();
  const normalized = String(Number(digits));
  return normalized.length === 3 ? normalized.padStart(4, "0") : normalized;
}`;
if (!normalizerPattern.test(source)) throw new Error("Normalizador de grupos Maggi não encontrado.");
source = source.replace(normalizerPattern, canonicalNormalizer);

source = source.replace(
  `        const rawGroup = exactGroup || normalizeGroupCode(normalized);
        const group = rawGroup.replace(/^0+(?=\\d)/, "");
        if (group) groups.add(group);`,
  `        const rawGroup = exactGroup || normalizeGroupCode(normalized);
        const group = normalizeGroupCode(rawGroup);
        if (group) groups.add(group);`,
);

source = source.replace(
  `  for (const row of existingRows || []) existingMap.set(String(row.segmento || "") + ":" + String(row.grupo || ""), row);`,
  `  for (const row of existingRows || []) existingMap.set(String(row.segmento || "") + ":" + normalizeGroupCode(row.grupo), row);`,
);

source = source.replace(
  `      const key = segmento + ":" + grupo;`,
  `      const canonicalGroup = normalizeGroupCode(grupo);
      const key = segmento + ":" + canonicalGroup;`,
);

source = source.replace(
  `          grupo,
          segmento,
          nome_grupo: "Grupo " + grupo,`,
  `          grupo: canonicalGroup,
          segmento,
          nome_grupo: "Grupo " + canonicalGroup,`,
);

source = source.replace(
  `        needsDetailsSync: !hasDetails,
      };`,
  `        needsDetailsSync: !hasDetails,
        createdByAvailableGroupsRobot: existingConfig?.createdByAvailableGroupsRobot === true,
      };`,
);

source = source.replace(
  `            needsDetailsSync: true,
          },`,
  `            needsDetailsSync: true,
            createdByAvailableGroupsRobot: true,
          },`,
);

source = source.replace(
  `    const key = segmento + ":" + String(row.grupo || "");
    if (row.is_active !== false && !activeKeys.has(key)) {`,
  `    const key = segmento + ":" + normalizeGroupCode(row.grupo);
    const existingConfig = row?.config && typeof row.config === "object" ? row.config : {};
    const managedByAvailabilityRobot = existingConfig?.createdByAvailableGroupsRobot === true;
    if (managedByAvailabilityRobot && row.is_active !== false && !activeKeys.has(key)) {`,
);

source = source.replace(
  `      const existingConfig = row?.config && typeof row.config === "object" ? row.config : {};
      const { error } = await deps.supabase`,
  `      const { error } = await deps.supabase`,
);

const requiredMarkers = [
  'return normalized.length === 3 ? normalized.padStart(4, "0") : normalized;',
  "const group = normalizeGroupCode(rawGroup);",
  "createdByAvailableGroupsRobot: true",
  "const managedByAvailabilityRobot = existingConfig?.createdByAvailableGroupsRobot === true;",
];
for (const marker of requiredMarkers) {
  if (!source.includes(marker)) throw new Error(`Correção Maggi incompleta: ${marker}`);
}

fs.writeFileSync(filePath, source);
console.log("Grupos Maggi preservam zero à esquerda e registros legados não são desativados pelo robô de disponibilidade.");
