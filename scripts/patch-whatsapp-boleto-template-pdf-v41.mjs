import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  console.log("[patch-whatsapp-boleto-template-pdf-v41] arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function log(label, status) {
  console.log(`[patch-whatsapp-boleto-template-pdf-v41] ${label}: ${status}`);
}

function replace(label, from, to) {
  if (src.includes(to)) return log(label, "já aplicado");
  if (!src.includes(from)) return log(label, "trecho não encontrado");
  src = src.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

replace(
  "state overlay boleto",
  `const [templates, setTemplates] = useState<Template[]>([]), [startTemplate, setStartTemplate] = useState(""), [startMessage, setStartMessage] = useState(""), [templateFallbackMessage, setTemplateFallbackMessage] = useState("");`,
  `const [templates, setTemplates] = useState<Template[]>([]), [startTemplate, setStartTemplate] = useState(""), [startMessage, setStartMessage] = useState(""), [templateFallbackMessage, setTemplateFallbackMessage] = useState("");
  const [boletoOverlay, setBoletoOverlay] = useState<{ conv: Conv } | null>(null), [boletoFile, setBoletoFile] = useState<File | null>(null);`
);

replace(
  "assinatura sendTemplate",
  `async function sendTemplate(conv: Conv) {`,
  `async function sendTemplate(conv: Conv, boletoPdf?: File | null) {`
);

replace(
  "exigir boleto pdf",
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");`,
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");
    if (startTemplate === "lembrete_boleto_vencimento" && !boletoPdf) {
      setBoletoFile(null);
      setBoletoOverlay({ conv });
      return;
    }`
);

replace(
  "payload pdf boleto",
  `const selected = templates.find((t) => t.name === startTemplate);
      const res = await fetch("/api/whatsapp/template", {`,
  `const selected = templates.find((t) => t.name === startTemplate);
      const mediaPayload: any = {};
      if (boletoPdf) {
        const name = boletoPdf.name || "boleto.pdf";
        const mime = boletoPdf.type || "application/pdf";
        if (!name.toLowerCase().endsWith(".pdf") && mime !== "application/pdf") throw new Error("Anexe um boleto em PDF.");
        mediaPayload.file_base64 = await fileToBase64(boletoPdf);
        mediaPayload.file_name = name;
        mediaPayload.header_file_name = name;
        mediaPayload.mime_type = "application/pdf";
        mediaPayload.media_type = "document";
      }
      const res = await fetch("/api/whatsapp/template", {`
);

replace(
  "enviar mediaPayload",
  `body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: selected?.language || "pt_BR", template_params: params })`,
  `body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: selected?.language || "pt_BR", template_params: params, ...mediaPayload })`
);

const boletoModal = `{boletoOverlay && <Modal title="Anexar boleto em PDF" subtitle="O modelo lembrete_boleto_vencimento exige o PDF do boleto como anexo." onClose={() => { if (!sending) { setBoletoOverlay(null); setBoletoFile(null); } }}><div className="space-y-4"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Modelo selecionado: lembrete_boleto_vencimento</p><p className="mt-1">Selecione o boleto em PDF para enviar junto com o modelo aprovado.</p></div><label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:bg-slate-100"><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setBoletoFile(e.target.files?.[0] || null)} /><Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-500" /><p className="text-sm font-black text-slate-800">Selecionar PDF do boleto</p><p className="mt-1 text-xs text-slate-500">Apenas arquivo .pdf</p></label>{boletoFile && <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-sm"><span className="truncate font-bold text-slate-700">📎 {boletoFile.name}</span><button className="text-xs font-black text-[#A11C27]" onClick={() => setBoletoFile(null)}>remover</button></div>}<div className="flex justify-end gap-2"><button disabled={sending} onClick={() => { setBoletoOverlay(null); setBoletoFile(null); }} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button><button disabled={sending || !boletoFile} onClick={async () => { if (!boletoOverlay?.conv || !boletoFile) return; await sendTemplate(boletoOverlay.conv, boletoFile); setBoletoOverlay(null); setBoletoFile(null); }} className="rounded-2xl bg-[#A11C27] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{sending ? "Enviando..." : "Enviar modelo com boleto"}</button></div></div></Modal>}`;

if (!src.includes("title=\"Anexar boleto em PDF\"")) {
  if (src.includes("{finishOpen && <Modal title=\"Finalizar conversa\"")) {
    src = src.replace("{finishOpen && <Modal title=\"Finalizar conversa\"", boletoModal + "{finishOpen && <Modal title=\"Finalizar conversa\"");
    changed = true;
    log("modal boleto", "aplicado");
  } else {
    log("modal boleto", "trecho não encontrado");
  }
} else {
  log("modal boleto", "já aplicado");
}

fs.writeFileSync(file, src);
console.log("[patch-whatsapp-boleto-template-pdf-v41] concluído");
