import fs from "node:fs";

// Este hook roda depois da cadeia principal de patches. Mantém as pendências
// operacionais de Clientes sincronizadas com o Meu Dia antes da validação/build.
await import("./patch-clientes-novos-meu-dia-v1.mjs");

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
  source.includes("isBoletoTemplate(") &&
  !/function\s+isBoletoTemplate\s*\(/.test(source)
) {
  throw new Error(
    "[validate-whatsapp-template-ticket-flow] isBoletoTemplate é usado, mas não está definido.",
  );
}

if (
  /function\s+isBoletoTemplate\s*\(/.test(source) &&
  !source.includes("BOLETO_TEMPLATE_NAMES")
) {
  throw new Error(
    "[validate-whatsapp-template-ticket-flow] A identificação dos modelos de boleto está incompleta.",
  );
}

const boletoStateChecks = [
  {
    used: source.includes("setBoletoFile("),
    defined:
      /\[\s*boletoFile\s*,\s*setBoletoFile\s*\]\s*=\s*useState<File\s*\|\s*null>\(null\)/.test(
        source,
      ),
    label: "setBoletoFile",
  },
  {
    used: source.includes("setBoletoOverlay("),
    defined:
      /\[\s*boletoOverlay\s*,\s*setBoletoOverlay\s*\]\s*=\s*useState/.test(
        source,
      ),
    label: "setBoletoOverlay",
  },
  {
    used: source.includes("setBoletoDueDate("),
    defined:
      /\[\s*boletoDueDate\s*,\s*setBoletoDueDate\s*\]\s*=\s*useState\(""\)/.test(
        source,
      ),
    label: "setBoletoDueDate",
  },
];

for (const check of boletoStateChecks) {
  if (check.used && !check.defined) {
    throw new Error(
      `[validate-whatsapp-template-ticket-flow] ${check.label} é usado, mas o estado correspondente não está definido.`,
    );
  }
}

if (source.includes("BOLETO_TEMPLATE_NAMES")) {
  for (const required of [
    "mediaPayload.file_base64",
    "fileToBase64(boletoPdf)",
    "...mediaPayload",
  ]) {
    if (!sendTemplate.includes(required)) {
      throw new Error(
        `[validate-whatsapp-template-ticket-flow] Fluxo de PDF do boleto incompleto: ${required} ausente.`,
      );
    }
  }
}

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
  "[validate-whatsapp-template-ticket-flow] ticket, template e anexo de boleto validados",
);
