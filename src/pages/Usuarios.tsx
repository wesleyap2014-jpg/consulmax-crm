// --- NOVA FUNÇÃO DE CADASTRO (ADMIN-ONLY) ---
// Apague a função antiga e cole esta no Usuarios.tsx

import { supabase } from '@/lib/supabaseClient';

function normalizePixType(t?: string | null) {
  if (!t) return null;
  const v = String(t).trim().toLowerCase();
  if (['telefone', 'celular', 'phone', 'fone'].includes(v)) return 'phone';
  if (['e-mail', 'email', 'mail'].includes(v)) return 'email';
  if (v === 'cpf') return 'cpf';
  return null; // não envia nada se for inválido
}

export async function cadastrarUsuarioViaAPI(form: any) {
  // 1) exige sessão válida
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    alert('Sua sessão expirou. Faça login novamente.');
    return;
  }

  // 2) payload (campos opcionais viram null)
  const payload = {
    email: (form?.email ?? '').toString().trim(),
    nome: (form?.nome ?? '').toString().trim(),
    role: (form?.role ?? 'viewer') as 'admin' | 'vendedor' | 'viewer',

    phone: form?.telefone ?? null,
    cep: form?.cep ?? null,
    logradouro: form?.logradouro ?? null,
    numero: form?.numero ?? null,
    bairro: form?.bairro ?? null,
    cidade: form?.cidade ?? null,
    uf: form?.uf ?? null,

    pix_type: normalizePixType(form?.pix_type) as 'cpf' | 'email' | 'phone' | null,
    pix_key: form?.pix_key ?? null,
  };

  if (!payload.email || !payload.nome) {
    alert('Preencha Nome e E-mail.');
    return;
  }

  // 3) chama o endpoint admin
  const res = await fetch('/api/users/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert('Erro ao criar usuário: ' + (out?.error || res.statusText));
    return;
  }

  alert(
    `Usuário criado com sucesso!
Senha temporária: ${out?.tempPassword || '(gerada)'}.
Um e-mail de redefinição de senha foi enviado ao usuário.`
  );
}
