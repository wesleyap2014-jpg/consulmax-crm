-- Preserva a data de competência informada ao cancelar uma cota.
-- O fallback mantém compatibilidade com integrações que não enviam a data.
create or replace function public.set_cancelada_em()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if TG_OP = 'UPDATE' then
    if btrim(coalesce(old.codigo, '')) = '00' and btrim(coalesce(new.codigo, '')) <> '00' then
      new.cancelada_em := coalesce(new.cancelada_em, now());
    elsif btrim(coalesce(old.codigo, '')) <> '00' and btrim(coalesce(new.codigo, '')) = '00' then
      new.cancelada_em := null;
    end if;
  end if;
  return new;
end;
$function$;

-- Valida a função real em registros temporários, sem alterar cotas da carteira.
do $test$
begin
  create temporary table portfolio_cancel_date_check (
    id integer primary key,
    codigo text,
    cancelada_em timestamptz
  ) on commit drop;
  create trigger check_cancel_date before update of codigo
    on portfolio_cancel_date_check for each row execute function public.set_cancelada_em();

  insert into portfolio_cancel_date_check (id, codigo, cancelada_em)
    values (1, '00', null), (2, '00', null), (3, '01', '2026-09-01 00:00:00-04');

  update portfolio_cancel_date_check
    set codigo = '01', cancelada_em = '2026-09-30 00:00:00-04' where id = 1;
  if (select cancelada_em from portfolio_cancel_date_check where id = 1)
    is distinct from timestamptz '2026-09-30 00:00:00-04' then
    raise exception 'A data informada do cancelamento foi substituída';
  end if;

  update portfolio_cancel_date_check set codigo = '01' where id = 2;
  if (select cancelada_em from portfolio_cancel_date_check where id = 2) is distinct from now() then
    raise exception 'O fallback da data do cancelamento falhou';
  end if;

  update portfolio_cancel_date_check set codigo = '00' where id = 1;
  if (select cancelada_em from portfolio_cancel_date_check where id = 1) is not null then
    raise exception 'A reativação deve limpar a data do cancelamento';
  end if;

  update portfolio_cancel_date_check
    set codigo = '02', cancelada_em = '2026-09-15 00:00:00-04' where id = 3;
  if (select cancelada_em from portfolio_cancel_date_check where id = 3)
    is distinct from timestamptz '2026-09-15 00:00:00-04' then
    raise exception 'A edição de uma cota cancelada alterou sua competência';
  end if;
end;
$test$;
