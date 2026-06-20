import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";

if (!fs.existsSync(file)) {
  console.log("patch central grupos deactivated count: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

replaceOnce(
  'type SyncStep = { key: string; label: string; status: StepStatus; found?: number; message?: string; rawRows?: number; readDetails?: SyncReadDetail[] };',
  'type SyncStep = { key: string; label: string; status: StepStatus; found?: number; deactivated?: number; message?: string; rawRows?: number; readDetails?: SyncReadDetail[] };',
  'deactivated?: number'
);

replaceOnce(
  '  const base = step.rawRows !== undefined ? `${step.rawRows} linha(s) lida(s)` : null;\n  const byDetail = details.map((d) => `${d.venda ? `${d.venda}: ` : ""}${Number(d.linhas || 0)} linha(s), ${Number(d.grupos || 0)} grupo(s), ${Number(d.paginas || 0)} pág.`);\n  return [base, ...byDetail].filter(Boolean).join(" • ");',
  '  const base = step.rawRows !== undefined ? `${step.rawRows} linha(s) lida(s)` : null;\n  const deactivated = step.deactivated ? `${step.deactivated} grupo(s) inativado(s)` : null;\n  const byDetail = details.map((d) => `${d.venda ? `${d.venda}: ` : ""}${Number(d.linhas || 0)} linha(s), ${Number(d.grupos || 0)} grupo(s), ${Number(d.paginas || 0)} pág.`);\n  return [base, deactivated, ...byDetail].filter(Boolean).join(" • ");',
  'const deactivated = step.deactivated ?'
);

replaceOnce(
  '        const rawRows = Number(json?.details?.raw_rows || 0);\n        const readDetails = Array.isArray(json?.details?.readDetails) ? json.details.readDetails : [];\n        total += Number.isFinite(found) ? found : 0;\n        setSyncSteps((steps) => steps.map((s) => s.key === item.key ? { ...s, status: "done", found, rawRows, readDetails, message } : s));',
  '        const rawRows = Number(json?.details?.raw_rows || 0);\n        const deactivated = Number(json?.deactivated || 0);\n        const readDetails = Array.isArray(json?.details?.readDetails) ? json.details.readDetails : [];\n        total += Number.isFinite(found) ? found : 0;\n        setSyncSteps((steps) => steps.map((s) => s.key === item.key ? { ...s, status: "done", found, deactivated, rawRows, readDetails, message } : s));',
  'const deactivated = Number(json?.deactivated || 0);'
);

replaceOnce(
  '      const rawRows = Number(json?.details?.raw_rows || 0);\n      const readDetails = Array.isArray(json?.details?.readDetails) ? json.details.readDetails : [];\n\n      setSyncSteps((steps) => steps.map((step) => step.key === item.key ? { ...step, status: "done", found, rawRows, readDetails, message } : step));',
  '      const rawRows = Number(json?.details?.raw_rows || 0);\n      const deactivated = Number(json?.deactivated || 0);\n      const readDetails = Array.isArray(json?.details?.readDetails) ? json.details.readDetails : [];\n\n      setSyncSteps((steps) => steps.map((step) => step.key === item.key ? { ...step, status: "done", found, deactivated, rawRows, readDetails, message } : step));',
  'found, deactivated, rawRows'
);

replaceOnce(
  '        text: `${item.label}: ${found} grupo(s) processado(s). ${rawRows} linha(s) lida(s).`',
  '        text: `${item.label}: ${found} grupo(s) processado(s). ${rawRows} linha(s) lida(s).${deactivated ? ` ${deactivated} grupo(s) inativado(s).` : ""}`',
  '${deactivated ? ` ${deactivated} grupo(s) inativado(s).` : ""}'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch central grupos deactivated count: applied");
} else {
  console.log("patch central grupos deactivated count: no changes");
}
