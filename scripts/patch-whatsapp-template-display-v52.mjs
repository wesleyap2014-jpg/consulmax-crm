import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppMessageBubble.tsx";
if (!fs.existsSync(file)) process.exit(0);

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.warn(`[whatsapp-template-display-v52] trecho não encontrado: ${label}`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[whatsapp-template-display-v52] ${label}: aplicado`);
}

replaceOnce(
  `export function messageSearchText(message: WhatsAppMessage) {\n  const media = getStoredMedia(message);\n  return [\n    message.body,`,
  `function messageDisplayBody(message: WhatsAppMessage) {\n  const direct = String(message.body || "").trim();\n  if (direct) return String(message.body);\n\n  const rendered = String(message.raw_payload?.template_rendered_body || "").trim();\n  if (rendered) return rendered;\n\n  return "";\n}\n\nexport function messageSearchText(message: WhatsAppMessage) {\n  const media = getStoredMedia(message);\n  return [\n    messageDisplayBody(message),`,
  "fonte única do texto do modelo",
);

replaceOnce(
  `  if (message.body) return message.body;`,
  `  const displayBody = messageDisplayBody(message);\n  if (displayBody) return displayBody;`,
  "fallback usa template_rendered_body",
);

replaceOnce(
  `  const messageType = String(message.message_type || "text").toLowerCase();`,
  `  const messageType = String(message.message_type || "text").toLowerCase();\n  const displayBody = messageDisplayBody(message);`,
  "texto renderizado disponível em MessageContent",
);

const oldMediaBody = `{message.body && <p className="whitespace-pre-wrap">{message.body}</p>}`;
const newMediaBody = `{displayBody && <p className="whitespace-pre-wrap">{displayBody}</p>}`;
let mediaCount = 0;
while (src.includes(oldMediaBody)) {
  src = src.replace(oldMediaBody, newMediaBody);
  mediaCount += 1;
  changed = true;
}
if (mediaCount) console.log(`[whatsapp-template-display-v52] texto em mídias: ${mediaCount} ocorrência(s) aplicada(s)`);

if (changed) fs.writeFileSync(file, src);
console.log(`[whatsapp-template-display-v52] concluído: ${changed ? "com alterações" : "sem alterações"}`);
