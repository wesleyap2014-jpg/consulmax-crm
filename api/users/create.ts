// /api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY nas envs da Vercel.')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

function tempPassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('')
}

// Apenas escopos válidos
const ALLOWED_SCOPES = new Set([
  'leads',
  'oportunidades',
  'usuarios',
  'lgpd',
  'carteira',
  'gestao_grupos',
  'comissoes',
  'suporte',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS básico (opcional)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body: any =
      typeof req.body === 'string' && req.body.length ? JSON.parse(req.body) : req.body || {}

    const nome: string = (body?.nome || '').trim()
    const email: string = (body?.email || '').trim().toLowerCase()

    // UI manda "operacoes" e mapeamos para "viewer" no front,
    // mas validamos aqui também:
    const roleIn = String(body?.role || 'viewer').toLowerCase()
    const role: 'admin' | 'vendedor' | 'viewer' =
      roleIn === 'admin' || roleIn === 'vendedor' ? (roleIn as any) : 'viewer'

    const cpf: string | undefined = body?.cpf ? String(body.cpf) : undefined
    const phone: string | undefined = body?.phone ? String(body.phone) : undefined
    const cep: string | undefined = body?.cep ? String(body.cep) : undefined
    const logradouro: string | undefined = body?.logradouro || undefined
    const numero: string | undefined = body?.numero || undefined
    const bairro: string | undefined = body?.bairro || undefined
    const cidade: string | undefined = body?.cidade || undefined
    const uf: string | undefined = body?.uf || undefined
    const avatar_url: string | undefined = body?.avatar_url || undefined

    const pix_type: 'cpf' | 'email' | 'telefone' | null = body?.pix_type || null
    const pix_key: string | null = body?.pix_key || null

    const scopesRaw: string[] = Array.isArray(body?.scopes) ? body.scopes : []
    const scopes: string[] = scopesRaw.filter((s) => ALLOWED_SCOPES.has(String(s)))

    if (!nome || !email) {
      return res.status(400).json({ error: 'nome e email são obrigatórios' })
    }

    // 1) Cria usuário no Auth, já confirmando e exigindo troca de senha
    const tempPass = tempPassword()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPass,
      email_confirm: true,
      user_metadata: {
        nome,
        role,
        must_change_password: true, // RequireAuth checa essa flag
        scopes,
        pix_type,
        pix_key,
      },
      app_metadata: { role },
    })

    if (createErr) {
      return res.status(400).json({ error: createErr.message || 'Falha ao criar usuário (Auth)' })
    }

    const auth_user_id = created.user?.id
    if (!auth_user_id) {
      return res.status(500).json({ error: 'Usuário criado no Auth sem id.' })
    }

    // 2) Upsert no perfil público (tabela public.users)
    const profile = {
      auth_user_id,
      nome,
      email,
      role, // 'admin' | 'vendedor' | 'viewer'
      phone: phone || null,
      cep: cep || null,
      logradouro: logradouro || null,
      numero: numero || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
      scopes: scopes.length ? scopes : null, // text[] ou jsonb
      avatar_url: avatar_url || null,
      pix_type: pix_type || null,
      pix_key: pix_key || null,
      // cpf: NÃO gravamos aqui por segurança — use trigger/RPC no banco p/ cpf_encrypted
    }

    const { error: upsertErr } = await admin.from('users').upsert(profile, { onConflict: 'auth_user_id' })

    if (upsertErr) {
      return res.status(400).json({ error: `Perfil não salvo: ${upsertErr.message}` })
    }

    // 3) Resposta para o front exibir a senha provisória
    return res.status(200).json({
      ok: true,
      user_id: auth_user_id,
      email,
      role,
      temp_password: tempPass,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro interno' })
  }
}
