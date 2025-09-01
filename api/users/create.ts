// /api/users/create.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!; // precisa estar setado no Vercel

// client admin (service role)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function tmpPassword(len = 12) {
  const alphabet =
    'ABCDEFGHJKL MNOPQRSTUVWXZabcdef ghijkmnopqrstuvwxyz23456789!@#%*'
      .replace(/\s+/g, '');
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

// normaliza pix_type e pix_key
function normalizePix(type: any, key: any) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'cpf' || t === 'telefone' || t === 'email') {
    return { pix_type: t, pix_key: String(key || '').trim() || null };
  }
  // quando não informado corretamente, insere como NULL (passa no CHECK atualizado)
  return { pix_type: null, pix_key: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const {
      nome,
      email,
      telefone,
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      role,
      pix_type,
      pix_key,
    } = payload || {};

    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const userRole =
      role === 'admin' || role === 'vendedor' || role === 'viewer' ? role : 'viewer';

    // 1) cria usuário no Auth com senha temporária
    const password = tmpPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // marca como confirmado
      user_metadata: { must_reset_password: true },
      app_metadata: { role: userRole },
    });

    if (createErr || !created?.user?.id) {
      console.error('AUTH createUser error:', createErr);
      return res.status(400).json({
        error: 'Falha ao criar usuário no Auth',
        details: createErr?.message || createErr,
      });
    }

    const auth_user_id = created.user.id;

    // 2) normaliza PIX (evita cair no CHECK)
    const pix = normalizePix(pix_type, pix_key);

    // 3) insere direto na tabela public.users (service role ignora RLS)
    const { error: insertErr } = await admin.from('users').insert({
      auth_user_id,
      nome,
      email,
      phone: telefone || null,
      cep: cep || null,
      logradouro: logradouro || null,
      numero: numero || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
      pix_type: pix.pix_type,
      pix_key: pix.pix_key,
      role: userRole, // 'admin' | 'vendedor' | 'viewer'
    });

    if (insertErr) {
      console.error('DB insert error:', insertErr);
      // rollback do auth se der ruim no perfil
      await admin.auth.admin.deleteUser(auth_user_id).catch(() => {});
      return res.status(400).json({
        error: 'Falha ao criar perfil',
        details: insertErr.message || insertErr,
      });
    }

    // 4) opcional: gera link de recuperação para o admin enviar ao usuário
    // (mantemos aqui caso você queira exibir/usar depois)
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    return res.status(200).json({
      ok: true,
      auth_user_id,
      role: userRole,
      temp_password: password, // você pode exibir pro admin copiar, se quiser
      recovery_link: linkData?.properties?.action_link || null,
    });
  } catch (e: any) {
    console.error('UNEXPECTED:', e);
    // se a resposta não era JSON e o front chamar .json(), evite quebrar:
    return res.status(500).json({
      error: 'Server error',
      details: e?.message || String(e),
    });
  }
}
