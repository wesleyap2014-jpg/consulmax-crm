import fs from "node:fs";

const file = "api/whatsapp/send.ts";
if (!fs.existsSync(file)) {
  throw new Error("[patch-whatsapp-birthday-retry-key-v45] api/whatsapp/send.ts não encontrado");
}

let src = fs.readFileSync(file, "utf8");
const from = `    automation_type: raw.automation_type || null,
    agenda_event_id: raw.agenda_event_id || null,`;
const to = `    automation_type: raw.automation_type || null,
    automation_key: raw.automation_key || null,
    agenda_event_id: raw.agenda_event_id || null,`;

if (!src.includes("automation_key: raw.automation_key || null")) {
  if (!src.includes(from)) {
    throw new Error("[patch-whatsapp-birthday-retry-key-v45] ponto de preservação da automação não encontrado");
  }
  src = src.replace(from, to);
  fs.writeFileSync(file, src);
  console.log("[patch-whatsapp-birthday-retry-key-v45] automation_key preservada no reenvio");
} else {
  console.log("[patch-whatsapp-birthday-retry-key-v45] já aplicado");
}
