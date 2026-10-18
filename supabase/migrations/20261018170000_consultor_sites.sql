create table if not exists public.consultor_sites (
 user_id uuid primary key references public.users(id) on delete cascade,
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 headline text not null default 'Planejamento inteligente para suas conquistas',
 sobre_mim text not null default '',
 especialidades text[] not null default array['Imóveis','Veículos','Agro','Planejamento patrimonial']::text[],
 whatsapp text,
 instagram text,
 linkedin text,
 publicado boolean not null default false,
 visualizacoes integer not null default 0,
 updated_at timestamptz not null default now()
);
create table if not exists public.consultor_site_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 lead_id uuid references public.leads(id),
 nome text not null,
 telefone text not null,
 objetivo text not null,
 valor_desejado numeric,
 origem_pagina text not null,
 created_at timestamptz not null default now()
);
create index if not exists consultor_site_submissions_owner_idx on public.consultor_site_submissions(user_id,created_at desc);
alter table public.consultor_sites enable row level security;
alter table public.consultor_site_submissions enable row level security;
revoke all on public.consultor_sites from anon,authenticated;
revoke all on public.consultor_site_submissions from anon,authenticated;