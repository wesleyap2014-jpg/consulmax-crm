import fs from "node:fs";

const file = "src/pages/AreaRestritaMaggi.tsx";
if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);

let source = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (source.includes(marker)) return;
  if (!source.includes(needle)) {
    throw new Error(`Trecho da Área Restrita não encontrado: ${needle.slice(0, 120)}`);
  }
  source = source.replace(needle, replacement);
  changed = true;
}

replaceOnce(
  "  lance_embutido_max_pct: number | null;\n  config: AnyRow | null;",
  "  lance_embutido_max_pct: number | null;\n  permite_lance_livre: boolean | null;\n  permite_lance_fixo: boolean | null;\n  permite_lance_embutido: boolean | null;\n  config: AnyRow | null;",
  "  permite_lance_livre: boolean | null;",
);

replaceOnce(
  '"id,grupo,segmento,credito_min,credito_max,prazo_original,prazo_restante,taxa_adm_pct,fundo_reserva_pct,lance_embutido_max_pct,config,is_active,updated_at",',
  '"id,grupo,segmento,credito_min,credito_max,prazo_original,prazo_restante,taxa_adm_pct,fundo_reserva_pct,lance_embutido_max_pct,permite_lance_livre,permite_lance_fixo,permite_lance_embutido,config,is_active,updated_at",',
  "permite_lance_livre,permite_lance_fixo,permite_lance_embutido,config",
);

const helper = `function hasCompleteGroupDetails(group: MaggiGroup) {
  const config = group.config && typeof group.config === "object" ? group.config : {};
  const credits = Array.isArray(config.creditRanges)
    ? config.creditRanges.map((item: AnyRow) => Number(item?.valor || 0)).filter((value: number) => value > 0)
    : [];
  const hasCredits = credits.length >= 2
    || (Number(group.credito_min || 0) > 0 && Number(group.credito_max || 0) > 0);

  const rules = Array.isArray(config.prazoRules) ? config.prazoRules : [];
  const validRules = rules
    .map((item: AnyRow) => ({
      prazo: Number(item?.prazo),
      taxaAdmPct: Number(item?.taxaAdmPct),
      fundoReservaPct: Number(item?.fundoReservaPct),
    }))
    .filter((item: AnyRow) => Number.isFinite(item.prazo) && item.prazo > 0);
  const finalRule = validRules.sort((a: AnyRow, b: AnyRow) => a.prazo - b.prazo).at(-1);
  const hasTerm = Boolean(finalRule?.prazo)
    || Number(group.prazo_original || group.prazo_restante || 0) > 0;
  const adminRate = Number.isFinite(finalRule?.taxaAdmPct)
    ? finalRule.taxaAdmPct
    : Number(group.taxa_adm_pct);
  const reserveRate = Number.isFinite(finalRule?.fundoReservaPct)
    ? finalRule.fundoReservaPct
    : Number(group.fundo_reserva_pct);
  const hasFees = Number.isFinite(adminRate) && adminRate > 0
    && Number.isFinite(reserveRate) && reserveRate >= 0;

  const options = Array.isArray(config.lanceOptions) ? config.lanceOptions : [];
  const hasLanceRules = options.some((option: AnyRow) => option?.enabled !== false)
    || group.permite_lance_livre === true
    || group.permite_lance_fixo === true
    || group.permite_lance_embutido === true
    || Number(config.maxLanceEmbutidoPct || group.lance_embutido_max_pct || 0) > 0;

  return hasCredits && hasTerm && hasFees && hasLanceRules;
}

`;
replaceOnce(
  "export default function AreaRestritaMaggi() {",
  `${helper}export default function AreaRestritaMaggi() {`,
  "function hasCompleteGroupDetails(group: MaggiGroup)",
);

replaceOnce(
  `  const status = worker?.status || null;
  const syncRunning = Boolean(worker?.syncRunning || status?.state === "price_tables_syncing");
  const info = stateInfo(status?.state, syncRunning);`,
  `  const status = worker?.status || null;
  const manifestFinished = Boolean(worker?.manifest?.finishedAt);
  const recoveredFinishedState = status?.state === "price_tables_syncing"
    && !worker?.syncRunning
    && manifestFinished;
  const effectiveState = recoveredFinishedState ? "price_tables_synced" : status?.state;
  const syncRunning = Boolean(
    worker?.syncRunning
    || (status?.state === "price_tables_syncing" && !manifestFinished),
  );
  const info = stateInfo(effectiveState, syncRunning);
  const effectiveMessage = recoveredFinishedState
    ? \`\${Number(worker?.manifest?.summary?.updatedGroups || 0)} grupo(s) foram atualizados.\`
    : status?.message;`,
  "const recoveredFinishedState = status?.state",
);

replaceOnce(
  `  const completeGroups = useMemo(
    () => groups.filter((group) => group.config?.needsDetailsSync === false),
    [groups],
  );`,
  `  const completeGroups = useMemo(
    () => groups.filter(hasCompleteGroupDetails),
    [groups],
  );`,
  "() => groups.filter(hasCompleteGroupDetails)",
);

source = source.replace(
  '{status?.message || "Aguardando informações do worker"}',
  '{effectiveMessage || "Aguardando informações do worker"}',
);
source = source.replace(
  '{progress.currentTable || status?.message || "Aguardando execução"}',
  '{effectiveState === "price_tables_synced" && !syncRunning ? "Sincronização concluída" : progress.currentTable || effectiveMessage || "Aguardando execução"}',
);
source = source.replace(
  "                  const complete = group.config?.needsDetailsSync === false;",
  "                  const complete = hasCompleteGroupDetails(group);",
);
source = source.replace(
  "Com crédito, prazo, taxas e lance",
  "Com crédito, prazo, taxas e regras de lance",
);

if (!source.includes("const complete = hasCompleteGroupDetails(group);")) {
  throw new Error("O selo Completa/Parcial não foi ligado aos dados essenciais.");
}
if (!source.includes('effectiveState === "price_tables_synced"')) {
  throw new Error("A recuperação visual do estado concluído não foi aplicada.");
}

if (changed || source !== fs.readFileSync(file, "utf8")) fs.writeFileSync(file, source);
console.log("Área Restrita agora usa dados essenciais e manifesto final para exibir o estado confiável.");
