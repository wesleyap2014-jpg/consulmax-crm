// IMPORT – deixe exatamente assim no topo:
import { supabase } from '@/lib/supabaseClient';

// FUNÇÃO ÚNICA PARA CRIAR USUÁRIO (cole logo após os imports)
export async function cadastrarUsuario(form: any) {
  try {
    // 1) Validar / normalizar campos do formulário
    const email = (form?.email ?? '').trim();
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

    // 3) Criar o perfil do usuário com o uid retornado (RPC existente)
    const { error: createErr } = await supabase.rpc('create_user_profile', {
      auth_user_id: uid,

      // Dados pessoais / contato
      nome: (form?.nome ?? '').trim(),
      email,
      phone: (form?.telefone ?? '').trim(), // se seu schema usa "phone"

      // Endereço
      cep: (form?.cep ?? '').trim(),
      logradouro: (form?.logradouro ?? '').trim(),
      numero: (form?.numero ?? '').trim(),
      bairro: (form?.bairro ?? '').trim(),
      cidade: (form?.cidade ?? '').trim(),
      uf: (form?.uf ?? '').trim(),

      // Chave PIX (preenchida automaticamente conforme o tipo)
      // Tipos aceitos pelo seu schema: 'cpf' | 'email' | 'telefone'
      pix_type: form?.pix_type ?? null,
      pix_key: (form?.pix_key ?? '').trim(),

      // Papel do usuário (se seu banco usa ENUM, garanta que o valor é válido)
      role: form?.role ?? 'viewer',
    });

    if (createErr) {
      alert('Erro ao criar usuário: ' + createErr.message);
      return;
    }

    alert('Usuário criado com sucesso!');
  } catch (e: any) {
    console.error(e);
    alert('Falha inesperada ao criar usuário.');
  }
}
<Button onClick={handleSubmit(cadastrarUsuario)}>
  Cadastrar
</Button>
