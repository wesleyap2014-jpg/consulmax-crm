// api/users/create.ts (apenas trechos relevantes)

const ENCRYPT_KEY = process.env.SUPABASE_PG_ENCRYPTION_KEY!;

// ...

const { error: rpcErr } = await admin.rpc('create_user_profile', {
  p_auth_user_id: user.id,
  p_nome: nome,
  p_email: email,
  p_login: login,
  p_role: role,
  p_scopes: scopes,
  p_phone: telefone,
  p_cpf: cpf,
  p_cep: endereco.cep ?? null,
  p_logradouro: endereco.logradouro ?? null,
  p_numero: endereco.numero ?? null,
  p_bairro: endereco.bairro ?? null,
  p_cidade: endereco.cidade ?? null,
  p_uf: endereco.uf ?? null,
  p_pix_type: pixType,
  p_pix_key: pixKey,
  // 🔐 envia a chave junto para a RPC
  p_encrypt_key: ENCRYPT_KEY
});
