import { execFileSync } from "node:child_process";

const patches = [
  "scripts/patch-maggi-lead-select.mjs",
  "scripts/patch-marketing-newsletter-templates-v1.mjs",
  "scripts/patch-newsletter-test-only-v1.mjs",
  "scripts/patch-social-accounts-live-v1.mjs",
  "scripts/patch-marketing-radar-pulse-v1.mjs",
  "scripts/patch-marketing-radar-run-now-v1.mjs",
];

for (const patch of patches) {
  console.log(`[build-patches] ${patch}`);
  execFileSync(process.execPath, [patch], { stdio: "inherit" });
}
