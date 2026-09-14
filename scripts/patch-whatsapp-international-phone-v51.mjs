import fs from "node:fs";

const FRONT_FILE = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
const TEMPLATE_FILE = "api/whatsapp/template.ts";
const SEND_FILE = "api/whatsapp/send.ts";

for (const file of [FRONT_FILE, TEMPLATE_FILE, SEND_FILE]) {
  if (!fs.existsSync(file)) {
    throw new Error(`[patch-whatsapp-international-phone-v51] arquivo não encontrado: ${file}`);
  }
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) {
    console.log(`[patch-whatsapp-international-phone-v51] ${label}: já aplicado`);
    return source;
  }
  if (!source.includes(from)) {
    throw new Error(`[patch-whatsapp-international-phone-v51] ${label}: âncora não encontrada`);
  }
  console.log(`[patch-whatsapp-international-phone-v51] ${label}: aplicado`);
  return source.replace(from, to);
}

// -----------------------------------------------------------------------------
// Front-end: Central WhatsApp passa a respeitar o país do cadastro e E.164.
// -----------------------------------------------------------------------------
let front = fs.readFileSync(FRONT_FILE, "utf8");

if (!front.includes('from "libphonenumber-js"')) {
  front = replaceOnce(
    front,
    'import lameJsBrowserUrl from "lamejs/lame.min.js?url";\n',
    'import lameJsBrowserUrl from "lamejs/lame.min.js?url";\nimport {\n  getCountries,\n  getCountryCallingCode,\n  parsePhoneNumberFromString,\n  type CountryCode,\n} from "libphonenumber-js";\n',
    "import libphonenumber-js",
  );
}

front = replaceOnce(
  front,
  '  telefone: string;\n  email?: string | null;',
  '  telefone: string;\n  telefone_pais?: CountryCode | null;\n  email?: string | null;',
  "ContactOption com país",
);

const oldPhoneHelpers = `const fmtPhone = (v?: string | null) => {\n  const d = onlyDigits(v);\n  const l = d.startsWith("55") ? d.slice(2) : d;\n  if (l.length === 11)\n    return \`(\${l.slice(0, 2)}) \${l.slice(2, 7)}-\${l.slice(7)}\`;\n  if (l.length === 10)\n    return \`(\${l.slice(0, 2)}) \${l.slice(2, 6)}-\${l.slice(6)}\`;\n  return d || "Telefone não identificado";\n};\nconst withCountry = (country: string, phone: string) => {\n  const d = onlyDigits(phone);\n  const code = onlyDigits(country) || "55";\n  return d ? (d.startsWith(code) ? d : \`\${code}\${d}\`) : "";\n};`;

const newPhoneHelpers = `const countryNames =\n  typeof Intl.DisplayNames === "function"\n    ? new Intl.DisplayNames(["pt-BR"], { type: "region" })\n    : null;\nconst PHONE_COUNTRIES = getCountries()\n  .map((code) => ({\n    code,\n    name: countryNames?.of(code) || code,\n    dialCode: getCountryCallingCode(code),\n  }))\n  .sort((a, b) => {\n    if (a.code === "BR") return -1;\n    if (b.code === "BR") return 1;\n    return a.name.localeCompare(b.name, "pt-BR");\n  });\nconst PHONE_COUNTRY_SET = new Set<string>(PHONE_COUNTRIES.map((item) => item.code));\nconst normalizeCountryCode = (value?: string | null): CountryCode | null => {\n  const code = String(value || "").trim().toUpperCase();\n  return PHONE_COUNTRY_SET.has(code) ? (code as CountryCode) : null;\n};\nconst clientCountryFromObservacoes = (value?: string | null): CountryCode | null => {\n  const raw = String(value || "").trim();\n  if (!raw) return null;\n  try {\n    const jsonText = raw.startsWith("CMX_JSON:") ? raw.slice("CMX_JSON:".length) : raw;\n    const parsed = JSON.parse(jsonText);\n    return normalizeCountryCode(parsed?.telefone_pais);\n  } catch {\n    return null;\n  }\n};\nconst normalizePhoneForWhatsapp = (value?: string | null, countryHint?: string | null) => {\n  const raw = String(value || "").trim();\n  if (!raw) return "";\n  const hint = normalizeCountryCode(countryHint);\n  let parsed = raw.startsWith("+") ? parsePhoneNumberFromString(raw) : undefined;\n  if (!parsed?.isValid() && hint) parsed = parsePhoneNumberFromString(raw, hint);\n  const digits = onlyDigits(raw);\n  if (!parsed?.isValid() && digits) {\n    const international = parsePhoneNumberFromString(\`+\${digits}\`);\n    if (international?.isValid()) parsed = international;\n  }\n  if (!parsed?.isValid() && !hint && (digits.length === 10 || digits.length === 11)) {\n    parsed = parsePhoneNumberFromString(raw, "BR");\n  }\n  return parsed?.isValid() ? parsed.number.replace("+", "") : "";\n};\nconst phoneCountryFromValue = (value?: string | null, countryHint?: string | null): CountryCode | null => {\n  const hinted = normalizeCountryCode(countryHint);\n  const normalized = normalizePhoneForWhatsapp(value, hinted);\n  if (!normalized) return hinted;\n  return parsePhoneNumberFromString(\`+\${normalized}\`)?.country || hinted || null;\n};\nconst fmtPhone = (v?: string | null) => {\n  const normalized = normalizePhoneForWhatsapp(v);\n  if (!normalized) return onlyDigits(v) || "Telefone não identificado";\n  return parsePhoneNumberFromString(\`+\${normalized}\`)?.formatInternational() || \`+\${normalized}\`;\n};`;

front = replaceOnce(front, oldPhoneHelpers, newPhoneHelpers, "normalização internacional no atendimento");

front = replaceOnce(
  front,
  '  const [country, setCountry] = useState("55"),',
  '  const [country, setCountry] = useState<CountryCode>("BR"),',
  "estado de país por ISO",
);

front = replaceOnce(
  front,
  '.from("clientes")\n        .select("id,nome,telefone,email,lead_id")',
  '.from("clientes")\n        .select("id,nome,telefone,email,lead_id,observacoes")',
  "busca país em clientes",
);

front = replaceOnce(
  front,
  '        telefone: x.telefone || "",\n        email: x.email || null,\n      })),\n      ...clientes.map((x: any) => ({',
  '        telefone: x.telefone || "",\n        telefone_pais: phoneCountryFromValue(x.telefone),\n        email: x.email || null,\n      })),\n      ...clientes.map((x: any) => ({',
  "país derivado em leads",
);

front = replaceOnce(
  front,
  '        telefone: x.telefone || "",\n        email: x.email || null,\n      })),\n      ...wa.map((x: any) => ({',
  '        telefone: x.telefone || "",\n        telefone_pais:\n          clientCountryFromObservacoes(x.observacoes) || phoneCountryFromValue(x.telefone),\n        email: x.email || null,\n      })),\n      ...wa.map((x: any) => ({',
  "país cadastrado em clientes",
);

front = replaceOnce(
  front,
  '        nome: x.nome || "Contato WhatsApp",\n        telefone: x.telefone || x.wa_id || "",\n      })),',
  '        nome: x.nome || "Contato WhatsApp",\n        telefone: x.telefone || x.wa_id || "",\n        telefone_pais: phoneCountryFromValue(x.telefone || x.wa_id),\n      })),',
  "país derivado em contatos WhatsApp",
);

front = replaceOnce(
  front,
  `    const contact = selectedContact || {\n      source: "manual" as const,\n      nome: manualName || "Contato",\n      telefone: withCountry(country, manualPhone),\n    };\n    const phone = onlyDigits(contact.telefone);\n    if (!phone) return alert("Informe ou selecione um contato com telefone.");`,
  `    const manualCountry = normalizeCountryCode(country) || "BR";\n    const contact = selectedContact || {\n      source: "manual" as const,\n      nome: manualName || "Contato",\n      telefone: manualPhone,\n      telefone_pais: manualCountry,\n    };\n    const phone = normalizePhoneForWhatsapp(\n      contact.telefone,\n      contact.telefone_pais || manualCountry,\n    );\n    if (!phone)\n      return alert("Informe ou selecione um telefone válido para o país escolhido.");`,
  "criação de ticket sem +55 forçado",
);

front = replaceOnce(
  front,
  '      setManualPhone("");\n      setStartMessage("");',
  '      setManualPhone("");\n      setCountry("BR");\n      setStartMessage("");',
  "reset do país após criar ticket",
);

front = replaceOnce(
  front,
  `                      onClick={() => {\n                        setSelectedContact(c);\n                        setManualName(c.nome);\n                        setManualPhone(c.telefone);\n                      }}`,
  `                      onClick={() => {\n                        setSelectedContact(c);\n                        setManualName(c.nome);\n                        setManualPhone(c.telefone);\n                        const selectedCountry =\n                          c.telefone_pais || phoneCountryFromValue(c.telefone);\n                        if (selectedCountry) setCountry(selectedCountry);\n                      }}`,
  "seleção preserva país do contato",
);

front = replaceOnce(
  front,
  `                  <option value="55">Brasil +55</option>\n                  <option value="1">EUA/Canadá +1</option>\n                  <option value="351">Portugal +351</option>`,
  `                  {PHONE_COUNTRIES.map((item) => (\n                    <option key={item.code} value={item.code}>\n                      {item.name} +{item.dialCode}\n                    </option>\n                  ))}`,
  "seletor internacional completo",
);

front = replaceOnce(
  front,
  '                  onChange={(e) => setCountry(e.target.value)}',
  '                  onChange={(e) => setCountry(e.target.value as CountryCode)}',
  "tipagem do seletor de país",
);

front = replaceOnce(
  front,
  '                  placeholder="DDD + número"',
  '                  placeholder="Número no formato do país selecionado"',
  "placeholder internacional",
);

if (!front.includes('normalizePhoneForWhatsapp') || !front.includes('clientCountryFromObservacoes')) {
  throw new Error("[patch-whatsapp-international-phone-v51] validação do front-end falhou");
}
fs.writeFileSync(FRONT_FILE, front);

// -----------------------------------------------------------------------------
// Back-end: conversa existente usa o telefone canônico do cadastro do cliente.
// Isso corrige principalmente templates fora da janela de 24h apontando para
// whatsapp_contacts desatualizado.
// -----------------------------------------------------------------------------
const backendHelper = `\nfunction canonicalStoredPhone(value?: string | null) {\n  const raw = String(value || "").trim();\n  const digits = onlyDigits(raw);\n  if (!digits) return "";\n  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return digits;\n  if (digits.length > 11 && digits.length <= 15) return digits;\n  return "";\n}\n\nasync function resolveConversationRecipientPhone(conversationId: string, suppliedTo?: string | null) {\n  const fallback = onlyDigits(suppliedTo);\n  if (!conversationId) return fallback;\n\n  const { data: conversation } = await supabaseAdmin\n    .from("whatsapp_conversations")\n    .select("id,lead_id,whatsapp_contacts(id,lead_id,telefone,wa_id)")\n    .eq("id", conversationId)\n    .maybeSingle();\n\n  const contact: any = Array.isArray((conversation as any)?.whatsapp_contacts)\n    ? (conversation as any).whatsapp_contacts[0]\n    : (conversation as any)?.whatsapp_contacts;\n  const leadId = (conversation as any)?.lead_id || contact?.lead_id || null;\n  let phone = onlyDigits(contact?.telefone || contact?.wa_id) || fallback;\n\n  if (leadId) {\n    const { data: client } = await supabaseAdmin\n      .from("clientes")\n      .select("telefone")\n      .eq("lead_id", leadId)\n      .maybeSingle();\n    const clientPhone = canonicalStoredPhone((client as any)?.telefone);\n    if (clientPhone) phone = clientPhone;\n\n    if (!clientPhone) {\n      const { data: lead } = await supabaseAdmin\n        .from("leads")\n        .select("telefone")\n        .eq("id", leadId)\n        .maybeSingle();\n      const leadPhone = canonicalStoredPhone((lead as any)?.telefone);\n      if (leadPhone) phone = leadPhone;\n    }\n  }\n\n  if (!phone) phone = fallback;\n\n  const contactId = contact?.id ? String(contact.id) : "";\n  const currentPhone = onlyDigits(contact?.wa_id || contact?.telefone);\n  if (contactId && phone && currentPhone !== phone) {\n    const { data: conflict } = await supabaseAdmin\n      .from("whatsapp_contacts")\n      .select("id")\n      .eq("wa_id", phone)\n      .neq("id", contactId)\n      .limit(1)\n      .maybeSingle();\n\n    if (!(conflict as any)?.id) {\n      await supabaseAdmin\n        .from("whatsapp_contacts")\n        .update({ wa_id: phone, telefone: phone, updated_at: new Date().toISOString() })\n        .eq("id", contactId);\n    }\n  }\n\n  return phone;\n}\n`;

let template = fs.readFileSync(TEMPLATE_FILE, "utf8");
if (!template.includes("async function resolveConversationRecipientPhone")) {
  template = replaceOnce(
    template,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n`,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n${backendHelper}`,
    "helper canônico no endpoint de template",
  );
}

template = replaceOnce(
  template,
  '    const phone = onlyDigits(to);\n    const name = String(template_name || "").trim();',
  '    const phone = await resolveConversationRecipientPhone(String(conversation_id || ""), to);\n    const name = String(template_name || "").trim();',
  "template resolve telefone atualizado",
);

if (!template.includes('resolveConversationRecipientPhone(String(conversation_id || ""), to)')) {
  throw new Error("[patch-whatsapp-international-phone-v51] validação do template falhou");
}
fs.writeFileSync(TEMPLATE_FILE, template);

let send = fs.readFileSync(SEND_FILE, "utf8");
if (!send.includes("async function resolveConversationRecipientPhone")) {
  send = replaceOnce(
    send,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n`,
    `function onlyDigits(value?: string | null) {\n  return String(value || "").replace(/\\D/g, "");\n}\n${backendHelper}`,
    "helper canônico no endpoint de envio",
  );
}

send = replaceOnce(
  send,
  `    if (!conversation_id || !to) {\n      return res.status(400).json({\n        ok: false,\n        error: "conversation_id e to são obrigatórios.",\n      });\n    }\n\n    if (resend_message_id) {`,
  `    if (!conversation_id || !to) {\n      return res.status(400).json({\n        ok: false,\n        error: "conversation_id e to são obrigatórios.",\n      });\n    }\n\n    const resolvedTo = await resolveConversationRecipientPhone(conversation_id, to);\n    if (!resolvedTo) {\n      return res.status(400).json({\n        ok: false,\n        error: "Não foi possível identificar um telefone internacional válido para a conversa.",\n      });\n    }\n\n    if (resend_message_id) {`,
  "resolve telefone antes do envio",
);

send = replaceOnce(
  send,
  `        message_id: resend_message_id,\n        conversation_id,\n        to,\n        user_id,`,
  `        message_id: resend_message_id,\n        conversation_id,\n        to: resolvedTo,\n        user_id,`,
  "reenvio usa telefone canônico",
);

send = replaceOnce(
  send,
  `        conversation_id,\n        to,\n        user_id,\n        file_base64,`,
  `        conversation_id,\n        to: resolvedTo,\n        user_id,\n        file_base64,`,
  "mídia usa telefone canônico",
);

send = replaceOnce(
  send,
  `      conversation_id,\n      to,\n      body,\n      user_id,`,
  `      conversation_id,\n      to: resolvedTo,\n      body,\n      user_id,`,
  "texto usa telefone canônico",
);

if (!send.includes("const resolvedTo = await resolveConversationRecipientPhone")) {
  throw new Error("[patch-whatsapp-international-phone-v51] validação do send falhou");
}
fs.writeFileSync(SEND_FILE, send);

console.log("[patch-whatsapp-international-phone-v51] concluído");
