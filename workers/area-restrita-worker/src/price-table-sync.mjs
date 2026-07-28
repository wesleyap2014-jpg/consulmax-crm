import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const DOWNLOAD_ROOT = path.join(DATA_DIR, "downloads", "tabelas-precos");
const MANIFEST_FILE = path.join(DATA_DIR, "area-restrita-price-tables.json");
const SOURCE_NAME = "area-restrita-price-table-worker";

function optionalEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeSlug(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "tabela";
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter(Number.isFinite).map((value) => Number(value.toFixed(6))))]
    .sort((a, b) => a - b);
}

function parseBrazilianNumber(raw) {
  const cleaned = String(raw || "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentValue(raw) {
  const parsed = parseBrazilianNumber(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Number((parsed / 100).toFixed(6));
}

function moneyValuesFromLine(line) {
  const values = [];
  const regex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,}(?:,\d{2})?)/gi;
  let match;
  while ((match = regex.exec(String(line || ""))) !== null) {
    const value = parseBrazilianNumber(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function collectRegexValues(text, regexes, mapper) {
  const values = [];
  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = mapper(match[1]);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return uniqueSortedNumbers(values);
}

function extractCreditValues(text) {
  const lines = String(text || "").split(/\r?\n/);
  const values = [];
  const codePattern = /\b[A-Z]{2,5}\s*[-.]?\s*\d{1,3}\b/i;

  for (const line of lines) {
    if (!codePattern.test(line)) continue;
    const money = moneyValuesFromLine(line).filter((value) => value >= 20000 && value <= 100000000);
    if (money.length > 0) values.push(money[0]);
  }

  if (values.length < 2) {
    const headerIndex = lines.findIndex((line) => /cr[eé]dito/i.test(line));
    if (headerIndex >= 0) {
      const windowLines = lines.slice(headerIndex + 1, headerIndex + 120);
      for (const line of windowLines) {
        const money = moneyValuesFromLine(line).filter((value) => value >= 20000 && value <= 100000000);
        if (money.length === 0) continue;
        if (money.length >= 2 || codePattern.test(line)) values.push(money[0]);
      }
    }
  }

  if (values.length < 2) {
    for (const line of lines) {
      const money = moneyValuesFromLine(line).filter((value) => value >= 20000 && value <= 100000000);
      if (money.length >= 2) values.push(Math.max(...money));
    }
  }

  return uniqueSortedNumbers(values).slice(0, 200);
}

function extractPlanTerms(text) {
  const normalized = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const terms = collectRegexValues(normalized, [
    /prazo\s+(?:do\s+)?plano\s*[:\-]?\s*(\d{2,3})\s*(?:meses|parcelas)?/gi,
    /plano\s+(?:de\s+)?(\d{2,3})\s*(?:meses|parcelas)/gi,
    /(\d{2,3})\s*parcelas[^\n]{0,60}prazo\s+(?:do\s+)?plano/gi,
  ], (raw) => Number(raw));
  return terms.filter((value) => value >= 12 && value <= 600);
}

function extractAdminRates(text) {
  const normalized = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return collectRegexValues(normalized, [
    /taxa\s+(?:de\s+)?administracao[^\d%]{0,80}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /administracao\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercentValue);
}

function extractReserveRates(text) {
  const normalized = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return collectRegexValues(normalized, [
    /fundo\s+(?:de\s+)?reserva[^\d%]{0,80}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /reserva\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercentValue);
}

function extractEmbeddedBidRates(text) {
  const normalized = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return collectRegexValues(normalized, [
    /lance\s+embutido[^\d%]{0,120}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /embutido[^\d%]{0,80}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercentValue);
}

function buildPlanRules(extraction) {
  const terms = extraction.planTerms;
  const admin = extraction.adminRates;
  const reserve = extraction.reserveRates;
  if (terms.length === 0) return [];

  return terms.map((prazo, index) => ({
    prazo,
    taxaAdmPct: admin[index] ?? admin.at(-1) ?? null,
    fundoReservaPct: reserve[index] ?? reserve.at(-1) ?? null,
  }));
}

function parsePriceTableText(text) {
  const credits = extractCreditValues(text);
  const planTerms = extractPlanTerms(text);
  const adminRates = extractAdminRates(text);
  const reserveRates = extractReserveRates(text);
  const embeddedBidRates = extractEmbeddedBidRates(text);

  return {
    credits,
    creditMin: credits.at(0) ?? null,
    creditMax: credits.at(-1) ?? null,
    planTerms,
    prazoMax: planTerms.length ? Math.max(...planTerms) : null,
    adminRates,
    reserveRates,
    embeddedBidRates,
    lanceEmbutidoMaxPct: embeddedBidRates.length ? Math.max(...embeddedBidRates) : null,
  };
}

async function pdfToText(pdfPath) {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-layout", "-enc", "UTF-8", pdfPath, "-"],
    { maxBuffer: 30 * 1024 * 1024 }
  );
  return String(stdout || "");
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function resolveHttpUrl(candidate, baseUrl) {
  const value = String(candidate || "").trim();
  if (!value || value === "#" || /^javascript:/i.test(value) || /^blob:/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/i.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function extractViewerFileUrl(candidate, baseUrl) {
  const value = String(candidate || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, baseUrl);
    for (const key of ["file", "src", "url"]) {
      const nested = parsed.searchParams.get(key);
      if (nested) {
        const resolved = resolveHttpUrl(decodeURIComponent(nested), baseUrl);
        if (resolved) return resolved;
      }
    }
    if (/\.pdf(?:$|[?#])/i.test(parsed.href)) return parsed.href;
  } catch {
    return null;
  }
  return null;
}

async function savePdfBuffer(buffer, directory, filename) {
  if (!isPdfBuffer(buffer)) throw new Error("A resposta capturada não é um PDF válido.");
  await fs.mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, filename);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

async function fetchPdfWithContext(context, url, referer, directory, filename) {
  const response = await context.request.get(url, {
    timeout: 45000,
    headers: referer ? { Referer: referer } : undefined,
  });
  if (!response.ok()) return null;
  const buffer = await response.body();
  if (!isPdfBuffer(buffer)) return null;
  return savePdfBuffer(buffer, directory, filename);
}

async function discoverPriceEntries(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const candidates = Array.from(document.querySelectorAll('a, button, [onclick], [role="button"]'));
    const seen = new Map();
    const entries = [];

    for (const element of candidates) {
      const label = String(element.innerText || element.textContent || element.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      const normalized = normalize(label);
      if (!normalized.includes("tabela") || !normalized.includes("grupo")) continue;
      const groupMatch = normalized.match(/\bgrupo\s*0*(\d{3,5})\b/i);
      if (!groupMatch) continue;

      const group = String(Number(groupMatch[1]));
      const signature = `${group}|${normalized}`;
      const occurrence = seen.get(signature) || 0;
      seen.set(signature, occurrence + 1);

      entries.push({
        group,
        label,
        normalizedLabel: normalized,
        occurrence,
        href: element.getAttribute("href"),
        onclick: element.getAttribute("onclick"),
        tagName: element.tagName,
      });
    }

    return entries;
  });
}

async function markPriceEntry(page, entry) {
  return page.evaluate((expected) => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const candidates = Array.from(document.querySelectorAll('a, button, [onclick], [role="button"]'))
      .filter((element) => {
        const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
        return label === expected.normalizedLabel;
      });

    const target = candidates[expected.occurrence] || candidates[0] || null;
    if (!target) return false;
    document.querySelectorAll('[data-consulmax-active-price-entry="true"]')
      .forEach((element) => element.removeAttribute("data-consulmax-active-price-entry"));
    target.setAttribute("data-consulmax-active-price-entry", "true");
    return true;
  }, entry).catch(() => false);
}

async function extractPdfUrlFromPage(page) {
  const values = await page.evaluate(() => {
    const urls = [location.href];
    for (const element of document.querySelectorAll('embed[src], iframe[src], object[data], a[href]')) {
      const value = element.getAttribute("src") || element.getAttribute("data") || element.getAttribute("href");
      if (value) urls.push(value);
    }
    return urls;
  }).catch(() => [page.url()]);

  for (const value of values) {
    const resolved = extractViewerFileUrl(value, page.url());
    if (resolved) return resolved;
  }
  return null;
}

async function downloadEntryPdf(page, context, entry, directory, filename) {
  const listUrl = page.url();
  const directUrl = resolveHttpUrl(entry.href, listUrl);
  if (directUrl) {
    const directPath = await fetchPdfWithContext(context, directUrl, listUrl, directory, filename).catch(() => null);
    if (directPath) return { pdfPath: directPath, sourceUrl: directUrl, method: "direct_request" };
  }

  const marked = await markPriceEntry(page, entry);
  if (!marked) throw new Error(`Não foi possível localizar novamente a tabela: ${entry.label}`);

  const pagesBefore = new Set(context.pages());
  const popupPromise = page.waitForEvent("popup", { timeout: 12000 }).catch(() => null);
  const downloadPromise = page.waitForEvent("download", { timeout: 12000 }).catch(() => null);
  const responsePromise = context.waitForEvent("response", {
    timeout: 12000,
    predicate: (response) => {
      const contentType = String(response.headers()["content-type"] || "").toLowerCase();
      return contentType.includes("application/pdf") || /\.pdf(?:$|[?#])/i.test(response.url());
    },
  }).catch(() => null);

  const target = page.locator('[data-consulmax-active-price-entry="true"]').first();
  await target.scrollIntoViewIfNeeded().catch(() => null);
  await target.click({ force: true, timeout: 20000 });

  const [popupEvent, download, pdfResponse] = await Promise.all([popupPromise, downloadPromise, responsePromise]);
  let popup = popupEvent || context.pages().find((candidate) => !pagesBefore.has(candidate)) || null;
  let pdfPath = null;
  let sourceUrl = null;
  let method = null;

  if (download) {
    const suggested = safeSlug(path.parse(download.suggestedFilename()).name || entry.label);
    const extension = path.extname(download.suggestedFilename()) || ".pdf";
    const downloadPath = path.join(directory, `${suggested}${extension}`);
    await fs.mkdir(directory, { recursive: true });
    await download.saveAs(downloadPath);
    const buffer = await fs.readFile(downloadPath);
    if (isPdfBuffer(buffer)) {
      pdfPath = downloadPath;
      sourceUrl = download.url() || null;
      method = "browser_download";
    } else {
      await fs.rm(downloadPath, { force: true }).catch(() => null);
    }
  }

  if (!pdfPath && pdfResponse) {
    const buffer = await pdfResponse.body().catch(() => null);
    if (isPdfBuffer(buffer)) {
      pdfPath = await savePdfBuffer(buffer, directory, filename);
      sourceUrl = pdfResponse.url();
      method = "network_response";
    }
  }

  if (!pdfPath && popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
    const popupPdfUrl = await extractPdfUrlFromPage(popup);
    if (popupPdfUrl) {
      pdfPath = await fetchPdfWithContext(context, popupPdfUrl, listUrl, directory, filename).catch(() => null);
      if (pdfPath) {
        sourceUrl = popupPdfUrl;
        method = "popup_request";
      }
    }
  }

  if (!pdfPath && page.url() !== listUrl) {
    const samePagePdfUrl = await extractPdfUrlFromPage(page);
    if (samePagePdfUrl) {
      pdfPath = await fetchPdfWithContext(context, samePagePdfUrl, listUrl, directory, filename).catch(() => null);
      if (pdfPath) {
        sourceUrl = samePagePdfUrl;
        method = "same_page_request";
      }
    }
  }

  if (popup) await popup.close().catch(() => null);
  if (page.url() !== listUrl) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(700);
  }

  if (!pdfPath) throw new Error(`O PDF não foi capturado para ${entry.label}.`);
  return { pdfPath, sourceUrl, method };
}

function supabaseConfig() {
  const url = optionalEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
  return url && key ? { url, key } : null;
}

function supabaseHeaders(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function fetchActiveGroups() {
  const config = supabaseConfig();
  if (!config) {
    const configuredGroups = optionalEnv("AREA_RESTRITA_ACTIVE_GROUPS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (configuredGroups.length === 0) {
      throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão disponíveis no Railway.");
    }
    return {
      config: null,
      rows: configuredGroups.map((group) => ({ id: null, grupo: String(Number(group)), segmento: null, config: {} })),
      source: "AREA_RESTRITA_ACTIVE_GROUPS",
    };
  }

  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?select=id,grupo,segmento,config&is_active=eq.true&order=grupo.asc`;
  const response = await fetch(endpoint, {
    headers: supabaseHeaders(config),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Supabase retornou HTTP ${response.status} ao consultar grupos Maggi.`);
  const rows = await response.json();
  return {
    config,
    rows: Array.isArray(rows) ? rows : [],
    source: "sim_maggi_groups",
  };
}

function mergeGroupDocuments(group, documents) {
  const credits = uniqueSortedNumbers(documents.flatMap((document) => document.extraction.credits));
  const embedded = uniqueSortedNumbers(documents.flatMap((document) => document.extraction.embeddedBidRates));
  const rules = [];

  for (const document of documents) {
    for (const rule of buildPlanRules(document.extraction)) {
      const key = `${rule.prazo}|${rule.taxaAdmPct ?? ""}|${rule.fundoReservaPct ?? ""}`;
      if (!rules.some((candidate) => candidate.key === key)) rules.push({ ...rule, key });
    }
  }

  rules.sort((a, b) => a.prazo - b.prazo);
  const maxRule = rules.at(-1) || null;
  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;
  const complete = credits.length > 0 && rules.length > 0 && rules.some((rule) => rule.taxaAdmPct !== null) && rules.some((rule) => rule.fundoReservaPct !== null);

  const currentConfig = group.config && typeof group.config === "object" ? group.config : {};
  const nextConfig = {
    ...currentConfig,
    source: currentConfig.source || SOURCE_NAME,
    detailsSource: SOURCE_NAME,
    detailsSyncedAt: new Date().toISOString(),
    needsDetailsSync: !complete,
    areaRestritaPriceTables: {
      syncedAt: new Date().toISOString(),
      documents: documents.map((document) => ({
        label: document.entry.label,
        group: document.entry.group,
        file: document.pdfPath,
        sourceUrl: document.sourceUrl,
        method: document.method,
        sha256: document.sha256,
        extraction: document.extraction,
      })),
    },
  };

  if (credits.length > 0) {
    nextConfig.creditRanges = credits.map((valor, index) => ({
      id: `area_restrita_${group.grupo}_faixa_${index + 1}`,
      label: `Faixa ${index + 1}`,
      valor,
    }));
  }

  if (rules.length > 0) {
    nextConfig.prazoRules = rules.map((rule, index) => ({
      id: `area_restrita_${group.grupo}_prazo_${index + 1}`,
      prazo: rule.prazo,
      taxaAdmPct: rule.taxaAdmPct,
      fundoReservaPct: rule.fundoReservaPct,
    }));
  }

  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;

  const patch = { config: nextConfig, updated_at: new Date().toISOString() };
  if (credits.length > 0) {
    patch.credito_min = credits.at(0);
    patch.credito_max = credits.at(-1);
  }
  if (maxRule) {
    patch.prazo_original = maxRule.prazo;
    if (maxRule.taxaAdmPct !== null) patch.taxa_adm_pct = maxRule.taxaAdmPct;
    if (maxRule.fundoReservaPct !== null) patch.fundo_reserva_pct = maxRule.fundoReservaPct;
  }
  if (lanceEmbutidoMaxPct !== null) {
    patch.permite_lance_embutido = lanceEmbutidoMaxPct > 0;
    patch.lance_embutido_max_pct = lanceEmbutidoMaxPct;
  }

  return {
    patch,
    summary: {
      group: group.grupo,
      documents: documents.length,
      credits: credits.length,
      creditMin: credits.at(0) ?? null,
      creditMax: credits.at(-1) ?? null,
      prazoMax: maxRule?.prazo ?? null,
      taxaAdmPct: maxRule?.taxaAdmPct ?? null,
      fundoReservaPct: maxRule?.fundoReservaPct ?? null,
      lanceEmbutidoMaxPct,
      complete,
    },
  };
}

async function updateGroup(config, group, patch) {
  if (!config || !group.id) return { updated: false, reason: "supabase_write_unavailable" };
  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?id=eq.${encodeURIComponent(group.id)}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: supabaseHeaders(config, { Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao atualizar o grupo ${group.grupo}: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  return { updated: true };
}

export async function syncActivePriceTables({ page, context, onProgress = async () => {} }) {
  const startedAt = new Date().toISOString();
  const active = await fetchActiveGroups();
  const activeMap = new Map(active.rows.map((row) => [String(Number(row.grupo)), row]));
  const entries = await discoverPriceEntries(page);
  const selectedEntries = entries.filter((entry) => activeMap.has(entry.group));
  const ignoredEntries = entries.filter((entry) => !activeMap.has(entry.group));
  const dateFolder = new Date().toISOString().slice(0, 10);
  const runDirectory = path.join(DOWNLOAD_ROOT, dateFolder);
  await fs.mkdir(runDirectory, { recursive: true });

  const manifest = {
    startedAt,
    activeGroupsSource: active.source,
    activeGroups: [...activeMap.keys()],
    portalEntries: entries,
    selectedEntries,
    ignoredEntries,
    groups: {},
  };

  await onProgress({
    state: "price_tables_syncing",
    message: `${selectedEntries.length} tabela(s) de grupos ativos foram localizada(s).`,
    details: {
      activeGroups: manifest.activeGroups,
      selected: selectedEntries.map((entry) => entry.label),
      ignored: ignoredEntries.map((entry) => entry.label),
    },
  });

  const documentsByGroup = new Map();
  for (let index = 0; index < selectedEntries.length; index += 1) {
    const entry = selectedEntries[index];
    const groupDirectory = path.join(runDirectory, entry.group);
    const filename = `${entry.group}-${safeSlug(entry.label)}-${entry.occurrence + 1}.pdf`;

    await onProgress({
      state: "price_tables_syncing",
      message: `Baixando e lendo ${entry.label} (${index + 1}/${selectedEntries.length}).`,
      details: { currentGroup: entry.group, currentTable: entry.label, position: index + 1, total: selectedEntries.length },
    });

    try {
      const download = await downloadEntryPdf(page, context, entry, groupDirectory, filename);
      const text = await pdfToText(download.pdfPath);
      const extraction = parsePriceTableText(text);
      const buffer = await fs.readFile(download.pdfPath);
      const document = {
        entry,
        ...download,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        extraction,
      };
      const current = documentsByGroup.get(entry.group) || [];
      current.push(document);
      documentsByGroup.set(entry.group, current);
    } catch (error) {
      const current = manifest.groups[entry.group] || { documents: [], errors: [] };
      current.errors.push({ label: entry.label, error: String(error?.message || error) });
      manifest.groups[entry.group] = current;
    }
  }

  const groupSummaries = [];
  for (const [groupNumber, group] of activeMap.entries()) {
    const documents = documentsByGroup.get(groupNumber) || [];
    const current = manifest.groups[groupNumber] || { documents: [], errors: [] };
    current.documents = documents.map((document) => ({
      label: document.entry.label,
      pdfPath: document.pdfPath,
      sourceUrl: document.sourceUrl,
      method: document.method,
      sha256: document.sha256,
      extraction: document.extraction,
    }));

    if (documents.length === 0) {
      current.updated = false;
      current.reason = "active_group_without_matching_pdf";
      manifest.groups[groupNumber] = current;
      groupSummaries.push({ group: groupNumber, updated: false, reason: current.reason });
      continue;
    }

    try {
      const merged = mergeGroupDocuments(group, documents);
      const updateResult = await updateGroup(active.config, group, merged.patch);
      current.updated = updateResult.updated;
      current.updateReason = updateResult.reason || null;
      current.summary = merged.summary;
      groupSummaries.push({ ...merged.summary, updated: updateResult.updated, updateReason: updateResult.reason || null });
    } catch (error) {
      current.updated = false;
      current.errors.push({ error: String(error?.message || error) });
      groupSummaries.push({ group: groupNumber, updated: false, error: String(error?.message || error) });
    }
    manifest.groups[groupNumber] = current;
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.summary = {
    activeGroups: activeMap.size,
    portalEntries: entries.length,
    selectedEntries: selectedEntries.length,
    ignoredEntries: ignoredEntries.length,
    groupsWithPdf: documentsByGroup.size,
    updatedGroups: groupSummaries.filter((item) => item.updated).length,
  };
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  return {
    ok: true,
    manifestFile: MANIFEST_FILE,
    summary: manifest.summary,
    groups: groupSummaries,
    ignoredTables: ignoredEntries.map((entry) => entry.label),
  };
}
