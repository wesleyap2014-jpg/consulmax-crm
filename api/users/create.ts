// api/users/create.ts
import { createClient } from '@supabase/supabase-js';

type Body = {
  nome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
  role: 'admin' | 'vendedor' | 'viewer';
  endereco?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
  } | null;
  pixType?: 'cpf' | 'email' | 'celular' | 'aleatoria' | null;
  pixKey?: string | null;
  scopes?: string[];
};

async function findUserIdByEmail(
  supabaseUrl: string,
  serviceKey: string,
  email: string
): Promise<string | null> {
  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(
      email
    )}`;
    const resp = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    // API pode retornar { users: [...] } ou um array simples dependendo da versão
    const users =
      Array.isArray(json) ? json : Array.isArray(json?.users) ? json.users : [];
    const u = users[0];
    return u?.id ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL =
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const ENCRYPT_KEY = process.env.SUPABASE_PG_ENCRYPTION_KEY || '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res
        .status(500)
        .json({ error: 'Missing Supabase envs (URL/Service Role).' });
    }
    if (!ENCRYPT_KEY) {
      return res
        .status(500)
        .json({ error: 'Missing SUPABASE_PG_ENCRYPTION_KEY.' });
    }

    let body: Body;
    try {
      body =
        typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { nome, email, telefone, cpf, role, endereco, pixType, pixKey, scopes } =
      body;

    if (!nome || !email || !role) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: nome, email, role' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // senha provisória só quando criar de fato
    const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!';

    let userId: string | null = null;
    let reusedExisting = false;

    // tenta criar o usuário no Auth
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authErr) {
      // se já existe, tenta localizar o id por e-mail e reaproveitar
      if (/already been registered/i.test(authErr.message)) {
        const existingId = await findUserIdByEmail(SUPABASE_URL, SERVICE_KEY, email);
        if (!existingId) {
          return res.status(400).json({
            error:
              'E-mail já existe no Auth e não foi possível localizar o ID. Remova em Auth > Users ou use outro e-mail.',
          });
        }
        userId = existingId;
        reusedExisting = true;
      } else {
        return res.status(400).json({ error: authErr.message });
      }
    } else {
      userId = created?.user?.id ?? null;
    }

    if (!userId) {
      return res.status(500).json({ error: 'Falha ao obter id do usuário' });
    }

    const login = (email.split('@')[0] || '').replace(/\W/g, '');

    const { error: rpcErr } = await admin.rpc('create_user_profile', {
      p_auth_user_id: userId,
      p_nome: nome,
      p_email: email,
      p_login: login,
      p_role: role,
      p_scopes: Array.isArray(scopes) ? scopes : [],
      p_phone: telefone || null,
      p_cpf: cpf || null,
      p_cep: endereco?.cep || null,
      p_logradouro: endereco?.logradouro || null,
      p_numero: endereco?.numero || null,
      p_bairro: endereco?.bairro || null,
      p_cidade: endereco?.cidade || null,
      p_uf: endereco?.uf || null,
      p_pix_type: pixType || null,
      p_pix_key: pixKey || null,
      p_encrypt_key: ENCRYPT_KEY,
    });

    if (rpcErr) return res.status(400).json({ error: rpcErr.message });

    return res.status(200).json({
      ok: true,
      tempPassword: reusedExisting ? null : tempPassword,
      reusedExisting,
    });
  } catch (e: any) {
    console.error('create user error:', e);
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
