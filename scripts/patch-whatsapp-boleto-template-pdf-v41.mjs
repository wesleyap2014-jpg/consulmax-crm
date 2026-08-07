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

// O arquivo-fonte é formatado pelo Prettier em múltiplas linhas. A versão antiga
// procurava este bloco em uma única linha e acabava adicionando usos de
// setBoletoFile sem criar o estado correspondente no bundle de produção.
if (/\[\s*boletoFile\s*,\s*setBoletoFile\s*\]\s*=\s*useState<File\s*\|\s*null>\(null\)/.test(src)) {
  log("state overlay boleto", "já aplicado");
} else {
  const templateStates = /(const\s+\[templates,\s*setTemplates\]\s*=\s*useState<Template\[\]>\(\[\]\),[\s\S]*?\[templateFallbackMessage,\s*setTemplateFallbackMessage\]\s*=\s*useState\(""\);)/;
  if (!templateStates.test(src)) {
    throw new Error(
      "[patch-whatsapp-boleto-template-pdf-v41] Não foi possível localizar os estados de template para criar o estado do boleto.",
    );
  }
  src = src.replace(
    templateStates,
    `$1\n  const [boletoOverlay, setBoletoOverlay] = useState<{ conv: Conv } | null>(null), [boletoFile, setBoletoFile] = useState<File | null>(null);`,
  );
  changed = true;
  log("state overlay boleto", "aplicado");
}

replace(
  "assinatura sendTemplate",
  `async function sendTemplate(conv: Conv) {`,
  `async function sendTemplate(conv: Conv, boletoPdf?: File | null) {`
);

replace(
  "exigir boleto pdf",
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");`,
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");\n    if (startTemplate === "lembrete_boleto_vencimento" && !boletoPdf) {\n      setBoletoFile(null);\n      setBoletoOverlay({ conv });\n      return;\n    }`
);

replace(
  "payload pdf boleto",
  `const selected = templates.find((t) => t.name === startTemplate);\n      const res = await fetch("/api/whatsapp/template", {`,
  `const selected = templates.find((t) => t.name === startTemplate);\n      const mediaPayload: any = {};\n      if (boletoPdf) {\n        const name = boletoPdf.name || "boleto.pdf";\n        const mime = boletoPdf.type || "application/pdf";\n        if (!name.toLowerCase().endsWith(".pdf") && mime !== "application/pdf") throw new Error("Anexe um boleto em PDF.");\n        mediaPayload.file_base64 = await fileToBase64(boletoPdf);\n        mediaPayload.file_name = name;\n        mediaPayload.header_file_name = name;\n        mediaPayload.mime_type = "application/pdf";\n        mediaPayload.media_type = "document";\n      }\n      const res = await fetch("/api/whatsapp/template", {`
);

replace(
  "enviar mediaPayload",
  `body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: selected?.language || "pt_BR", template_params: params })`,
  `body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: selected?.language || "pt_BR", template_params: params, ...mediaPayload })`
);

const boletoModal = `{boletoOverlay && <Modal title="Anexar boleto em PDF" subtitle="O modelo lembrete_boleto_vencimento exige o PDF do boleto como anexo." onClose={() => { if (!sending) { setBoletoOverlay(null); setBoletoFile(null); } }}><div className="space-y-4"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Modelo selecionado: lembrete_boleto_vencimento</p><p className="mt-1">Selecione o boleto em PDF para enviar junto com o modelo aprovado.</p></div><label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:bg-slate-100"><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setBoletoFile(e.target.files?.[0] || null)} /><Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-500" /><p className="text-sm font-black text-slate-800">Selecionar PDF do boleto</p><p className="mt-1 text-xs text-slate-500">Apenas arquivo .pdf</p></label>{boletoFile && <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-sm"><span className="truncate font-bold text-slate-700">📎 {boletoFile.name}</span><button className="text-xs font-black text-[#A11C27]" onClick={() => setBoletoFile(null)}>remover</button></div>}<div className="flex justify-end gap-2"><button disabled={sending} onClick={() => { setBoletoOverlay(null); setBoletoFile(null); }} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button><button disabled={sending || !boletoFile} onClick={async () => { if (!boletoOverlay?.conv || !boletoFile) return; await sendTemplate(boletoOverlay.conv, boletoFile); setBoletoOverlay(null); setBoletoFile(null); }} className="rounded-2xl bg-[#A11C27] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{sending ? "Enviando..." : "Enviar modelo com boleto"}</button></div></div></Modal>}`;

if (!src.includes("title=\"Anexar boleto em PDF\"")) {
  const finishModalAnchor = /\{\s*finishOpen\s*&&\s*\(\s*<Modal\s+title="Finalizar conversa"/;
  const compactFinishModalAnchor = `{finishOpen && <Modal title="Finalizar conversa"`;

  if (src.includes(compactFinishModalAnchor)) {
    src = src.replace(
      compactFinishModalAnchor,
      boletoModal + compactFinishModalAnchor,
    );
    changed = true;
    log("modal boleto", "aplicado");
  } else if (finishModalAnchor.test(src)) {
    src = src.replace(finishModalAnchor, (match) => boletoModal + match);
    changed = true;
    log("modal boleto", "aplicado");
  } else {
    throw new Error(
      "[patch-whatsapp-boleto-template-pdf-v41] Não foi possível localizar o modal de finalização para inserir o modal do boleto.",
    );
  }
} else {
  log("modal boleto", "já aplicado");
}

for (const [label, pattern] of [
  ["setBoletoFile", /\[\s*boletoFile\s*,\s*setBoletoFile\s*\]\s*=\s*useState<File\s*\|\s*null>\(null\)/],
  ["setBoletoOverlay", /\[\s*boletoOverlay\s*,\s*setBoletoOverlay\s*\]\s*=\s*useState/],
  ["payload PDF", /mediaPayload\.file_base64\s*=\s*await\s+fileToBase64\(boletoPdf\)/],
  ["payload anexado ao template", /template_params:\s*params,\s*\.\.\.mediaPayload/],
  ["modal de boleto", /title="Anexar boleto em PDF"/],
]) {
  if (!pattern.test(src)) {
    throw new Error(
      `[patch-whatsapp-boleto-template-pdf-v41] Fluxo de boleto incompleto: ${label} ausente.`,
    );
  }
}

fs.writeFileSync(file, src);
console.log(
  `[patch-whatsapp-boleto-template-pdf-v41] concluído${changed ? " com alterações" : " sem alterações"}`,
);
