// IMPORTS — mantenha exatamente assim no topo:
import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Função que cria o usuário via RPC (já normaliza pix_type/pix_key).
 * Você pode chamá-la de qualquer lugar da página.
 */
export async function cadastrarUsuario(form: any) {
  try {
    // 1) Validar e normalizar campos principais
    const email = (form?.email ?? '').toString().trim();
    if (!email) {
      alert('Preencha o e-mail do vendedor.');
      return;
    }

    // 2) Buscar auth_user_id pelo e-mail (RPC)
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

    const cpfNum  = (form?.cpf ?? '').toString().replace(/\D/g, '');
    const foneNum = (form?.telefone ?? '').toString().replace(/\D/g, '');
    const cepNum  = (form?.cep ?? '').toString().replace(/\D/g, '');

    let pix_key = (form?.pix_key ?? '').toString().trim();
    if (!pix_key) {
      if (pix_type === 'email')     pix_key = email;
      if (pix_type === 'cpf')       pix_key = cpfNum;
      if (pix_type === 'telefone')  pix_key = foneNum;
    }

    // 4) Chama a RPC que você criou no banco
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
      pix_type,     // 'cpf' | 'email' | 'telefone'
      pix_key,      // coerente com o tipo
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

/**
 * Componente de página (DEFAULT EXPORT) — exigido pelo router.
 * Form simples, funcional, com os campos necessários para a RPC.
 */
export default function Usuarios() {
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    pix_type: '',   // cpf | email | telefone
    pix_key: '',
    role: 'viewer', // admin | vendedor | viewer
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await cadastrarUsuario(form);
  };

  const wrapper: React.CSSProperties = {
    maxWidth: 720,
    margin: '24px auto',
    padding: 24,
    border: '1px solid #eee',
    borderRadius: 12,
    background: '#fff'
  };

  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const full: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr', gap: 12 };

  return (
    <div style={wrapper}>
      <h2>Novo Usuário (Vendedor)</h2>
      <form onSubmit={onSubmit}>
        <div style={row}>
          <label>Nome
            <input value={form.nome} onChange={set('nome')} placeholder="Nome completo"/>
          </label>
          <label>E-mail
            <input value={form.email} onChange={set('email')} placeholder="email@exemplo.com"/>
          </label>
        </div>

        <div style={row}>
          <label>Telefone
            <input value={form.telefone} onChange={set('telefone')} placeholder="(xx) 9xxxx-xxxx"/>
          </label>
          <label>CPF
            <input value={form.cpf} onChange={set('cpf')} placeholder="xxx.xxx.xxx-xx"/>
          </label>
        </div>

        <div style={row}>
          <label>CEP
            <input value={form.cep} onChange={set('cep')} placeholder="xxxxx-xxx"/>
          </label>
          <label>Número
            <input value={form.numero} onChange={set('numero')} placeholder="1234"/>
          </label>
        </div>

        <div style={row}>
          <label>Logradouro
            <input value={form.logradouro} onChange={set('logradouro')} placeholder="Rua/Av."/>
          </label>
          <label>Bairro
            <input value={form.bairro} onChange={set('bairro')} placeholder="Bairro"/>
          </label>
        </div>

        <div style={row}>
          <label>Cidade
            <input value={form.cidade} onChange={set('cidade')} placeholder="Cidade"/>
          </label>
          <label>UF
            <input value={form.uf} onChange={set('uf')} placeholder="UF" maxLength={2}/>
          </label>
        </div>

        <div style={row}>
          <label>Tipo da chave PIX
            <select value={form.pix_type} onChange={set('pix_type')}>
              <option value="">Selecione…</option>
              <option value="email">PIX por E-mail</option>
              <option value="cpf">PIX por CPF</option>
              <option value="telefone">PIX por Telefone</option>
            </select>
          </label>
          <label>Chave PIX (opcional — preenche automático)
            <input value={form.pix_key} onChange={set('pix_key')} placeholder="Deixe em branco para auto"/>
          </label>
        </div>

        <div style={full}>
          <label>Perfil (papel / role)
            <select value={form.role} onChange={set('role')}>
              <option value="viewer">Viewer</option>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button type="submit">Cadastrar</button>
        </div>
      </form>
    </div>
  );
}
