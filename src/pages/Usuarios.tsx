// IMPORT – deixe exatamente assim no topo:
import React from 'react';
import { supabase } from '@/lib/supabaseClient';

// Componente default que o router espera
export default function Usuarios() {
  // submit do formulário
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => (form.get(k)?.toString() ?? '').trim();

    // 1) validar e-mail
    const email = get('email');
    if (!email) {
      alert('Preencha o e-mail do vendedor.');
      return;
    }

    // 2) buscar o auth_user_id pelo e-mail (RPC existente no banco)
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

    // 3) criar o perfil do usuário com o uid retornado (RPC existente)
    const { error: createErr } = await supabase.rpc('create_user_profile', {
      auth_user_id: uid,
      // Dados pessoais
      nome: get('nome'),
      email,
      phone: get('telefone'),

      // Endereço
      cep: get('cep'),
      logradouro: get('logradouro'),
      numero: get('numero'),
      bairro: get('bairro'),
      cidade: get('cidade'),
      uf: get('uf'),

      // PIX
      pix_type: get('pix_type'), // 'cpf' | 'email' | 'telefone'
      pix_key: get('pix_key'),

      // Papel (ajuste conforme seu ENUM no banco)
      role: get('role') || 'viewer',
    });

    if (createErr) {
      alert('Erro ao criar usuário: ' + createErr.message);
      return;
    }

    alert('Usuário criado com sucesso!');
    e.currentTarget.reset();
  }

  // Form simples só para funcionar (sem libs adicionais)
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
      <input name="nome" placeholder="Nome completo" />
      <input name="email" type="email" placeholder="E-mail" />
      <input name="telefone" placeholder="Telefone (xx) 9xxxx-xxxx" />

      <input name="cep" placeholder="CEP xxxxx-xxx" />
      <input name="logradouro" placeholder="Logradouro" />
      <input name="numero" placeholder="Número (aceita S/N)" />
      <input name="bairro" placeholder="Bairro" />
      <input name="cidade" placeholder="Cidade" />
      <input name="uf" placeholder="UF" />

      <select name="pix_type" defaultValue="">
        <option value="">Tipo de chave PIX</option>
        <option value="cpf">CPF</option>
        <option value="email">E-mail</option>
        <option value="telefone">Telefone</option>
      </select>
      <input name="pix_key" placeholder="Chave PIX" />

      <select name="role" defaultValue="viewer">
        <option value="viewer">Viewer</option>
        <option value="vendedor">Vendedor</option>
        <option value="admin">Admin</option>
      </select>

      <button type="submit">Cadastrar</button>
    </form>
  );
}
