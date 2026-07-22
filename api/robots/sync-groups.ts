// api/robots/sync-groups.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type AdminKey = 'bb' | 'maggi'

type RobotResult = {
  ok: boolean
  status: 'not_configured' | 'ready' | 'queued' | 'synced' | 'error'
  administradora: AdminKey
  message: string
  found?: number
  created?: number
  updated?: number
  deactivated?: number
  details?: Record<string, any>
}

export const config = {
  maxDuration: 60,
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null

function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body)
  return req.body || {}
}

function allowedAdmin(value: unknown): AdminKey | null {
  const key = String(value || '').toLowerCase()
  if (key === 'bb' || key === 'maggi') return key
  return null
}

async function verifyUser(req: VercelRequest) {
  if (!admin) throw new Error('Supabase Admin não configurado na Vercel.')

  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return { ok: false, error: 'Token de autenticação ausente.' }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { ok: false, error: 'Sessão inválida ou expirada.' }

  const role = String(data.user.app_metadata?.role || '').toLowerCase()
  if (role === 'admin') return { ok: true, user: data.user }

  const { data: profile } = await admin
    .from('users')
    .select('role,user_role,email,nome')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()

  const profileRole = String(profile?.role || profile?.user_role || '').toLowerCase()
  if (profileRole !== 'admin') return { ok: false, error: 'Apenas Admin pode executar robôs.' }

  return { ok: true, user: data.user }
}

function isBBAssemblyRequest(options: Record<string, any>) {
  const tipo = String(options.tipo || options.mode || '').toLowerCase()
  return tipo === 'assembleia' || tipo === 'assembly' || tipo === 'resultado_assembleia'
}

function normalizeWorkerUrl(url: string) {
  return url.replace(/\/+$/, '')
}

function workerApplicationNotFound(data: any, rawText: string) {
  const message = [data?.error, data?.message, data?.raw, rawText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return message.includes('application not found')
}

function workerConfig() {
  const workerUrl = process.env.MAGGI_GROUPS_WORKER_URL || ''
  const workerUrlEnv = 'MAGGI_GROUPS_WORKER_URL'
  const secret = process.env.ROBOT_API_SECRET || ''
  const missing = [
    [workerUrlEnv, workerUrl],
    ['ROBOT_API_SECRET', secret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  return { workerUrl, workerUrlEnv, secret, missing }
}

async function callExternalWorker(
  administradora: AdminKey,
  path: string,
  body: Record<string, any>,
  fallbackMessage: string
): Promise<RobotResult> {
  const { workerUrl, workerUrlEnv, secret, missing } = workerConfig()

  if (missing.length) {
    return {
      ok: false,
      status: 'not_configured',
      administradora,
      message: `Worker externo ${administradora.toUpperCase()} criado, mas ainda faltam variáveis seguras na Vercel: ${missing.join(', ')}.`,
      details: {
        required_envs: [workerUrlEnv, 'ROBOT_API_SECRET'],
      },
    }
  }

  const endpoint = `${normalizeWorkerUrl(workerUrl)}${path}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
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
        status: 'error',
        administradora,
        message: unavailable
          ? `O serviço externo do robô ${administradora.toUpperCase()} não foi encontrado. Verifique o deployment no Railway e atualize ${workerUrlEnv} na Vercel.`
          : data?.error || data?.message || `Worker ${administradora.toUpperCase()} retornou erro HTTP ${response.status}.`,
        details: {
          worker_status: response.status,
          worker_response: data,
          worker_unavailable: unavailable,
        },
      }
    }

    return {
      ok: Boolean(data?.ok ?? true),
      status: data?.status || 'synced',
      administradora,
      message: data?.message || fallbackMessage,
      found: data?.found,
      created: data?.created,
      updated: data?.updated,
      deactivated: data?.deactivated,
      details: data?.details || {},
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      administradora,
      message: `Falha ao chamar worker externo ${administradora.toUpperCase()}: ${err?.message || String(err)}`,
      details: {
        endpoint,
      },
    }
  }
}

async function callMaggiAvailableGroupsWorker(options: Record<string, any> = {}): Promise<RobotResult> {
  const segments = options.segments || options.segmentos || options.segmento || undefined
  return await callExternalWorker(
    'maggi',
    '/sync/maggi/available-groups',
    { segments },
    'Grupos disponíveis Maggi sincronizados pelo worker externo.'
  )
}

const BB_SEGMENTS = new Set([
  'auto_ipca',
  'auto_fipe',
  'outros_bens',
  'pesados',
  'motocicleta',
  'imoveis',
])

async function enqueueBBJob(options: Record<string, any>, requestedBy: string): Promise<RobotResult> {
  if (!admin) throw new Error('Supabase Admin não configurado na Vercel.')

  const mode = isBBAssemblyRequest(options)
    ? 'assemblies'
    : options.segmento || options.bbSegmento
      ? 'segment'
      : 'full'
  const segment = mode === 'segment'
    ? String(options.segmento || options.bbSegmento || '').trim().toLowerCase()
    : null

  if (mode === 'segment' && !BB_SEGMENTS.has(segment || '')) {
    return {
      ok: false,
      status: 'error',
      administradora: 'bb',
      message: 'Segmento BB inválido.',
      details: { allowed_segments: Array.from(BB_SEGMENTS) },
    }
  }

  const { data: activeJob, error: activeError } = await admin
    .from('robot_sync_jobs')
    .select('*')
    .eq('administradora', 'bb')
    .in('status', ['pending', 'running'])
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (activeError) throw activeError

  if (activeJob) {
    return {
      ok: true,
      status: 'queued',
      administradora: 'bb',
      message: activeJob.status === 'running'
        ? 'Já existe uma sincronização BB em andamento no GitHub Actions.'
        : 'Já existe uma sincronização BB aguardando o GitHub Actions.',
      details: { job_id: activeJob.id, job: activeJob, reused: true },
    }
  }

  const { data: job, error } = await admin
    .from('robot_sync_jobs')
    .insert({
      administradora: 'bb',
      mode,
      segment,
      source: 'manual',
      status: 'pending',
      requested_by: requestedBy,
      current_stage: 'Aguardando GitHub Actions',
      progress: {
        segments: {},
        assemblies: { total: 0, done: 0, success: 0, error: 0, currentGroup: '', errors: [] },
      },
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return enqueueBBJob(options, requestedBy)
    }
    throw error
  }

  return {
    ok: true,
    status: 'queued',
    administradora: 'bb',
    message: 'Sincronização BB adicionada à fila do GitHub Actions. O início pode levar alguns minutos.',
    details: { job_id: job.id, job },
  }
}

async function syncByRpa(administradora: AdminKey, options: Record<string, any> = {}, requestedBy = ''): Promise<RobotResult> {
  if (!admin) throw new Error('Supabase Admin não configurado na Vercel.')

  if (administradora === 'bb') {
    return await enqueueBBJob(options, requestedBy)
  }

  return await callMaggiAvailableGroupsWorker(options)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const auth = await verifyUser(req)
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error })

    const body = parseBody(req)
    const administradora = allowedAdmin(body?.administradora)
    if (!administradora) return res.status(400).json({ ok: false, error: 'Administradora inválida. Use bb ou maggi.' })

    const result = await syncByRpa(administradora, body || {}, auth.user?.id || '')
    const status = result.status === 'not_configured'
      ? 409
      : result.status === 'queued'
        ? 202
      : result.details?.worker_unavailable
        ? 503
        : result.status === 'error'
          ? 500
          : 200
    return res.status(status).json(result)
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      status: 'error',
      error: err?.message || 'Erro interno ao executar robô.',
    })
  }
}
