create or replace function public.agenda_internal_invite_directory()
returns table (
  auth_user_id uuid,
  nome text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.auth_user_id, u.nome, u.email
  from public.users u
  where coalesce(u.is_active, true) = true
    and u.auth_user_id is not null
    and nullif(trim(u.email), '') is not null
  order by u.nome nulls last, u.email;
$$;

revoke all on function public.agenda_internal_invite_directory() from public;
grant execute on function public.agenda_internal_invite_directory() to authenticated;
