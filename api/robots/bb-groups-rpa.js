// api/robots/bb-groups-rpa.js

const BB_SEGMENTS = [
  { portalLabel: 'AI - AUTO IPCA', crmSegmento: 'auto_ipca' },
  { portalLabel: 'AU - AUTO DEMAIS', crmSegmento: 'auto_fipe' },
  { portalLabel: 'EE - OUTROS BENS MOVEIS', crmSegmento: 'outros_bens' },
  { portalLabel: 'TC - TRATOR E CAMINHÃO GERAL', crmSegmento: 'pesados' },
  { portalLabel: 'MO - MOTO DEMAIS', crmSegmento: 'motocicleta' },
  { portalLabel: 'IM - IMOVEIS GERAL', crmSegmento: 'imoveis', vendaLabels: ['93 - MAIS BBC IMOVEIS 240', '95 - MAIS BBC TODOS SEGMENTOS'] },
]

const SELECT_INDEX = {
  tipoPessoa: 0,
  filial: 1,
  grupo: 2,
  periodicidade: 3,
  venda: 4,
}

function parseNumberBR(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!cleaned) return 0
  const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function pctDecimal(value) {
  const parsed = parseNumberBR(value)
  if (!parsed) return 0
  return parsed > 1 ? parsed / 100 : parsed
}

function formatMoneyBR(value) {
  const n = Number(value || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function browserlessEndpoint() {
  const explicit = process.env.BROWSERLESS_WS_ENDPOINT || process.env.BROWSERLESS_WS_URL || ''
  if (explicit) return explicit

  const token = process.env.BROWSERLESS_TOKEN || ''
  if (token) return `wss://production-sfo.browserless.io?token=${encodeURIComponent(token)}`

  return ''
}

function normalizeKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function normalizePortalText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

function segmentsToRun(segmento) {
  const requested = normalizeKey(segmento || 'auto_fipe')
  const found = BB_SEGMENTS.filter((segment) => {
    const crm = normalizeKey(segment.crmSegmento)
    const label = normalizeKey(segment.portalLabel)
    return crm === requested || label.includes(requested) || requested.includes(crm)
  })

  return found.length ? found : BB_SEGMENTS.filter((segment) => segment.crmSegmento === 'auto_fipe')
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
    throw new Error('Chromium local indisponível no runtime da Vercel: falta libnss3.so. Configure BROWSERLESS_TOKEN ou BROWSERLESS_WS_ENDPOINT nas variáveis da Vercel para executar o robô com navegador remoto.')
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
  for (let i = 0; i < 5; i++) {
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

async function selectByText(page, selectIndex, label) {
  const select = page.locator('select:visible').nth(selectIndex)
  const visibleCount = await page.locator('select:visible').count()
  await select.waitFor({ state: 'visible', timeout: 20000 })

  const options = await select.locator('option').evaluateAll((opts) =>
    opts.map((option) => ({ value: option.value, text: option.textContent || '' }))
  )

  const normalizedLabel = normalizePortalText(label)
  const code = normalizedLabel.split('-')[0]?.trim()

  const found = options.find((option) => {
    const text = normalizePortalText(option.text)
    const value = normalizePortalText(option.value)

    return (
      text === normalizedLabel ||
      text.includes(normalizedLabel) ||
      normalizedLabel.includes(text) ||
      (
        code &&
        (
          text === code ||
          text.startsWith(`${code} `) ||
          text.startsWith(`${code}-`) ||
          text.startsWith(`${code} -`) ||
          value === code ||
          value.includes(code)
        )
      )
    )
  })

  if (!found) {
    const available = options.map((option) => option.text).join(' | ')
    throw new Error(`Opção não encontrada no select visível ${selectIndex}/${visibleCount}: ${label}. Código: ${code || '—'}. Opções: ${available}`)
  }

  await select.selectOption(String(found.value))
  await page.waitForTimeout(1200)
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

async function openSimulator(page) {
  await dismissPostLoginMessages(page)

  const candidates = [
    page.getByText('Simulador/Contratação').first(),
    page.getByText('Simulador/Contratacao').first(),
    page.locator('a').filter({ hasText: /Simulador\/Contrata/i }).first(),
  ]

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => null),
        candidate.click({ timeout: 10000 }),
      ])
      await page.waitForTimeout(1200)
      return
    }
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
    const elements = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], img'))
    const target = elements.find((el) => {
      const text = normalize(el.innerText || el.textContent || el.value || el.title || el.alt || '')
      return text.includes('SIMULADOR/CONTRATACAO') || text.includes('SIMULADOR')
    })
    if (target) {
      target.click()
      return true
    }
    return false
  })

  if (clicked) {
    await page.waitForLoadState('domcontentloaded').catch(() => null)
    await page.waitForTimeout(1200)
    return
  }

  const url = page.url()
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  throw new Error(`Menu Simulador/Contratação não encontrado. URL atual: ${url}. Texto da tela: ${normalizePortalText(bodyText).slice(0, 500)}`)
}

async function clickNext(page) {
  const next = page.getByText('Próximo', { exact: true }).or(page.getByText('Proximo', { exact: true })).first()
  if (await next.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), next.click()])
    await page.waitForTimeout(1200)
    return
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
    const elements = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'))
    const target = elements.find((el) => normalize(el.innerText || el.textContent || el.value || el.title || '').includes('PROXIMO'))
    if (target) {
      target.click()
      return true
    }
    return false
  })

  if (clicked) {
    await page.waitForLoadState('domcontentloaded').catch(() => null)
    await page.waitForTimeout(1200)
    return
  }

  throw new Error('Botão Próximo não encontrado.')
}

async function clickPrevious(page) {
  const previous = page.getByText('Anterior', { exact: true }).first()
  if (await previous.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), previous.click()])
    await page.waitForTimeout(1200)
    return true
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
    const elements = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'))
    const target = elements.find((el) => normalize(el.innerText || el.textContent || el.value || el.title || '').includes('ANTERIOR'))
    if (target) {
      target.click()
      return true
    }
    return false
  })

  if (clicked) {
    await page.waitForLoadState('domcontentloaded').catch(() => null)
    await page.waitForTimeout(1200)
    return true
  }

  return false
}

async function tableSignature(page) {
  return await page.locator('table tr').evaluateAll((trs) => {
    const rows = trs
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => String(td.innerText || td.textContent || '').trim()).join('|'))
      .filter((text) => /^\d+/.test(text))
    return `${rows.length}::${rows[0] || ''}::${rows[rows.length - 1] || ''}`
  }).catch(() => '')
}

async function clickTableArrow(page) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      const box = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }

    const pageText = String(document.body.innerText || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()

    if (!pageText.includes('GRUPOS DISPONIVEIS')) return false

    const elements = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], input[type="image"], img'))
      .filter(isVisible)
      .map((el) => {
        const box = el.getBoundingClientRect()
        const text = String(
          el.innerText ||
          el.textContent ||
          el.value ||
          el.title ||
          el.alt ||
          el.getAttribute('src') ||
          el.getAttribute('onclick') ||
          ''
        ).toUpperCase()

        return {
          el,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          right: box.right,
          bottom: box.bottom,
          text,
        }
      })

    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0

    const candidates = elements.filter((item) => {
      const smallIcon = item.width <= 80 && item.height <= 80
      const nearRight = item.right > viewportW * 0.45
      const lowerHalf = item.y > viewportH * 0.25
      const maybeArrowByText =
        item.text.includes('PROX') ||
        item.text.includes('NEXT') ||
        item.text.includes('RIGHT') ||
        item.text.includes('DIREITA') ||
        item.text.includes('AVAN') ||
        item.text.includes('SETA') ||
        item.text.includes('ARROW') ||
        item.text.includes('IMG') ||
        item.text.includes('.GIF') ||
        item.text.includes('.PNG') ||
        item.text.includes('.JPG') ||
        item.text.includes('.JPEG')
      return smallIcon && nearRight && lowerHalf && maybeArrowByText
    })

    const ordered = candidates.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 10) return b.y - a.y
      return b.x - a.x
    })

    const target = ordered[0]?.el
    if (!target) return false
    target.click()
    return true
  }).catch(() => false)

  if (!clicked) return false

  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(1200)
  return true
}

async function waitForTableChange(page, previousSignature) {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500)
    const current = await tableSignature(page)
    if (current && current !== previousSignature) return true
  }
  return false
}

async function readGroupsTable(page, segmento) {
  await page.getByText('Grupos Disponíveis').waitFor({ timeout: 30000 }).catch(() => null)

  const rows = await page.locator('table tr').evaluateAll((trs, seg) => {
    return trs
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => String(td.innerText || td.textContent || '').trim())
        return { cells, segmento: seg }
      })
      .filter((row) => row.cells.length >= 12 && /^\d+/.test(row.cells[0] || ''))
  }, segmento)

  return rows.map((row) => {
    const c = row.cells
    return {
      grupo: String(c[0] || '').trim(),
      segmento,
      prazo: parseNumberBR(c[1]),
      vagas: parseNumberBR(c[2]),
      bem: String(c[3] || '').trim(),
      taxaAdmPct: pctDecimal(c[4]),
      fundoReservaPct: pctDecimal(c[5]),
      seguroPct: pctDecimal(c[6]),
      credito: parseNumberBR(c[7]),
      parcela: parseNumberBR(c[8]),
      assembleia: String(c[9] || '').trim(),
      vencimento: String(c[10] || '').trim(),
      minContemplacaoPct: pctDecimal(c[11]),
    }
  }).filter((row) => row.grupo && row.credito > 0)
}

async function readAllGroupsPages(page, segmento) {
  const allRows = []
  const seen = new Set()

  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    const signature = await tableSignature(page)
    if (signature && seen.has(signature)) break
    if (signature) seen.add(signature)

    const pageRows = await readGroupsTable(page, segmento)
    allRows.push(...pageRows.map((row) => ({ ...row, pageIndex })))

    const clicked = await clickTableArrow(page)
    if (!clicked) break

    const changed = await waitForTableChange(page, signature)
    if (!changed) break
  }

  return allRows
}

function mergeGroups(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = `${row.segmento}:${row.grupo}`
    map.set(key, [...(map.get(key) || []), row])
  }

  return Array.from(map.entries()).map(([key, list]) => {
    const [segmento, grupo] = key.split(':')
    const credits = list.map((row) => row.credito).filter(Boolean)
    const prazos = list.map((row) => row.prazo).filter(Boolean)
    const minCont = list.map((row) => row.minContemplacaoPct).filter(Boolean)
    const first = list[0] || {}

    const rangeMap = new Map()
    for (const row of list) {
      if (!row.credito) continue
      const rangeKey = [
        Number(row.credito || 0).toFixed(2),
        Number(row.parcela || 0).toFixed(2),
        Number(row.prazo || 0),
        String(row.bem || ''),
      ].join(':')

      if (!rangeMap.has(rangeKey)) {
        rangeMap.set(rangeKey, row)
      }
    }

    const creditRanges = Array.from(rangeMap.values())
      .sort((a, b) => Number(a.credito || 0) - Number(b.credito || 0))
      .map((row, index) => ({
        id: `bb_${grupo}_${index}`,
        label: `Faixa ${index + 1} - ${formatMoneyBR(row.credito)}`,
        valor: Number(Number(row.credito || 0).toFixed(2)),
        parcela: Number(Number(row.parcela || 0).toFixed(2)),
        prazo: Number(row.prazo || 0),
        vagas: Number(row.vagas || 0),
        bem: String(row.bem || ''),
        taxaAdmPct: Number(row.taxaAdmPct || 0),
        fundoReservaPct: Number(row.fundoReservaPct || 0),
        seguroPct: Number(row.seguroPct || 0),
        minContemplacaoPct: Number(row.minContemplacaoPct || 0),
        assembleia: String(row.assembleia || ''),
        vencimento: String(row.vencimento || ''),
      }))

    const prazoRuleMap = new Map()
    for (const row of list) {
      const ruleKey = `${Number(row.prazo || 0)}:${Number(row.taxaAdmPct || 0)}:${Number(row.fundoReservaPct || 0)}`
      if (!prazoRuleMap.has(ruleKey)) {
        prazoRuleMap.set(ruleKey, {
          id: `prazo_${grupo}_${prazoRuleMap.size}`,
          prazo: Number(row.prazo || 0),
          taxaAdmPct: Number(row.taxaAdmPct || 0),
          fundoReservaPct: Number(row.fundoReservaPct || 0),
        })
      }
    }

    const prazoRules = Array.from(prazoRuleMap.values())
      .filter((rule) => rule.prazo > 0)
      .sort((a, b) => a.prazo - b.prazo)

    return {
      grupo,
      segmento,
      nome_grupo: `Grupo ${grupo}`,
      observacoes: `Importado pelo robô BB${first.assembleia ? ` • Assembleia: ${first.assembleia}` : ''}${first.vencimento ? ` • Vencimento: ${first.vencimento}` : ''}`,
      credito_min: credits.length ? Math.min(...credits) : 0,
      credito_max: credits.length ? Math.max(...credits) : 0,
      prazo_min: prazos.length ? Math.min(...prazos) : 0,
      prazo_max: prazos.length ? Math.max(...prazos) : 0,
      taxa_adm_pct: first.taxaAdmPct || 0,
      fundo_reserva_pct: first.fundoReservaPct || 0,
      seguro_pct: first.seguroPct || 0,
      permite_lance_livre: true,
      permite_lance_embutido: false,
      lance_embutido_max_pct: 0,
      permite_fixo_25: false,
      permite_fixo_50: false,
      is_active: true,
      config: {
        creditRanges,
        prazoRules,
        lanceOptions: [
          { key: 'livre', enabled: true, nomeComercial: 'Lance Livre', pct: minCont.length ? Math.min(...minCont) : 0 },
          { key: 'primeiro_fixo', enabled: false, nomeComercial: '1º Lance Fixo', pct: 0 },
          { key: 'segundo_fixo', enabled: false, nomeComercial: '2º Lance Fixo', pct: 0 },
          { key: 'limitado', enabled: false, nomeComercial: 'Lance Limitado', pct: 0 },
          { key: 'fidelidade', enabled: false, nomeComercial: 'Lance Fidelidade', pct: 0 },
        ],
        maxLanceEmbutidoPct: 0,
        regraPosContemplacao: 'saldo_devedor_prazo_restante',
        observacoesRegra: minCont.length ? `% mín. contemplação: ${(Math.min(...minCont) * 100).toFixed(4).replace('.', ',')}%` : '',
      },
    }
  })
}

async function upsertGroups(supabase, rows) {
  let created = 0
  let updated = 0

  for (const payload of rows) {
    const { data: existing, error: findErr } = await supabase
      .from('sim_bb_groups')
      .select('id, config')
      .eq('grupo', payload.grupo)
      .eq('segmento', payload.segmento)
      .maybeSingle()

    if (findErr) throw findErr

    const existingConfig = existing?.config && typeof existing.config === 'object' ? existing.config : {}
    if (existingConfig?.assemblyResult && payload.config) {
      payload.config.assemblyResult = existingConfig.assemblyResult
    }

    if (existing?.id) {
      const { error } = await supabase.from('sim_bb_groups').update(payload).eq('id', existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await supabase.from('sim_bb_groups').insert(payload)
      if (error) throw error
      created += 1
    }
  }

  return { created, updated }
}

export async function syncBBGroupsRpa(env, supabase, options = {}) {
  const selectedSegments = segmentsToRun(options.segmento)
  const browser = await createBrowser()
  const { context, page } = await newRobotPage(browser)
  const rows = []
  const errors = []

  try {
    await login(page, env)

    for (const segment of selectedSegments) {
      try {
        await openSimulator(page)
        await selectByText(page, SELECT_INDEX.grupo, segment.portalLabel)

        if (segment.vendaLabels?.length) {
          for (const vendaLabel of segment.vendaLabels) {
            try {
              await selectByText(page, SELECT_INDEX.venda, vendaLabel)
              await clickNext(page)
              rows.push(...await readAllGroupsPages(page, segment.crmSegmento))
              await clickPrevious(page)
            } catch (err) {
              errors.push(`${segment.portalLabel} / ${vendaLabel}: ${err?.message || String(err)}`)
              await clickPrevious(page).catch(() => null)
            }
          }
        } else {
          await clickNext(page)
          rows.push(...await readAllGroupsPages(page, segment.crmSegmento))
          await clickPrevious(page)
        }
      } catch (err) {
        errors.push(`${segment.portalLabel}: ${err?.message || String(err)}`)
        await clickPrevious(page).catch(() => null)
      }
    }

    const merged = mergeGroups(rows)
    const { created, updated } = await upsertGroups(supabase, merged)
    const segmentNames = selectedSegments.map((segment) => segment.crmSegmento).join(', ')
    const zeroWarning = merged.length === 0 && errors.length ? ` Erros: ${errors.join(' | ')}` : ''

    return {
      ok: true,
      status: 'synced',
      administradora: 'bb',
      message: `Sincronização BB concluída para ${segmentNames}: ${merged.length} grupo(s) processado(s).${zeroWarning}`,
      found: merged.length,
      created,
      updated,
      deactivated: 0,
      details: {
        raw_rows: rows.length,
        errors,
        segmentos: selectedSegments.map((segment) => segment.crmSegmento),
        credit_ranges_enriched: true,
        pagination_enabled: true,
        arrow_detection: 'visual-table-arrow',
      },
    }
  } finally {
    if (context) await context.close().catch(() => null)
    await browser.close().catch(() => null)
  }
}
