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

// OBS: não importamos tipos do '@vercel/node' para evitar problemas de build.
// A Vercel compila TS automaticamente e injeta req/res.

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1) Ler envs de forma tolerante (alguns projetos usam NEXT_PUBLIC_ ou SUPABASE_URL)
    const SUPABASE_URL =
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '';

    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const ENCRYPT_KEY = process.env.SUPABASE_PG_ENCRYPTION_KEY || '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        error:
          'Missing Supabase envs. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
      });
    }
    if (!ENCRYPT_KEY) {
      return res.status(500).json({
        error: 'Missing SUPABASE_PG_ENCRYPTION_KEY in Vercel.',
      });
    }

    // 2) Parse seguro do body (às vezes req.body chega como string)
    let body: Body;
    try {
      body =
        typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e: any) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { nome, email, telefone, cpf, role, endereco, pixType, pixKey, scopes } = body;

    if (!nome || !email || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, role' });
    }

    // 3) Criar cliente admin só depois de validar envs
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // senha provisória
    const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!';

    // 4) Criar usuário no Auth
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authErr) return res.status(400).json({ error: authErr.message });

    const userId = created?.user?.id;
    if (!userId) return res.status(500).json({ error: 'Falha ao obter id do usuário' });

    // 5) Chamar RPC para gravar perfil (com CPF criptografado)
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

    return res.status(200).json({ ok: true, tempPassword });
  } catch (e: any) {
    // Isso vai aparecer nos logs da Vercel (Functions)
    console.error('create user error:', e);
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
