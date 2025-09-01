// /api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// cliente admin (service role) – só na API
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// gera senha provisória forte
function tempPassword(len = 12) {
  const alphabet =
    'ABCDEFGHJKLMMNPRQSTUVWXYZabcdefghiijkmnopqrrstuvwxyz23456789!@#$%';
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nome, email, role } = (req.body ?? {}) as {
      nome?: string;
      email?: string;
      role?: 'admin' | 'vendedor' | 'viewer';
    };

    if (!nome || !email) {
      return res.status(400).json({ error: 'nome e email são obrigatórios' });
    }

    const tempPass = tempPassword();

    // cria usuário e já marca e-mail como confirmado
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPass,
      email_confirm: true, // <- evita "Email not confirmed"
      user_metadata: {
        nome,
        role: role ?? 'viewer',
        require_password_change: true, // força tela de troca de senha
      },
      app_metadata: {
        role: role ?? 'viewer',
      },
    });

    if (error) {
      return res
        .status(400)
        .json({ error: error.message || 'Falha ao criar usuário' });
    }

    return res.status(200).json({
      ok: true,
      user_id: data.user?.id,
      email,
      role: role ?? 'viewer',
      temp_password: tempPass, // o front exibe isso
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || 'Erro interno ao criar usuário' });
  }
}
