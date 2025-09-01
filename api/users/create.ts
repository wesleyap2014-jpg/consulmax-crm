// api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function tempPassword(len = 12) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const nome = (body?.nome || '').trim();
    const email = (body?.email || '').trim().toLowerCase();
    const role = (body?.role || 'viewer').trim();

    if (!nome || !email) {
      return res.status(400).json({ error: 'nome e email são obrigatórios' });
    }

    const password = tempPassword();

    // cria usuário no Auth
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { nome, role },
      app_metadata: { role },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // (opcional) upsert no seu perfil público
    await admin.from('users').upsert({
      auth_user_id: data.user?.id,
      nome,
      email,
      role,
    });

    // devolve a senha para o frontend exibir
    return res.status(200).json({ ok: true, password });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || String(err) || 'Server error' });
  }
}
