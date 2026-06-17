// api/robots/sync-groups.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { syncBBGroupsRpa } from './bb-groups-rpa'

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

async function syncByRpa(administradora: AdminKey): Promise<RobotResult> {
  if (!admin) throw new Error('Supabase Admin não configurado na Vercel.')

  const env = envFor(administradora)
  const missing = Object.entries(env).filter(([, value]) => !value).map(([key]) => key)

  if (missing.length) {
    return {
      ok: false,
      status: 'not_configured',
      administradora,
      message: `Robô ${administradora.toUpperCase()} criado, mas ainda faltam variáveis seguras na Vercel: ${missing.join(', ')}.`,
      details: {
        required_envs: administradora === 'bb'
          ? ['BB_ROBOT_PORTAL_URL', 'BB_ROBOT_USERNAME', 'BB_ROBOT_PASSWORD']
          : ['MAGGI_ROBOT_PORTAL_URL', 'MAGGI_ROBOT_USERNAME', 'MAGGI_ROBOT_PASSWORD'],
      },
    }
  }

  if (administradora === 'bb') {
    return await syncBBGroupsRpa(env, admin)
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

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const auth = await verifyUser(req)
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error })

    const body = parseBody(req)
    const administradora = allowedAdmin(body?.administradora)
    if (!administradora) return res.status(400).json({ ok: false, error: 'Administradora inválida. Use bb ou maggi.' })

    const result = await syncByRpa(administradora)
    return res.status(result.status === 'not_configured' ? 409 : 200).json(result)
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Erro interno ao executar robô.' })
  }
}
