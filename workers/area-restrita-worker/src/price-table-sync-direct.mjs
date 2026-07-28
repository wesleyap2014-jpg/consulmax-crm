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

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeSlug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "tabela";
}

function uniqueNumbers(values) {
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

function parsePercent(raw) {
  const parsed = parseBrazilianNumber(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Number((parsed / 100).toFixed(6));
}

function collect(text, regexes, mapper) {
  const values = [];
  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = mapper(match[1]);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return uniqueNumbers(values);
}

function moneyValues(line) {
  const values = [];
  const regex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,}(?:,\d{2})?)/gi;
  let match;
  while ((match = regex.exec(String(line || ""))) !== null) {
    const value = parseBrazilianNumber(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function extractCredits(text) {
  const lines = String(text || "").split(/\r?\n/);
  const values = [];
  const codePattern = /\b[A-Z]{2,6}\s*[-.]?\s*\d{1,3}\b/i;

  for (const line of lines) {
    const amounts = moneyValues(line).filter((value) => value >= 20000 && value <= 100000000);
    if (amounts.length === 0) continue;
    if (codePattern.test(line)) values.push(amounts[0]);
  }

  if (values.length < 2) {
    const header = lines.findIndex((line) => /cr[eé]dito/i.test(line));
    if (header >= 0) {
      for (const line of lines.slice(header + 1, header + 150)) {
        const amounts = moneyValues(line).filter((value) => value >= 20000 && value <= 100000000);
        if (amounts.length >= 2 || codePattern.test(line)) values.push(amounts[0]);
      }
    }
  }

  return uniqueNumbers(values).slice(0, 250);
}

function parseTableText(text) {
  const plain = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const credits = extractCredits(text);
  const planTerms = collect(plain, [
    /prazo\s+max(?:imo)?\s*[:\-]?\s*(\d{2,3})\s*(?:meses|parcelas)?/gi,
    /prazo\s+(?:do\s+)?plano\s*[:\-]?\s*(\d{2,3})\s*(?:meses|parcelas)?/gi,
    /plano\s+(?:de\s+)?(\d{2,3})\s*(?:meses|parcelas)/gi,
    /(\d{2,3})\s*parcelas[^\n]{0,60}prazo\s+(?:do\s+)?plano/gi,
  ], Number).filter((value) => value >= 12 && value <= 600);
  const adminRates = collect(plain, [
    /taxa\s+(?:de\s+)?administracao[^\d%]{0,100}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /administracao\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercent);
  const reserveRates = collect(plain, [
    /fundo\s+(?:de\s+)?reserva[^\d%]{0,100}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /reserva\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercent);
  const embeddedBidRates = collect(plain, [
    /lance\s+embutido[^\d%]{0,140}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
    /embutido[^\d%]{0,100}(\d{1,3}(?:[.,]\d+)?)\s*%/gi,
  ], parsePercent);

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

function resolveUrl(candidate, baseUrl) {
  const value = String(candidate || "").trim().replace(/&amp;/gi, "&");
  if (!value || value === "#" || /^javascript:/i.test(value) || /^blob:/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/i.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function onclickUrls(onclick, baseUrl) {
  const source = String(onclick || "");
  const values = [];
  const functionMatch = source.match(/funDocumento\s*\(\s*['"]([^'"]+)['"]/i);
  if (functionMatch?.[1]) values.push(functionMatch[1]);

  const quoted = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = quoted.exec(source)) !== null) {
    if (/documento|\.pdf|arquivo|download/i.test(match[1])) values.push(match[1]);
  }

  return [...new Set(values.map((value) => resolveUrl(value, baseUrl)).filter(Boolean))];
}

function urlsFromHtml(html, baseUrl) {
  const values = [];
  const source = String(html || "").replace(/&amp;/gi, "&");
  const quoted = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = quoted.exec(source)) !== null) {
    if (/\.pdf(?:$|[?#])|documento|arquivo|download/i.test(match[1])) values.push(match[1]);
  }
  return [...new Set(values.map((value) => resolveUrl(value, baseUrl)).filter(Boolean))];
}

function isPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function savePdf(buffer, directory, filename) {
  if (!isPdf(buffer)) throw new Error("A resposta não é um PDF válido.");
  await fs.mkdir(directory, { recursive: true });
  const output = path.join(directory, filename);
  await fs.writeFile(output, buffer);
  return output;
}

async function requestPdf(context, initialUrl, referer, directory, filename) {
  const queue = [initialUrl];
  const visited = new Set();

  while (queue.length > 0 && visited.size < 12) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const response = await context.request.get(url, {
      timeout: 45000,
      headers: referer ? { Referer: referer } : undefined,
    }).catch(() => null);
    if (!response || !response.ok()) continue;

    const buffer = await response.body().catch(() => null);
    if (buffer && isPdf(buffer)) {
      return {
        pdfPath: await savePdf(buffer, directory, filename),
        sourceUrl: response.url() || url,
        method: visited.size === 1 ? "onclick_direct_request" : "onclick_followup_request",
      };
    }

    const contentType = String(response.headers()["content-type"] || "").toLowerCase();
    if (buffer && (contentType.includes("text/html") || contentType.includes("javascript") || buffer.length < 3_000_000)) {
      const html = buffer.toString("utf8");
      for (const candidate of urlsFromHtml(html, response.url() || url)) {
        if (!visited.has(candidate)) queue.push(candidate);
      }
    }
  }

  return null;
}

async function ensurePriceList(page, listUrl) {
  if (!/\/NewDocumentos\/DocumentoLista\.asp/i.test(String(page.url() || ""))) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  await page.evaluate(() => {
    if (typeof window.slideonlyone === "function") window.slideonlyone("4");
  }).catch(() => null);
  await page.waitForTimeout(500);
}

async function discoverEntries(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const seen = new Map();
    const entries = [];

    for (const element of document.querySelectorAll('a[onclick], a, button, [role="button"]')) {
      const label = String(element.innerText || element.textContent || element.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      const normalizedLabel = normalize(label);
      if (!normalizedLabel.includes("tabela") || !normalizedLabel.includes("grupo")) continue;
      const groupMatch = normalizedLabel.match(/\bgrupo\s*0*(\d{3,5})\b/i);
      if (!groupMatch) continue;
      const group = String(Number(groupMatch[1]));
      const signature = `${group}|${normalizedLabel}`;
      const occurrence = seen.get(signature) || 0;
      seen.set(signature, occurrence + 1);
      entries.push({
        group,
        label,
        normalizedLabel,
        occurrence,
        href: element.getAttribute("href"),
        onclick: element.getAttribute("onclick"),
      });
    }
    return entries;
  });
}

async function fallbackClickDownload(page, context, entry, listUrl, directory, filename) {
  await ensurePriceList(page, listUrl);
  const marked = await page.evaluate((expected) => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const candidates = Array.from(document.querySelectorAll('a[onclick], a, button, [role="button"]'))
      .filter((element) => normalize(element.innerText || element.textContent || element.getAttribute("title") || "") === expected.normalizedLabel);
    const target = candidates[expected.occurrence] || candidates[0];
    if (!target) return false;
    target.setAttribute("data-consulmax-pdf-entry", "true");
    return true;
  }, entry).catch(() => false);
  if (!marked) return null;

  const pagesBefore = new Set(context.pages());
  const popupPromise = page.waitForEvent("popup", { timeout: 12000 }).catch(() => null);
  const responsePromise = context.waitForEvent("response", {
    timeout: 12000,
    predicate: (response) => String(response.headers()["content-type"] || "").toLowerCase().includes("application/pdf") || /\.pdf(?:$|[?#])/i.test(response.url()),
  }).catch(() => null);

  await page.locator('[data-consulmax-pdf-entry="true"]').first().click({ force: true, timeout: 20000 });
  const [popupEvent, pdfResponse] = await Promise.all([popupPromise, responsePromise]);
  const popup = popupEvent || context.pages().find((candidate) => !pagesBefore.has(candidate)) || null;
  let result = null;

  if (pdfResponse) {
    const buffer = await pdfResponse.body().catch(() => null);
    if (buffer && isPdf(buffer)) {
      result = {
        pdfPath: await savePdf(buffer, directory, filename),
        sourceUrl: pdfResponse.url(),
        method: "browser_network_fallback",
      };
    }
  }

  if (!result && popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
    const candidates = await popup.evaluate(() => {
      const values = [location.href];
      for (const element of document.querySelectorAll('embed[src], iframe[src], object[data], a[href]')) {
        values.push(element.getAttribute("src") || element.getAttribute("data") || element.getAttribute("href"));
      }
      return values.filter(Boolean);
    }).catch(() => []);
    for (const candidate of candidates) {
      const url = resolveUrl(candidate, popup.url());
      if (!url) continue;
      result = await requestPdf(context, url, listUrl, directory, filename);
      if (result) break;
    }
  }

  if (popup && popup !== page) await popup.close().catch(() => null);
  await ensurePriceList(page, listUrl).catch(() => null);
  return result;
}

async function downloadEntry(page, context, entry, listUrl, directory, filename) {
  const candidates = [
    resolveUrl(entry.href, listUrl),
    ...onclickUrls(entry.onclick, listUrl),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const direct = await requestPdf(context, candidate, listUrl, directory, filename);
    if (direct) return direct;
  }

  const fallback = await fallbackClickDownload(page, context, entry, listUrl, directory, filename);
  if (fallback) return fallback;
  throw new Error(`O PDF não foi capturado para ${entry.label}.`);
}

async function pdfToText(pdfPath) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
    maxBuffer: 30 * 1024 * 1024,
  });
  return String(stdout || "");
}

function supabaseConfig() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
  return url && key ? { url, key } : null;
}

function headers(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function activeGroups() {
  const config = supabaseConfig();
  if (!config) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão disponíveis no Railway.");
  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?select=id,grupo,segmento,config&is_active=eq.true&order=grupo.asc`;
  const response = await fetch(endpoint, { headers: headers(config), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Supabase retornou HTTP ${response.status} ao consultar grupos Maggi.`);
  const rows = await response.json();
  return { config, rows: Array.isArray(rows) ? rows : [] };
}

function mergeDocuments(group, documents) {
  const credits = uniqueNumbers(documents.flatMap((document) => document.extraction.credits));
  const terms = uniqueNumbers(documents.flatMap((document) => document.extraction.planTerms));
  const admin = uniqueNumbers(documents.flatMap((document) => document.extraction.adminRates));
  const reserve = uniqueNumbers(documents.flatMap((document) => document.extraction.reserveRates));
  const embedded = uniqueNumbers(documents.flatMap((document) => document.extraction.embeddedBidRates));
  const prazoMax = terms.length ? Math.max(...terms) : null;
  const taxaAdmPct = admin.at(-1) ?? null;
  const fundoReservaPct = reserve.at(-1) ?? null;
  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;
  const complete = credits.length >= 2 && prazoMax !== null && taxaAdmPct !== null && fundoReservaPct !== null;
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

  if (credits.length >= 2) {
    nextConfig.creditRanges = credits.map((valor, index) => ({
      id: `area_restrita_${group.grupo}_faixa_${index + 1}`,
      label: `Faixa ${index + 1}`,
      valor,
    }));
  }
  if (prazoMax !== null) {
    nextConfig.prazoRules = [{
      id: `area_restrita_${group.grupo}_prazo_max`,
      prazo: prazoMax,
      taxaAdmPct,
      fundoReservaPct,
    }];
  }
  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;

  const patch = { config: nextConfig, updated_at: new Date().toISOString() };
  if (credits.length >= 2) {
    patch.credito_min = credits.at(0);
    patch.credito_max = credits.at(-1);
  }
  if (prazoMax !== null) patch.prazo_original = prazoMax;
  if (taxaAdmPct !== null) patch.taxa_adm_pct = taxaAdmPct;
  if (fundoReservaPct !== null) patch.fundo_reserva_pct = fundoReservaPct;
  if (lanceEmbutidoMaxPct !== null) {
    patch.permite_lance_embutido = lanceEmbutidoMaxPct > 0;
    patch.lance_embutido_max_pct = lanceEmbutidoMaxPct;
  }

  return {
    patch,
    summary: {
      group: String(group.grupo),
      documents: documents.length,
      credits: credits.length,
      creditMin: credits.at(0) ?? null,
      creditMax: credits.at(-1) ?? null,
      prazoMax,
      taxaAdmPct,
      fundoReservaPct,
      lanceEmbutidoMaxPct,
      complete,
    },
  };
}

async function updateGroup(config, group, patch) {
  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?id=eq.${encodeURIComponent(group.id)}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: headers(config, { Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao atualizar o grupo ${group.grupo}: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
}

export async function syncActivePriceTablesDirect({ page, context, onProgress = async () => {} }) {
  const startedAt = new Date().toISOString();
  const listUrl = new URL("/NewDocumentos/DocumentoLista.asp", page.url()).href;
  await ensurePriceList(page, listUrl);
  const active = await activeGroups();
  const activeMap = new Map(active.rows.map((row) => [String(Number(row.grupo)), row]));
  const entries = await discoverEntries(page);
  const selected = entries.filter((entry) => activeMap.has(entry.group));
  const ignored = entries.filter((entry) => !activeMap.has(entry.group));
  const runDirectory = path.join(DOWNLOAD_ROOT, new Date().toISOString().slice(0, 10));
  await fs.mkdir(runDirectory, { recursive: true });

  const manifest = {
    startedAt,
    activeGroups: [...activeMap.keys()],
    portalEntries: entries,
    selectedEntries: selected,
    ignoredEntries: ignored,
    groups: {},
  };

  await onProgress({
    state: "price_tables_syncing",
    message: `${selected.length} tabela(s) de grupos ativos foram localizada(s).`,
    details: { activeGroups: manifest.activeGroups, selected: selected.map((entry) => entry.label), ignored: ignored.map((entry) => entry.label) },
  });

  const byGroup = new Map();
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    const directory = path.join(runDirectory, entry.group);
    const filename = `${entry.group}-${safeSlug(entry.label)}-${entry.occurrence + 1}.pdf`;
    await onProgress({
      state: "price_tables_syncing",
      message: `Baixando e lendo ${entry.label} (${index + 1}/${selected.length}).`,
      details: { currentGroup: entry.group, currentTable: entry.label, position: index + 1, total: selected.length },
    });

    try {
      await ensurePriceList(page, listUrl);
      const download = await downloadEntry(page, context, entry, listUrl, directory, filename);
      const text = await pdfToText(download.pdfPath);
      const extraction = parseTableText(text);
      const buffer = await fs.readFile(download.pdfPath);
      const document = {
        entry,
        ...download,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        extraction,
      };
      const current = byGroup.get(entry.group) || [];
      current.push(document);
      byGroup.set(entry.group, current);
    } catch (error) {
      const current = manifest.groups[entry.group] || { documents: [], errors: [] };
      current.errors.push({ label: entry.label, error: String(error?.message || error) });
      manifest.groups[entry.group] = current;
    }
  }

  const summaries = [];
  for (const [groupNumber, group] of activeMap.entries()) {
    const documents = byGroup.get(groupNumber) || [];
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
      summaries.push({ group: groupNumber, updated: false, reason: current.reason });
      manifest.groups[groupNumber] = current;
      continue;
    }

    try {
      const merged = mergeDocuments(group, documents);
      await updateGroup(active.config, group, merged.patch);
      current.updated = true;
      current.summary = merged.summary;
      summaries.push({ ...merged.summary, updated: true });
    } catch (error) {
      current.updated = false;
      current.errors.push({ error: String(error?.message || error) });
      summaries.push({ group: groupNumber, updated: false, error: String(error?.message || error) });
    }
    manifest.groups[groupNumber] = current;
  }

  await ensurePriceList(page, listUrl).catch(() => null);
  manifest.finishedAt = new Date().toISOString();
  manifest.summary = {
    activeGroups: activeMap.size,
    portalEntries: entries.length,
    selectedEntries: selected.length,
    ignoredEntries: ignored.length,
    groupsWithPdf: byGroup.size,
    updatedGroups: summaries.filter((item) => item.updated).length,
  };
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  return {
    ok: true,
    manifestFile: MANIFEST_FILE,
    summary: manifest.summary,
    groups: summaries,
    ignoredTables: ignored.map((entry) => entry.label),
  };
}
