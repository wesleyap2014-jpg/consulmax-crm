import fs from "node:fs";

const pageFile = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
let s = fs.readFileSync(pageFile, "utf8");
let changed = false;

function log(label, status) {
  console.log(`[patch-whatsapp-template-render-v37] ${label}: ${status}`);
}

function replace(label, from, to) {
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

replace(
  "Template type components",
  `type Template = { name: string; language?: string | null; category?: string | null; body?: string | null; status?: string | null };`,
  `type Template = { name: string; language?: string | null; category?: string | null; body?: string | null; status?: string | null; components?: any[] };`
);

replace(
  "template variable helpers",
  `const onlyDigits = (v?: string | null) => String(v || "").replace(/\D/g, "");`,
  `const onlyDigits = (v?: string | null) => String(v || "").replace(/\D/g, "");
const templateVariableNames = (text?: string | null) => Array.from(String(text || "").matchAll(/{{\s*([^}]+)\s*}}/g)).map((m) => String(m[1] || "").trim());
const normalizeTemplateVar = (v?: string | null) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");`
);

const oldSendTemplate = `  async function sendTemplate(conv: Conv) { if (!startTemplate) return alert("Selecione um modelo aprovado."); setSending(true); try { const res = await fetch("/api/whatsapp/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: "pt_BR" }) }); const json = await res.json().catch(() => null); if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error || "Falha ao enviar modelo"); await loadMessages(conv.id); await load(); } catch (e: any) { alert(e?.message || "Não foi possível enviar modelo."); } finally { setSending(false); } }`;

const newSendTemplate = `  async function sendTemplate(conv: Conv) {
    if (!startTemplate) return alert("Selecione um modelo aprovado.");
    const selectedTemplate = templates.find((t) => t.name === startTemplate);
    const vars = templateVariableNames(selectedTemplate?.body);
    const contactName = nameOf(conv);
    const firstName = contactName.split(/\s+/)[0] || contactName || "Cliente";
    const template_params: { name: string; text: string }[] = [];

    for (const varName of vars) {
      const key = normalizeTemplateVar(varName);
      let defaultValue = "";
      if (["nomecliente", "nome", "cliente", "primeironome"].includes(key)) defaultValue = firstName;
      if (["nomecompleto"].includes(key)) defaultValue = contactName;
      if (["telefone", "celular", "whatsapp"].includes(key)) defaultValue = onlyDigits(phoneOf(conv));

      const value = defaultValue || window.prompt(\`Informe o valor de {{\${varName}}} para o modelo \${startTemplate}:\`, "") || "";
      if (!value.trim()) return alert(\`Envio cancelado. A variável {{\${varName}}} não foi preenchida.\`);
      template_params.push({ name: varName, text: value.trim() });
    }

    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: selectedTemplate?.language || "pt_BR", template_params })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error || "Falha ao enviar modelo");
      await loadMessages(conv.id);
      await load();
    } catch (e: any) {
      alert(e?.message || "Não foi possível enviar modelo.");
    } finally {
      setSending(false);
    }
  }`;

replace("sendTemplate with params", oldSendTemplate, newSendTemplate);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-template-render-v37] concluído");
