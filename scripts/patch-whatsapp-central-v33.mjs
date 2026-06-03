import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v33] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
let changed = false;

const start = s.indexOf("async function handleSingleCallEvent(payload: any, value: any, call: any) {");
const end = s.indexOf("async function handleInboundWebhook", start);

if (start < 0 || end < 0) {
  log("handleSingleCallEvent", "ponto não encontrado");
} else {
  let fn = s.slice(start, end);

  if (!fn.includes("const nome =")) {
    const needles = [
      "  const direction = extractCallDirectionV32(value, call);",
      "  const direction = extractCallDirection(value, call);",
      "  const direction = call?.from || call?.caller || call?.customer ? \"inbound\" : \"outbound\";",
    ];

    let applied = false;
    for (const needle of needles) {
      if (fn.includes(needle)) {
        fn = fn.replace(
          needle,
          [
            needle,
            "  const contactFromContacts = value?.contacts?.find((c: any) => onlyDigits(c?.wa_id) === waId) || value?.contacts?.[0];",
            "  const nome = contactFromContacts?.profile?.name || null;",
          ].join("\n")
        );
        applied = true;
        changed = true;
        log("nome no handleSingleCallEvent", "aplicado");
        break;
      }
    }

    if (!applied) log("nome no handleSingleCallEvent", "ponto não encontrado");
  } else {
    log("nome no handleSingleCallEvent", "já aplicado");
  }

  // Segurança extra: se algum patch colocou nome em payload sem escopo, garante fallback local.
  if (!fn.includes("const safeCallContactNameV33")) {
    const safeNeedle = "  const payloadToStore = {";
    if (fn.includes(safeNeedle)) {
      fn = fn.replace(
        safeNeedle,
        [
          "  const safeCallContactNameV33 = typeof nome !== \"undefined\" ? nome : null;",
          safeNeedle,
        ].join("\n")
      );
      changed = true;
      log("safeCallContactNameV33", "aplicado");
    }
  }

  // Troca usos problemáticos apenas dentro do handler de chamada.
  fn = fn.replace(/\bnome,\n/g, "nome: safeCallContactNameV33,\n");
  fn = fn.replace(/\bnome,\r\n/g, "nome: safeCallContactNameV33,\r\n");

  s = s.slice(0, start) + fn + s.slice(end);
}

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v33] concluído");
