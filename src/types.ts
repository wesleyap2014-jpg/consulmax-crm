export type Role = 'admin'|'vendedor'|'viewer'

export type UserSafe = {
  id: string
  auth_user_id: string
  nome: string
  email: string
  telefone?: string
  login?: string
  role: Role
  scopes: string[]
  avatar_url?: string
  cpf?: string
  cep?: string; logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string
  must_change_password: boolean
  pix_kind?: 'cpf'|'email'|'celular'|'aleatoria'
  pix_key?: string
}
