import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value) {
  return stripAccents(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Number.isFinite).map((value) => Number(value.toFixed(6))))]
    .sort((a, b) => a - b);
}

function parseBrNumber(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const cleaned = value
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(raw) {
  const value = parseBrNumber(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100
    ? Number((value / 100).toFixed(6))
    : null;
}

function moneyTokens(line) {
  const tokens = [];
  const regex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:\.\d{3})+)/g;
  let match;
  while ((match = regex.exec(String(line || ""))) !== null) {
    const value = parseBrNumber(match[1]);
    if (Number.isFinite(value)) tokens.push({ raw: match[1], value, index: match.index });
  }
  return tokens;
}

function percentageCandidates(text, patterns, field) {
  const normalized = stripAccents(text);
  const output = [];
  for (const item of patterns) {
    item.regex.lastIndex = 0;
    let match;
    while ((match = item.regex.exec(normalized)) !== null) {
      const value = pct(match[1]);
      if (value === null) continue;
      output.push({
        field,
        value,
        confidence: item.confidence,
        source: item.source,
        evidence: match[0].replace(/\s+/g, " ").trim().slice(0, 350),
      });
    }
  }
  return output;
}

function bestCandidate(candidates) {
  return [...candidates].sort((a, b) => b.confidence - a.confidence)[0] || null;
}

function extractPlanEvidence(text) {
  const normalized = stripAccents(text);
  const candidates = [];
  const patterns = [
    { regex: /PARCELA\s+(\d{2,3})\s+MESES/gi, confidence: 1, source: "cabecalho_parcela" },
    { regex: /(?:^|\n)\s*(\d{2,3})\s+MESES\s*[-–]/gim, confidence: 0.99, source: "titulo_plano" },
    { regex: /PRAZO\s+(?:DO\s+)?PLANO\s*[:\-]?\s*(\d{2,3})/gi, confidence: 0.97, source: "prazo_plano_explicito" },
    { regex: /PLANO\s+(?:DE\s+)?(\d{2,3})\s+(?:MESES|PARCELAS)/gi, confidence: 0.95, source: "plano_meses" },
  ];

  for (const item of patterns) {
    item.regex.lastIndex = 0;
    let match;
    while ((match = item.regex.exec(normalized)) !== null) {
      const value = Number(match[1]);
      if (value < 12 || value > 600) continue;
      candidates.push({
        field: "prazoPlano",
        value,
        confidence: item.confidence,
        source: item.source,
        evidence: match[0].replace(/\s+/g, " ").trim(),
      });
    }
  }

  const groupMatch = normalized.match(/PRAZO\s+DO\s+GRUPO\s*[:\-]?\s*(\d{2,3})/i);
  const prazoGrupo = groupMatch ? Number(groupMatch[1]) : null;
  return { candidates, prazoGrupo: prazoGrupo >= 12 && prazoGrupo <= 600 ? prazoGrupo : null };
}

function extractTableRows(text) {
  const rows = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const tokens = moneyTokens(line);
    if (tokens.length < 2) continue;

    const normalizedLine = normalize(line);
    const looksLikeItem = /(credito|imobiliario|automovel|carro|veiculo|moto|pesado|bem|plano)/.test(normalizedLine);
    if (!looksLikeItem) continue;

    const plausible = tokens.filter(({ value }) => value >= 1000 && value <= 100000000);
    if (plausible.length < 2) continue;

    rows.push({
      line,
      values: plausible.map((item) => item.value),
      credit: plausible[0]?.value ?? null,
      installment: plausible[1]?.value ?? null,
      available: plausible.length >= 3 ? plausible.at(-1).value : null,
    });
  }
  return rows;
}

function extractCredits(text, rows) {
  const rowCredits = rows
    .map((row) => row.credit)
    .filter((value) => Number.isFinite(value) && value >= 20000);
  if (rowCredits.length >= 2) return uniqueSorted(rowCredits);

  const lines = String(text || "").split(/\r?\n/);
  const fallback = [];
  let insideCreditTable = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const normalizedLine = normalize(line);
    if (/valor do credito/.test(normalizedLine)) insideCreditTable = true;
    if (insideCreditTable && /(assembleia|taxa de administracao|informacoes ao vendedor)/.test(normalizedLine)) break;
    if (!insideCreditTable) continue;
    const values = moneyTokens(line).map((item) => item.value).filter((value) => value >= 20000);
    if (values.length > 0) fallback.push(values[0]);
  }
  return uniqueSorted(fallback);
}

function inferEmbeddedBidFromRows(rows, adminRate, reserveRate, declaredRate) {
  if (!Number.isFinite(declaredRate) || declaredRate <= 0) return null;
  const usableRows = rows.filter((row) => Number.isFinite(row.credit) && Number.isFinite(row.available));
  if (usableRows.length < 2) return null;

  const totalFeeFactor = 1 + (adminRate || 0) + (reserveRate || 0);
  const errorsOnCredit = [];
  const errorsOnPlanBase = [];
  for (const row of usableRows) {
    const deduction = row.credit - row.available;
    if (deduction <= 0) continue;
    errorsOnCredit.push(Math.abs(deduction / row.credit - declaredRate));
    errorsOnPlanBase.push(Math.abs(deduction / (row.credit * totalFeeFactor) - declaredRate));
  }
  if (errorsOnCredit.length < 2) return null;

  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const creditError = avg(errorsOnCredit);
  const planBaseError = avg(errorsOnPlanBase);
  const base = planBaseError + 0.002 < creditError ? "credito_mais_taxas" : "credito";
  const confidence = Math.max(0.5, Math.min(0.99, 1 - Math.min(creditError, planBaseError) * 8));

  return {
    base,
    confidence: Number(confidence.toFixed(4)),
    evidence: `${usableRows.length} linhas conferidas matematicamente; erro médio crédito=${creditError.toFixed(6)}; crédito+taxas=${planBaseError.toFixed(6)}`,
  };
}

function parseSemantic(text, textSource) {
  const rows = extractTableRows(text);
  const credits = extractCredits(text, rows);
  const plan = extractPlanEvidence(text);
  const adminEvidence = percentageCandidates(text, [
    { regex: /TAXA\s+(?:DE\s+)?ADMINISTRACAO\s*[.:\-]*\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi, confidence: 1, source: "taxa_administracao_explicita" },
    { regex: /ADMINISTRACAO[^\d%]{0,80}(\d{1,3}(?:[.,]\d+)?)\s*%/gi, confidence: 0.9, source: "administracao_contextual" },
  ], "taxaAdmPct");
  const reserveEvidence = percentageCandidates(text, [
    { regex: /FUNDO\s+(?:DE\s+)?RESERVA\s*[.:\-]*\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi, confidence: 1, source: "fundo_reserva_explicito" },
    { regex: /RESERVA[^\d%]{0,80}(\d{1,3}(?:[.,]\d+)?)\s*%/gi, confidence: 0.88, source: "reserva_contextual" },
  ], "fundoReservaPct");
  const embeddedEvidence = percentageCandidates(text, [
    { regex: /LANCE\s*:\s*PODERAO\s+SER\s+UTILIZADOS\s+ATE\s+(\d{1,3}(?:[.,]\d+)?)\s*%[^\n]{0,240}PAGAMENTO\s+DO\s+LANCE/gi, confidence: 1, source: "regra_lance_explicita" },
    { regex: /LANCE\s+EMBUTIDO[^\d%]{0,150}(\d{1,3}(?:[.,]\d+)?)\s*%/gi, confidence: 1, source: "lance_embutido_explicito" },
    { regex: /UTILIZADOS\s+ATE\s+(\d{1,3}(?:[.,]\d+)?)\s*%[^\n]{0,200}VALOR\s+DO\s+CREDITO[^\n]{0,160}LANCE/gi, confidence: 0.98, source: "uso_credito_para_lance" },
    { regex: /ABATIMENTO\s+DE\s+(\d{1,3}(?:[.,]\d+)?)\s*%\s+DO\s+CREDITO/gi, confidence: 0.8, source: "coluna_valor_disponivel" },
  ], "lanceEmbutidoMaxPct");

  const admin = bestCandidate(adminEvidence);
  const reserve = bestCandidate(reserveEvidence);
  const embedded = bestCandidate(embeddedEvidence);
  const prazo = bestCandidate(plan.candidates);
  const baseExplicit = /BASE\s+DE\s+CALCULO[^\n]{0,180}VALOR\s+DO\s+CREDITO\s+ACRESCIDO\s+DE\s+TAXA\s+DE\s+ADMINISTRACAO\s+E\s+FUNDO\s+DE\s+RESERVA/i.test(stripAccents(text));
  const numericBase = inferEmbeddedBidFromRows(rows, admin?.value, reserve?.value, embedded?.value);
  const embeddedBase = baseExplicit ? {
    base: "credito_mais_taxas",
    confidence: 1,
    evidence: "O PDF declara que a base de cálculo é o crédito acrescido da taxa de administração e do fundo de reserva.",
  } : numericBase;

  const planTerms = uniqueSorted(plan.candidates.map((candidate) => candidate.value));
  const adminRates = uniqueSorted(adminEvidence.map((candidate) => candidate.value));
  const reserveRates = uniqueSorted(reserveEvidence.map((candidate) => candidate.value));
  const embeddedBidRates = uniqueSorted(embeddedEvidence.map((candidate) => candidate.value));
  const required = [credits.length >= 2, Boolean(prazo), Boolean(admin), Boolean(reserve)];
  const confidence = Number((required.filter(Boolean).length / required.length).toFixed(4));

  return {
    credits,
    creditMin: credits.at(0) ?? null,
    creditMax: credits.at(-1) ?? null,
    planTerms,
    prazoMax: prazo?.value ?? null,
    prazoGrupo: plan.prazoGrupo,
    adminRates,
    reserveRates,
    embeddedBidRates,
    lanceEmbutidoMaxPct: embedded?.value ?? null,
    embeddedBidBase: embeddedBase?.base ?? null,
    confidence,
    textSource,
    evidence: {
      prazoPlano: prazo,
      prazoGrupo: plan.prazoGrupo ? { value: plan.prazoGrupo, source: "prazo_grupo_explicito" } : null,
      taxaAdmPct: admin,
      fundoReservaPct: reserve,
      lanceEmbutidoMaxPct: embedded,
      embeddedBidBase: embeddedBase,
      creditRows: rows.slice(0, 30),
    },
  };
}

async function pdftotext(pdfPath) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
    maxBuffer: 30 * 1024 * 1024,
  });
  return String(stdout || "");
}

async function ocrPdf(pdfPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "consulmax-pdf-ocr-"));
  try {
    const prefix = path.join(tempDir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", "180", pdfPath, prefix], { maxBuffer: 10 * 1024 * 1024 });
    const files = (await fs.readdir(tempDir)).filter((name) => /\.png$/i.test(name)).sort();
    const pages = [];
    for (const file of files) {
      const image = path.join(tempDir, file);
      const { stdout } = await execFileAsync("tesseract", [image, "stdout", "-l", "por+eng", "--psm", "6"], {
        maxBuffer: 20 * 1024 * 1024,
      });
      pages.push(String(stdout || ""));
    }
    return pages.join("\n\f\n");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}

export async function extractPriceTableIntelligence(pdfPath) {
  const nativeText = await pdftotext(pdfPath);
  let extraction = parseSemantic(nativeText, "pdftotext_layout");
  const needsOcr = extraction.credits.length < 2 || extraction.confidence < 0.75;

  if (needsOcr) {
    try {
      const ocrText = await ocrPdf(pdfPath);
      const ocrExtraction = parseSemantic(ocrText, "ocr_por_eng");
      const nativeScore = extraction.confidence + Math.min(extraction.credits.length, 10) / 100;
      const ocrScore = ocrExtraction.confidence + Math.min(ocrExtraction.credits.length, 10) / 100;
      if (ocrScore > nativeScore) extraction = ocrExtraction;
      extraction.ocrAttempted = true;
    } catch (error) {
      extraction.ocrAttempted = true;
      extraction.ocrError = String(error?.message || error);
    }
  } else {
    extraction.ocrAttempted = false;
  }

  return extraction;
}
