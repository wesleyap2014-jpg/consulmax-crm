// api/robots/bb-assemblies-rpa.cjs

function browserlessEndpoint() {
  const explicit = process.env.BROWSERLESS_WS_ENDPOINT || process.env.BROWSERLESS_WS_URL || ''
  if (explicit) return explicit

  const token = process.env.BROWSERLESS_TOKEN || ''
  if (token) return `wss://production-sfo.browserless.io?token=${encodeURIComponent(token)}`

  return ''
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function parseNumberBR(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0

  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/%/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '')

  if (!cleaned) return 0

  const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function pctDecimal(value) {
  const parsed = parseNumberBR(value)
  if (!parsed) return 0
  return parsed > 1 ? parsed / 100 : parsed
}

function isTransientRobotError(error) {
  const text = normalizeText(error?.message || error || '')

  return (
    text.includes('EXECUTION CONTEXT WAS DESTROYED') ||
    text.includes('NAVIGATION') ||
    text.includes('TIMEOUT') ||
    text.includes('NENHUM RESULTADO DE ASSEMBLEIA') ||
    text.includes('BOTAO PESQUISAR') ||
    text.includes('CAMPO DE GRUPO')
  )
}

async function createBrowser() {
  const playwright = await import('playwright-core')
  const remoteEndpoint = browserlessEndpoint()
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_REGION)

  if (remoteEndpoint) {
    const browser = await playwright.chromium.connectOverCDP(remoteEndpoint)
    browser.__remote = true
    return browser
  }

  if (isServerless) {
    throw new Error('Chromium local indisponível no runtime da Vercel. Configure BROWSERLESS_TOKEN ou BROWSERLESS_WS_ENDPOINT.')
  }

  return playwright.chromium.launch({ headless: true })
}

async function newRobotPage(browser) {
  if (browser.__remote) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    return { context, page: await context.newPage() }
  }

  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  return { context: null, page }
}

async function dismissPostLoginMessages(page) {
  for (let i = 0; i < 6; i++) {
    const candidates = [
      page.getByText('X', { exact: true }).first(),
      page.getByText('Fechar', { exact: true }).first(),
      page.locator('.ui-dialog-titlebar-close, [aria-label="Close"], [title="Fechar"], [title="Close"]').first(),
    ]

    let clicked = false

    for (const locator of candidates) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.click().catch(() => null)
        await page.waitForTimeout(500)
        clicked = true
        break
      }
    }

    if (!clicked) break
  }
}

async function login(page, env) {
  await page.goto(env.portalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

  await page.locator('input[type="text"], input:not([type])').first().fill(env.username)
  await page.locator('input[type="password"]').first().fill(env.password)

  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => null),
    page.getByText('Entrar', { exact: true }).click(),
  ])

  await page.waitForTimeout(2200)
  await dismissPostLoginMessages(page)
}

async function openAssemblyResult(page) {
  await dismissPostLoginMessages(page)

  const candidates = [
    page.getByText('Resultado de Assembleias').first(),
    page.getByText('Resultado de Assembleias', { exact: false }).first(),
    page.locator('a').filter({ hasText: /Resultado de Assembleias/i }).first(),
  ]

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => null),
        candidate.click({ timeout: 10000 }),
      ])

      await page.waitForTimeout(1500)
      return
    }
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()

    const elements = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"], img')
    )

    const target = elements.find((el) => {
      const text = normalize(el.innerText || el.textContent || el.value || el.title || el.alt || '')
      return text.includes('RESULTADO DE ASSEMBLEIAS') || text.includes('RESULTADO ASSEMBLEIAS')
    })

    if (target) {
      target.click()
      return true
    }

    return false
  })

  if (clicked) {
    await page.waitForLoadState('domcontentloaded').catch(() => null)
    await page.waitForTimeout(1500)
    return
  }

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  throw new Error(`Menu Resultado de Assembleias não encontrado. URL atual: ${page.url()}. Tela: ${normalizeText(bodyText).slice(0, 500)}`)
}

async function searchGroup(page, grupo) {
  const groupNumber = onlyDigits(grupo).padStart(6, '0')

  if (!groupNumber || groupNumber === '000000') {
    throw new Error(`Grupo inválido para resultado de assembleia: ${grupo}`)
  }

  await page.getByText('Resultado de Assembleias').waitFor({ timeout: 20000 }).catch(() => null)

  const inputs = page.locator(
    'input:visible:not([type="image"]):not([type="button"]):not([type="submit"]):not([type="hidden"]):not([type="password"])'
  )

  const count = await inputs.count()

  if (count < 1) {
    throw new Error('Campo de grupo não encontrado na tela de Resultado de Assembleias.')
  }

  const groupInput = inputs.nth(0)

  await groupInput.fill('')
  await groupInput.fill(groupNumber)
  await page.waitForTimeout(500)

  const clicked = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()

    const elements = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')
    )

    const target = elements.find((el) =>
      normalize(el.innerText || el.textContent || el.value || el.title || '').includes('PESQUISAR')
    )

    if (target) {
      target.click()
      return true
    }

    return false
  })

  if (!clicked) {
    throw new Error('Botão Pesquisar não encontrado na tela de Resultado de Assembleias.')
  }

  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(2500)
}

async function readLatestAssembly(page, grupo) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const rows = await page
      .locator('table tr')
      .evaluateAll((trs) => {
        return trs
          .map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) =>
              String(td.innerText || td.textContent || '').trim()
            )
          )
          .filter((cells) => cells.length >= 6 && /^\d+/.test(cells[0] || '') && /^\d+/.test(cells[1] || ''))
      })

    if (rows.length) {
      const last = rows[rows.length - 1]

      const maiorPct = pctDecimal(last[4])
      const menorPct = pctDecimal(last[5])
      const medianaPct = maiorPct && menorPct ? (maiorPct + menorPct) / 2 : 0

      return {
        grupo: String(last[0] || grupo).trim(),
        assembleia: String(last[1] || '').trim(),
        dataAssembleia: String(last[2] || '').trim(),
        qtdeContemplados: parseNumberBR(last[3]),
        maiorPct,
        menorPct,
        medianaPct,
        raw: last,
      }
    }

    if (attempt < 3) {
      await page.waitForTimeout(1500)
    }
  }

  throw new Error(`Nenhum resultado de assembleia encontrado para o grupo ${grupo}.`)
}

async function updateGroupAssembly(supabase, result) {
  const grupo = String(result.grupo || '').replace(/^0+/, '') || String(result.grupo || '')
  const padded = String(result.grupo || '').padStart(6, '0')

  const assemblyResult = {
    maiorPct: result.maiorPct,
    menorPct: result.menorPct,
    medianaPct: result.medianaPct,
    assembleia: result.assembleia,
    dataAssembleia: result.dataAssembleia,
    qtdeContemplados: result.qtdeContemplados,
    raw: result.raw,
    updatedAt: new Date().toISOString(),
  }

  let { data: rows, error: findError } = await supabase
    .from('sim_bb_groups')
    .select('id,grupo,config')
    .eq('grupo', padded)

  if (findError) throw findError

  if (!rows?.length) {
    const fallback = await supabase
      .from('sim_bb_groups')
      .select('id,grupo,config')
      .eq('grupo', grupo)

    if (fallback.error) throw fallback.error
    rows = fallback.data || []
  }

  let updated = 0

  for (const row of rows || []) {
    const config =
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? row.config
        : {}

    const { error } = await supabase
      .from('sim_bb_groups')
      .update({
        config: {
          ...config,
          assemblyResult,
        },
      })
      .eq('id', row.id)

    if (error) throw error
    updated += 1
  }

  return { updated }
}

async function runAssemblyOnce(page, grupo) {
  await openAssemblyResult(page)
  await searchGroup(page, grupo)
  return await readLatestAssembly(page, grupo)
}

async function syncBBAssemblyResultRpa(env, supabase, options = {}) {
  const grupo = options.grupo || options.group || ''

  if (!grupo) {
    throw new Error('Informe o número do grupo para buscar resultado de assembleia.')
  }

  const browser = await createBrowser()
  const { context, page } = await newRobotPage(browser)
  let lastError = null

  try {
    await login(page, env)

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await runAssemblyOnce(page, grupo)
        const saved = await updateGroupAssembly(supabase, result)
        const retryText = attempt > 1 ? ` após ${attempt} tentativas` : ''

        return {
          ok: true,
          status: 'synced',
          administradora: 'bb',
          message: `Resultado de assembleia BB atualizado${retryText} para o grupo ${result.grupo}: maior ${(result.maiorPct * 100).toFixed(4)}%, menor ${(result.menorPct * 100).toFixed(4)}%, mediana ${(result.medianaPct * 100).toFixed(4)}%.`,
          found: 1,
          updated: saved.updated,
          details: {
            ...result,
            attempts: attempt,
          },
        }
      } catch (error) {
        lastError = error

        if (attempt >= 2 || !isTransientRobotError(error)) {
          throw error
        }

        await page.waitForTimeout(2000)
      }
    }

    throw lastError || new Error('Erro desconhecido ao buscar resultado de assembleia.')
  } finally {
    if (context) await context.close().catch(() => null)
    await browser.close().catch(() => null)
  }
}

module.exports = {
  syncBBAssemblyResultRpa,
}
