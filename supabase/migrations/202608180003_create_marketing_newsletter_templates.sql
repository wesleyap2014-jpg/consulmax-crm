create table if not exists public.marketing_newsletter_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category text not null default 'institucional'
    check (category in ('institucional','oportunidade','educativo')),
  html_template text not null,
  is_default boolean not null default false,
  status text not null default 'ativo'
    check (status in ('ativo','inativo','arquivado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_marketing_newsletter_templates_default
  on public.marketing_newsletter_templates (is_default)
  where is_default = true;
create index if not exists idx_marketing_newsletter_templates_status
  on public.marketing_newsletter_templates(status, category, name);

drop trigger if exists trg_marketing_newsletter_templates_updated_at on public.marketing_newsletter_templates;
create trigger trg_marketing_newsletter_templates_updated_at
before update on public.marketing_newsletter_templates
for each row execute function public.marketing_set_updated_at();

alter table public.marketing_newsletter_templates enable row level security;
revoke all on public.marketing_newsletter_templates from anon;
grant select, insert, update, delete on public.marketing_newsletter_templates to authenticated;

drop policy if exists marketing_newsletter_templates_admin_read on public.marketing_newsletter_templates;
create policy marketing_newsletter_templates_admin_read
on public.marketing_newsletter_templates for select to authenticated using (public.marketing_is_admin());
drop policy if exists marketing_newsletter_templates_admin_insert on public.marketing_newsletter_templates;
create policy marketing_newsletter_templates_admin_insert
on public.marketing_newsletter_templates for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_templates_admin_update on public.marketing_newsletter_templates;
create policy marketing_newsletter_templates_admin_update
on public.marketing_newsletter_templates for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_templates_admin_delete on public.marketing_newsletter_templates;
create policy marketing_newsletter_templates_admin_delete
on public.marketing_newsletter_templates for delete to authenticated using (public.marketing_is_admin());

insert into public.marketing_newsletter_templates (name, slug, description, category, html_template, is_default, status)
values
(
  'Institucional Premium',
  'institucional-premium',
  'Layout institucional elegante para relacionamento, posicionamento de marca, novidades e comunicados.',
  'institucional',
  $tpl$<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);"><tr><td style="background:#1E293F;padding:24px 30px;border-bottom:4px solid #B5A573;"><div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.2px;">Consulmax Consórcios</div><div style="margin-top:5px;font-size:11px;color:#e2e8f0;letter-spacing:1.2px;text-transform:uppercase;">Relacionamento e planejamento</div></td></tr>{{banner}}<tr><td style="padding:34px 32px 32px;"><h1 style="margin:0 0 22px;color:#1E293F;font-size:27px;line-height:1.25;">{{title}}</h1>{{greeting}}{{content}}{{cta}}</td></tr><tr><td style="padding:22px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.55;">Esta mensagem foi enviada por Consulmax Consórcios através de <strong>{{from_email}}</strong>.<br>Se não quiser mais receber nossas newsletters, responda este e-mail solicitando a remoção da lista.</td></tr></table></td></tr></table></body></html>$tpl$,
  true,
  'ativo'
),
(
  'Oportunidade Comercial',
  'oportunidade-comercial',
  'Layout com maior destaque para proposta, condição, chamada comercial e botão de ação.',
  'oportunidade',
  $tpl$<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f5f4;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f5f4;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 26px rgba(30,41,63,.10);"><tr><td style="background:#A11C27;padding:22px 30px;"><div style="font-size:19px;font-weight:800;color:#ffffff;">Consulmax Consórcios</div><div style="margin-top:5px;font-size:11px;color:#fde8ea;letter-spacing:1px;text-transform:uppercase;">Oportunidades selecionadas</div></td></tr>{{banner}}<tr><td style="padding:34px 32px 30px;"><div style="height:3px;width:54px;background:#B5A573;margin-bottom:20px;"></div><h1 style="margin:0 0 22px;color:#1E293F;font-size:28px;line-height:1.22;">{{title}}</h1>{{greeting}}{{content}}{{cta}}</td></tr><tr><td style="padding:22px 30px;background:#1E293F;color:#cbd5e1;font-size:11px;line-height:1.55;">Consulmax Consórcios • <strong style="color:#ffffff;">{{from_email}}</strong><br>Condições, disponibilidade e análises dependem de cada operação. Para sair da lista, responda solicitando a remoção.</td></tr></table></td></tr></table></body></html>$tpl$,
  false,
  'ativo'
),
(
  'Conteúdo Educativo',
  'conteudo-educativo',
  'Layout editorial para artigos, explicações, planejamento financeiro e construção de autoridade.',
  'educativo',
  $tpl$<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef1f5;font-family:Georgia,'Times New Roman',serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef1f5;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);"><tr><td style="padding:24px 32px;background:#ffffff;border-top:6px solid #1E293F;border-bottom:1px solid #e2e8f0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#1E293F;">Consulmax Consórcios</div><div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#A11C27;letter-spacing:1.3px;text-transform:uppercase;">Conteúdo • Estratégia • Planejamento</div></td></tr>{{banner}}<tr><td style="padding:38px 36px 34px;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#B5A573;letter-spacing:1.3px;text-transform:uppercase;margin-bottom:12px;">Consulmax Insights</div><h1 style="margin:0 0 24px;color:#1E293F;font-size:30px;line-height:1.22;font-weight:700;">{{title}}</h1>{{greeting}}{{content}}{{cta}}</td></tr><tr><td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:11px;line-height:1.55;">Recebido de <strong>{{from_email}}</strong>. Conteúdo de caráter informativo. Para não receber novos conteúdos, responda solicitando a remoção.</td></tr></table></td></tr></table></body></html>$tpl$,
  false,
  'ativo'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  html_template = excluded.html_template,
  status = excluded.status,
  updated_at = now();

alter table public.marketing_newsletters
  add column if not exists template_id uuid references public.marketing_newsletter_templates(id) on delete set null;

create index if not exists idx_marketing_newsletters_template
  on public.marketing_newsletters(template_id);

update public.marketing_newsletters n
set template_id = t.id
from public.marketing_newsletter_templates t
where n.template_id is null
  and t.slug = 'institucional-premium';
