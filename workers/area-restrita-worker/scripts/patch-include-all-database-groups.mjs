import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/price-table-sync-direct.mjs");
let source = fs.readFileSync(file, "utf8");

source = source.replace(
  'const endpoint = `${config.url}/rest/v1/sim_maggi_groups?select=id,grupo,segmento,config&is_active=eq.true&order=grupo.asc`;',
  'const endpoint = `${config.url}/rest/v1/sim_maggi_groups?select=*&order=grupo.asc`;',
);

if (!source.includes("function selectDatabaseGroups(rows)")) {
  const anchor = "async function activeGroups() {";
  if (!source.includes(anchor)) throw new Error("Função de consulta dos grupos Maggi não encontrada.");

  const helpers = `function databaseGroupScore(row) {
  const config = row?.config && typeof row.config === "object" ? row.config : {};
  const creditRanges = Array.isArray(config.creditRanges) ? config.creditRanges.length : 0;
  const prazoRules = Array.isArray(config.prazoRules) ? config.prazoRules.length : 0;
  const aiAnalysis = config?.aiDocumentAnalysis?.responseId ? 1 : 0;
  const detailsSource = String(config?.detailsSource || "").trim() ? 1 : 0;
  const meaningfulTopLevel = [
    row?.credito_min,
    row?.credito_max,
    row?.prazo_original,
    row?.taxa_adm_pct,
    row?.fundo_reserva_pct,
  ].filter((value) => Number(value || 0) > 0).length;

  return aiAnalysis * 10000
    + detailsSource * 3000
    + creditRanges * 300
    + prazoRules * 200
    + meaningfulTopLevel * 50
    + (row?.is_active !== false ? 20 : 0)
    + (config?.createdByAvailableGroupsRobot === true ? 0 : 5);
}

function selectDatabaseGroups(rows) {
  const selected = new Map();
  const duplicates = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const group = canonicalGroupNumber(row?.grupo);
    if (!group) continue;
    const candidate = { ...row, grupo: group };
    const current = selected.get(group);
    if (!current || databaseGroupScore(candidate) > databaseGroupScore(current)) {
      if (current) duplicates.push({ group, ignoredId: current.id, selectedId: candidate.id });
      selected.set(group, candidate);
    } else {
      duplicates.push({ group, ignoredId: candidate.id, selectedId: current.id });
    }
  }

  return {
    rows: [...selected.values()].sort((a, b) => Number(a.grupo) - Number(b.grupo)),
    duplicates,
  };
}

`;
  source = source.replace(anchor, `${helpers}${anchor}`);
}

const oldMap = "  const activeMap = new Map(active.rows.map((row) => [canonicalGroupNumber(row.grupo), row]));";
const newMap = `  const databaseSelection = selectDatabaseGroups(active.rows);
  const activeMap = new Map(databaseSelection.rows.map((row) => [canonicalGroupNumber(row.grupo), row]));`;
if (source.includes(oldMap)) source = source.replace(oldMap, newMap);
if (!source.includes("const databaseSelection = selectDatabaseGroups(active.rows);")) {
  throw new Error("Não foi possível ampliar a seleção para todos os grupos do banco.");
}

source = source.replace(
  "    activeGroups: [...activeMap.keys()],",
  `    activeGroups: [...activeMap.keys()],
    databaseRows: active.rows.length,
    selectedDatabaseGroups: databaseSelection.rows.map((row) => ({
      id: row.id,
      grupo: row.grupo,
      active: row.is_active !== false,
      source: row?.config?.source || null,
      selectionReason:
        row?.config?.createdByAvailableGroupsRobot === true
          ? "created_by_available_groups_robot"
          : "existing_database_group",
    })),
    duplicateDatabaseGroups: databaseSelection.duplicates,`,
);

source = source.replaceAll("tabela(s) de grupos ativos", "documento(s) de grupos cadastrados no banco");
source = source.replaceAll("active_group_without_matching_pdf", "database_group_without_matching_pdf");

fs.writeFileSync(file, source);
console.log("Área Restrita ampliada para todos os grupos Maggi existentes no banco, com deduplicação canônica.");
