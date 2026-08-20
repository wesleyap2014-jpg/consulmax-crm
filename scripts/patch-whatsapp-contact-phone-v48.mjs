import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  throw new Error("[patch-whatsapp-contact-phone-v48] WhatsAppAtendimento.tsx não encontrado");
}

let src = fs.readFileSync(file, "utf8");
const marker = "{fmtPhone(phoneOf(active))}";

if (src.includes(marker)) {
  console.log("[patch-whatsapp-contact-phone-v48] telefone no cabeçalho já aplicado");
  process.exit(0);
}

const from = `              <p className="truncate text-xs text-slate-500">\n                Ticket #{active.id.slice(0, 8).toUpperCase()} •{" "}\n                {boardLabel(q.board)} • {q.label}\n              </p>`;

const to = `              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">\n                <span className="flex shrink-0 items-center gap-1 font-bold text-slate-700">\n                  <Phone className="h-3 w-3 text-slate-400" />\n                  {fmtPhone(phoneOf(active))}\n                </span>\n                <span className="text-slate-300">•</span>\n                <span className="truncate">\n                  Ticket #{active.id.slice(0, 8).toUpperCase()} • {boardLabel(q.board)} • {q.label}\n                </span>\n              </div>`;

if (!src.includes(from)) {
  throw new Error("[patch-whatsapp-contact-phone-v48] bloco do cabeçalho da conversa não encontrado");
}

src = src.replace(from, to);

if (!src.includes(marker) || !src.includes('Phone className="h-3 w-3 text-slate-400"')) {
  throw new Error("[patch-whatsapp-contact-phone-v48] validação falhou após aplicar telefone");
}

fs.writeFileSync(file, src);
console.log("[patch-whatsapp-contact-phone-v48] telefone exibido no cabeçalho da conversa");
