alter table public.users
  add column if not exists last_crm_access_at timestamptz;

update public.users u
set last_crm_access_at = coalesce(u.last_crm_access_at, au.last_sign_in_at, u.created_at)
from auth.users au
where au.id = u.auth_user_id
  and u.last_crm_access_at is null;

create or replace function public.touch_crm_access()
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  update public.users
     set last_crm_access_at = v_now
   where auth_user_id = auth.uid()
     and coalesce(is_active, true) = true;

  if not found then
    raise exception 'Usuário ativo do CRM não encontrado.';
  end if;

  return v_now;
end;
$$;

revoke all on function public.touch_crm_access() from public;
revoke all on function public.touch_crm_access() from anon;
grant execute on function public.touch_crm_access() to authenticated;
