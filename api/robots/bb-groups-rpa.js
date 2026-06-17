// api/robots/bb-groups-rpa.js

const BB_SEGMENTS = [
  { portalLabel: 'AI - AUTO IPCA', crmSegmento: 'auto_ipca' },
  { portalLabel: 'AU - AUTO DEMAIS', crmSegmento: 'auto_fipe' },
  { portalLabel: 'EE - OUTROS BENS MOVEIS', crmSegmento: 'outros_bens' },
  { portalLabel: 'TC - TRATOR E CAMINHÃO GERAL', crmSegmento: 'pesados' },
  { portalLabel: 'MO - MOTO DEMAIS', crmSegmento: 'motocicleta' },
  { portalLabel: 'IM - IMOVEIS GERAL', crmSegmento: 'imoveis', vendaLabels: ['93 - MAIS BBC IMOVEIS 240', '95 - MAIS BBC TODOS SEGMENTOS'] },
]

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

function browserlessEndpoint() {
  const explicit = process.env.BROWSERLESS_WS_ENDPOINT || process.env.BROWSERLESS_WS_URL || ''
  if (explicit) return explicit

  const token = process.env.BROWSERLESS_TOKEN || ''
  if (token) return `wss://production-sfo.browserless.io?token=${encodeURIComponent(token)}`

  return ''
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
  const select = page.locator('select').nth(selectIndex)
  await select.waitFor({ state: 'visible', timeout: 20000 })

  const found = await select.locator('option').evaluateAll((opts, wanted) => {
    const target = String(wanted || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    return opts
      .map((option) => ({ value: option.value, text: option.textContent || '' }))
      .filter((option) => String(option.text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(target))
  }, label)

  if (!found.length) throw new Error(`Opção não encontrada: ${label}`)
  await select.selectOption(String(found[0].value))
  await page.waitForTimeout(800)
}

async function login(page, env) {
  await page.goto(env.portalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[type="text"], input:not([type])').first().fill(env.username)
  await page.locator('input[type="password"]').first().fill(env.password)

  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => null),
    page.getByText('Entrar', { exact: true }).click(),
  ])

  await page.waitForTimeout(1800)
  await dismissPostLoginMessages(page)
}

async function openHome(page, env) {
  const base = env.portalUrl.split('/frmLogin.aspx')[0]
  await page.goto(`${base}/acesso_restrito/frmMain.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
  await page.waitForTimeout(800)
  await dismissPostLoginMessages(page)
}

async function openSimulator(page) {
  await page.getByText('Simulador/Contratação', { exact: true }).click({ timeout: 20000 })
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(1000)
}

async function clickNext(page) {
  const next = page.getByText('Próximo', { exact: true }).or(page.getByText('Proximo', { exact: true })).first()
  if (await next.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), next.click()])
    await page.waitForTimeout(1000)
    return
  }

  const link = page.locator('a, button, input').filter({ hasText: /próximo|proximo/i }).first()
  if (await link.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), link.click()])
    await page.waitForTimeout(1000)
    return
  }

  throw new Error('Botão Próximo não encontrado.')
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
    const creditRanges = Array.from(new Set(credits.map((v) => Number(v.toFixed(2)))))
      .sort((a, b) => a - b)
      .map((valor, index) => ({ id: `bb_${grupo}_${index}`, label: `Faixa ${index + 1}`, valor }))

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
        prazoRules: [{ id: `prazo_${grupo}`, prazo: prazos.length ? Math.max(...prazos) : 1, taxaAdmPct: first.taxaAdmPct || 0, fundoReservaPct: first.fundoReservaPct || 0 }],
        lanceOptions: [
          { key: 'livre', enabled: true, nomeComercial: 'Lance Livre', pct: minCont.length ? Math.min(...minCont) : 0 },
          { key: 'primeiro_fixo', enabled: false, nomeComercial: '1º Lance Fixo', pct: 0 },
          { key: 'segundo_fixo', enabled: false, nomeComercial: '2º Lance Fixo', pct: 0 },
          { key: 'limitado', enabled: false, nomeComercial: 'Lance Limitado', pct: 0 },
          { key: 'fidelidade', enabled: false, nomeComercial: 'Lance Fidelidade', pct: 0 },
        ],
        maxLanceEmbutidoPct: 0,
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
      .select('id')
      .eq('grupo', payload.grupo)
      .eq('segmento', payload.segmento)
      .maybeSingle()

    if (findErr) throw findErr

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

export async function syncBBGroupsRpa(env, supabase) {
  const browser = await createBrowser()
  const { context, page } = await newRobotPage(browser)
  const rows = []
  const errors = []

  try {
    await login(page, env)

    for (const segment of BB_SEGMENTS) {
      try {
        await openHome(page, env)
        await openSimulator(page)
        await selectByText(page, 1, segment.portalLabel)

        if (segment.vendaLabels?.length) {
          for (const vendaLabel of segment.vendaLabels) {
            try {
              await selectByText(page, 3, vendaLabel)
              await clickNext(page)
              rows.push(...await readGroupsTable(page, segment.crmSegmento))
              await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => openHome(page, env))
            } catch (err) {
              errors.push(`${segment.portalLabel} / ${vendaLabel}: ${err?.message || String(err)}`)
            }
          }
        } else {
          await clickNext(page)
          rows.push(...await readGroupsTable(page, segment.crmSegmento))
        }
      } catch (err) {
        errors.push(`${segment.portalLabel}: ${err?.message || String(err)}`)
      }
    }

    const merged = mergeGroups(rows)
    const { created, updated } = await upsertGroups(supabase, merged)

    return {
      ok: true,
      status: 'synced',
      administradora: 'bb',
      message: `Sincronização BB concluída: ${merged.length} grupo(s) processado(s).`,
      found: merged.length,
      created,
      updated,
      deactivated: 0,
      details: { raw_rows: rows.length, errors },
    }
  } finally {
    if (context) await context.close().catch(() => null)
    await browser.close().catch(() => null)
  }
}
