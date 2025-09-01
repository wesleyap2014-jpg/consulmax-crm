// /api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Variáveis (tanto faz se SUPABASE_URL ou VITE_SUPABASE_URL — usamos a que existir)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars ausentes. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Gera senha provisória
const alphabet =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
function tempPassword(len = 12) {
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { nome, email, role } = (req.body ?? {}) as {
      nome?: string;
      email?: string;
      role?: 'admin' | 'vendedor' | 'viewer';
    };

    if (!nome || !email || !role) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const password = tempPassword(12);

    // Cria o usuário no Auth (com e-mail já confirmado)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, role },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Se você tiver uma função RPC/insert do perfil, chame aqui.
    // Exemplo (opcional):
    // await admin.rpc('create_user_profile', { auth_user_id: data.user!.id, nome, email, role });

    return res.status(200).json({
      ok: true,
      userId: data.user?.id,
      tempPassword: password, // <— devolvemos a senha provisória aqui
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'server_error' });
  }
}
