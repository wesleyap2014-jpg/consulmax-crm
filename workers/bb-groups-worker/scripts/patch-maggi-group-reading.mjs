import fs from "node:fs";

const file = "src/maggiAvailableGroups.ts";

if (!fs.existsSync(file)) {
  console.log("patch maggi group reading: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceAllVariants(variants, replacement) {
  for (const variant of variants) {
    if (src.includes(variant)) {
      src = src.split(variant).join(replacement);
      changed = true;
    }
  }
}

replaceAllVariants(
  [
    "const groupRegex = /^Grupo(?:s|$)/i;",
    "const groupRegex = /^Grupo(?:\\s|$)/i;",
  ],
  "const groupRegex = /^Grupo\\s*:?\\s*$/i;",
);

replaceAllVariants(
  ["page.getByText(/^Grupo$/i, { exact: true }).first(),"],
  "page.getByText(/^Grupo\\s*:?\\s*$/i, { exact: true }).first(),",
);

replaceAllVariants(
  [
    "'[role=\"option\"], mat-option, .mat-option, .mat-mdc-option, .cdk-overlay-pane .mdc-list-item, ion-select-popover ion-item, .popover-content ion-item, [aria-label]'",
  ],
  "'flt-semantics[role=\"button\"], [role=\"option\"], mat-option, .mat-option, .mat-mdc-option, .cdk-overlay-pane .mdc-list-item, ion-select-popover ion-item, .popover-content ion-item'",
);

const loopNeedle = `      for (const text of texts) {
        const group = normalizeGroupCode(text);
        if (group) groups.add(group);
      }
`;

const loopReplacement = `      for (const text of texts) {
        const normalized = String(text || "").replace(/\\s+/g, " ").trim();
        const exactGroup = /^\\d{3,6}$/.test(normalized) ? normalized : "";
        const group = exactGroup || normalizeGroupCode(normalized);
        if (group) groups.add(group);
      }
`;

if (src.includes(loopNeedle) && !src.includes("const exactGroup = /^\\d{3,6}$/")) {
  src = src.replace(loopNeedle, loopReplacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch maggi group reading: applied");
} else {
  console.log("patch maggi group reading: no changes");
}
