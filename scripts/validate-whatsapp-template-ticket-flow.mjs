import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
const source = fs.readFileSync(file, "utf8");

function section(startPattern, endMarker, label) {
  const match = source.match(startPattern);
  const start = match?.index ?? -1;
  const end = source.indexOf(endMarker, start + (match?.[0].length || 0));
  if (start < 0 || end <= start) {
    throw new Error(
      `[validate-whatsapp-template-ticket-flow] Não foi possível localizar ${label}.`,
    );
  }
  return source.slice(start, end);
}

const createTicket = section(
  /async function createTicket\(\)/,
  "function fileToBase64",
  "createTicket",
);
const sendTemplate = section(
  /async function sendTemplate\s*\(\s*conv:\s*Conv\b/,
  "async function finishConversation",
  "sendTemplate",
);

if (
  !/if\s*\(\s*startTemplate\s*\)\s*await\s+sendTemplate\(conv\s+as\s+Conv\)/m.test(
    createTicket,
  )
) {
  throw new Error(
    "[validate-whatsapp-template-ticket-flow] O ticket é aberto, mas o modelo selecionado não é enviado.",
  );
}

for (const required of [
  'fetch("/api/whatsapp/template"',
  "template_name: startTemplate",
  "template_language:",
  "template_params:",
]) {
  if (!sendTemplate.includes(required)) {
    throw new Error(
      `[validate-whatsapp-template-ticket-flow] Envio de modelo incompleto: ${required} ausente.`,
    );
  }
}

console.log(
  "[validate-whatsapp-template-ticket-flow] ticket e envio do modelo validados",
);
