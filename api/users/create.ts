// api/users/create.ts  (substitua tudo por este conteúdo)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// VARS DE SERVIDOR (definidas no Vercel → Project Settings → Environment Variables)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client ADMIN (service role) — NUNCA usar no browser
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Senha temporária simples (só para primeira vez)
function tempPassword(len = 12) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefhijkmnoprstuvwxy23456789!@#$%';
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Verifica se quem chamou é ADMIN (precisa enviar o Bearer token do usuário logado)
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const { data: roleRow, error: roleErr } = await admin
    .from('users')
    .select('role')
    .eq('auth_user_id', me.user.id)
    .single();

  if (roleErr || !roleRow || roleRow.role !== 'admin') {
    return res.status(403).json({ error: 'Only ADMIN can create users' });
  }

  // 2) Dados do novo usuário (enviados pelo CRM)
  const {
    email,
    nome,
    role = 'viewer', // 'admin' | 'vendedor' | 'viewer' (ajuste aos seus enums)
    phone,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    uf,
    pix_type,
    pix_key,
  } = req.body ?? {};

  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

  // 3) Cria usuário no Auth com senha temporária e marca para troca
  const password = tempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // já confirma o e-mail
    user_metadata: { require_password_update: true }, // sua UI pode checar isso para forçar troca
  });

  if (createErr) {
    return res.status(400).json({ error: createErr.message });
  }

  // 4) Envia e-mail de "definir nova senha" (link de recuperação)
  await admin.auth.admin.generateLink({ type: 'recovery', email });

  // 5) (Opcional) cria/atualiza o perfil na sua tabela "users" via upsert (ou chame sua RPC)
  // Aqui uso upsert direto porque você já tem política/estruturas prontas:
  await admin
    .from('users')
    .upsert(
      {
        auth_user_id: created.user!.id,
        nome,
        email,
        phone,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        uf,
        pix_type,
        pix_key,
        role,
      },
      { onConflict: 'auth_user_id' }
    );

  // Retorna OK + a senha temporária (se quiser exibir para o admin)
  return res.status(200).json({ ok: true, tempPassword: password });
}
