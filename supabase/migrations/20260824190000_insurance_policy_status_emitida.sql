alter table public.insurance_sales
  drop constraint if exists insurance_sales_policy_status_check;

alter table public.insurance_sales
  add constraint insurance_sales_policy_status_check
  check (policy_status = any (array[
    'pre_emissao'::text,
    'emitida'::text,
    'ativa'::text,
    'inadimplente'::text,
    'potencial_cancelamento'::text,
    'cancelada'::text,
    'vencida'::text,
    'em_renovacao'::text,
    'renovada'::text
  ]));

create or replace function public.sync_insurance_policy_emission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.policy_status <> 'pre_emissao' and new.proposal_status <> 'recusada' then
    new.proposal_status := 'apolice_emitida';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_insurance_policy_emission on public.insurance_sales;
create trigger trg_sync_insurance_policy_emission
before insert or update of policy_status on public.insurance_sales
for each row
execute function public.sync_insurance_policy_emission();

update public.insurance_sales
set proposal_status = 'apolice_emitida'
where policy_status <> 'pre_emissao'
  and proposal_status <> 'recusada';
