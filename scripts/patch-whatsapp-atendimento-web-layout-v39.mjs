import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  console.log("patch-whatsapp-atendimento-web-layout-v39: arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");

src = src.replace(
  `<p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p>`,
  `{String(m.message_type || "").toLowerCase().includes("audio") ? <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">🎧 Áudio recebido/enviado</div> : <p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p>}`
);

fs.writeFileSync(file, src);
console.log("patch-whatsapp-atendimento-web-layout-v39: mídia básica aplicada");
