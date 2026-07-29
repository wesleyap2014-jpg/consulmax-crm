import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PRICE_MANIFEST_FILE = path.join(DATA_DIR, "area-restrita-price-tables.json");
const ASSEMBLY_MANIFEST_FILE = path.join(DATA_DIR, "area-restrita-assemblies.json");
const PORTAL_URL = String(process.env.AREA_RESTRITA_PORTAL_URL || "").trim();
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const HOME_URL = new URL("/NewHome/HomePrincipal.asp", PORTAL_URL).href;
const SOURCE_NAME = "area-restrita-assembly-worker";

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

export function canonicalGroupNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized.length === 3 ? normalized.padStart(4, "0") : normalized;
}

function parseConfig(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function percentPoints(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number((parsed <= 1 ? parsed * 100 : parsed).toFixed(6));
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(Number.isFinite).map((value) => Number(value.toFixed(6))))]
    .sort((a, b) => a - b);
}

export function fixedBidPercentages(groupRow) {
  const config = parseConfig(groupRow?.config);
  const values = [];
  const add = (value) => {
    const pct = percentPoints(value);
    if (pct !== null) values.push(pct);
  };

  add(groupRow?.lance_fixo_pct);

  for (const option of Array.isArray(config.lanceOptions) ? config.lanceOptions : []) {
    const descriptor = normalize(`${option?.key || ""} ${option?.tipo || ""} ${option?.nome || ""} ${option?.nomeComercial || ""}`);
    if (option?.enabled === false || !descriptor.includes("fixo")) continue;
    add(option?.pct ?? option?.percentual);
  }

  const aiLances = config?.aiDocumentAnalysis?.result?.lancesPermitidos;
  for (const lance of Array.isArray(aiLances) ? aiLances : []) {
    if (normalize(lance?.tipo) !== "fixo" && !normalize(lance?.nome).includes("fixo")) continue;
    add(lance?.percentual ?? lance?.pct);
  }

  return uniqueNumbers(values);
}

function parseBrazilianPercent(value) {
  const cleaned = String(value || "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals = 4) {
  return Number(Number(value).toFixed(decimals));
}

export function calculateAssemblyStats(rows, fixedPercentages, tolerance = 0.05) {
  const fixed = uniqueNumbers((fixedPercentages || []).map(Number).filter(Number.isFinite));
  const contemplated = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      cota: String(row?.cota || "").trim(),
      tipo: String(row?.tipo || "").trim(),
      lancePct: parseBrazilianPercent(row?.lancePct),
      data: String(row?.data || "").trim(),
    }))
    .filter((row) => row.lancePct !== null && row.lancePct > 0 && !normalize(row.tipo).includes("sorteio"));

  const fixedRows = contemplated.filter((row) => fixed.some((pct) => Math.abs(row.lancePct - pct) <= tolerance));
  const freeRows = contemplated.filter((row) => !fixed.some((pct) => Math.abs(row.lancePct - pct) <= tolerance));
  const sorted = freeRows.map((row) => row.lancePct).sort((a, b) => a - b);

  if (!sorted.length) {
    return {
      menorPct: null,
      medianaPct: null,
      maiorPct: null,
      quantidadeLancesLivres: 0,
      quantidadeContemplados: contemplated.length,
      quantidadeFixosDescartados: fixedRows.length,
      lancesFixosConfigurados: fixed,
      lancesFixosDescartados: fixedRows,
      lancesLivres: [],
    };
  }

  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;

  return {
    menorPct: round(sorted[0]),
    medianaPct: round(median),
    maiorPct: round(sorted.at(-1)),
    quantidadeLancesLivres: freeRows.length,
    quantidadeContemplados: contemplated.length,
    quantidadeFixosDescartados: fixedRows.length,
    lancesFixosConfigurados: fixed,
    lancesFixosDescartados: fixedRows,
    lancesLivres: freeRows.map((row) => ({ ...row, lancePct: round(row.lancePct) })),
  };
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
  const columns = "id,grupo,segmento,lance_fixo_pct,permite_lance_fixo,config,is_active";
  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?select=${columns}&is_active=eq.true&order=grupo.asc`;
  const response = await fetch(endpoint, { headers: headers(config), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Supabase retornou HTTP ${response.status} ao consultar grupos Maggi.`);
  const rows = await response.json();
  return { config, rows: Array.isArray(rows) ? rows : [] };
}

async function updateGroup(config, group, nextConfig) {
  const endpoint = `${config.url}/rest/v1/sim_maggi_groups?id=eq.${encodeURIComponent(group.id)}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: headers(config, { Prefer: "return=minimal" }),
    body: JSON.stringify({ config: nextConfig, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao atualizar assembleia do grupo ${group.grupo}: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
}

function portalSegment(segmento) {
  const value = normalize(segmento);
  if (/auto|veiculo|carro|moto|pesado|caminhao/.test(value)) return "automovel";
  if (/imovel|residencial|construcao|reforma/.test(value)) return "imovel";
  return null;
}

async function frameHasAssemblyForm(frame) {
  return frame.evaluate(() => {
    const normalizeText = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const text = normalizeText(document.body?.innerText || "");
    const visibleSelects = Array.from(document.querySelectorAll("select")).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    return text.includes("resultado de assembleias") && visibleSelects.length >= 3;
  }).catch(() => false);
}

async function findAssemblyFrame(page) {
  for (const frame of page.frames()) {
    if (await frameHasAssemblyForm(frame)) return frame;
  }
  return null;
}

async function clickAssemblyMenu(page) {
  for (const frame of page.frames()) {
    const marked = await frame.evaluate(() => {
      const normalizeText = (value) => String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      for (const element of document.querySelectorAll("a, button, [onclick], [role='button']")) {
        const label = normalizeText(element.innerText || element.textContent || element.getAttribute("title") || "");
        if (label !== "resultado de assembleias") continue;
        element.setAttribute("data-consulmax-assembly-menu", "true");
        return true;
      }
      return false;
    }).catch(() => false);
    if (!marked) continue;
    await frame.locator("[data-consulmax-assembly-menu='true']").first().click({ force: true, timeout: 15000 }).catch(() => null);
    return true;
  }
  return false;
}

async function openAssemblyForm(page) {
  if (!String(page.url() || "").startsWith(PORTAL_ORIGIN)) {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } else {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  }
  await page.waitForTimeout(700);

  let formFrame = await findAssemblyFrame(page);
  if (formFrame) return formFrame;
  const clicked = await clickAssemblyMenu(page);
  if (!clicked) throw new Error("O menu Resultado de Assembleias não foi localizado.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(500);
    formFrame = await findAssemblyFrame(page);
    if (formFrame) return formFrame;
  }
  throw new Error("O formulário Resultado de Assembleias não foi carregado.");
}

async function visibleSelects(frame) {
  return frame.locator("select:visible");
}

async function selectMatching(select, predicate, description) {
  const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    value: node.value,
    label: String(node.textContent || "").replace(/\s+/g, " ").trim(),
  })));
  const found = options.find((option) => predicate(option));
  if (!found) throw new Error(`${description} não foi encontrado no portal.`);
  await select.selectOption({ value: found.value });
  return found;
}

async function waitForOptions(select, minimum = 2, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = await select.locator("option").count().catch(() => 0);
    if (count >= minimum) return count;
    await select.page().waitForTimeout(300);
  }
  return select.locator("option").count().catch(() => 0);
}

function parseReference(label) {
  const match = String(label || "").match(/\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/);
  if (!match) return null;
  return { month: Number(match[1]), year: Number(match[2]), key: Number(match[2]) * 100 + Number(match[1]) };
}

async function configureSearch(frame, groupRow) {
  const selects = await visibleSelects(frame);
  const count = await selects.count();
  if (count < 3) throw new Error("O formulário de assembleias não possui os três seletores esperados.");
  const segmentSelect = selects.nth(0);
  const groupSelect = selects.nth(1);
  const dateSelect = selects.nth(2);
  const expectedSegment = portalSegment(groupRow.segmento);
  if (!expectedSegment) throw new Error(`Segmento não reconhecido para o grupo ${groupRow.grupo}: ${groupRow.segmento || "vazio"}.`);

  await selectMatching(
    segmentSelect,
    (option) => normalize(option.label).includes(expectedSegment),
    `O segmento ${groupRow.segmento}`,
  );
  await waitForOptions(groupSelect, 2);

  const expectedGroup = canonicalGroupNumber(groupRow.grupo);
  await selectMatching(
    groupSelect,
    (option) => canonicalGroupNumber(option.label || option.value) === expectedGroup,
    `O grupo ${expectedGroup}`,
  );
  await waitForOptions(dateSelect, 2);

  const dateOptions = await dateSelect.locator("option").evaluateAll((nodes) => nodes.map((node) => ({
    value: node.value,
    label: String(node.textContent || "").replace(/\s+/g, " ").trim(),
  })));
  const dated = dateOptions
    .map((option) => ({ ...option, parsed: parseReference(option.label) }))
    .filter((option) => option.parsed)
    .sort((a, b) => b.parsed.key - a.parsed.key);
  const latest = dated[0];
  if (!latest) throw new Error(`Nenhuma data de assembleia foi encontrada para o grupo ${expectedGroup}.`);
  await dateSelect.selectOption({ value: latest.value });
  return { reference: latest.label, referenceKey: latest.parsed.key };
}

async function clickSearch(frame) {
  const marked = await frame.evaluate(() => {
    const normalizeText = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    for (const element of document.querySelectorAll("button, input[type='submit'], input[type='button'], a")) {
      const label = normalizeText(element.innerText || element.textContent || element.value || "");
      if (label !== "pesquisar") continue;
      element.setAttribute("data-consulmax-assembly-search", "true");
      return true;
    }
    return false;
  }).catch(() => false);
  if (!marked) throw new Error("O botão Pesquisar não foi localizado.");
  await frame.locator("[data-consulmax-assembly-search='true']").first().click({ force: true, timeout: 15000 });
}

async function readResultTable(page, expectedGroup) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const frame of page.frames()) {
      const result = await frame.evaluate(() => {
        const normalizeText = (value) => String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        for (const table of document.querySelectorAll("table")) {
          const rows = Array.from(table.querySelectorAll("tr"));
          let headerIndex = -1;
          let indexes = null;
          for (let index = 0; index < rows.length; index += 1) {
            const labels = Array.from(rows[index].querySelectorAll("th,td")).map((cell) => normalizeText(cell.textContent || ""));
            const typeIndex = labels.findIndex((label) => label.includes("tipo de contemplacao"));
            const bidIndex = labels.findIndex((label) => label.includes("lance"));
            const quotaIndex = labels.findIndex((label) => label === "cota" || label.includes("cota"));
            const dateIndex = labels.findIndex((label) => label === "data" || label.includes("data"));
            if (typeIndex >= 0 && bidIndex >= 0) {
              headerIndex = index;
              indexes = { typeIndex, bidIndex, quotaIndex, dateIndex };
              break;
            }
          }
          if (headerIndex < 0 || !indexes) continue;
          const data = [];
          for (const row of rows.slice(headerIndex + 1)) {
            const cells = Array.from(row.querySelectorAll("td")).map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim());
            if (cells.length <= Math.max(indexes.typeIndex, indexes.bidIndex)) continue;
            data.push({
              cota: indexes.quotaIndex >= 0 ? cells[indexes.quotaIndex] : "",
              tipo: cells[indexes.typeIndex],
              lancePct: cells[indexes.bidIndex],
              data: indexes.dateIndex >= 0 ? cells[indexes.dateIndex] : "",
            });
          }
          if (data.length) {
            const bodyText = String(document.body?.innerText || "");
            const groupMatch = bodyText.match(/Grupo\s*:\s*0*(\d{3,5})/i);
            return { rows: data, group: groupMatch?.[1] || null };
          }
        }
        return null;
      }).catch(() => null);
      if (result?.rows?.length) {
        const returnedGroup = canonicalGroupNumber(result.group || expectedGroup);
        if (returnedGroup && returnedGroup !== canonicalGroupNumber(expectedGroup)) continue;
        return result.rows;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`A tabela de resultados da assembleia do grupo ${expectedGroup} não foi localizada.`);
}

function isoDateFromBrazilian(value) {
  const match = String(value || "").match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function markAssemblyPending() {
  const manifest = await readJson(PRICE_MANIFEST_FILE, {});
  const next = {
    ...manifest,
    finishedAt: null,
    assemblyStartedAt: new Date().toISOString(),
    summary: {
      ...(manifest?.summary && typeof manifest.summary === "object" ? manifest.summary : {}),
      assemblyPending: true,
    },
  };
  await writeJson(PRICE_MANIFEST_FILE, next);
}

async function finalizeManifest(summary, groups, errors) {
  const finishedAt = new Date().toISOString();
  const assemblyManifest = { finishedAt, summary, groups, errors };
  await writeJson(ASSEMBLY_MANIFEST_FILE, assemblyManifest);
  const manifest = await readJson(PRICE_MANIFEST_FILE, {});
  await writeJson(PRICE_MANIFEST_FILE, {
    ...manifest,
    finishedAt,
    assemblyFinishedAt: finishedAt,
    assemblyResults: assemblyManifest,
    summary: {
      ...(manifest?.summary && typeof manifest.summary === "object" ? manifest.summary : {}),
      assemblyPending: false,
      assemblyGroupsUpdated: summary.updatedGroups,
      assemblyGroupsWithErrors: summary.errors,
    },
  });
}

export async function syncLatestAssemblyResults({ page, onProgress = async () => {} }) {
  await markAssemblyPending();
  const startedAt = new Date().toISOString();
  const active = await activeGroups();
  const eligible = active.rows.filter((row) => portalSegment(row.segmento));
  const summaries = [];
  const errors = [];

  await onProgress({
    state: "assembly_results_syncing",
    message: `${eligible.length} grupo(s) serão consultados no Resultado de Assembleias.`,
    details: { assemblyPosition: 0, assemblyTotal: eligible.length, running: true },
  });

  for (let index = 0; index < eligible.length; index += 1) {
    const group = eligible[index];
    const groupNumber = canonicalGroupNumber(group.grupo);
    await onProgress({
      state: "assembly_results_syncing",
      message: `Consultando a assembleia mais recente do grupo ${groupNumber} (${index + 1}/${eligible.length}).`,
      details: {
        currentAssemblyGroup: groupNumber,
        assemblyPosition: index + 1,
        assemblyTotal: eligible.length,
        running: true,
      },
    });

    try {
      const formFrame = await openAssemblyForm(page);
      const selection = await configureSearch(formFrame, group);
      await clickSearch(formFrame);
      const rows = await readResultTable(page, groupNumber);
      const fixedPercentages = fixedBidPercentages(group);
      const stats = calculateAssemblyStats(rows, fixedPercentages);
      if (!stats.quantidadeLancesLivres) {
        throw new Error(`Nenhum lance livre permaneceu após descartar os fixos ${fixedPercentages.join("%, ") || "configurados"}.`);
      }

      const assemblyDate = stats.lancesLivres.map((row) => row.data).find(Boolean)
        || rows.map((row) => String(row?.data || "").trim()).find(Boolean)
        || null;
      const currentConfig = parseConfig(group.config);
      const assemblyResult = {
        grupo: groupNumber,
        segmento: group.segmento || null,
        referencia: selection.reference,
        dataAssembleia: isoDateFromBrazilian(assemblyDate),
        dataAssembleiaExibida: assemblyDate,
        menorPct: stats.menorPct,
        medianaPct: stats.medianaPct,
        maiorPct: stats.maiorPct,
        quantidadeLancesLivres: stats.quantidadeLancesLivres,
        quantidadeContemplados: stats.quantidadeContemplados,
        quantidadeFixosDescartados: stats.quantidadeFixosDescartados,
        lancesFixosDescartados: stats.lancesFixosConfigurados,
        lancesLivres: stats.lancesLivres,
        source: SOURCE_NAME,
        syncedAt: new Date().toISOString(),
      };
      const history = Array.isArray(currentConfig.assemblyHistory) ? currentConfig.assemblyHistory : [];
      const nextHistory = [
        assemblyResult,
        ...history.filter((item) => !(item?.referencia === assemblyResult.referencia && item?.dataAssembleia === assemblyResult.dataAssembleia)),
      ].slice(0, 12);
      const nextConfig = {
        ...currentConfig,
        assemblyResult,
        resultadoAssembleia: assemblyResult,
        assemblyHistory: nextHistory,
        assemblySyncedAt: assemblyResult.syncedAt,
        assemblySyncError: null,
      };
      await updateGroup(active.config, group, nextConfig);
      summaries.push({ group: groupNumber, updated: true, ...assemblyResult });
    } catch (error) {
      const message = String(error?.message || error);
      errors.push({ group: groupNumber, error: message });
      const currentConfig = parseConfig(group.config);
      await updateGroup(active.config, group, {
        ...currentConfig,
        assemblyLastAttemptAt: new Date().toISOString(),
        assemblySyncError: message,
      }).catch(() => null);
      summaries.push({ group: groupNumber, updated: false, error: message });
    }
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalGroups: eligible.length,
    updatedGroups: summaries.filter((item) => item.updated).length,
    errors: errors.length,
  };
  await finalizeManifest(summary, summaries, errors);
  await onProgress({
    state: "assembly_results_synced",
    message: `${summary.updatedGroups} grupo(s) tiveram a assembleia mais recente analisada.`,
    details: {
      assemblyPosition: eligible.length,
      assemblyTotal: eligible.length,
      assemblyUpdatedGroups: summary.updatedGroups,
      assemblyErrors: errors.length,
      running: false,
    },
  });
  return { summary, groups: summaries, errors };
}
