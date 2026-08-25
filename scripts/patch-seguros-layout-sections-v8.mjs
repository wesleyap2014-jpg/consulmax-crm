import fs from "node:fs";

// Corrige duas interpolações que pertencem ao TSX gerado, não ao script de patch.
const patchFile = "scripts/patch-seguros-layout-sections-v7.mjs";
let patch = fs.readFileSync(patchFile, "utf8");
patch = patch
  .replace('className={\\`${inputClass} pl-9\\`}', 'className={inputClass + " pl-9"}')
  .replace('className={\\`${inputClass} sm:w-44\\`}', 'className={inputClass + " sm:w-44"}');
fs.writeFileSync(patchFile, patch);

await import("./patch-seguros-layout-sections-v7.mjs");
