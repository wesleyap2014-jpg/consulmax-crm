begin;

create or replace function public.return_commission_to_sale(
  p_batch_id uuid,
  p_venda_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_batch_venda_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select u.id
    into v_profile_id
  from public.users u
  where u.auth_user_id = v_auth_user_id
    and lower(coalesce(u.role::text, '')) = 'admin'
    and coalesce(u.is_active, true) = true
  limit 1;

  if v_profile_id is null then
    raise exception 'Somente administradores podem retornar comissões.' using errcode = '42501';
  end if;

  select b.venda_id
    into v_batch_venda_id
  from public.commission_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'already_returned', true,
      'venda_id', p_venda_id
    );
  end if;

  if v_batch_venda_id is distinct from p_venda_id then
    raise exception 'O lote informado não pertence a essa venda.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.commission_entry_flow f
    where f.batch_id = p_batch_id
      and coalesce(f.valor_pago, 0) > 0
  ) then
    raise exception 'Esta comissão já possui parcela paga. Use Lançar Estorno no fluxo de pagamento.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.commission_adjustments a
    where a.batch_id = p_batch_id
  ) then
    raise exception 'Esta comissão possui histórico de estorno e não pode retornar para Nova venda.' using errcode = 'P0001';
  end if;

  delete from public.commission_entry_flow
  where batch_id = p_batch_id;

  delete from public.commission_entries
  where batch_id = p_batch_id;

  delete from public.commission_batches
  where id = p_batch_id
    and venda_id = p_venda_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'venda_id', p_venda_id
    );
  end if;

  raise exception 'A comissão não foi removida.' using errcode = 'P0001';
end;
$$;

revoke all on function public.return_commission_to_sale(uuid, uuid) from public;
grant execute on function public.return_commission_to_sale(uuid, uuid) to authenticated;

commit;
