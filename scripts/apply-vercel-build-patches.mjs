import { execFileSync } from "node:child_process";

const patches = [
  "scripts/patch-maggi-lead-select.mjs",
  "scripts/patch-marketing-newsletter-templates-v1.mjs",
  "scripts/patch-newsletter-test-only-v1.mjs",
  "scripts/patch-social-accounts-live-v1.mjs",
  "scripts/patch-marketing-radar-pulse-v1.mjs",
  "scripts/patch-marketing-radar-run-now-v1.mjs",
  "scripts/patch-marketing-radar-insights-v1.mjs",
  "scripts/patch-marketing-radar-auto-ideas-v1.mjs",
  "scripts/patch-marketing-radar-idea-selection-v2.mjs",
  "scripts/patch-marketing-idea-inbox-v1.mjs",
  "scripts/patch-agenda-preference-invites-v2.mjs",
  "scripts/patch-agenda-internal-directory-realtime-v3.mjs",
  "scripts/patch-agenda-cancellation-internal-v4.mjs",
  "scripts/patch-agenda-meeting-ai-v5.mjs",
  "scripts/patch-agenda-meeting-artifacts-v6.mjs",
  "scripts/patch-agenda-internal-guest-picker-v7.mjs",
  "scripts/patch-agenda-event-overlay-v8.mjs",
  "scripts/patch-agenda-create-overlay-v9.mjs",
  "scripts/patch-agenda-guest-management-v10.mjs",
  "scripts/patch-agenda-share-actions-v11.mjs",
];

for (const patch of patches) {
  console.log(`[build-patches] ${patch}`);
  execFileSync(process.execPath, [patch], { stdio: "inherit" });
}
