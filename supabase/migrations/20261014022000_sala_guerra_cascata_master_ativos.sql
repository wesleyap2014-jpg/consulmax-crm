create or replace function public.sala_guerra_equipe()
returns table (id uuid, nome text, email text, user_role text)
language sql stable security definer
set search_path = ''
as $function$
 select u.id, u.nome, u.email, u.user_role
 from public.users u
 join public.users me on me.auth_user_id = auth.uid()
 left join public.units unidade_me on unidade_me.id = me.unit_id
 where u.is_active is true and me.is_active is true
 and (
  me.id = u.id
  or (me.user_role = 'admin' and unidade_me.tipo = 'matriz')
  or (me.hierarchy_level = 'gestor_filial' and me.unit_id is not null and me.unit_id = u.unit_id)
  or (me.user_role = 'admin' and coalesce(me.hierarchy_level, '') <> 'gestor_filial')
 )
 order by case when u.id=me.id then 0 else 1 end, u.nome;
$function$;
