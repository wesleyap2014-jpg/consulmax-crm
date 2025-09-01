// IMPORT – deixe exatamente assim no topo:
import React from 'react';
import { supabase } from '@/lib/supabaseClient';

// --- FUNÇÃO ÚNICA PARA CRIAR USUÁRIO (cole esse bloco após os imports) ---
export async function cadastrarUsuario(form: any) {
  try {
    // 1) Validar / normalizar campos do formulário
    const email = (form?.email ?? '').toString().trim();
    if (!email) {
      alert('Preencha o e-mail do vendedor.');
      return;
    }

    // 2) Buscar o auth_user_id pelo e-mail (RPC existente no banco)
    const { data: uid, error: uidErr } = await supabase
      .rpc('get_auth_user_id_by_email', { p_email: email });

    if (uidErr) {
      alert('Erro ao buscar usuário no Auth: ' + uidErr.message);
      return;
    }
    if (!uid) {
      alert('Este e-mail ainda não aceitou o convite (Auth > Users).');
      return;
    }

    // 3) Normalização de PIX (tipo e chave)
    const rawPixType = (form?.pix_type ?? '')
      .toString()
      .trim()
      .toLowerCase();

    let pix_type: 'cpf' | 'email' | 'telefone' | null = null;
    if (['cpf', 'email', 'telefone'].includes(rawPixType)) {
      pix_type = rawPixType as any;
    } else if (rawPixType.includes('cpf')) {
      pix_type = 'cpf';
    } else if (rawPixType.includes('mail') || rawPixType.includes('e-mail')) {
      pix_type = 'email';
    } else if (
      rawPixType.includes('tel') ||
      rawPixType.includes('phone') ||
      rawPixType.includes('cel')
    ) {
      pix_type = 'telefone';
    }

    // Normaliza documentos / números
    const cpfNum  = (form?.cpf ?? '').toString().replace(/\D/g, '');
    const foneNum = (form?.telefone ?? '').toString().replace(/\D/g, '');
    const cepNum  = (form?.cep ?? '').toString().replace(/\D/g, '');

    // Se a chave não for informada, preenche automaticamente conforme o tipo
    let pix_key = (form?.pix_key ?? '').toString().trim();
    if (!pix_key) {
      if (pix_type === 'email')     pix_key = email;
      if (pix_type === 'cpf')       pix_key = cpfNum;
      if (pix_type === 'telefone')  pix_key = foneNum;
    }

    // 4) Chama a RPC para criar o perfil
    const { error: createErr } = await supabase.rpc('create_user_profile', {
      auth_user_id: uid,
      nome:        (form?.nome ?? '').toString().trim(),
      email,
      phone:       foneNum,
      cep:         cepNum,
      logradouro:  (form?.logradouro ?? '').toString().trim(),
      numero:      (form?.numero ?? '').toString().trim(),
      bairro:      (form?.bairro ?? '').toString().trim(),
      cidade:      (form?.cidade ?? '').toString().trim(),
      uf:          (form?.uf ?? '').toString().trim().slice(0, 2).toUpperCase(),
      pix_type,          // => 'cpf' | 'email' | 'telefone'
      pix_key,           // => chave coerente com o tipo
      role: (form?.role ?? 'viewer').toString().trim().toLowerCase() // 'admin' | 'vendedor' | 'viewer'
    });

    if (createErr) {
      alert('Erro ao criar usuário: ' + createErr.message);
      return;
    }

    alert('Usuário criado com sucesso!');
  } catch (e) {
    console.error(e);
    alert('Falha inesperada ao criar usuário.');
  }
}
