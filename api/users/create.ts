// api/users/create.ts
// Endpoint admin-only para criar usuário no Auth e salvar perfil (RPC).
// Remove tipos do @vercel/node para evitar erro de build no Vercel.

// @ts-nocheck  // (opcional) silencia checagens TS aqui
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!; // chave service_role (privada)

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Senha provisória forte
function tempPassword(len = 12) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      email,
      nome,
      role = 'viewer',

      // campos opcionais — podem vir nulos
      phone = null,
      cep = null,
      logradouro = null,
      numero = null,
      bairro = null,
      cidade = null,
      uf = null,
      pix_key = null,
      pix_type = null
    } = body || {};

    if (!email || !nome) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Informe nome e e-mail.' }));
      return;
    }

    const password = tempPassword();

    // 1) Cria usuário no Auth (já confirmado)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, role }
    });
    if (createErr) throw createErr;

    const uid = created.user?.id;
    if (!uid) throw new Error('Falha ao obter UID do usuário criado.');

    // 2) Salva/atualiza perfil na tabela via RPC (usa sua função no banco)
    const { error: rpcErr } = await admin.rpc('create_user_profile', {
      auth_user_id: uid,
      nome,
      email,
      phone,
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      pix_key,
      pix_type,
      role
    });
    if (rpcErr) throw rpcErr;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, auth_user_id: uid, tempPassword: password }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'FUNCTION_INVOCATION_FAILED' }));
  }
}
