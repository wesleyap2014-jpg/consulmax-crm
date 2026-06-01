import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v17] ${label}: ${status}`);
}

let s = fs.readFileSync(pageFile, "utf8");
let changed = false;

function replace(label, from, to) {
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

// Drawer: sai do full-height top-0 e vira painel flutuante dentro da área útil do CRM.
replace(
  "drawer painel flutuante",
  `<div className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl">`,
  `<div className="fixed bottom-4 right-4 top-[88px] z-[70] flex w-[min(680px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">`
);

// Header mais baixo.
replace(
  "drawer header compacto",
  `<div className="border-b bg-white p-4">`,
  `<div className="border-b bg-white px-4 py-3">`
);

// Avatar menor.
replace(
  "avatar compacto",
  `className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"`,
  `className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"`
);

// Título e telefone menores.
replace(
  "título compacto",
  `<CardTitle className="truncate text-xl text-slate-900">{conversationName(active)}</CardTitle>`,
  `<CardTitle className="truncate text-base text-slate-900">{conversationName(active)}</CardTitle>`
);

replace(
  "telefone compacto",
  `<p className="mt-0.5 text-base text-slate-500">{formatPhoneBR(activeContact?.telefone || activeContact?.wa_id)}</p>`,
  `<p className="mt-0.5 text-xs text-slate-500">{formatPhoneBR(activeContact?.telefone || activeContact?.wa_id)}</p>`
);

// Badges e ações com menos margem.
replace(
  "badges compactas",
  `<div className="mt-3 flex flex-wrap items-center gap-2">`,
  `<div className="mt-2 flex flex-wrap items-center gap-1.5">`
);

replace(
  "barra ações compacta",
  `<div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">`,
  `<div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">`
);

// Área de mensagens menor e com padding reduzido.
replace(
  "messages padding compacto",
  `<div className="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">`,
  `<div className="flex-1 space-y-3 overflow-auto bg-slate-50 px-4 py-3">`
);

// Bolhas menos gigantes.
replace(
  "bubble compacta",
  `className={\`max-w-[84%] rounded-3xl px-4 py-3 text-base leading-relaxed shadow-sm ${outbound ? "rounded-br-md text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-900"}\`}`,
  `className={\`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${outbound ? "rounded-br-md text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-900"}\`}`
);

// Composer final compacto. Trata variações do v13/v15/v16.
const composerVariants = [
  `<div className="border-t bg-white p-4">`,
  `<div className="border-t bg-white p-3">`,
  `<div className="border-t bg-white px-3 py-2">`,
];
if (!s.includes(`<div className="border-t bg-white px-3 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.06)]">`)) {
  for (const v of composerVariants) {
    const idx = s.lastIndexOf(v);
    if (idx >= 0) {
      s = s.slice(0, idx) + `<div className="border-t bg-white px-3 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.06)]">` + s.slice(idx + v.length);
      changed = true;
      log("composer rodapé compacto", "aplicado");
      break;
    }
  }
}

// Textarea e botões compactos.
const textareaPatterns = [
  `                  className="min-h-[72px] resize-none text-base leading-relaxed"`,
  `                  className="min-h-[46px] max-h-[96px] resize-none text-base leading-relaxed"`,
  `                  className="min-h-[44px] max-h-[92px] resize-none text-sm leading-relaxed py-2"`,
  `                  rows={1}\n                  className="min-h-[38px] max-h-[72px] resize-none rounded-2xl py-2 text-sm leading-snug"`,
];
const textareaCompact = `                  rows={1}\n                  className="min-h-[36px] max-h-[64px] resize-none rounded-2xl px-3 py-2 text-sm leading-snug"`;
if (!s.includes(`className="min-h-[36px] max-h-[64px]`)) {
  for (const p of textareaPatterns) {
    if (s.includes(p)) {
      s = s.replace(p, textareaCompact);
      changed = true;
      log("textarea final compacto", "aplicado");
      break;
    }
  }
}

s = s.replaceAll(`className="h-auto min-w-[48px]"`, `className="h-9 min-w-[40px] rounded-2xl px-2"`);
s = s.replaceAll(`className="h-10 min-w-[42px] rounded-2xl"`, `className="h-9 min-w-[40px] rounded-2xl px-2"`);
s = s.replaceAll(`className="min-w-[60px] px-4 text-white"`, `className="h-9 min-w-[44px] rounded-2xl px-3 text-white"`);
s = s.replaceAll(`className="h-10 min-w-[48px] rounded-2xl px-3 text-white"`, `className="h-9 min-w-[44px] rounded-2xl px-3 text-white"`);

// Card minimizado acompanha o painel novo.
replace(
  "minimized card posicionado",
  `className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-3xl px-4 py-3 text-white shadow-2xl"`,
  `className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-3xl px-4 py-3 text-white shadow-2xl ring-1 ring-white/20"`
);

if (changed) fs.writeFileSync(pageFile, s);
console.log("[patch-whatsapp-central-v17] concluído");
