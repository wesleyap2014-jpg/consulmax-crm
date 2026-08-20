import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  throw new Error("[patch-whatsapp-template-generic-v47] WhatsAppAtendimento.tsx não encontrado");
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function log(label, status) {
  console.log(`[patch-whatsapp-template-generic-v47] ${label}: ${status}`);
}

function replaceOnce(label, pattern, replacement, marker) {
  if (marker && src.includes(marker)) {
    log(label, "já aplicado");
    return;
  }
  if (!pattern.test(src)) {
    throw new Error(`[patch-whatsapp-template-generic-v47] Não foi possível aplicar: ${label}`);
  }
  src = src.replace(pattern, replacement);
  changed = true;
  log(label, "aplicado");
}

replaceOnce(
  "metadados completos do template",
  /type Template = \{\n([\s\S]*?)  status\?: string \| null;\n\};/,
  (_match, inner) =>
    `type Template = {\n${inner}  status?: string | null;\n  components?: Array<{\n    type?: string | null;\n    format?: string | null;\n    text?: string | null;\n    buttons?: any[];\n  }>;\n};`,
  "components?: Array<{",
);

const helperMarker = "function templateHeaderMediaType(";
if (!src.includes(helperMarker)) {
  const anchor = /  function boletoTemplateTitle\(name\?: string \| null\) \{[\s\S]*?\n  \}/;
  if (!anchor.test(src)) {
    throw new Error("[patch-whatsapp-template-generic-v47] helper boletoTemplateTitle não encontrado");
  }
  const helpers = `$&
  const AUTO_TEMPLATE_MEDIA_NAMES = new Set(["felicitacao_aniversario_cliente"]);
  function templateHeaderMediaType(name?: string | null) {
    if (AUTO_TEMPLATE_MEDIA_NAMES.has(String(name || ""))) return null;
    const selected = templates.find((template) => template.name === String(name || ""));
    const header = selected?.components?.find(
      (component) => String(component?.type || "").toUpperCase() === "HEADER",
    );
    const format = String(header?.format || "").toLowerCase();
    return ["document", "image", "video"].includes(format)
      ? (format as "document" | "image" | "video")
      : null;
  }
  function templateMediaAccept(type?: string | null) {
    if (type === "image") return "image/jpeg,image/png";
    if (type === "video") return "video/mp4,video/3gpp";
    return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf";
  }
  function templateMediaLabel(type?: string | null) {
    if (type === "image") return "imagem";
    if (type === "video") return "vídeo";
    return "documento";
  }
  function templateMediaMimeFallback(type?: string | null) {
    if (type === "image") return "image/jpeg";
    if (type === "video") return "video/mp4";
    return "application/pdf";
  }`;
  src = src.replace(anchor, helpers);
  changed = true;
  log("helpers de mídia dinâmica", "aplicado");
} else {
  log("helpers de mídia dinâmica", "já aplicado");
}

replaceOnce(
  "detecção genérica de cabeçalho com mídia",
  /    if \(isBoletoTemplate\(startTemplate\) && \(!boletoPdf \|\| !dueDate\)\) \{\n      setBoletoFile\(null\);\n      setBoletoDueDate\(""\);\n      setBoletoOverlay\(\{ conv, templateName: startTemplate \}\);\n      return;\n    \}/,
  `    const headerMediaType = templateHeaderMediaType(startTemplate);\n    const needsLegacyBoletoData = isBoletoTemplate(startTemplate);\n    if (\n      (needsLegacyBoletoData && (!boletoPdf || !dueDate)) ||\n      (headerMediaType && !boletoPdf)\n    ) {\n      setBoletoFile(null);\n      setBoletoDueDate("");\n      setBoletoOverlay({ conv, templateName: startTemplate });\n      return;\n    }`,
  "const headerMediaType = templateHeaderMediaType(startTemplate);",
);

replaceOnce(
  "upload genérico de mídia do cabeçalho",
  /      const mediaPayload: any = \{\};\n      if \(boletoPdf\) \{[\s\S]*?\n      \}\n      const res = await fetch\("\/api\/whatsapp\/template", \{/,
  `      const mediaPayload: any = {};\n      if (boletoPdf) {\n        const mediaType = headerMediaType || "document";\n        const name = boletoPdf.name || (mediaType === "image" ? "imagem.jpg" : mediaType === "video" ? "video.mp4" : "documento.pdf");\n        const mime = boletoPdf.type || templateMediaMimeFallback(mediaType);\n        if (isBoletoTemplate(startTemplate) && mediaType === "document" && !name.toLowerCase().endsWith(".pdf") && mime !== "application/pdf")\n          throw new Error("Anexe um boleto em PDF.");\n        if (mediaType === "image" && !mime.startsWith("image/"))\n          throw new Error("O modelo selecionado exige uma imagem no cabeçalho.");\n        if (mediaType === "video" && !mime.startsWith("video/"))\n          throw new Error("O modelo selecionado exige um vídeo no cabeçalho.");\n        mediaPayload.file_base64 = await fileToBase64(boletoPdf);\n        mediaPayload.file_name = name;\n        mediaPayload.header_file_name = name;\n        mediaPayload.mime_type = mime;\n        mediaPayload.media_type = mediaType;\n      }\n      const res = await fetch("/api/whatsapp/template", {`,
  "const mediaType = headerMediaType || \"document\";",
);

replaceOnce(
  "nomes de variáveis de cliente",
  /    if \(\["1", "nome", "nomecliente", "cliente", "primeironome"\]\.includes\(key\)\)\n      return firstName;\n    if \(\["nomecompleto", "nomeclientecompleto"\]\.includes\(key\)\) return fullName;/,
  `    if (["1", "nome", "nomecliente", "nomedocliente", "cliente", "primeironome", "primeironomedocliente"].includes(key))\n      return firstName;\n    if (["nomecompleto", "nomeclientecompleto", "nomecompletodocliente"].includes(key)) return fullName;`,
  "\"nomedocliente\"",
);

const genericModalMarker = 'title={isBoletoTemplate(boletoOverlay.templateName) ? "Anexar boleto e vencimento" : "Preparar modelo"}';
if (!src.includes(genericModalMarker)) {
  const modalRegex = /\{boletoOverlay && <Modal title="Anexar boleto e vencimento"[\s\S]*?<\/Modal>\}/;
  if (!modalRegex.test(src)) {
    throw new Error("[patch-whatsapp-template-generic-v47] modal de boleto não encontrado");
  }
  const modal = `{boletoOverlay && <Modal title={isBoletoTemplate(boletoOverlay.templateName) ? "Anexar boleto e vencimento" : "Preparar modelo"} subtitle={isBoletoTemplate(boletoOverlay.templateName) ? "O modelo selecionado exige o PDF do boleto e a data de vencimento." : \`O modelo selecionado exige ${templateMediaLabel(templateHeaderMediaType(boletoOverlay.templateName))} no cabeçalho.\`} onClose={() => { if (!sending) { setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); } }}><div className="space-y-4"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Modelo selecionado: {isBoletoTemplate(boletoOverlay.templateName) ? boletoTemplateTitle(boletoOverlay.templateName) : boletoOverlay.templateName}</p><p className="mt-1">{isBoletoTemplate(boletoOverlay.templateName) ? "Selecione o boleto em PDF e informe a data de vencimento para preencher o modelo automaticamente." : \`Selecione a ${templateMediaLabel(templateHeaderMediaType(boletoOverlay.templateName))} exigida pelo cabeçalho do modelo. As variáveis que o CRM não conseguir preencher serão solicitadas antes do envio.\`}</p></div>{isBoletoTemplate(boletoOverlay.templateName) && <div><label className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Data de vencimento do boleto</label><input type="date" value={boletoDueDate} onChange={(e) => setBoletoDueDate(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm font-bold text-slate-700" /></div>}<label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:bg-slate-100"><input type="file" accept={isBoletoTemplate(boletoOverlay.templateName) ? "application/pdf,.pdf" : templateMediaAccept(templateHeaderMediaType(boletoOverlay.templateName))} className="hidden" onChange={(e) => setBoletoFile(e.target.files?.[0] || null)} /><Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-500" /><p className="text-sm font-black text-slate-800">{isBoletoTemplate(boletoOverlay.templateName) ? "Selecionar PDF do boleto" : \`Selecionar ${templateMediaLabel(templateHeaderMediaType(boletoOverlay.templateName))}\`}</p><p className="mt-1 text-xs text-slate-500">{isBoletoTemplate(boletoOverlay.templateName) ? "Apenas arquivo .pdf" : "O arquivo será enviado no cabeçalho do modelo aprovado."}</p></label>{boletoFile && <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-sm"><span className="truncate font-bold text-slate-700">📎 {boletoFile.name}</span><button className="text-xs font-black text-[#A11C27]" onClick={() => setBoletoFile(null)}>remover</button></div>}<div className="flex justify-end gap-2"><button disabled={sending} onClick={() => { setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); }} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button><button disabled={sending || !boletoFile || (isBoletoTemplate(boletoOverlay.templateName) && !boletoDueDate)} onClick={async () => { if (!boletoOverlay?.conv || !boletoFile) return; await sendTemplate(boletoOverlay.conv, boletoFile, boletoDueDate || undefined); setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); }} className="rounded-2xl bg-[#A11C27] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{sending ? "Enviando..." : "Enviar modelo"}</button></div></div></Modal>}`;
  src = src.replace(modalRegex, modal);
  changed = true;
  log("modal genérico de mídia", "aplicado");
} else {
  log("modal genérico de mídia", "já aplicado");
}

for (const [label, pattern] of [
  ["componentes no tipo Template", /components\?: Array<\{/],
  ["detecção de mídia", /function templateHeaderMediaType\(/],
  ["exceção de mídia automática", /felicitacao_aniversario_cliente/],
  ["fluxo genérico", /const headerMediaType = templateHeaderMediaType\(startTemplate\)/],
  ["payload genérico", /mediaPayload\.media_type = mediaType/],
  ["modal genérico", /title=\{isBoletoTemplate\(boletoOverlay\.templateName\) \? "Anexar boleto e vencimento" : "Preparar modelo"\}/],
  ["variáveis desconhecidas continuam solicitadas", /window\.prompt\(/],
]) {
  if (!pattern.test(src)) {
    throw new Error(`[patch-whatsapp-template-generic-v47] Validação falhou: ${label}`);
  }
}

fs.writeFileSync(file, src);
console.log(`[patch-whatsapp-template-generic-v47] concluído${changed ? " com alterações" : " sem alterações"}`);
