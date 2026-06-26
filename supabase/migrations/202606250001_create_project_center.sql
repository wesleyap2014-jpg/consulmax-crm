-- Central de Projetos Consulmax
-- Estrutura: Projeto -> Fases -> Projetos da Fase -> Checklists -> Tarefas

create extension if not exists "pgcrypto";

-- =========================================================
-- Helpers
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1) Projetos estratégicos
-- =========================================================
create table if not exists public.project_center_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  objective text,
  description text,
  area text,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text,
  status text not null default 'planejamento' check (status in ('planejamento','andamento','aguardando','pausado','concluido','cancelado')),
  priority text not null default 'media' check (priority in ('baixa','media','alta','critica')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_center_projects_status on public.project_center_projects(status);
create index if not exists idx_project_center_projects_owner on public.project_center_projects(owner_id);
create index if not exists idx_project_center_projects_created_by on public.project_center_projects(created_by);

create trigger trg_project_center_projects_updated_at
before update on public.project_center_projects
for each row execute function public.set_updated_at();

-- =========================================================
-- 2) Fases criadas por projeto
-- Cada projeto pode ter fases próprias: Planejamento, Jurídico,
-- Materiais, Implantação, Operação etc.
-- =========================================================
create table if not exists public.project_center_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_center_projects(id) on delete cascade,
  title text not null,
  objective text,
  sort_order integer not null default 100,
  status text not null default 'planejamento' check (status in ('planejamento','andamento','aguardando','pausado','concluido','cancelado')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_center_phases_project on public.project_center_phases(project_id);
create index if not exists idx_project_center_phases_order on public.project_center_phases(project_id, sort_order);

create trigger trg_project_center_phases_updated_at
before update on public.project_center_phases
for each row execute function public.set_updated_at();

-- =========================================================
-- 3) Projetos dentro de cada fase
-- Exemplo: Fase Planejamento -> Diagnóstico, Segmentação,
-- Estrutura do Programa, Plano de Comissão, KPIs etc.
-- =========================================================
create table if not exists public.project_center_phase_projects (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.project_center_phases(id) on delete cascade,
  title text not null,
  description text,
  expected_result text,
  responsible_id uuid references auth.users(id) on delete set null,
  responsible_name text,
  status text not null default 'planejamento' check (status in ('planejamento','andamento','aguardando','pausado','concluido','cancelado')),
  priority text not null default 'media' check (priority in ('baixa','media','alta','critica')),
  sort_order integer not null default 100,
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_center_phase_projects_phase on public.project_center_phase_projects(phase_id);
create index if not exists idx_project_center_phase_projects_status on public.project_center_phase_projects(status);
create index if not exists idx_project_center_phase_projects_responsible on public.project_center_phase_projects(responsible_id);

create trigger trg_project_center_phase_projects_updated_at
before update on public.project_center_phase_projects
for each row execute function public.set_updated_at();

-- =========================================================
-- 4) Checklists de cada projeto da fase
-- =========================================================
create table if not exists public.project_center_checklists (
  id uuid primary key default gen_random_uuid(),
  phase_project_id uuid not null references public.project_center_phase_projects(id) on delete cascade,
  title text not null default 'Checklist',
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_center_checklists_phase_project on public.project_center_checklists(phase_project_id);

create trigger trg_project_center_checklists_updated_at
before update on public.project_center_checklists
for each row execute function public.set_updated_at();

-- =========================================================
-- 5) Tarefas dentro do checklist
-- Cada tarefa é a breve descrição do que precisa ser feito.
-- =========================================================
create table if not exists public.project_center_tasks (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.project_center_checklists(id) on delete cascade,
  title text not null,
  description text,
  is_done boolean not null default false,
  responsible_id uuid references auth.users(id) on delete set null,
  responsible_name text,
  priority text not null default 'media' check (priority in ('baixa','media','alta','critica')),
  sort_order integer not null default 100,
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_center_tasks_checklist on public.project_center_tasks(checklist_id);
create index if not exists idx_project_center_tasks_done on public.project_center_tasks(is_done);
create index if not exists idx_project_center_tasks_due_date on public.project_center_tasks(due_date);
create index if not exists idx_project_center_tasks_responsible on public.project_center_tasks(responsible_id);

create trigger trg_project_center_tasks_updated_at
before update on public.project_center_tasks
for each row execute function public.set_updated_at();

-- =========================================================
-- 6) Comentários / histórico manual
-- =========================================================
create table if not exists public.project_center_comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project','phase','phase_project','checklist','task')),
  entity_id uuid not null,
  comment text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_center_comments_entity on public.project_center_comments(entity_type, entity_id);
create index if not exists idx_project_center_comments_created_by on public.project_center_comments(created_by);

-- =========================================================
-- 7) Arquivos / links vinculados
-- Pode guardar URL de Drive, PDF, contrato, apresentação, vídeo etc.
-- =========================================================
create table if not exists public.project_center_files (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project','phase','phase_project','checklist','task')),
  entity_id uuid not null,
  title text not null,
  url text,
  file_path text,
  mime_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_center_files_entity on public.project_center_files(entity_type, entity_id);
create index if not exists idx_project_center_files_created_by on public.project_center_files(created_by);

-- =========================================================
-- 8) Dependências entre projetos/tarefas
-- Exemplo: Manual depende da Estrutura do Programa.
-- =========================================================
create table if not exists public.project_center_dependencies (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('phase_project','task')),
  entity_id uuid not null,
  depends_on_entity_type text not null check (depends_on_entity_type in ('phase_project','task')),
  depends_on_entity_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_center_dependencies_not_self check (
    not (entity_type = depends_on_entity_type and entity_id = depends_on_entity_id)
  )
);

create index if not exists idx_project_center_dependencies_entity on public.project_center_dependencies(entity_type, entity_id);
create index if not exists idx_project_center_dependencies_depends_on on public.project_center_dependencies(depends_on_entity_type, depends_on_entity_id);

-- =========================================================
-- 9) RLS
-- Primeira versão: usuários autenticados podem ler e gerenciar.
-- Depois evoluímos para permissões por perfil/unidade/responsável.
-- =========================================================
alter table public.project_center_projects enable row level security;
alter table public.project_center_phases enable row level security;
alter table public.project_center_phase_projects enable row level security;
alter table public.project_center_checklists enable row level security;
alter table public.project_center_tasks enable row level security;
alter table public.project_center_comments enable row level security;
alter table public.project_center_files enable row level security;
alter table public.project_center_dependencies enable row level security;

drop policy if exists "project_center_projects_auth_all" on public.project_center_projects;
create policy "project_center_projects_auth_all" on public.project_center_projects
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_phases_auth_all" on public.project_center_phases;
create policy "project_center_phases_auth_all" on public.project_center_phases
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_phase_projects_auth_all" on public.project_center_phase_projects;
create policy "project_center_phase_projects_auth_all" on public.project_center_phase_projects
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_checklists_auth_all" on public.project_center_checklists;
create policy "project_center_checklists_auth_all" on public.project_center_checklists
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_tasks_auth_all" on public.project_center_tasks;
create policy "project_center_tasks_auth_all" on public.project_center_tasks
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_comments_auth_all" on public.project_center_comments;
create policy "project_center_comments_auth_all" on public.project_center_comments
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_files_auth_all" on public.project_center_files;
create policy "project_center_files_auth_all" on public.project_center_files
for all to authenticated
using (true)
with check (true);

drop policy if exists "project_center_dependencies_auth_all" on public.project_center_dependencies;
create policy "project_center_dependencies_auth_all" on public.project_center_dependencies
for all to authenticated
using (true)
with check (true);

-- =========================================================
-- 10) View de progresso por projeto da fase
-- =========================================================
create or replace view public.project_center_phase_project_progress as
select
  pp.id as phase_project_id,
  pp.phase_id,
  pp.title,
  count(t.id)::int as total_tasks,
  count(t.id) filter (where t.is_done)::int as done_tasks,
  case
    when count(t.id) = 0 then 0
    else round((count(t.id) filter (where t.is_done)::numeric / count(t.id)::numeric) * 100)::int
  end as progress_percent
from public.project_center_phase_projects pp
left join public.project_center_checklists c on c.phase_project_id = pp.id
left join public.project_center_tasks t on t.checklist_id = c.id
group by pp.id, pp.phase_id, pp.title;

-- =========================================================
-- 11) View de progresso por projeto estratégico
-- =========================================================
create or replace view public.project_center_project_progress as
select
  p.id as project_id,
  p.title,
  count(distinct ph.id)::int as total_phases,
  count(distinct pp.id)::int as total_phase_projects,
  count(t.id)::int as total_tasks,
  count(t.id) filter (where t.is_done)::int as done_tasks,
  case
    when count(t.id) = 0 then 0
    else round((count(t.id) filter (where t.is_done)::numeric / count(t.id)::numeric) * 100)::int
  end as progress_percent,
  count(pp.id) filter (where pp.due_date is not null and pp.due_date < current_date and pp.status <> 'concluido')::int as delayed_phase_projects,
  count(t.id) filter (where t.due_date is not null and t.due_date < current_date and t.is_done = false)::int as delayed_tasks
from public.project_center_projects p
left join public.project_center_phases ph on ph.project_id = p.id
left join public.project_center_phase_projects pp on pp.phase_id = ph.id
left join public.project_center_checklists c on c.phase_project_id = pp.id
left join public.project_center_tasks t on t.checklist_id = c.id
group by p.id, p.title;
