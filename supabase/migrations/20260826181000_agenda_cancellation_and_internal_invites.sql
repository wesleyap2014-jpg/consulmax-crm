alter table public.agenda_eventos
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_agenda_internal_guest(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.agenda_event_guests g
    where g.event_id = p_event_id
      and g.guest_type = 'internal'
      and g.user_auth_id = auth.uid()
  );
$$;

revoke all on function app_private.is_agenda_internal_guest(uuid) from public;
grant execute on function app_private.is_agenda_internal_guest(uuid) to authenticated;

drop policy if exists agenda_eventos_select_invited_internal on public.agenda_eventos;
create policy agenda_eventos_select_invited_internal
on public.agenda_eventos
for select
to authenticated
using (app_private.is_agenda_internal_guest(id));

insert into public.email_templates (
  template_key, category, name, description, version,
  subject_template, preheader_template, html_template, text_template,
  variables, sender_name, reply_to, is_active
)
values (
  'agenda_cancelled',
  'agenda',
  'Cancelamento de compromisso',
  'Aviso institucional enviado aos convidados quando um compromisso da Agenda Consulmax é cancelado ou excluído.',
  1,
  'Cancelado: {{titulo}} • {{data_curta}} às {{hora_inicio}}',
  'O compromisso {{titulo}}, previsto para {{data_extenso}} às {{hora_inicio}}, foi cancelado.',
  $html$
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Compromisso cancelado</title></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#1E293F;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F5F5F5;margin:0;padding:0;">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:22px;overflow:hidden;box-shadow:0 14px 40px rgba(30,41,63,.08);">
        <tr><td style="background:#1E293F;padding:24px 30px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><img src="{{logo_url}}" alt="Consulmax" width="150" style="display:block;max-width:150px;height:auto;border:0;"></td>
            <td align="right" valign="middle" style="font-size:11px;line-height:1.3;color:#E0CE8C;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Agenda Consulmax</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:34px 30px 12px;">
          <div style="font-size:13px;line-height:1.4;color:#A11C27;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Compromisso cancelado</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.15;color:#1E293F;letter-spacing:-.02em;">{{titulo}}</h1>
          <p style="margin:18px 0 0;font-size:16px;line-height:1.7;color:#475569;">Olá, <strong style="color:#1E293F;">{{nome_convidado}}</strong>. Informamos que este compromisso com a Consulmax foi cancelado.</p>
        </td></tr>
        <tr><td style="padding:18px 30px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:16px;">
            <tr><td colspan="2" style="padding:19px 20px 8px;font-size:12px;color:#64748B;font-weight:800;text-transform:uppercase;letter-spacing:.05em;">Data prevista</td></tr>
            <tr><td colspan="2" style="padding:0 20px 16px;font-size:17px;color:#1E293F;font-weight:800;">{{data_extenso}}</td></tr>
            <tr>
              <td style="width:50%;padding:0 20px 20px;"><div style="font-size:12px;color:#64748B;font-weight:800;text-transform:uppercase;">Início</div><div style="margin-top:5px;font-size:21px;color:#1E293F;font-weight:800;">{{hora_inicio}}</div></td>
              <td style="width:50%;padding:0 20px 20px;border-left:1px solid #E2E8F0;"><div style="font-size:12px;color:#64748B;font-weight:800;text-transform:uppercase;">Término</div><div style="margin-top:5px;font-size:21px;color:#1E293F;font-weight:800;">{{hora_fim}}</div></td>
            </tr>
          </table>
        </td></tr>
        {{motivo_html}}
        <tr><td style="padding:24px 30px 8px;"><p style="margin:0;font-size:14px;line-height:1.65;color:#64748B;">Seu calendário também receberá a atualização de cancelamento. Caso um novo horário seja marcado, você receberá um novo convite.</p></td></tr>
        <tr><td style="padding:20px 30px 30px;"><div style="padding-top:18px;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.6;color:#94A3B8;">Organizado por <strong style="color:#64748B;">{{organizador_nome}}</strong>.<br>Consulmax Consórcios • Transformando sonhos em conquistas reais.</div></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
$html$,
  $text$
Olá, {{nome_convidado}}.

O compromisso "{{titulo}}" foi cancelado.

Data prevista: {{data_extenso}}
Horário: {{hora_inicio}} às {{hora_fim}}
Organizador: {{organizador_nome}}
{{motivo_texto}}

Seu calendário também receberá a atualização de cancelamento. Caso um novo horário seja marcado, você receberá um novo convite.

Consulmax Consórcios
Transformando sonhos em conquistas reais.
$text$,
  '{"required":["titulo","nome_convidado","data_curta","data_extenso","hora_inicio","hora_fim","organizador_nome","logo_url","preheader"],"optional":["motivo_html","motivo_texto"]}'::jsonb,
  'Consulmax | Agenda',
  'relacionamento@consulmaxconsorcios.com.br',
  true
)
on conflict (template_key, version)
do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  subject_template = excluded.subject_template,
  preheader_template = excluded.preheader_template,
  html_template = excluded.html_template,
  text_template = excluded.text_template,
  variables = excluded.variables,
  sender_name = excluded.sender_name,
  reply_to = excluded.reply_to,
  is_active = true,
  updated_at = now();
