create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists supabase_vault;

create or replace function app_get_key() returns text
language sql security definer as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pg_encryption_key' limit 1;
$$;

create or replace function encrypt_text(p_text text) returns bytea
language plpgsql security definer as $$
declare k text;
begin
  select app_get_key() into k;
  if k is null then
    raise exception 'Chave de criptografia ausente no Vault';
  end if;
  return pgp_sym_encrypt(p_text, k, 'compress-algo=1, cipher-algo=aes256');
end;
$$;

create or replace function decrypt_text(p_data bytea) returns text
language plpgsql security definer as $$
declare k text;
begin
  if p_data is null then return null; end if;
  select app_get_key() into k;
  if k is null then
    raise exception 'Chave de criptografia ausente no Vault';
  end if;
  return pgp_sym_decrypt(p_data, k);
end;
$$;

create or replace function mask_cpf(p_cpf text) returns text
language plpgsql immutable as $$
begin
  if p_cpf is null then return null; end if;
  return substring(p_cpf from 1 for 3) || '.***.***-' || substring(p_cpf from 12 for 2);
end;
$$;

create type user_role as enum ('admin','vendedor','viewer');
create type estagio_oportunidade as enum ('Novo','Qualificação','Proposta','Negociação','Convertido','Perdido');
create type pix_type as enum ('cpf','email','celular','aleatoria');

create table public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  cpf_encrypted bytea,
  email text not null,
  telefone text,
  cep text, logradouro text, numero text, bairro text, cidade text, uf text,
  login text unique,
  avatar_url text,
  role user_role not null default 'viewer',
  scopes text[] default array[]::text[],
  must_change_password boolean not null default true,
  pix_kind pix_type,
  pix_key text,
  created_at timestamptz default now()
);

create index on public.users(role);

create or replace view public.users_safe as
select
  u.*,
  case
    when auth.uid() = u.auth_user_id then mask_cpf(decrypt_text(u.cpf_encrypted))
    when exists (select 1 from public.users uu where uu.auth_user_id = auth.uid() and uu.role = 'admin') then decrypt_text(u.cpf_encrypted)
    else mask_cpf(decrypt_text(u.cpf_encrypted))
  end as cpf
from public.users u;

create table public.leads (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  telefone text,
  email text,
  origem text,
  descricao text,
  owner_id uuid not null references public.users(auth_user_id) on delete set null,
  created_at timestamptz default now()
);
create index on public.leads(owner_id);

create table public.oportunidades (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  vendedor_id uuid not null references public.users(auth_user_id) on delete set null,
  origem text,
  segmento text check (segmento in ('Automóvel','Imóvel','Motocicleta','Serviços','Pesados','Imóvel Estendido')),
  valor_credito numeric(14,2),
  observacao text,
  score int check (score between 1 and 5),
  estagio estagio_oportunidade not null default 'Novo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.oportunidades(vendedor_id);
create index on public.oportunidades(estagio);

create table public.simulacoes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  grupo text,
  indice_correcao text check (indice_correcao in ('INCC','IPCA')),
  config_plano jsonb,
  config_credito jsonb,
  outputs jsonb,
  created_at timestamptz default now()
);

create table public.lances (
  id uuid primary key default uuid_generate_v4(),
  simulacao_id uuid not null references public.simulacoes(id) on delete cascade,
  lance_ofertado_percent numeric(7,4),
  lance_embutido_percent numeric(5,4) check (lance_embutido_percent <= 25.0000),
  parcela_contemplacao int,
  outputs jsonb,
  created_at timestamptz default now()
);

create table public.propostas (
  id uuid primary key default uuid_generate_v4(),
  simulacao_id uuid references public.simulacoes(id) on delete set null,
  tipo text check (tipo in ('Direcionada','Alavancagem Financeira','Alavancagem Patrimonial','Previdência Aplicada','Crédito com Correção','Extrato')),
  payload jsonb,
  pdf_url text,
  status text,
  created_at timestamptz default now()
);

create table public.vendas (
  id uuid primary key default uuid_generate_v4(),
  data_venda date not null check (data_venda <= current_date),
  vendedor_id uuid not null references public.users(auth_user_id),
  segmento text,
  tabela text,
  administradora text,
  forma_venda text,
  numero_proposta text,
  cliente_lead_id uuid references public.leads(id),
  cpf_cnpj bytea,
  nascimento date,
  telefone text,
  valor_venda numeric(14,2),
  descricao text,
  status_inicial text default 'a_encarteirar',
  created_at timestamptz default now()
);

create table public.carteira_itens (
  id uuid primary key default uuid_generate_v4(),
  venda_id uuid references public.vendas(id) on delete cascade,
  status text check (status in ('A_Encarteirar','Aguardando_Cota','Em_Carteira','Cancelado')),
  grupo text, cota text, cota_referencia text,
  vencimento date, sorteio text, assembleia date, data_contemplacao date,
  created_at timestamptz default now()
);

create table public.gestao_grupos (
  id uuid primary key default uuid_generate_v4(),
  segmento text,
  grupo text,
  administradora text,
  participantes int,
  vencimento int,
  sorteio text,
  assembleia date,
  referencia text,
  data_ultima_assembleia date,
  lance_fixo_25 jsonb,
  lance_fixo_50 jsonb,
  lance_livre jsonb
);

create table public.comissoes (
  id uuid primary key default uuid_generate_v4(),
  venda_id uuid references public.vendas(id) on delete set null,
  vendedor_id uuid references public.users(auth_user_id) on delete set null,
  tabela text, grupo text, cota text, cliente text,
  valor_base numeric(14,2),
  percentual_comissao numeric(6,4),
  fluxo text,
  estorno_percentual numeric(6,4),
  recibo_pdf_url text,
  created_at timestamptz default now()
);

create table public.comissoes_parcelas (
  id uuid primary key default uuid_generate_v4(),
  comissao_id uuid references public.comissoes(id) on delete cascade,
  num_parcela int,
  valor_bruto numeric(14,2),
  imposto_percent numeric(5,2),
  valor_liquido numeric(14,2),
  data_pagamento date
);

create table public.suporte_mensagens (
  id uuid primary key default uuid_generate_v4(),
  canal text default 'geral',
  author_id uuid references public.users(auth_user_id) on delete set null,
  content text not null,
  attachments jsonb,
  created_at timestamptz default now()
);

create table public.consents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(auth_user_id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip text
);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz default now(),
  actor uuid,
  action text,
  table_name text,
  row_id uuid,
  details jsonb
);

create or replace function log_audit() returns trigger
language plpgsql as $$
begin
  insert into public.audit_log(actor, action, table_name, row_id, details)
  values (auth.uid(), tg_op, tg_table_name, coalesce(NEW.id, OLD.id), to_jsonb(coalesce(NEW, OLD)));
  return coalesce(NEW, OLD);
end;
$$;

create trigger tg_leads_audit after insert or update or delete on public.leads
for each row execute function log_audit();
create trigger tg_oportunidades_audit after insert or update or delete on public.oportunidades
for each row execute function log_audit();

insert into storage.buckets (id, name, public) values
  ('propostas','propostas', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values
  ('recibos','recibos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true) on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.leads enable row level security;
alter table public.oportunidades enable row level security;
alter table public.simulacoes enable row level security;
alter table public.lances enable row level security;
alter table public.propostas enable row level security;
alter table public.vendas enable row level security;
alter table public.carteira_itens enable row level security;
alter table public.gestao_grupos enable row level security;
alter table public.comissoes enable row level security;
alter table public.comissoes_parcelas enable row level security;
alter table public.suporte_mensagens enable row level security;
alter table public.consents enable row level security;
alter table public.audit_log enable row level security;

create or replace function is_admin() returns boolean
language sql stable as $$
  select exists(
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin'
  );
$$;

create policy "users self or admin read"
on public.users for select
to authenticated
using (
  auth.uid() = auth_user_id or is_admin()
);

create policy "users admin insert"
on public.users for insert
to authenticated
with check ( is_admin() );

create policy "users admin update"
on public.users for update
to authenticated
using ( is_admin() )
with check ( is_admin() );

create policy "leads owner read"
on public.leads for select
to authenticated
using ( owner_id = auth.uid() or is_admin() );

create policy "leads owner insert"
on public.leads for insert
to authenticated
with check ( owner_id = auth.uid() or is_admin() );

create policy "leads owner update"
on public.leads for update
to authenticated
using ( owner_id = auth.uid() or is_admin() )
with check ( owner_id = auth.uid() or is_admin() );

create policy "leads owner delete"
on public.leads for delete
to authenticated
using ( owner_id = auth.uid() or is_admin() );

create policy "opps vendedor scope"
on public.oportunidades for select
to authenticated
using ( vendedor_id = auth.uid() or is_admin() );

create policy "opps insert vendedor or admin"
on public.oportunidades for insert
to authenticated
with check ( vendedor_id = auth.uid() or is_admin() );

create policy "opps update vendedor or admin"
on public.oportunidades for update
to authenticated
using ( vendedor_id = auth.uid() or is_admin() )
with check ( vendedor_id = auth.uid() or is_admin() );

create policy "consents self"
on public.consents for all
to authenticated
using ( user_id = auth.uid() or is_admin() )
with check ( user_id = auth.uid() or is_admin() );

create policy "suporte read all auth"
on public.suporte_mensagens for select
to authenticated
using ( true );

create policy "suporte write self"
on public.suporte_mensagens for insert
to authenticated
with check ( author_id = auth.uid() );

create policy "Avatars public read"
on storage.objects for select to public
using ( bucket_id = 'avatars' );

create policy "Avatars owner write"
on storage.objects for insert to authenticated
with check ( bucket_id = 'avatars' and owner = auth.uid() );

create policy "Propostas private read"
on storage.objects for select to authenticated
using ( bucket_id = 'propostas' and ( is_admin() or owner = auth.uid() ) );

create policy "Propostas private write"
on storage.objects for insert to authenticated
with check ( bucket_id = 'propostas' and ( is_admin() or owner = auth.uid() ) );

create policy "Recibos private read"
on storage.objects for select to authenticated
using ( bucket_id = 'recibos' and ( is_admin() or owner = auth.uid() ) );

create policy "Recibos private write"
on storage.objects for insert to authenticated
with check ( bucket_id = 'recibos' and ( is_admin() or owner = auth.uid() ) );
