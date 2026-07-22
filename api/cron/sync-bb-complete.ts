import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type SegmentKey =
  | 'auto_ipca'
  | 'auto_fipe'
  | 'outros_bens'
  | 'pesados'
  | 'motocicleta'
  | 'imoveis'

type WorkerResult = {
  ok: boolean
  status?: string
  segmento: SegmentKey
  found?: number
  created?: number
  updated?: number
  deactivated?: number
  message?: string
  error?: string
  attempts?: number
  attemptHistory?: Array<{
    attempt: number
    ok: boolean
    status?: string
    error?: string
    worker_status?: number
  }>
  details?: Record<string, any>
}

export const config = {
  maxDuration: 800,
}

const DEFAULT_SEGMENTS: SegmentKey[] = [
  'auto_ipca',
  'auto_fipe',
  'outros_bens',
  'pesados',
  'motocicleta',
  'imoveis',
]

const MAX_ATTEMPTS = Number(process.env.BB_CRON_RETRY_ATTEMPTS || 3)
const RETRY_DELAY_MS = Number(process.env.BB_CRON_RETRY_DELAY_MS || 8000)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null

function normalizeWorkerUrl(url: string) {
  return url.replace(/\/+$/, '')
}

function parseSegments(value: string | undefined): SegmentKey[] {
  if (!value) return DEFAULT_SEGMENTS

  const allowed = new Set(DEFAULT_SEGMENTS)
  const parsed = value
    .split(',')
    .map((item) => item.trim().toLowerCase() as SegmentKey)
    .filter((item) => allowed.has(item))

  return parsed.length ? parsed : DEFAULT_SEGMENTS
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function workerApplicationNotFound(data: any, rawText: string) {
  const message = [data?.error, data?.message, data?.raw, rawText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return message.includes('application not found')
}

async function recordCronSuccess(
  startedAt: string,
  finishedAt: string,
  segments: SegmentKey[],
  summary: Record<string, number>
) {
  if (!admin) {
    throw new Error('Supabase Admin não configurado para registrar o sucesso do cron BB.')
  }

  const { error } = await admin.from('robot_sync_status').upsert({
    key: 'bb_groups_cron',
    administradora: 'bb',
    process: 'groups',
    source: 'cron',
    last_success_at: finishedAt,
    summary: { startedAt, finishedAt, segments, ...summary },
    updated_at: finishedAt,
  }, { onConflict: 'key' })

  if (error) {
    throw new Error(`Não foi possível registrar o sucesso do cron BB: ${error.message}`)
  }
}

function assertCronAuthorized(req: VercelRequest) {
  const secret = process.env.CRON_SECRET || ''

  if (!secret) {
    const err: any = new Error('CRON_SECRET não configurado na Vercel.')
    err.statusCode = 500
    throw err
  }

  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (token !== secret) {
    const err: any = new Error('Cron não autorizado.')
    err.statusCode = 401
    throw err
  }
}

async function callWorker(segmento: SegmentKey): Promise<WorkerResult> {
  const workerUrl = process.env.BB_GROUPS_WORKER_URL || ''
  const robotSecret = process.env.ROBOT_API_SECRET || ''

  if (!workerUrl || !robotSecret) {
    return {
      ok: false,
      segmento,
      status: 'not_configured',
      error: 'BB_GROUPS_WORKER_URL ou ROBOT_API_SECRET ausente na Vercel.',
    }
  }

  const endpoint = `${normalizeWorkerUrl(workerUrl)}/sync/bb/groups`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${robotSecret}`,
      },
      body: JSON.stringify({ segmento }),
    })

    const text = await response.text()
    let data: any = null

    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      const unavailable = workerApplicationNotFound(data, text)
      return {
        ok: false,
        segmento,
        status: 'error',
        error: unavailable
          ? 'O serviço externo do robô BB não foi encontrado. Verifique o deployment no Railway e atualize BB_GROUPS_WORKER_URL na Vercel.'
          : data?.error || data?.message || `Worker BB retornou HTTP ${response.status}.`,
        details: {
          worker_status: response.status,
          worker_response: data,
          worker_unavailable: unavailable,
        },
      }
    }

    return {
      ok: Boolean(data?.ok ?? true),
      segmento,
      status: data?.status || 'synced',
      found: data?.found,
      created: data?.created,
      updated: data?.updated,
      deactivated: data?.deactivated,
      message: data?.message,
      details: data?.details || {},
    }
  } catch (err: any) {
    return {
      ok: false,
      segmento,
      status: 'error',
      error: err?.message || String(err),
      details: { endpoint },
    }
  }
}

async function callWorkerWithRetry(segmento: SegmentKey): Promise<WorkerResult> {
  const attempts = Math.max(1, Math.min(5, MAX_ATTEMPTS || 3))
  const history: WorkerResult['attemptHistory'] = []
  let lastResult: WorkerResult | null = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await callWorker(segmento)
    lastResult = result

    history.push({
      attempt,
      ok: result.ok,
      status: result.status,
      error: result.error,
      worker_status: Number(result.details?.worker_status || 0) || undefined,
    })

    if (result.details?.worker_unavailable) {
      return {
        ...result,
        attempts: attempt,
        attemptHistory: history,
      }
    }

    if (result.ok) {
      return {
        ...result,
        attempts: attempt,
        attemptHistory: history,
      }
    }

    if (attempt < attempts) {
      await sleep(RETRY_DELAY_MS)
    }
  }

  return {
    ...(lastResult as WorkerResult),
    attempts,
    attemptHistory: history,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    assertCronAuthorized(req)

    const startedAt = new Date().toISOString()
    const segments = parseSegments(process.env.BB_CRON_SEGMENTS)
    const results: WorkerResult[] = []

    for (let index = 0; index < segments.length; index++) {
      const segmento = segments[index]
      const result = await callWorkerWithRetry(segmento)
      results.push(result)

      if (result.details?.worker_unavailable) {
        for (const skippedSegment of segments.slice(index + 1)) {
          results.push({
            ok: false,
            segmento: skippedSegment,
            status: 'error',
            error: 'Não executado porque o serviço externo do robô BB está indisponível.',
            attempts: 0,
            details: { worker_unavailable: true, skipped: true },
          })
        }
        break
      }
    }

    const failed = results.filter((item) => !item.ok)
    const summary = results.reduce(
      (acc, item) => ({
        found: acc.found + Number(item.found || 0),
        created: acc.created + Number(item.created || 0),
        updated: acc.updated + Number(item.updated || 0),
        deactivated: acc.deactivated + Number(item.deactivated || 0),
        attempts: acc.attempts + Number(item.attempts || 1),
        retriedSegments: acc.retriedSegments + (Number(item.attempts || 1) > 1 ? 1 : 0),
      }),
      { found: 0, created: 0, updated: 0, deactivated: 0, attempts: 0, retriedSegments: 0 }
    )

    const finishedAt = new Date().toISOString()

    if (!failed.length) {
      await recordCronSuccess(startedAt, finishedAt, segments, summary)
    }

    return res.status(failed.length ? 207 : 200).json({
      ok: failed.length === 0,
      status: failed.length ? 'partial_error' : 'synced',
      administradora: 'bb',
      startedAt,
      finishedAt,
      segments,
      retry: {
        maxAttempts: Math.max(1, Math.min(5, MAX_ATTEMPTS || 3)),
        delayMs: RETRY_DELAY_MS,
      },
      summary,
      results,
    })
  } catch (err: any) {
    return res.status(Number(err?.statusCode || 500)).json({
      ok: false,
      status: 'error',
      error: err?.message || 'Erro interno no cron BB.',
    })
  }
}
