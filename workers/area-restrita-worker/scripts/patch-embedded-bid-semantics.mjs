import fs from "node:fs";
import path from "node:path";

function replaceRequired(source, needle, replacement, description) {
  if (!source.includes(needle)) {
    throw new Error(`Não foi possível aplicar ${description}. Trecho esperado não encontrado.`);
  }
  return source.replace(needle, replacement);
}

const aiFile = path.resolve("src/group-document-ai.mjs");
let aiSource = fs.readFileSync(aiFile, "utf8");

const oldEvidence = `function evidenceFor(result, field) {
  return (Array.isArray(result?.evidencias) ? result.evidencias : [])
    .filter((item) => item && String(item.campo || "") === field && String(item.trecho || "").trim())
    .sort((a, b) => clampConfidence(b.confianca) - clampConfidence(a.confianca));
}`;
const newEvidence = `function normalizedEvidenceField(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function evidenceAliases(field) {
  const aliases = {
    maxLanceEmbutidoPct: [
      "maxLanceEmbutidoPct",
      "lanceEmbutido",
      "lanceEmbutidoPct",
      "abatimentoCredito",
      "valorDisponivelComAbatimento",
      "utilizacaoCreditoParaLance",
    ],
    lanceEmbutidoBase: [
      "lanceEmbutidoBase",
      "baseLanceEmbutido",
      "baseCalculoLance",
      "baseCalculoEmbutido",
    ],
  };
  return (aliases[field] || [field]).map(normalizedEvidenceField);
}

function evidenceFor(result, field) {
  const aliases = new Set(evidenceAliases(field));
  return (Array.isArray(result?.evidencias) ? result.evidencias : [])
    .filter((item) =>
      item
      && aliases.has(normalizedEvidenceField(item.campo))
      && String(item.trecho || "").trim(),
    )
    .sort((a, b) => clampConfidence(b.confianca) - clampConfidence(a.confianca));
}`;
if (aiSource.includes(oldEvidence)) aiSource = aiSource.replace(oldEvidence, newEvidence);
if (!aiSource.includes("function evidenceAliases(field)")) {
  throw new Error("Não foi possível ampliar as evidências semânticas do lance embutido.");
}

const oldPromptRule = `- Lance embutido é distinto de lance fixo. Liste lance livre, lances fixos, limitado e fidelidade separadamente.
- "valor_categoria" significa crédito acrescido de taxa de administração e fundo de reserva.`;
const newPromptRule = `- Lance embutido é distinto de lance fixo. Liste lance livre, lances fixos, limitado e fidelidade separadamente.
- Interprete pelo significado econômico, mesmo que o documento não use a expressão "lance embutido".
- Na Tabela de Preços, cabeçalhos como "VLR. DISPONÍVEL C/ ABATIMENTO DE 20% DO CRÉDITO", "valor disponível com abatimento de X%" ou equivalentes significam que até X% do crédito/base pode ser usado para pagar o lance. Nesse caso, retorne maxLanceEmbutidoPct = X.
- No Termo de Aditamento, frases como "é permitida a utilização de até X% do valor do crédito para amortização do lance", "utilizados até X% para pagamento do lance" ou equivalentes também significam lance embutido máximo de X%.
- Quando o documento disser que a base considera o crédito acrescido da taxa de administração e do fundo de reserva, retorne lanceEmbutidoBase = "valor_categoria". Quando for somente o crédito, retorne "credito".
- Para o limite do lance embutido, registre a evidência com campo exatamente "maxLanceEmbutidoPct". Para a base, use exatamente "lanceEmbutidoBase".
- Se Tabela e Aditamento expressarem a mesma regra com palavras diferentes, consolide as duas evidências. Não retorne nulo apenas porque a expressão literal "lance embutido" não apareceu.
- "valor_categoria" significa crédito acrescido de taxa de administração e fundo de reserva.`;
if (aiSource.includes(oldPromptRule)) aiSource = aiSource.replace(oldPromptRule, newPromptRule);
if (!aiSource.includes("Interprete pelo significado econômico")) {
  throw new Error("Não foi possível reforçar o conceito econômico de lance embutido no prompt.");
}

const oldDeterministicReturn = `  const embeddedRates = uniqueNumbers(documents.flatMap((document) => document.extraction?.embeddedBidRates || [])).map((value) => value * 100);
  return { credits, planTerms, adminRates, reserveRates, embeddedRates };`;
const newDeterministicReturn = `  const embeddedRates = uniqueNumbers(documents.flatMap((document) => document.extraction?.embeddedBidRates || [])).map((value) => value * 100);
  const embeddedBases = [...new Set(
    documents
      .map((document) => document.extraction?.embeddedBidBase)
      .filter(Boolean),
  )];
  const embeddedEvidence = documents
    .map((document) => ({
      documento: path.basename(document.pdfPath),
      limite: document.extraction?.evidence?.lanceEmbutidoMaxPct || null,
      base: document.extraction?.evidence?.embeddedBidBase || null,
    }))
    .filter((item) => item.limite || item.base);
  return { credits, planTerms, adminRates, reserveRates, embeddedRates, embeddedBases, embeddedEvidence };`;
if (aiSource.includes(oldDeterministicReturn)) {
  aiSource = aiSource.replace(oldDeterministicReturn, newDeterministicReturn);
}
if (!aiSource.includes("embeddedEvidence")) {
  throw new Error("Não foi possível enviar as evidências determinísticas de lance embutido para a IA.");
}

const oldValidationEnd = `  if (!fieldIsSupported(result, "seguroMensalPct")) result.seguroMensalPct = null;
  if (!fieldIsSupported(result, "maxLanceEmbutidoPct")) result.maxLanceEmbutidoPct = null;
  if (!fieldIsSupported(result, "lanceEmbutidoBase")) result.lanceEmbutidoBase = "nao_informado";
  if (!fieldIsSupported(result, "regraPosContemplacao")) result.regraPosContemplacao = "nao_informado";
  return result;`;
const newValidationEnd = `  if (!fieldIsSupported(result, "seguroMensalPct")) result.seguroMensalPct = null;
  if (!fieldIsSupported(result, "maxLanceEmbutidoPct")) result.maxLanceEmbutidoPct = null;
  if (!fieldIsSupported(result, "lanceEmbutidoBase")) result.lanceEmbutidoBase = "nao_informado";
  if (!fieldIsSupported(result, "regraPosContemplacao")) result.regraPosContemplacao = "nao_informado";

  const deterministicEmbedded = Array.isArray(deterministic?.embeddedRates)
    ? deterministic.embeddedRates.filter((value) => finite(value) > 0).sort((a, b) => a - b).at(-1)
    : null;
  if (result.maxLanceEmbutidoPct === null && deterministicEmbedded !== null && deterministicEmbedded !== undefined) {
    result.maxLanceEmbutidoPct = deterministicEmbedded;
    result.alertas.push("O limite do lance embutido foi confirmado pela leitura semântica/matemática da Tabela de Preços e preservado como contingência da interpretação da IA.");
  }

  if (result.lanceEmbutidoBase === "nao_informado") {
    const bases = Array.isArray(deterministic?.embeddedBases) ? deterministic.embeddedBases : [];
    if (bases.includes("credito_mais_taxas")) {
      result.lanceEmbutidoBase = "valor_categoria";
      result.alertas.push("A base do lance embutido foi confirmada como crédito acrescido de taxa de administração e fundo de reserva.");
    } else if (bases.includes("credito")) {
      result.lanceEmbutidoBase = "credito";
    }
  }

  return result;`;
if (aiSource.includes(oldValidationEnd)) aiSource = aiSource.replace(oldValidationEnd, newValidationEnd);
if (!aiSource.includes("const deterministicEmbedded =")) {
  throw new Error("Não foi possível adicionar a contingência semântica do lance embutido.");
}

fs.writeFileSync(aiFile, aiSource);

const intelligenceFile = path.resolve("src/price-table-intelligence.mjs");
let intelligenceSource = fs.readFileSync(intelligenceFile, "utf8");

const oldPatterns = `    { regex: /LANCE\\s*:\\s*PODERAO\\s+SER\\s+UTILIZADOS\\s+ATE\\s+(\\d{1,3}(?:[.,]\\d+)?)\\s*%[^\\n]{0,240}PAGAMENTO\\s+DO\\s+LANCE/gi, confidence: 1, source: "regra_lance_explicita" },
    { regex: /LANCE\\s+EMBUTIDO[^\\d%]{0,150}(\\d{1,3}(?:[.,]\\d+)?)\\s*%/gi, confidence: 1, source: "lance_embutido_explicito" },
    { regex: /UTILIZADOS\\s+ATE\\s+(\\d{1,3}(?:[.,]\\d+)?)\\s*%[^\\n]{0,200}VALOR\\s+DO\\s+CREDITO[^\\n]{0,160}LANCE/gi, confidence: 0.98, source: "uso_credito_para_lance" },
    { regex: /ABATIMENTO\\s+DE\\s+(\\d{1,3}(?:[.,]\\d+)?)\\s*%\\s+DO\\s+CREDITO/gi, confidence: 0.8, source: "coluna_valor_disponivel" },`;
const newPatterns = `    { regex: /LANCE\\s*:\\s*PODERAO\\s+SER\\s+UTILIZADOS\\s+ATE\\s+(\\d{1,3}(?:[.,]\\d+)?)\\s*%[\\s\\S]{0,300}?PAGAMENTO\\s+DO\\s+LANCE/gi, confidence: 1, source: "regra_lance_explicita" },
    { regex: /LANCE\\s+EMBUTIDO[^\\d%]{0,180}(\\d{1,3}(?:[.,]\\d+)?)\\s*%/gi, confidence: 1, source: "lance_embutido_explicito" },
    { regex: /(?:UTILIZACAO|UTILIZAR|UTILIZADOS|UTILIZADA)[\\s\\S]{0,100}?ATE\\s+(\\d{1,3}(?:[.,]\\d+)?)\\s*%[\\s\\S]{0,260}?(?:VALOR\\s+DO\\s+CREDITO|CREDITO)[\\s\\S]{0,220}?(?:AMORTIZACAO|PAGAMENTO)[\\s\\S]{0,80}?LANCE/gi, confidence: 1, source: "uso_credito_para_amortizacao_lance" },
    { regex: /(?:VLR\\.?|VALOR)\\s+DISPONIVEL[\\s\\S]{0,180}?ABATIMENTO[\\s\\S]{0,80}?(\\d{1,3}(?:[.,]\\d+)?)\\s*%[\\s\\S]{0,160}?CREDITO/gi, confidence: 0.98, source: "valor_disponivel_com_abatimento" },
    { regex: /ABATIMENTO[\\s\\S]{0,100}?(\\d{1,3}(?:[.,]\\d+)?)\\s*%[\\s\\S]{0,180}?(?:DO\\s+)?CREDITO/gi, confidence: 0.94, source: "abatimento_credito_contextual" },`;
if (intelligenceSource.includes(oldPatterns)) {
  intelligenceSource = intelligenceSource.replace(oldPatterns, newPatterns);
}
if (!intelligenceSource.includes("uso_credito_para_amortizacao_lance")) {
  throw new Error("Não foi possível ampliar os padrões semânticos do lance embutido.");
}

const oldBase = `  const baseExplicit = /BASE\\s+DE\\s+CALCULO[^\\n]{0,180}VALOR\\s+DO\\s+CREDITO\\s+ACRESCIDO\\s+DE\\s+TAXA\\s+DE\\s+ADMINISTRACAO\\s+E\\s+FUNDO\\s+DE\\s+RESERVA/i.test(stripAccents(text));`;
const newBase = `  const baseExplicit = /(?:BASE\\s+DE\\s+CALCULO|BASE\\s+DE\\s+CALCULO\\s+DO\\s+VALOR|ONDE\\s+A\\s+BASE)[\\s\\S]{0,260}?VALOR\\s+DO\\s+CREDITO[\\s\\S]{0,120}?ACRESCIDO[\\s\\S]{0,120}?TAXA\\s+DE\\s+ADMINISTRACAO[\\s\\S]{0,120}?FUNDO\\s+DE\\s+RESERVA/i.test(stripAccents(text));`;
if (intelligenceSource.includes(oldBase)) intelligenceSource = intelligenceSource.replace(oldBase, newBase);
if (!intelligenceSource.includes("ONDE\\s+A\\s+BASE")) {
  throw new Error("Não foi possível ampliar a leitura da base do lance embutido.");
}

fs.writeFileSync(intelligenceFile, intelligenceSource);
console.log("Lance embutido passou a ser interpretado semanticamente pela Tabela de Preços e pelo Termo de Aditamento.");