import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/group-document-ai.mjs");
let source = fs.readFileSync(filePath, "utf8");

const helperMarker = "export function normalizeCustomAmortizationRule";
const validationAnchor = "function validateAiResult(group, aiResult, deterministic) {";

const helper = `function normalizeContractText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase();
}

function customFraction(value) {
  const parsed = finite(value);
  if (parsed === null || parsed < 0 || parsed > 1) return null;
  return Number(parsed.toFixed(8));
}

function validDistribution(prazo, parcela) {
  return prazo !== null && parcela !== null && Math.abs((prazo + parcela) - 1) <= 0.0001;
}

export function normalizeCustomAmortizationRule(result) {
  if (!result || typeof result !== "object") return result;

  const original = result.customRule && typeof result.customRule === "object"
    ? result.customRule
    : {};
  let lePrazoPct = customFraction(original.lePrazoPct);
  let leParcelaPct = customFraction(original.leParcelaPct);
  let llPrazoPct = customFraction(original.llPrazoPct);
  let llParcelaPct = customFraction(original.llParcelaPct);

  const evidenceFragments = [
    result.regraPosContemplacaoDescricao,
    ...evidenceFor(result, "regraPosContemplacao").map((item) => item.trecho),
    ...evidenceFor(result, "customRule").map((item) => item.trecho),
  ].map(normalizeContractText).filter(Boolean);
  const contractualEvidence = evidenceFragments.join(" ");

  const mentionsOwnResources = /\\brecurso(?:s)? proprio(?:s)?\\b|\\blance proprio\\b|\\brecursos? do consorciado\\b/.test(contractualEvidence);
  const embeddedBidMention = /\\blance embutido\\b|\\brecurso(?:s)? embutido(?:s)?\\b|\\bparte embutida\\b|\\bvalor embutido\\b/;
  const amortizationDestination = /amort|abat|redu|prazo|parcela|prestac|ordem inversa|antecip/;
  const explicitAllocation = /\\b\\d{1,3}(?:[.,]\\d+)?\\s*%|\\bintegral(?:mente)?\\b|\\btotalidade\\b|\\b100\\s*%|\\btodo(?: o)? lance embutido\\b/;
  const explicitlyRegulatesEmbeddedBid = evidenceFragments.some((fragment) =>
    embeddedBidMention.test(fragment)
    && amortizationDestination.test(fragment)
    && explicitAllocation.test(fragment)
  );

  const originalLeIsValid = validDistribution(lePrazoPct, leParcelaPct);
  const llIsValid = validDistribution(llPrazoPct, llParcelaPct);

  if (mentionsOwnResources && !explicitlyRegulatesEmbeddedBid && !llIsValid && originalLeIsValid) {
    llPrazoPct = lePrazoPct;
    llParcelaPct = leParcelaPct;
    result.alertas = Array.isArray(result.alertas) ? result.alertas : [];
    const message = "A regra que menciona recurso próprio foi aplicada ao Lance Livre/Próprio, e não ao Lance Embutido.";
    if (!result.alertas.includes(message)) result.alertas.push(message);
  }

  // Regra operacional Consulmax: salvo disposição expressa em contrário no
  // Termo de Aditamento, 100% do Lance Embutido reduz o prazo da cota.
  if (!explicitlyRegulatesEmbeddedBid) {
    lePrazoPct = 1;
    leParcelaPct = 0;
  }

  result.customRule = {
    lePrazoPct: lePrazoPct ?? 0,
    leParcelaPct: leParcelaPct ?? 0,
    llPrazoPct: llPrazoPct ?? 0,
    llParcelaPct: llParcelaPct ?? 0,
  };
  return result;
}

`;

if (!source.includes(helperMarker)) {
  if (!source.includes(validationAnchor)) {
    throw new Error("Âncora de validação da IA não encontrada em group-document-ai.mjs.");
  }
  source = source.replace(validationAnchor, `${helper}${validationAnchor}`);
}

const promptAnchor = `- Lance embutido é distinto de lance fixo. Liste lance livre, lances fixos, limitado e fidelidade separadamente.`;
const promptReplacement = `- Em customRule, LE significa Lance Embutido e LL significa Lance Livre/Próprio.\n- Expressões como "recurso próprio", "recursos próprios" ou "lance próprio" pertencem exclusivamente aos campos llPrazoPct e llParcelaPct, salvo quando o texto mencionar expressamente também o Lance Embutido.\n- Nunca transfira para o Lance Embutido uma regra que o documento limite ao recurso próprio do consorciado.\n- Regra operacional Consulmax: quando o documento não definir expressamente a distribuição do Lance Embutido entre prazo e parcela, considere lePrazoPct = 1 e leParcelaPct = 0 (100% do LE abate prazo). Só use outra distribuição quando houver disposição expressa para o Lance Embutido.\n${promptAnchor}`;
if (!source.includes("Expressões como \"recurso próprio\"")) {
  if (!source.includes(promptAnchor)) throw new Error("Âncora do prompt de customRule não encontrada.");
  source = source.replace(promptAnchor, promptReplacement);
}

const postContemplationPromptAnchor = `- "saldo_devedor_prazo_restante" significa manter o prazo e recalcular/reduzir a parcela.\n- "mantem_parcela_reduz_prazo" significa manter a parcela e reduzir o prazo.\n- Use "custom" quando houver divisão personalizada entre redução de prazo e redução de parcela; preencha customRule em frações de 0 a 1.`;
const postContemplationPromptReplacement = `- Para regraPosContemplacao, leia a seção de amortização do Termo de Aditamento deste grupo e escolha exatamente uma opção: "saldo_devedor_prazo_restante", "mantem_parcela_reduz_prazo", "custom" ou "nao_informado". Classifique cada grupo individualmente; não aplique a regra de outro grupo Maggi.\n- Use "saldo_devedor_prazo_restante" quando o lance/amortização reduzir o saldo devedor e esse saldo for redistribuído pelo prazo remanescente, mantendo a quantidade de parcelas e reduzindo o valor da parcela.\n- Use "mantem_parcela_reduz_prazo" quando o percentual ou a parcela contratual do plano for preservado e a amortização antecipar parcelas finais, mantendo a parcela-base e reduzindo a quantidade de parcelas. A menção ao percentual mensal correspondente ao prazo original, aplicado do início ao fim, é indício dessa regra, mas deve ser interpretada no contexto integral da cláusula.\n- Use "custom" quando a cláusula misturar redução de prazo e redução de parcela, definir percentuais próprios ou tratar Lance Embutido e Lance Livre/Próprio de formas diferentes.\n- Quando a regra for "custom", explique obrigatoriamente em regraPosContemplacaoDescricao como a customização funciona e preencha customRule em frações de 0 a 1: lePrazoPct + leParcelaPct = 1 para Lance Embutido e llPrazoPct + llParcelaPct = 1 para Lance Livre/Próprio, sempre que o documento disciplinar esses tipos.\n- Em regraPosContemplacaoDescricao, interprete a regra em linguagem objetiva: informe o que acontece com o saldo devedor, o valor da parcela e o prazo. Não apenas repita o nome da classificação.\n- Se a cláusula estiver em branco, incompleta ou não permitir distinguir as opções com segurança, use "nao_informado" e registre um alerta; não presuma uma regra.`;
if (!source.includes("Classifique cada grupo individualmente")) {
  if (!source.includes(postContemplationPromptAnchor)) {
    throw new Error("Âncora das opções de regra pós-contemplação não encontrada.");
  }
  source = source.replace(postContemplationPromptAnchor, postContemplationPromptReplacement);
}

const currentConfigAnchor = `  const currentConfig = groupRow.config && typeof groupRow.config === "object" ? groupRow.config : {};
  const nextConfig = {`;
const currentConfigReplacement = `  const currentConfig = groupRow.config && typeof groupRow.config === "object" ? groupRow.config : {};
  const effectiveCustomRule = {
    regraPosContemplacao: result?.regraPosContemplacao || groupRow.regra_pos_contemplacao || null,
    regraPosContemplacaoDescricao: result?.regraPosContemplacaoDescricao || currentConfig.customRuleNotes || "",
    customRule: result?.customRule || currentConfig.customRule || null,
    evidencias: Array.isArray(result?.evidencias) ? result.evidencias : [],
    alertas: [],
  };
  normalizeCustomAmortizationRule(effectiveCustomRule);
  const nextConfig = {`;

if (source.includes(currentConfigAnchor)) {
  source = source.replace(currentConfigAnchor, currentConfigReplacement);
}

const rawCustomBlock = `  if (result?.regraPosContemplacao === "custom") {
    nextConfig.customRule = {
      lePrazoPct: finite(result.customRule?.lePrazoPct) ?? 0,
      leParcelaPct: finite(result.customRule?.leParcelaPct) ?? 0,
      llPrazoPct: finite(result.customRule?.llPrazoPct) ?? 0,
      llParcelaPct: finite(result.customRule?.llParcelaPct) ?? 0
    };
  }`;
const normalizedCustomBlock = `  if (effectiveCustomRule.regraPosContemplacao === "custom" && effectiveCustomRule.customRule) {
    nextConfig.customRule = {
      lePrazoPct: finite(effectiveCustomRule.customRule?.lePrazoPct) ?? 1,
      leParcelaPct: finite(effectiveCustomRule.customRule?.leParcelaPct) ?? 0,
      llPrazoPct: finite(effectiveCustomRule.customRule?.llPrazoPct) ?? 0,
      llParcelaPct: finite(effectiveCustomRule.customRule?.llParcelaPct) ?? 0
    };
  }`;
if (source.includes(rawCustomBlock)) {
  source = source.replace(rawCustomBlock, normalizedCustomBlock);
}

if (!source.includes("const effectiveCustomRule = {") || !source.includes("finite(effectiveCustomRule.customRule?.lePrazoPct) ?? 1")) {
  throw new Error("Não foi possível normalizar o customRule persistido.");
}

const validationReturnAnchor = `\n\n  return result;\n}\n\nfunction lanceOptionsFromAi`;
const normalizedReturn = `\n\n  normalizeCustomAmortizationRule(result);\n  return result;\n}\n\nfunction lanceOptionsFromAi`;
if (!source.includes("normalizeCustomAmortizationRule(result);")) {
  if (!source.includes(validationReturnAnchor)) throw new Error("Retorno final da validação da IA não encontrado.");
  source = source.replace(validationReturnAnchor, normalizedReturn);
}

fs.writeFileSync(filePath, source);
console.log("Semântica de amortização corrigida: a IA interpreta a regra de cada grupo e detalha as customizações.");
