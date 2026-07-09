import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  console.log("[patch-whatsapp-boleto-template-pdf-v42] arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function log(label, status) {
  console.log(`[patch-whatsapp-boleto-template-pdf-v42] ${label}: ${status}`);
}

function replace(label, from, to) {
  if (src.includes(to)) return log(label, "já aplicado");
  if (!src.includes(from)) return log(label, "trecho não encontrado");
  src = src.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

replace(
  "state overlay boleto vencimento",
  `const [boletoOverlay, setBoletoOverlay] = useState<{ conv: Conv } | null>(null), [boletoFile, setBoletoFile] = useState<File | null>(null);`,
  `const [boletoOverlay, setBoletoOverlay] = useState<{ conv: Conv; templateName: string } | null>(null), [boletoFile, setBoletoFile] = useState<File | null>(null), [boletoDueDate, setBoletoDueDate] = useState("");`
);

replace(
  "helper data boleto",
  `function fileToBase64(f: File): Promise<string> { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(f); }); }`,
  `function fileToBase64(f: File): Promise<string> { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(f); }); }
  const BOLETO_TEMPLATE_NAMES = new Set(["lembrete_boleto_vencimento", "regularizacao_parcela_consorcio"]);
  function isBoletoTemplate(name?: string | null) { return BOLETO_TEMPLATE_NAMES.has(String(name || "")); }
  function formatDateBRInput(value?: string | null) {
    const raw = String(value || "").slice(0, 10);
    const parts = raw.split("-");
    if (parts.length === 3 && parts[0].length === 4) return parts[2] + "/" + parts[1] + "/" + parts[0];
    return raw;
  }
  function boletoTemplateTitle(name?: string | null) {
    return String(name || "") === "regularizacao_parcela_consorcio" ? "Regularização de parcela" : "Lembrete de vencimento";
  }`
);

replace(
  "assinatura template values overrides",
  `function templateVariableValues(conv: Conv) {`,
  `function templateVariableValues(conv: Conv, overrides?: Record<string, string>) {`
);

replace(
  "aplicar vencimento em variaveis",
  `const auto = defaultTemplateValue(conv, varName);
      const value = auto || window.prompt(\`Informe o valor de {{\${varName}}} para o modelo \${startTemplate}:\`, "") || "";`,
  `const key = normalizeTemplateVarKey(varName);
      const auto = defaultTemplateValue(conv, varName);
      const override = overrides?.[key] || "";
      const value = override || auto || window.prompt(\`Informe o valor de {{\${varName}}} para o modelo \${startTemplate}:\`, "") || "";`
);

replace(
  "assinatura sendTemplate vencimento",
  `async function sendTemplate(conv: Conv, boletoPdf?: File | null) {`,
  `async function sendTemplate(conv: Conv, boletoPdf?: File | null, dueDate?: string) {`
);

replace(
  "exigir pdf e vencimento nos modelos boleto",
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");
    if (startTemplate === "lembrete_boleto_vencimento" && !boletoPdf) {
      setBoletoFile(null);
      setBoletoOverlay({ conv });
      return;
    }`,
  `if (!startTemplate) return alert("Selecione um modelo aprovado.");
    if (isBoletoTemplate(startTemplate) && (!boletoPdf || !dueDate)) {
      setBoletoFile(null);
      setBoletoDueDate("");
      setBoletoOverlay({ conv, templateName: startTemplate });
      return;
    }`
);

replace(
  "template params com vencimento",
  `params = templateVariableValues(conv);`,
  `const vencimentoFormatado = formatDateBRInput(dueDate);
      const boletoOverrides = dueDate ? {
        vencimento: vencimentoFormatado,
        datavencimento: vencimentoFormatado,
        datadevencimento: vencimentoFormatado,
        vencimentoboleto: vencimentoFormatado,
        dtvencimento: vencimentoFormatado,
        dtvenc: vencimentoFormatado,
        prazo: vencimentoFormatado,
        parcela: vencimentoFormatado,
        "2": vencimentoFormatado,
      } : undefined;
      params = templateVariableValues(conv, boletoOverrides);`
);

const modalRegex = /\{boletoOverlay && <Modal title="Anexar boleto em PDF"[\s\S]*?\}\{finishOpen && <Modal title="Finalizar conversa"/;
const newModal = `{boletoOverlay && <Modal title="Anexar boleto e vencimento" subtitle="O modelo selecionado exige o PDF do boleto e a data de vencimento." onClose={() => { if (!sending) { setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); } }}><div className="space-y-4"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Modelo selecionado: {boletoTemplateTitle(boletoOverlay.templateName)}</p><p className="mt-1">Selecione o boleto em PDF e informe a data de vencimento para preencher o modelo automaticamente.</p></div><div><label className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Data de vencimento do boleto</label><input type="date" value={boletoDueDate} onChange={(e) => setBoletoDueDate(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm font-bold text-slate-700" /></div><label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:bg-slate-100"><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setBoletoFile(e.target.files?.[0] || null)} /><Paperclip className="mx-auto mb-2 h-6 w-6 text-slate-500" /><p className="text-sm font-black text-slate-800">Selecionar PDF do boleto</p><p className="mt-1 text-xs text-slate-500">Apenas arquivo .pdf</p></label>{boletoFile && <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-sm"><span className="truncate font-bold text-slate-700">📎 {boletoFile.name}</span><button className="text-xs font-black text-[#A11C27]" onClick={() => setBoletoFile(null)}>remover</button></div>}<div className="flex justify-end gap-2"><button disabled={sending} onClick={() => { setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); }} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button><button disabled={sending || !boletoFile || !boletoDueDate} onClick={async () => { if (!boletoOverlay?.conv || !boletoFile || !boletoDueDate) return; await sendTemplate(boletoOverlay.conv, boletoFile, boletoDueDate); setBoletoOverlay(null); setBoletoFile(null); setBoletoDueDate(""); }} className="rounded-2xl bg-[#A11C27] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{sending ? "Enviando..." : "Enviar modelo com boleto"}</button></div></div></Modal>}{finishOpen && <Modal title="Finalizar conversa"`;

if (modalRegex.test(src)) {
  src = src.replace(modalRegex, newModal);
  changed = true;
  log("modal boleto com vencimento", "aplicado");
} else if (src.includes("title=\"Anexar boleto e vencimento\"")) {
  log("modal boleto com vencimento", "já aplicado");
} else {
  log("modal boleto com vencimento", "trecho não encontrado");
}

fs.writeFileSync(file, src);
console.log("[patch-whatsapp-boleto-template-pdf-v42] concluído");
