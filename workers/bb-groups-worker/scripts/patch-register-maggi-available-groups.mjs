import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch register maggi available groups: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

if (!src.includes('from "./maggiAvailableGroups.js"')) {
  const importNeedle = 'import { createClient } from "@supabase/supabase-js";\n';
  if (!src.includes(importNeedle)) throw new Error("patch register maggi available groups: import needle not found");
  src = src.replace(importNeedle, importNeedle + 'import { registerMaggiAvailableGroups } from "./maggiAvailableGroups.js";\n');
  changed = true;
}

if (!src.includes("registerMaggiAvailableGroups(app")) {
  const listenNeedle = "\napp.listen(PORT, () => {";
  if (!src.includes(listenNeedle)) throw new Error("patch register maggi available groups: app.listen not found");
  const registration = `
registerMaggiAvailableGroups(app, {
  supabase,
  requiredEnv,
  log,
  waitDom,
  launchBrowser,
  fillFirstVisible,
  clickFirstVisible,
  assertAuthorized,
});
`;
  src = src.replace(listenNeedle, "\n" + registration + listenNeedle);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch register maggi available groups: applied");
} else {
  console.log("patch register maggi available groups: already applied");
}
