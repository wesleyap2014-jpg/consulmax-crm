import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v34] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
let changed = false;

// Segurança final: depois de todos os patches, qualquer shorthand `nome,` dentro de payload
// vira expressão segura. Isso evita ReferenceError quando evento de chamada não traz contact.profile.name.
const safeNomeExpr = 'nome: (typeof nome !== "undefined" ? nome : null),';
if (!s.includes(safeNomeExpr)) {
  const before = s;
  s = s.replace(/\bnome,\n/g, safeNomeExpr + "\n");
  s = s.replace(/\bnome,\r\n/g, safeNomeExpr + "\r\n");
  changed = s !== before;
  log("guard nome shorthand", changed ? "aplicado" : "nenhum trecho encontrado");
} else {
  log("guard nome shorthand", "já aplicado");
}

// Segurança extra específica para handleSingleCallEvent: se não existir uma variável nome no escopo,
// cria uma declaração segura logo após direction/status.
const start = s.indexOf("async function handleSingleCallEvent(payload: any, value: any, call: any) {");
const end = s.indexOf("async function handleInboundWebhook", start);
if (start >= 0 && end > start) {
  const fn = s.slice(start, end);
  if (!fn.includes("const nome =") && !fn.includes("let nome =")) {
    const anchors = [
      "  const direction = extractCallDirectionV32(value, call);",
      "  const direction = extractCallDirection(value, call);",
      "  const direction = call?.from || call?.caller || call?.customer ? \"inbound\" : \"outbound\";",
    ];

    let nextFn = fn;
    for (const anchor of anchors) {
      if (nextFn.includes(anchor)) {
        nextFn = nextFn.replace(anchor, [
          anchor,
          "  const contactFromContactsForCallV34 = value?.contacts?.find((c: any) => onlyDigits(c?.wa_id) === waId) || value?.contacts?.[0];",
          "  const nome = contactFromContactsForCallV34?.profile?.name || null;",
        ].join("\n"));
        break;
      }
    }

    if (nextFn !== fn) {
      s = s.slice(0, start) + nextFn + s.slice(end);
      changed = true;
      log("const nome chamada", "aplicado");
    } else {
      log("const nome chamada", "âncora não encontrada");
    }
  } else {
    log("const nome chamada", "já existe");
  }
} else {
  log("handleSingleCallEvent", "não encontrado");
}

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v34] concluído");
