// api/robots/sync-groups.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type AdminKey = 'bb' | 'maggi'

type RobotResult = {
  ok: boolean
  status: 'not_configured' | 'ready' | 'synced' | 'error'
  administradora: AdminKey
  message: string
  found?: number
  created?: number
  updated?: number
  deactivated?: number
  details?: Record<string, any>
}

export const config = {
  maxDuration: 800,
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

  const role = String(data.user.app_metadata?.role || data.user.user_metadata?.role || '').toLowerCase()
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

function envFor(administradora: AdminKey) {
  if (administradora === 'bb') {
    return {
      portalUrl: process.env.BB_ROBOT_PORTAL_URL || '',
      username: process.env.BB_ROBOT_USERNAME || '',
      password: process.env.BB_ROBOT_PASSWORD || '',
    }
  }

  return {
    portalUrl: process.env.MAGGI_ROBOT_PORTAL_URL || '',
    username: process.env.MAGGI_ROBOT_USERNAME || '',
    password: process.env.MAGGI_ROBOT_PASSWORD || '',
  }
}

function isBBAssemblyRequest(options: Record<string, any>) {
  const tipo = String(options.tipo || options.mode || '').toLowerCase()
  return tipo === 'assembleia' || tipo === 'assembly' || tipo === 'resultado_assembleia'
}

function normalizeWorkerUrl(url: string) {
  return url.replace(/\/+$/, '')
}

function workerConfigMissing() {
  const workerUrl = process.env.BB_GROUPS_WORKER_URL || ''
  const secret = process.env.ROBOT_API_SECRET || ''
  const missing = [
    ['BB_GROUPS_WORKER_URL', workerUrl],
    ['ROBOT_API_SECRET', secret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  return { workerUrl, secret, missing }
}

async function callBBWorker(path: string, body: Record<string, any>, fallbackMessage: string): Promise<RobotResult> {
  const { workerUrl, secret, missing } = workerConfigMissing()

  if (missing.length) {
    return {
      ok: false,
      status: 'not_configured',
      administradora: 'bb',
      message: `Worker externo BB criado, mas ainda faltam variáveis seguras na Vercel: ${missing.join(', ')}.`,
      details: {
        required_envs: ['BB_GROUPS_WORKER_URL', 'ROBOT_API_SECRET'],
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
      return {
        ok: false,
        status: 'error',
        administradora: 'bb',
        message: data?.error || data?.message || `Worker BB retornou erro HTTP ${response.status}.`,
        details: {
          worker_status: response.status,
          worker_response: data,
        },
      }
    }

    return {
      ok: Boolean(data?.ok ?? true),
      status: data?.status || 'synced',
      administradora: 'bb',
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
      administradora: 'bb',
      message: `Falha ao chamar worker externo BB: ${err?.message || String(err)}`,
      details: {
        endpoint,
      },
    }
  }
}

async function callBBGroupsWorker(options: Record<string, any> = {}): Promise<RobotResult> {
  const segmento = options.segmento || options.bbSegmento || 'auto_fipe'
  return await callBBWorker(
    '/sync/bb/groups',
    { segmento },
    `Sincronização BB concluída pelo worker externo para o segmento ${segmento}.`
  )
}

async function callBBAssemblyWorker(options: Record<string, any> = {}): Promise<RobotResult> {
  const grupo = options.grupo || options.group

  if (!grupo) {
    return {
      ok: false,
      status: 'error',
      administradora: 'bb',
      message: 'Informe o número do grupo para buscar resultado de assembleia.',
    }
  }

  return await callBBWorker(
    '/sync/bb/assembly-result',
    { grupo },
    `Resultado de assembleia BB atualizado pelo worker externo para o grupo ${grupo}.`
  )
}

async function syncByRpa(administradora: AdminKey, options: Record<string, any> = {}): Promise<RobotResult> {
  if (!admin) throw new Error('Supabase Admin não configurado na Vercel.')

  if (administradora === 'bb') {
    if (isBBAssemblyRequest(options)) {
      return await callBBAssemblyWorker(options)
    }

    return await callBBGroupsWorker(options)
  }

  const env = envFor(administradora)
  const missing = Object.entries(env).filter(([, value]) => !value).map(([key]) => key)

  if (missing.length) {
    return {
      ok: false,
      status: 'not_configured',
      administradora,
      message: `Robô ${administradora.toUpperCase()} criado, mas ainda faltam variáveis seguras na Vercel: ${missing.join(', ')}.`,
      details: {
        required_envs: ['MAGGI_ROBOT_PORTAL_URL', 'MAGGI_ROBOT_USERNAME', 'MAGGI_ROBOT_PASSWORD'],
      },
    }
  }

  return {
    ok: false,
    status: 'ready',
    administradora,
    message: 'Credenciais Maggi encontradas. Próximo passo: mapear telas/campos do portal Maggi para ativar a navegação RPA.',
    details: {
      next_step: 'Enviar prints das telas de login, listagem de grupos e detalhe dos grupos da Maggi.',
    },
  }
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

    const result = await syncByRpa(administradora, body || {})
    const status = result.status === 'not_configured' ? 409 : result.status === 'error' ? 500 : 200
    return res.status(status).json(result)
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      status: 'error',
      error: err?.message || 'Erro interno ao executar robô.',
    })
  }
}
