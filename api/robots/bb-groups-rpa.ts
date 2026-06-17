// api/robots/bb-groups-rpa.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

type BBEnv = {
  portalUrl: string
  username: string
  password: string
}

type BBPortalSegment = {
  portalLabel: string
  crmSegmento: 'auto_ipca' | 'auto_fipe' | 'outros_bens' | 'pesados' | 'motocicleta' | 'imoveis'
  vendaLabels?: string[]
}

type ParsedGroup = {
  grupo: string
  segmento: BBPortalSegment['crmSegmento']
  credito: number
  prazo: number
  vagas: number
  bem: string
  taxaAdmPct: number
  fundoReservaPct: number
  seguroPct: number
  parcela: number
  assembleia: string
  vencimento: string
  minContemplacaoPct: number
}

export const BB_SEGMENTS: BBPortalSegment[] = [
  { portalLabel: 'AI - AUTO IPCA', crmSegmento: 'auto_ipca' },
  { portalLabel: 'AU - AUTO DEMAIS', crmSegmento: 'auto_fipe' },
  { portalLabel: 'EE - OUTROS BENS MOVEIS', crmSegmento: 'outros_bens' },
  { portalLabel: 'TC - TRATOR E CAMINHÃO GERAL', crmSegmento: 'pesados' },
  { portalLabel: 'MO - MOTO DEMAIS', crmSegmento: 'motocicleta' },
  { portalLabel: 'IM - IMOVEIS GERAL', crmSegmento: 'imoveis', vendaLabels: ['93 - MAIS BBC IMOVEIS 240', '95 - MAIS BBC TODOS SEGMENTOS'] },
]

function parseNumberBR(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!cleaned) return 0
  const n = Number(cleaned.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function pctDecimal(value: unknown) {
  const n = parseNumberBR(value)
  if (!n) return 0
  return n > 1 ? n / 100 : n
}

function digits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

async function createBrowser() {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_REGION)

  if (isVercel) {
    const chromiumModule = await import('@sparticuz/chromium')
    const playwright = await import('playwright-core')
    const chromium = chromiumModule.default
    return playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const playwright = await import('playwright-core')
  return playwright.chromium.launch({ headless: true })
}

async function dismissPostLoginMessages(page: any) {
  for (let i = 0; i < 4; i++) {
    const closeByText = page.getByText('X', { exact: true }).first()
    if (await closeByText.isVisible().catch(() => false)) {
      await closeByText.click().catch(() => null)
      await page.waitForTimeout(600)
      continue
    }

    const closeButton = page.locator('text="X", text="Fechar", .ui-dialog-titlebar-close, [aria-label="Close"], [title="Fechar"]').first()
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click().catch(() => null)
      await page.waitForTimeout(600)
      continue
    }

    break
  }
}

async function selectOptionByVisibleText(page: any, selectIndex: number, text: string) {
  const select = page.locator('select').nth(selectIndex)
  await select.waitFor({ state: 'visible', timeout: 15000 })
  const options = await select.locator('option').evaluateAll((opts: any[], label: string) => {
    const target = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    return opts.map((o) => ({ value: o.value, text: o.textContent || '' })).filter((o) => String(o.text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(target))
  }, text)

  if (!options?.length) throw new Error(`Opção não encontrada no select ${selectIndex}: ${text}`)
  await select.selectOption(String(options[0].value))
}

async function login(page: any, env: BBEnv) {
  await page.goto(env.portalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[type="text"], input:not([type])').first().fill(env.username)
  await page.locator('input[type="password"]').first().fill(env.password)
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => null),
    page.getByText('Entrar', { exact: true }).click(),
  ])
  await page.waitForTimeout(1500)
  await dismissPostLoginMessages(page)
}

async function openSimulator(page: any) {
  await page.getByText('Simulador/Contratação', { exact: true }).click()
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(800)
}

async function goNext(page: any) {
  const next = page.getByText('Próximo', { exact: true }).or(page.getByText('Proximo', { exact: true })).first()
  if (await next.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), next.click()])
    await page.waitForTimeout(800)
    return
  }

  const nextLike = page.locator('a, input, button').filter({ hasText: /próximo|proximo/i }).first()
  if (await nextLike.isVisible().catch(() => false)) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => null), nextLike.click()])
    await page.waitForTimeout(800)
    return
  }

  throw new Error('Botão Próximo não encontrado.')
}

async function readGroupsTable(page: any, segmento: BBPortalSegment['crmSegmento']) {
  await page.getByText('Grupos Disponíveis').waitFor({ timeout: 30000 }).catch(() => null)
  const rows = await page.locator('table tr').evaluateAll((trs: any[], segmentoAtual: string) => {
    return trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td: any) => String(td.innerText || td.textContent || '').trim())
      return { cells, segmento: segmentoAtual }
    }).filter((r) => r.cells.length >= 13)
  }, segmento)

  return rows.map((row: any) => {
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
    } satisfies ParsedGroup
  }).filter((g: ParsedGroup) => g.grupo && g.credito > 0)
}

function mergeGroups(rows: ParsedGroup[]) {
  const map = new Map<string, ParsedGroup[]>()
  for (const row of rows) {
    const key = `${row.segmento}:${row.grupo}`
    const list = map.get(key) || []
    list.push(row)
    map.set(key, list)
  }

  return [...map.entries()].map(([key, list]) => {
    const [segmento, grupo] = key.split(':')
    const credits = list.map((r) => r.credito).filter(Boolean)
    const prazos = list.map((r) => r.prazo).filter(Boolean)
    const minCont = list.map((r) => r.minContemplacaoPct).filter(Boolean)
    const first = list[0]
    const creditRanges = [...new Set(credits.map((v) => Number(v.toFixed(2))))].sort((a, b) => a - b).map((valor, index) => ({ id: `bb_${grupo}_${index}`, label: `Faixa ${index + 1}`, valor }))

    return {
      grupo,
      segmento,
      nome_grupo: `Grupo ${grupo}`,
      observacoes: `Importado pelo robô BB${first?.assembleia ? ` • Assembleia: ${first.assembleia}` : ''}${first?.vencimento ? ` • Vencimento: ${first.vencimento}` : ''}`,
      credito_min: credits.length ? Math.min(...credits) : 0,
      credito_max: credits.length ? Math.max(...credits) : 0,
      prazo_min: prazos.length ? Math.min(...prazos) : 0,
      prazo_max: prazos.length ? Math.max(...prazos) : 0,
      taxa_adm_pct: first?.taxaAdmPct || 0,
      fundo_reserva_pct: first?.fundoReservaPct || 0,
      seguro_pct: first?.seguroPct || 0,
      permite_lance_livre: true,
      permite_lance_embutido: false,
      lance_embutido_max_pct: 0,
      permite_fixo_25: false,
      permite_fixo_50: false,
      is_active: true,
      config: {
        creditRanges,
        prazoRules: [{ id: `prazo_${grupo}`, prazo: prazos.length ? Math.max(...prazos) : 1, taxaAdmPct: first?.taxaAdmPct || 0, fundoReservaPct: first?.fundoReservaPct || 0 }],
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

async function upsertGroups(supabase: SupabaseClient, rows: ReturnType<typeof mergeGroups>) {
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
      const { error } = await supabase.from('sim_bb_groups').update(payload as any).eq('id', existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await supabase.from('sim_bb_groups').insert(payload as any)
      if (error) throw error
      created += 1
    }
  }

  return { created, updated }
}

export async function syncBBGroupsRpa(env: BBEnv, supabase: SupabaseClient) {
  const browser = await createBrowser()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const allRows: ParsedGroup[] = []
  const errors: string[] = []

  try {
    await login(page, env)

    for (const segment of BB_SEGMENTS) {
      try {
        await openSimulator(page)
        await selectOptionByVisibleText(page, 1, segment.portalLabel)

        if (segment.vendaLabels?.length) {
          for (const vendaLabel of segment.vendaLabels) {
            try {
              await selectOptionByVisibleText(page, 3, vendaLabel)
              await goNext(page)
              allRows.push(...await readGroupsTable(page, segment.crmSegmento))
              await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null)
            } catch (err: any) {
              errors.push(`${segment.portalLabel} / ${vendaLabel}: ${err?.message || err}`)
            }
          }
        } else {
          await goNext(page)
          allRows.push(...await readGroupsTable(page, segment.crmSegmento))
        }
      } catch (err: any) {
        errors.push(`${segment.portalLabel}: ${err?.message || err}`)
      }

      await page.goto(env.portalUrl.replace('/frmLogin.aspx', '/acesso_restrito/frmMain.aspx')).catch(() => null)
      await dismissPostLoginMessages(page).catch(() => null)
    }

    const merged = mergeGroups(allRows)
    const { created, updated } = await upsertGroups(supabase, merged)

    return {
      ok: true,
      status: 'synced' as const,
      administradora: 'bb' as const,
      message: `Sincronização BB concluída: ${merged.length} grupo(s) processado(s).`,
      found: merged.length,
      created,
      updated,
      deactivated: 0,
      details: { raw_rows: allRows.length, errors },
    }
  } finally {
    await browser.close().catch(() => null)
  }
}
