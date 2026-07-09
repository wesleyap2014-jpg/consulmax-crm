import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  console.log("[patch-whatsapp-boleto-data-vcto-v43] arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");

const from = `        dtvencimento: vencimentoFormatado,
        dtvenc: vencimentoFormatado,
        prazo: vencimentoFormatado,`;
const to = `        dtvencimento: vencimentoFormatado,
        dtvenc: vencimentoFormatado,
        datavcto: vencimentoFormatado,
        data_vcto: vencimentoFormatado,
        vcto: vencimentoFormatado,
        prazo: vencimentoFormatado,`;

if (!src.includes("datavcto: vencimentoFormatado")) {
  if (!src.includes(from)) {
    console.log("[patch-whatsapp-boleto-data-vcto-v43] trecho não encontrado");
  } else {
    src = src.replace(from, to);
    console.log("[patch-whatsapp-boleto-data-vcto-v43] aplicado");
  }
} else {
  console.log("[patch-whatsapp-boleto-data-vcto-v43] já aplicado");
}

fs.writeFileSync(file, src);
