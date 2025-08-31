// api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.VITE_SUPABASE_URL!,          // pública
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role (server only)
)

function tempPassword() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    'Aa1!'
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const b = req.body || {}

    // Campos mínimos
    const nome = String(b.nome || '')
    const email = String(b.email || '')
    const role = (b.role || 'viewer') as 'admin'|'vendedor'|'viewer'
    const telefone = b.telefone ? String(b.telefone) : null
    const cpf = b.cpf ? String(b.cpf) : null
    const endereco = b.endereco || {}
    const pixType = (b.pixType || 'email') as 'cpf'|'email'|'celular'|'aleatoria'
    let pixKey = b.pixKey ? String(b.pixKey) : null
    const scopes = Array.isArray(b.scopes) && b.scopes.length ? b.scopes : ['leads','oportunidades','usuarios']

    if (!nome || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' })

    // 1) cria usuário no Auth
    const password = tempPassword()
    const { data, error: authErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (authErr || !data?.user) return res.status(400).json({ error: authErr?.message || 'Falha ao criar no Auth' })
    const user = data.user

    // 2) pixKey automática se não veio
    if (!pixKey) {
      if (pixType === 'cpf' && cpf) pixKey = cpf.replace(/\D/g,'')
      if (pixType === 'email') pixKey = email
      if (pixType === 'celular' && telefone) pixKey = telefone.replace(/\D/g,'')
    }

    // 3) login tipo nome.sobrenome
    const login = nome.toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu,'')
      .replace(/\s+/g,'.')

    // 4) chama RPC para gravar o perfil (criptografa CPF e seta must_change_password=true)
    const { error: rpcErr } = await admin.rpc('create_user_profile', {
      p_auth_user_id: user.id,
      p_nome: nome,
      p_email: email,
      p_login: login,
      p_role: role,
      p_scopes: scopes,
      p_phone: telefone,
      p_cpf: cpf,
      p_cep: endereco.cep ?? null,
      p_logradouro: endereco.logradouro ?? null,
      p_numero: endereco.numero ?? null,
      p_bairro: endereco.bairro ?? null,
      p_cidade: endereco.cidade ?? null,
      p_uf: endereco.uf ?? null,
      p_pix_type: pixType,
      p_pix_key: pixKey
    })
    if (rpcErr) return res.status(400).json({ error: rpcErr.message })

    return res.status(200).json({ ok: true, tempPassword: password })
  } catch (e:any) {
    return res.status(400).json({ error: e.message })
  }
}
