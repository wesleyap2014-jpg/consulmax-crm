import fs from "node:fs";

function replaceOnce(text, anchor, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(anchor)) throw new Error(`[newsletter-test-only] ${label}: anchor not found`);
  return text.replace(anchor, replacement);
}

// Test sends must never move the newsletter to Programada/Enviada.
const audiencePath = "api/marketing/newsletter-audience.ts";
let audience = fs.readFileSync(audiencePath, "utf8");

const statusAnchor = '    await db.from("marketing_newsletters").update({ status: "programada" }).eq("id", newsletterId).neq("status", "enviada");';
const statusReplacement = `    const isTestDispatch = Array.isArray(dispatch.source_types) && dispatch.source_types.length === 1 && dispatch.source_types[0] === "manual";\n    if (!isTestDispatch) {\n      await db.from("marketing_newsletters").update({ status: "programada" }).eq("id", newsletterId).neq("status", "enviada");\n    }`;
audience = replaceOnce(audience, statusAnchor, statusReplacement, "audience start status");
fs.writeFileSync(audiencePath, audience, "utf8");

const dispatchPath = "api/marketing/newsletter-dispatch-run.ts";
let dispatch = fs.readFileSync(dispatchPath, "utf8");

if (!dispatch.includes("  source_types: string[];")) {
  dispatch = replaceOnce(
    dispatch,
    "  status: string;\n  total_recipients: number;",
    "  status: string;\n  source_types: string[];\n  total_recipients: number;",
    "dispatch source_types type",
  );
}

dispatch = replaceOnce(
  dispatch,
  '.select("id,newsletter_id,status,total_recipients,sent_count,failed_count,skipped_count,started_at")',
  '.select("id,newsletter_id,status,source_types,total_recipients,sent_count,failed_count,skipped_count,started_at")',
  "dispatch source_types select",
);

if (!dispatch.includes("function isTestDispatch(dispatch: Dispatch)")) {
  const anchor = "async function processQueues() {";
  const helper = `function isTestDispatch(dispatch: Dispatch) {\n  return Array.isArray(dispatch.source_types) && dispatch.source_types.length === 1 && dispatch.source_types[0] === "manual";\n}\n\n${anchor}`;
  dispatch = replaceOnce(dispatch, anchor, helper, "test helper");
}

const completionAnchor = '          await db.from("marketing_newsletters").update({ status: "enviada", sent_at: completedAt }).eq("id", newsletter.id);';
const completionReplacement = `          if (!isTestDispatch(dispatch)) {\n            await db.from("marketing_newsletters").update({ status: "enviada", sent_at: completedAt }).eq("id", newsletter.id);\n          }`;
dispatch = replaceOnce(dispatch, completionAnchor, completionReplacement, "empty queue completion");

const finalAnchor = '        await db.from("marketing_newsletters").update({ status: "enviada", sent_at: updatedAt }).eq("id", newsletter.id);';
const finalReplacement = `        if (!isTestDispatch(dispatch)) {\n          await db.from("marketing_newsletters").update({ status: "enviada", sent_at: updatedAt }).eq("id", newsletter.id);\n        }`;
dispatch = replaceOnce(dispatch, finalAnchor, finalReplacement, "dispatch completion");

fs.writeFileSync(dispatchPath, dispatch, "utf8");
console.log("Newsletter test-only status patch applied");
