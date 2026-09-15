import fs from "node:fs";

const file = "src/pages/Clientes.tsx";
const marker = "patch-clientes-phone-source-v1";

if (!fs.existsSync(file)) {
  throw new Error(`[${marker}] Clientes.tsx não encontrado`);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (src.includes(to)) {
    console.log(`[${marker}] ${label}: já aplicado`);
    return;
  }
  if (!src.includes(from)) {
    throw new Error(`[${marker}] ${label}: âncora não encontrada`);
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[${marker}] ${label}: aplicado`);
}

replaceOnce(
  '  telefone?: string | null;\n  email?: string | null;',
  '  telefone?: string | null;\n  telefone_pais?: CountryCode | null;\n  email?: string | null;',
  "país no tipo ClienteBase",
);

replaceOnce(
  'const waNumber = (phone?: string | null) =>\n  parseStoredPhone(phone)?.number.replace("+", "") || onlyDigits(String(phone || ""));',
  'const waNumber = (phone?: string | null, countryHint?: CountryCode | null) =>\n  parseStoredPhone(phone, countryHint)?.number.replace("+", "") || onlyDigits(String(phone || ""));',
  "WhatsApp com dica de país",
);

replaceOnce(
  '.from("clientes").select("id,lead_id,observacoes,uf,cidade").in("lead_id", leadIds)',
  '.from("clientes").select("id,lead_id,telefone,email,observacoes,uf,cidade").in("lead_id", leadIds)',
  "telefone e email vindos de clientes",
);

replaceOnce(
  'const confirmedByLead = new Map<string, { id: string; extra: CadastroExtra | null; uf?: string | null; cidade?: string | null }>();',
  'const confirmedByLead = new Map<string, { id: string; extra: CadastroExtra | null; telefone?: string | null; email?: string | null; uf?: string | null; cidade?: string | null }>();',
  "mapa confirmado com contato",
);

replaceOnce(
  '        confirmedByLead.set(lid, { id: String(c.id), extra: extra || null, uf: resolvedUf, cidade: resolvedCidade });',
  '        confirmedByLead.set(lid, { id: String(c.id), extra: extra || null, telefone: c.telefone ?? null, email: c.email ?? null, uf: resolvedUf, cidade: resolvedCidade });',
  "contato confirmado no mapa",
);

replaceOnce(
  '          telefone: (l as any).telefone || latest?.telefone || null,\n          email: (l as any).email || latest?.email || null,',
  '          telefone: confirmed?.telefone || (l as any).telefone || latest?.telefone || null,\n          telefone_pais:\n            extraFromClient?.telefone_pais ||\n            phoneCountryFromStored(confirmed?.telefone || (l as any).telefone || latest?.telefone || null),\n          email: confirmed?.email || (l as any).email || latest?.email || null,',
  "cliente confirmado como fonte de verdade",
);

const beforeFormat = src;
src = src.replace(/formatPhone\(c\.telefone\)/g, 'formatPhone(c.telefone, c.telefone_pais)');
if (src !== beforeFormat) {
  changed = true;
  console.log(`[${marker}] formatação com país: aplicada`);
} else if (!src.includes('formatPhone(c.telefone, c.telefone_pais)')) {
  throw new Error(`[${marker}] formatação com país: âncora não encontrada`);
}

const beforeWa = src;
src = src.replace(/waNumber\(c\.telefone\)/g, 'waNumber(c.telefone, c.telefone_pais)');
if (src !== beforeWa) {
  changed = true;
  console.log(`[${marker}] link WhatsApp com país: aplicado`);
} else if (!src.includes('waNumber(c.telefone, c.telefone_pais)')) {
  throw new Error(`[${marker}] link WhatsApp com país: âncora não encontrada`);
}

for (const [label, pattern] of [
  ["telefone_pais no ClienteBase", /telefone_pais\?: CountryCode \| null/],
  ["select de clientes com telefone", /select\("id,lead_id,telefone,email,observacoes,uf,cidade"\)/],
  ["cliente confirmado priorizado", /telefone: confirmed\?\.telefone \|\|/],
  ["formatação recebe país", /formatPhone\(c\.telefone, c\.telefone_pais\)/],
  ["WhatsApp recebe país", /waNumber\(c\.telefone, c\.telefone_pais\)/],
]) {
  if (!pattern.test(src)) throw new Error(`[${marker}] validação falhou: ${label}`);
}

if (changed) fs.writeFileSync(file, src);
console.log(`[${marker}] ${changed ? "concluído com alterações" : "já aplicado"}`);
