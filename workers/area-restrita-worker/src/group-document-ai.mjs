import fs from "node:fs/promises";
import path from "node:path";

const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const DEFAULT_MODEL = String(process.env.AREA_RESTRITA_AI_MODEL || "gpt-5.2").trim();
const MIN_CONFIDENCE = Number(process.env.AREA_RESTRITA_AI_MIN_CONFIDENCE || 0.78);

export function canonicalGroupNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized.length === 3 ? normalized.padStart(4, "0") : normalized;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueNumbers(values) {
  return [...new Set(values.map(finite).filter(Number.isFinite).map((value) => Number(value.toFixed(6))))]
    .sort((a, b) => a - b);
}

function pctToFraction(value) {
  const parsed = finite(value);
  if (parsed === null || parsed < 0 || parsed > 100) return null;
  return Number((parsed / 100).toFixed(8));
}

function clampConfidence(value) {
  const parsed = finite(value);
  if (parsed === null) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function evidenceFor(result, field) {
  return (Array.isArray(result?.evidencias) ? result.evidencias : [])
    .filter((item) => item && String(item.campo || "") === field && String(item.trecho || "").trim())
    .sort((a, b) => clampConfidence(b.confianca) - clampConfidence(a.confianca));
}

function fieldIsSupported(result, field, requiredConfidence = MIN_CONFIDENCE) {
  return evidenceFor(result, field).some((item) => clampConfidence(item.confianca) >= requiredConfidence);
}

function responseOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content?.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

const groupSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "grupo",
    "seguroMensalPct",
    "seguroMomento",
    "maxLanceEmbutidoPct",
    "lanceEmbutidoBase",
    "regraPosContemplacao",
    "regraPosContemplacaoDescricao",
    "customRule",
    "faixasCredito",
    "faixasPrazo",
    "lancesPermitidos",
    "evidencias",
    "alertas",
    "confiancaGeral"
  ],
  properties: {
    grupo: { type: "string" },
    seguroMensalPct: { type: ["number", "null"] },
    seguroMomento: { type: "string", enum: ["contratacao", "contemplacao", "nao_informado"] },
    maxLanceEmbutidoPct: { type: ["number", "null"] },
    lanceEmbutidoBase: { type: "string", enum: ["credito", "valor_categoria", "nao_informado"] },
    regraPosContemplacao: {
      type: "string",
      enum: ["saldo_devedor_prazo_restante", "mantem_parcela_reduz_prazo", "custom", "nao_informado"]
    },
    regraPosContemplacaoDescricao: { type: "string" },
    customRule: {
      type: "object",
      additionalProperties: false,
      required: ["lePrazoPct", "leParcelaPct", "llPrazoPct", "llParcelaPct"],
      properties: {
        lePrazoPct: { type: ["number", "null"] },
        leParcelaPct: { type: ["number", "null"] },
        llPrazoPct: { type: ["number", "null"] },
        llParcelaPct: { type: ["number", "null"] }
      }
    },
    faixasCredito: { type: "array", items: { type: "number" } },
    faixasPrazo: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prazo", "taxaAdmPct", "fundoReservaPct"],
        properties: {
          prazo: { type: "integer" },
          taxaAdmPct: { type: "number" },
          fundoReservaPct: { type: "number" }
        }
      }
    },
    lancesPermitidos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "nome", "percentual", "quantidadeContemplacoes", "base"],
        properties: {
          tipo: { type: "string", enum: ["livre", "fixo", "limitado", "fidelidade", "outro"] },
          nome: { type: "string" },
          percentual: { type: ["number", "null"] },
          quantidadeContemplacoes: { type: ["integer", "null"] },
          base: { type: "string", enum: ["credito", "valor_categoria", "saldo_devedor", "nao_informado"] }
        }
      }
    },
    evidencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campo", "documento", "pagina", "trecho", "confianca"],
        properties: {
          campo: { type: "string" },
          documento: { type: "string" },
          pagina: { type: ["integer", "null"] },
          trecho: { type: "string" },
          confianca: { type: "number" }
        }
      }
    },
    alertas: { type: "array", items: { type: "string" } },
    confiancaGeral: { type: "number" }
  }
};

async function uploadPdf(apiKey, pdfPath) {
  const buffer = await fs.readFile(pdfPath);
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([buffer], { type: "application/pdf" }), path.basename(pdfPath));

  const response = await fetch(`${OPENAI_BASE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(`Falha ao enviar ${path.basename(pdfPath)} para a IA: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload.id;
}

async function deleteUploadedFile(apiKey, fileId) {
  if (!fileId) return;
  await fetch(`${OPENAI_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30000)
  }).catch(() => null);
}

function buildPrompt(group, documents, deterministic) {
  const files = documents.map((document) => `- ${path.basename(document.pdfPath)}: ${document.kind === "aditamento" ? "Termo de Aditamento" : "Tabela de Preços"}`).join("\n");
  return `Você é um analista especialista em contratos e tabelas comerciais de consórcio no Brasil.

Analise EM CONJUNTO todos os PDFs anexados do grupo ${group}. Não use conhecimento externo e não presuma regras ausentes.

Hierarquia das fontes:
1. O Termo de Aditamento prevalece para regras contratuais: lances, quantidade de contemplações, seguro e regra pós-contemplação.
2. A Tabela de Preços prevalece para faixas de crédito, prazo comercial vigente, taxa de administração e fundo de reserva.
3. Quando os documentos divergirem, registre um alerta e use a fonte prioritária acima.

Documentos:
${files}

Extração determinística preliminar para conferência, não para copiar cegamente:
${JSON.stringify(deterministic)}

Regras de resposta:
- Retorne percentuais como pontos percentuais exibidos no documento: 20% => 20; 0,055% => 0.055; 25% => 25.
- Faixas de crédito devem ser valores em reais, sem códigos de bens ou de grupos.
- Prazo é o prazo comercial do plano/parcela, não o prazo total do grupo.
- "saldo_devedor_prazo_restante" significa manter o prazo e recalcular/reduzir a parcela.
- "mantem_parcela_reduz_prazo" significa manter a parcela e reduzir o prazo.
- Use "custom" quando houver divisão personalizada entre redução de prazo e redução de parcela; preencha customRule em frações de 0 a 1.
- Lance embutido é distinto de lance fixo. Liste lance livre, lances fixos, limitado e fidelidade separadamente.
- "valor_categoria" significa crédito acrescido de taxa de administração e fundo de reserva.
- Cada campo não nulo deve ter uma evidência com trecho literal curto, documento e página. Sem evidência, retorne nulo ou "nao_informado".
- Não invente páginas; use null quando não for possível determinar.
- O número do grupo deve ser exatamente "${group}".
`;
}

async function requestAiAnalysis({ apiKey, group, documents, deterministic }) {
  const uploaded = [];
  try {
    for (const document of documents) {
      const fileId = await uploadPdf(apiKey, document.pdfPath);
      uploaded.push({ fileId, document });
    }

    const content = [
      { type: "input_text", text: buildPrompt(group, documents, deterministic) },
      ...uploaded.map(({ fileId }) => ({ type: "input_file", file_id: fileId }))
    ];

    const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "maggi_group_document_configuration",
            description: "Configuração comercial e contratual consolidada de um grupo Maggi.",
            strict: true,
            schema: groupSchema
          }
        }
      }),
      signal: AbortSignal.timeout(300000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`A IA retornou HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
    }
    const outputText = responseOutputText(payload);
    if (!outputText) throw new Error("A IA não retornou conteúdo estruturado.");
    return {
      result: JSON.parse(outputText),
      responseId: payload.id || null,
      model: payload.model || DEFAULT_MODEL,
      usage: payload.usage || null
    };
  } finally {
    await Promise.all(uploaded.map(({ fileId }) => deleteUploadedFile(apiKey, fileId)));
  }
}

function deterministicSummary(documents) {
  const priceDocuments = documents.filter((document) => document.kind !== "aditamento");
  const credits = uniqueNumbers(priceDocuments.flatMap((document) => document.extraction?.credits || []));
  const planTerms = uniqueNumbers(priceDocuments.flatMap((document) => document.extraction?.planTerms || []));
  const adminRates = uniqueNumbers(priceDocuments.flatMap((document) => document.extraction?.adminRates || [])).map((value) => value * 100);
  const reserveRates = uniqueNumbers(priceDocuments.flatMap((document) => document.extraction?.reserveRates || [])).map((value) => value * 100);
  const embeddedRates = uniqueNumbers(documents.flatMap((document) => document.extraction?.embeddedBidRates || [])).map((value) => value * 100);
  return { credits, planTerms, adminRates, reserveRates, embeddedRates };
}

function validateAiResult(group, aiResult, deterministic) {
  const result = aiResult && typeof aiResult === "object" ? structuredClone(aiResult) : null;
  if (!result) throw new Error("Resultado vazio da IA.");
  result.grupo = canonicalGroupNumber(result.grupo);
  if (result.grupo !== group) throw new Error(`A IA retornou o grupo ${result.grupo || "vazio"}, esperado ${group}.`);
  result.confiancaGeral = clampConfidence(result.confiancaGeral);
  result.evidencias = Array.isArray(result.evidencias) ? result.evidencias : [];
  result.alertas = Array.isArray(result.alertas) ? result.alertas : [];

  result.faixasCredito = uniqueNumbers(Array.isArray(result.faixasCredito) ? result.faixasCredito : [])
    .filter((value) => value >= 1000 && value <= 100000000);
  if (deterministic.credits.length >= 2 && result.faixasCredito.length >= 2) {
    const minError = Math.abs(result.faixasCredito.at(0) - deterministic.credits.at(0)) / deterministic.credits.at(0);
    const maxError = Math.abs(result.faixasCredito.at(-1) - deterministic.credits.at(-1)) / deterministic.credits.at(-1);
    if (minError > 0.02 || maxError > 0.02) {
      result.alertas.push("Faixas de crédito da IA divergiram da leitura matemática; foram preservadas as faixas determinísticas.");
      result.faixasCredito = deterministic.credits;
    }
  } else if (deterministic.credits.length >= 2) {
    result.faixasCredito = deterministic.credits;
  }

  result.faixasPrazo = (Array.isArray(result.faixasPrazo) ? result.faixasPrazo : [])
    .map((rule) => ({
      prazo: Math.trunc(finite(rule?.prazo) || 0),
      taxaAdmPct: finite(rule?.taxaAdmPct),
      fundoReservaPct: finite(rule?.fundoReservaPct)
    }))
    .filter((rule) => rule.prazo >= 12 && rule.prazo <= 600 && rule.taxaAdmPct !== null && rule.fundoReservaPct !== null);

  result.lancesPermitidos = (Array.isArray(result.lancesPermitidos) ? result.lancesPermitidos : [])
    .map((lance) => ({
      tipo: ["livre", "fixo", "limitado", "fidelidade", "outro"].includes(lance?.tipo) ? lance.tipo : "outro",
      nome: String(lance?.nome || "").trim() || "Lance",
      percentual: finite(lance?.percentual),
      quantidadeContemplacoes: finite(lance?.quantidadeContemplacoes) === null ? null : Math.max(0, Math.trunc(finite(lance.quantidadeContemplacoes))),
      base: ["credito", "valor_categoria", "saldo_devedor", "nao_informado"].includes(lance?.base) ? lance.base : "nao_informado"
    }));

  if (!fieldIsSupported(result, "seguroMensalPct")) result.seguroMensalPct = null;
  if (!fieldIsSupported(result, "maxLanceEmbutidoPct")) result.maxLanceEmbutidoPct = null;
  if (!fieldIsSupported(result, "lanceEmbutidoBase")) result.lanceEmbutidoBase = "nao_informado";
  if (!fieldIsSupported(result, "regraPosContemplacao")) result.regraPosContemplacao = "nao_informado";
  return result;
}

function lanceOptionsFromAi(lances) {
  const output = [];
  const usedKeys = new Set();
  let fixedIndex = 0;
  for (const lance of lances) {
    let key = "livre";
    if (lance.tipo === "fixo") {
      fixedIndex += 1;
      key = fixedIndex === 1 ? "primeiro_fixo" : fixedIndex === 2 ? "segundo_fixo" : "limitado";
    } else if (lance.tipo === "limitado") key = "limitado";
    else if (lance.tipo === "fidelidade") key = "fidelidade";
    else if (lance.tipo === "outro") key = usedKeys.has("limitado") ? "fidelidade" : "limitado";
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    output.push({
      key,
      enabled: true,
      nomeComercial: lance.nome,
      pct: pctToFraction(lance.percentual) ?? 0,
      quantidadeContemplacoes: lance.quantidadeContemplacoes,
      base: lance.base
    });
  }
  if (!usedKeys.has("livre")) {
    output.unshift({ key: "livre", enabled: false, nomeComercial: "Lance Livre", pct: 0, quantidadeContemplacoes: null, base: "nao_informado" });
  }
  return output;
}

export async function buildAiGroupPatch(groupRow, documents) {
  const group = canonicalGroupNumber(groupRow.grupo);
  const deterministic = deterministicSummary(documents);
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  let ai = null;
  let aiError = null;

  if (apiKey && documents.some((document) => document.kind === "aditamento") && documents.some((document) => document.kind !== "aditamento")) {
    try {
      const response = await requestAiAnalysis({ apiKey, group, documents, deterministic });
      ai = {
        ...response,
        result: validateAiResult(group, response.result, deterministic)
      };
    } catch (error) {
      aiError = String(error?.message || error);
    }
  } else if (!apiKey) {
    aiError = "OPENAI_API_KEY não configurada no Railway.";
  } else {
    aiError = "Não foi possível formar o par Tabela de Preços + Termo de Aditamento.";
  }

  const result = ai?.result || null;
  const credits = result?.faixasCredito?.length >= 2 ? result.faixasCredito : deterministic.credits;
  const prazoRules = result?.faixasPrazo?.length ? result.faixasPrazo : [];
  const currentConfig = groupRow.config && typeof groupRow.config === "object" ? groupRow.config : {};
  const nextConfig = {
    ...currentConfig,
    detailsSource: ai ? "area-restrita-ai-pdf-pair" : "area-restrita-deterministic-fallback",
    detailsSyncedAt: new Date().toISOString(),
    aiDocumentAnalysis: {
      analyzedAt: new Date().toISOString(),
      model: ai?.model || DEFAULT_MODEL,
      responseId: ai?.responseId || null,
      usage: ai?.usage || null,
      error: aiError,
      result,
      documents: documents.map((document) => ({
        kind: document.kind,
        label: document.entry.label,
        file: document.pdfPath,
        sourceUrl: document.sourceUrl,
        sha256: document.sha256
      }))
    }
  };

  if (credits.length >= 2) {
    nextConfig.creditRanges = credits.map((valor, index) => ({
      id: `area_restrita_${group}_faixa_${index + 1}`,
      label: `Faixa ${index + 1}`,
      valor
    }));
  }
  if (prazoRules.length) {
    nextConfig.prazoRules = prazoRules.map((rule, index) => ({
      id: `area_restrita_${group}_prazo_${index + 1}`,
      prazo: rule.prazo,
      taxaAdmPct: pctToFraction(rule.taxaAdmPct),
      fundoReservaPct: pctToFraction(rule.fundoReservaPct)
    }));
  }

  const lanceOptions = result ? lanceOptionsFromAi(result.lancesPermitidos) : [];
  if (lanceOptions.length) nextConfig.lanceOptions = lanceOptions;
  const maxEmbedded = result ? pctToFraction(result.maxLanceEmbutidoPct) : null;
  if (maxEmbedded !== null) nextConfig.maxLanceEmbutidoPct = maxEmbedded;
  if (result?.lanceEmbutidoBase && result.lanceEmbutidoBase !== "nao_informado") {
    nextConfig.lanceEmbutidoBase = result.lanceEmbutidoBase;
    nextConfig.baseCalculoEmbutido = result.lanceEmbutidoBase;
  }
  if (result?.seguroMomento && result.seguroMomento !== "nao_informado") nextConfig.seguroMomento = result.seguroMomento;
  if (result?.regraPosContemplacaoDescricao) nextConfig.customRuleNotes = result.regraPosContemplacaoDescricao;
  if (result?.regraPosContemplacao === "custom") {
    nextConfig.customRule = {
      lePrazoPct: finite(result.customRule?.lePrazoPct) ?? 0,
      leParcelaPct: finite(result.customRule?.leParcelaPct) ?? 0,
      llPrazoPct: finite(result.customRule?.llPrazoPct) ?? 0,
      llParcelaPct: finite(result.customRule?.llParcelaPct) ?? 0
    };
  }

  const coreComplete = credits.length >= 2
    && prazoRules.length > 0
    && maxEmbedded !== null
    && result?.regraPosContemplacao !== "nao_informado"
    && result?.lancesPermitidos?.length > 0
    && clampConfidence(result?.confiancaGeral) >= MIN_CONFIDENCE;
  nextConfig.needsDetailsSync = !coreComplete;

  const patch = { grupo, config: nextConfig, updated_at: new Date().toISOString() };
  if (credits.length >= 2) {
    patch.credito_min = credits.at(0);
    patch.credito_max = credits.at(-1);
  }
  if (prazoRules.length) {
    const maxRule = [...prazoRules].sort((a, b) => a.prazo - b.prazo).at(-1);
    patch.prazo_original = maxRule.prazo;
    patch.taxa_adm_pct = pctToFraction(maxRule.taxaAdmPct);
    patch.fundo_reserva_pct = pctToFraction(maxRule.fundoReservaPct);
  }
  if (result) {
    const seguro = pctToFraction(result.seguroMensalPct);
    if (seguro !== null) patch.seguro_pct = seguro;
    if (maxEmbedded !== null) {
      patch.permite_lance_embutido = maxEmbedded > 0;
      patch.lance_embutido_max_pct = maxEmbedded;
    }
    patch.permite_lance_livre = result.lancesPermitidos.some((lance) => lance.tipo === "livre");
    patch.permite_lance_fixo = result.lancesPermitidos.some((lance) => lance.tipo === "fixo");
    const firstFixed = result.lancesPermitidos.find((lance) => lance.tipo === "fixo" && finite(lance.percentual) !== null);
    if (firstFixed) patch.lance_fixo_pct = pctToFraction(firstFixed.percentual);
    if (result.regraPosContemplacao !== "nao_informado") patch.regra_pos_contemplacao = result.regraPosContemplacao;
  }

  return {
    patch,
    summary: {
      group,
      documents: documents.length,
      priceTables: documents.filter((document) => document.kind !== "aditamento").length,
      addenda: documents.filter((document) => document.kind === "aditamento").length,
      creditMin: credits.at(0) ?? null,
      creditMax: credits.at(-1) ?? null,
      prazoMax: prazoRules.length ? Math.max(...prazoRules.map((rule) => rule.prazo)) : null,
      maxLanceEmbutidoPct: maxEmbedded,
      regraPosContemplacao: result?.regraPosContemplacao || null,
      lancesPermitidos: result?.lancesPermitidos?.length || 0,
      confidence: clampConfidence(result?.confiancaGeral),
      aiUsed: Boolean(ai),
      aiError,
      complete: coreComplete
    }
  };
}
