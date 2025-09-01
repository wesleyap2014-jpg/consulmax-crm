// IMPORT – deixe exatamente assim
import React from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Função única de cadastro (cole este bloco após os imports).
 * - Normaliza e valida os campos
 * - Busca o auth_user_id pelo e-mail via RPC
 * - Cria o perfil via RPC
 * - Normaliza PIX: envia apenas 'cpf' | 'email' | 'telefone' ou NULL
 */
export async function cadastrarUsuario(form: any) {
  try {
    // 1) E-mail (obrigatório)
    const email = (form?.email ?? '').toString().trim();
    if (!email) {
      alert('Preencha o e-mail do vendedor.');
      return;
    }

    // 2) Busca auth_user_id pelo e-mail
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
    // Aceitos pelo banco: 'cpf' | 'email' | 'telefone'
    const rawPixType = (form?.pix_type ?? '')
      .toString()
      .trim()
      .toLowerCase();

    const pix_type =
      rawPixType.includes('cpf') ? 'cpf' :
      rawPixType.includes('email') || rawPixType.includes('e-mail') ? 'email' :
      rawPixType.includes('telefone') || rawPixType.includes('phone') ? 'telefone' :
      null; // envia NULL se vier algo diferente

    const pix_key = pix_type ? (form?.pix_key ?? '').toString().trim() : null;

    // 4) Demais campos (ajuste se necessário)
    const nome       = (form?.nome ?? '').toString().trim();
    const phone      = (form?.telefone ?? '').toString().trim(); // se o schema usa "phone"
    const cep        = (form?.cep ?? '').toString().trim();
    const logradouro = (form?.logradouro ?? '').toString().trim();
    const numero     = (form?.numero ?? '').toString().trim();
    const bairro     = (form?.bairro ?? '').toString().trim();
    const cidade     = (form?.cidade ?? '').toString().trim();
    const uf         = (form?.uf ?? '').toString().trim();

    // Papel do usuário (se for ENUM no banco, garanta que o valor é válido)
    const role       = (form?.role ?? 'viewer').toString().trim();

    // 5) Chama a RPC de criação do perfil
    const { error: createErr } = await supabase.rpc('create_user_profile', {
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
      pix_key,   // pode ser null
      pix_type,  // 'cpf' | 'email' | 'telefone' | null
      role,
    });

    if (createErr) {
      alert('Erro ao criar usuário: ' + createErr.message);
      return;
    }

    alert('Usuário criado com sucesso!');
  } catch (err: any) {
    console.error(err);
    alert('Falha inesperada ao criar usuário.');
  }
}
