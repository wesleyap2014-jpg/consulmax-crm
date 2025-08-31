// ... imports
import { supabase } from '../lib/supabaseClient';

// dentro do submit/handler do cadastro:
const email = form.email.trim();

// 1) busca o auth_user_id pelo e-mail via RPC
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

// 2) agora chame sua função de criação de perfil com o uid retornado
//    (exemplo; ajuste os nomes dos campos para os da sua função atual)
const { error: createErr } = await supabase.rpc('create_user_profile', {
  auth_user_id: uid,
  nome: form.nome,
  email: email,
  phone: form.telefone,     // se seu schema usa "phone"
  cep: form.cep,
  logradouro: form.logradouro,
  numero: form.numero,
  bairro: form.bairro,
  cidade: form.cidade,
  uf: form.uf,
  pix_type: form.pix_type,  // 'cpf' | 'email' | 'telefone'
  pix_key: form.pix_key,
  role: form.role,          // se o campo já for ENUM no banco, verifique o valor
  // ...demais campos conforme sua função SQL
});

if (createErr) {
  alert('Erro ao criar usuário: ' + createErr.message);
  return;
}

alert('Usuário criado com sucesso!');
