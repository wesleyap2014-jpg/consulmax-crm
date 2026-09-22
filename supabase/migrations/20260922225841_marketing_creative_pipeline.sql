-- Esteira Criativa: additive schema, same admin boundary as Central de Conteúdo.
create schema if not exists creative_private;
revoke all on schema creative_private from public, anon, authenticated;

create table public.marketing_creative_strategies (
 id uuid primary key default gen_random_uuid(), title text not null check (length(trim(title)) > 0),
 kind text not null default 'Estratégia Mensal' check(kind in ('Estratégia Mensal','Campanha','Estratégia Pontual')),
 start_date date not null, end_date date not null check(end_date>=start_date),
 owner_id uuid references public.users(id), campaign_id uuid references public.marketing_campaigns(id),
 status text not null default 'Rascunho' check(status in ('Rascunho','Planejada','Em execução','Concluída')),
 primary_objective text not null, secondary_objectives text[] not null default '{}',
 audiences text[] not null default '{}', focus_products text[] not null default '{}', message text not null default '',
 editorial_mix jsonb not null default '{"mode":"percent","HERO":20,"HUB":50,"HELP":30}',
 purpose_mix jsonb not null default '{"mode":"percent","Marca":40,"Demanda":40,"Comercial":20}',
 kpis text[] not null default '{}', planned_count integer not null default 12 check(planned_count>=0),
 revision integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketing_creative_topics (
 id uuid primary key default gen_random_uuid(), strategy_id uuid not null references public.marketing_creative_strategies(id),
 title text not null check(length(trim(title))>0), idea text not null default '', problem text not null default '',
 audiences text[] not null default '{}', objective text not null default '', product text not null default '',
 pillar text not null default '', angle text not null default '', hook text not null default '', message text not null default '',
 cta text not null default '', refs text not null default '', notes text not null default '',
 hero text not null check(hero in ('HERO','HUB','HELP')), purpose text not null check(purpose in ('Marca','Demanda','Comercial')),
 funnel text not null default 'Educação', source text not null default 'Ideia interna', source_item_id uuid,
 source_learning text not null default '', revision integer not null default 1,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketing_creative_sessions (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title))>0), scheduled_at timestamptz not null,
 location text not null default '', owner_id uuid references public.users(id), presenter text not null default '',
 videomaker text not null default '', equipment text not null default '', notes text not null default '',
 revision integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketing_creative_items (
 id uuid primary key default gen_random_uuid(), code bigint generated always as identity unique,
 topic_id uuid not null references public.marketing_creative_topics(id), title text not null check(length(trim(title))>0),
 channel text not null, format text not null, duration_seconds integer not null default 30 check(duration_seconds>=0),
 aspect_ratio text not null default '9:16', units integer not null default 6 check(units>0), cta text not null default '',
 owner_id uuid references public.users(id), needs_recording boolean not null default false, needs_design boolean not null default true,
 needs_editing boolean not null default false, needs_special_approval boolean not null default false,
 stage text not null default 'formatos' check(stage in ('estrategia','pautas','formatos','calendario','roteiro','gravacao','producao','aprovacao','publicacao','distribuicao','analise')),
 scheduled_at timestamptz, due_at timestamptz, published_at timestamptz, session_id uuid references public.marketing_creative_sessions(id),
 priority text not null default 'Normal' check(priority in ('Baixa','Normal','Alta','Urgente')),
 script jsonb not null default '{}' check(jsonb_typeof(script)='object'),
 recording jsonb not null default '{"status":"Aguardando gravação"}' check(jsonb_typeof(recording)='object'),
 production jsonb not null default '{"status":"Aguardando produção","files":[]}' check(jsonb_typeof(production)='object'),
 approval jsonb not null default '{"status":"Aguardando aprovação","checklist":{}}' check(jsonb_typeof(approval)='object'),
 publication jsonb not null default '{"status":"Aguardando agendamento"}' check(jsonb_typeof(publication)='object'),
 metrics jsonb not null default '{}' check(jsonb_typeof(metrics)='object'), qualitative jsonb not null default '{}' check(jsonb_typeof(qualitative)='object'),
 result text check(result in ('Excelente','Acima da média','Dentro da média','Abaixo da média','Fraco')),
 analysis_status text not null default 'not_started' check(analysis_status in ('not_started','pending','done')),
 revision integer not null default 1, creative_version integer not null default 1,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.marketing_creative_topics add constraint creative_topic_source_item foreign key(source_item_id) references public.marketing_creative_items(id);
create table public.marketing_creative_distributions (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.marketing_creative_items(id),
 title text not null check(length(trim(title))>0), channel text not null, owner_id uuid references public.users(id), due_at timestamptz,
 status text not null default 'Pendente' check(status in ('Pendente','Agendado','Concluído','Cancelado')), adaptation text not null default '',
 revision integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketing_creative_comments (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.marketing_creative_items(id),
 body text not null check(length(trim(body)) between 1 and 10000),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.marketing_creative_events (
 id uuid primary key default gen_random_uuid(), entity_table text not null, entity_id uuid not null,
 item_id uuid references public.marketing_creative_items(id), kind text not null, actor_id uuid references auth.users(id),
 before_data jsonb, after_data jsonb, comment text, created_at timestamptz not null default now()
);
create table public.marketing_creative_ai_runs (
 id uuid primary key default gen_random_uuid(), strategy_id uuid not null references public.marketing_creative_strategies(id),
 item_id uuid references public.marketing_creative_items(id), action text not null, instructions text not null default '',
 model text not null, result jsonb not null, usage jsonb not null default '{}',
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

-- Stable IDs, revisions and actor stamping cannot be overwritten by clients.
create function creative_private.stamp_record() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre novamente no CRM.'; end if;
 if TG_OP='INSERT' then
   new.created_by=auth.uid(); new.created_at=now();
 else
   new.id=old.id; new.created_by=old.created_by; new.created_at=old.created_at;
 end if;
 if TG_TABLE_NAME<>'marketing_creative_comments' then
   new.updated_at=now();
   if TG_OP='UPDATE' then new.revision=old.revision+1; else new.revision=1; end if;
 end if;
 return new;
end $$;

create function creative_private.guard_item() returns trigger language plpgsql set search_path='' as $$
declare
 steps text[] := array['estrategia','pautas','formatos','calendario','roteiro','gravacao','producao','aprovacao','publicacao','distribuicao','analise'];
 target integer; previous integer; changed boolean:=false; has_asset boolean; approved boolean; check_name text; metric record;
begin
 target=array_position(steps,new.stage);
 if TG_OP='INSERT' then
   if target>3 then raise exception 'Novos conteúdos devem começar em Estratégia, Pautas ou Formatos.'; end if;
   new.creative_version=1; new.published_at=null; new.analysis_status='not_started';
   new.approval=jsonb_build_object('status','Aguardando aprovação','checklist','{}'::jsonb);
   new.publication=jsonb_build_object('status','Aguardando agendamento'); previous=target;
 else
   new.code=old.code; new.topic_id=old.topic_id;
   previous=array_position(steps,old.stage);
   changed=(row(new.title,new.channel,new.format,new.cta,new.script,new.production,new.needs_special_approval)
      is distinct from row(old.title,old.channel,old.format,old.cta,old.script,old.production,old.needs_special_approval));
   if changed and old.published_at is not null then raise exception 'Conteúdo publicado preserva sua versão. Crie outro formato ou uma nova pauta para editar a peça.'; end if;
   new.creative_version=old.creative_version+case when changed then 1 else 0 end;
   new.published_at=old.published_at;
   if changed then
     new.approval=jsonb_build_object('status','Aguardando aprovação','checklist','{}'::jsonb);
     if target>=9 then new.stage='aprovacao'; target=8; end if;
     if new.publication->>'status'='Agendado' then new.publication=jsonb_set(new.publication,'{status}','"Aguardando agendamento"'); end if;
   end if;
 end if;
 has_asset=coalesce(new.production->>'final_url','') ~ '^https?://' or coalesce(new.production->>'canva','') ~ '^https?://' or coalesce(new.production->>'drive','') ~ '^https?://' or jsonb_array_length(coalesce(new.production->'files','[]'))>0;
 if new.script->>'completed'='true' then
   if new.format in ('Reels','Vídeo','Shorts','Live','Podcast/entrevista') then
     foreach check_name in array array['Convite','Acordo','Mensagem 1','Mensagem 2','Mensagem 3','Conclusão'] loop
       if not exists(select 1 from jsonb_array_elements(coalesce(new.script->'takes','[]')) t where t->>'function'=check_name and length(trim(coalesce(t->>'speech','')))>0) then
         raise exception 'Complete a fala da etapa % do roteiro C + A + M³ + C.',check_name;
       end if;
     end loop;
   elsif new.format='Carrossel' then
     if jsonb_array_length(coalesce(new.script->'cards','[]'))<2 or exists(select 1 from jsonb_array_elements(new.script->'cards') c where length(trim(coalesce(c->>'text','')))=0) then raise exception 'Preencha pelo menos dois cards do carrossel.'; end if;
   elsif length(trim(coalesce(new.script->>'art_text','')||coalesce(new.script->>'caption','')))=0 then raise exception 'Preencha o texto da arte ou a copy.';
   end if;
 end if;
 if new.approval->>'status' not in ('Aguardando aprovação','Aprovado','Aprovado com ajustes','Reprovado','Revisar informações') then raise exception 'Status de aprovação inválido.'; end if;
 if TG_OP='UPDATE' and new.approval is distinct from old.approval and new.approval->>'status'='Aprovado' then
   if old.stage<>'aprovacao' then raise exception 'Envie o conteúdo para Aprovação antes de aprovar.'; end if;
   if not has_asset then raise exception 'Anexe a peça final antes de aprovar.'; end if;
   if new.script->>'completed' is distinct from 'true' then raise exception 'Conclua o roteiro/copy antes de aprovar.'; end if;
   foreach check_name in array array['Copy','Ortografia','Valores','Informações técnicas','Identidade visual','Marca','CTA','Thumbnail','Legenda','Informações regulatórias','Links'] loop
     if new.approval->'checklist'->>check_name is distinct from 'true' then raise exception 'Revise o checklist: %.',check_name; end if;
   end loop;
   if new.needs_special_approval and (nullif(new.approval->>'special_reviewer','') is null or new.approval->>'special_reviewer'<>auth.uid()::text) then
     raise exception 'A aprovação especial deve ser registrada pelo revisor indicado.';
   end if;
   new.approval=new.approval||jsonb_build_object('by',auth.uid(),'at',now(),'version',new.creative_version);
   new.stage='publicacao'; target=9;
 elsif TG_OP='UPDATE' and not changed then
   -- Ignore forged audit stamps even when saving an unchanged approval.
   new.approval=(new.approval-'by'-'at'-'version') || jsonb_strip_nulls(jsonb_build_object('by',old.approval->'by','at',old.approval->'at','version',old.approval->'version'));
 end if;
 approved=new.approval->>'status'='Aprovado' and (new.approval->>'version')::integer=new.creative_version;
 if new.publication->>'status' not in ('Aguardando agendamento','Agendado','Publicado','Erro','Cancelado') then raise exception 'Status de publicação inválido.'; end if;
 if new.publication->>'status' in ('Agendado','Publicado') and not coalesce(approved,false) then raise exception 'Registre a aprovação da versão atual antes de agendar/publicar.'; end if;
 if new.publication->>'status'='Agendado' and new.scheduled_at is null then raise exception 'Defina data e horário do agendamento.'; end if;
 if new.publication->>'status'='Publicado' and new.published_at is null then
   if coalesce(new.publication->>'url','') !~ '^https?://' then raise exception 'Informe o link da publicação.'; end if;
   new.published_at=now(); new.analysis_status='pending'; new.stage='distribuicao'; target=10;
 end if;
 if TG_OP='UPDATE' and old.published_at is not null and new.publication->>'status'<>'Publicado' then raise exception 'Uma publicação registrada mantém seu histórico. Use os comentários para registrar correções.'; end if;
 if target>previous then
   if target>=5 and new.scheduled_at is null then raise exception 'Defina a data e o horário previstos no Calendário.'; end if;
   if target>=6 and new.script->>'completed' is distinct from 'true' then raise exception 'Conclua o roteiro/copy antes de avançar.'; end if;
   if target>=7 and new.needs_recording and new.recording->>'status' is distinct from 'Gravado' then raise exception 'Conclua a gravação antes de iniciar a produção.'; end if;
   if target>=8 and not has_asset then raise exception 'Anexe um arquivo ou link da peça final antes da aprovação.'; end if;
   if target>=9 and not coalesce(approved,false) then raise exception 'Registre a aprovação da versão atual antes da publicação.'; end if;
   if target>=10 and new.published_at is null then raise exception 'Registre a publicação antes de avançar.'; end if;
 end if;
 for metric in select * from jsonb_each(new.metrics) loop
   if metric.value<>'null'::jsonb and (jsonb_typeof(metric.value)<>'number' or (metric.value::text)::numeric<0) then raise exception 'Métricas devem ser números não negativos.'; end if;
 end loop;
 if (new.metrics->>'retention')::numeric>100 then raise exception 'A retenção deve estar entre 0 e 100%%.'; end if;
 if new.analysis_status='done' and (new.published_at is null or new.result is null or length(trim(coalesce(new.qualitative->>'learning','')))=0) then raise exception 'Para concluir a análise, registre a publicação, o resultado e o aprendizado.'; end if;
 return new;
end $$;

-- Events are append-only. Only this authenticated trigger can insert audit rows.
create function creative_private.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_data jsonb; event_kind text; content_id uuid;
begin
 if auth.uid() is null then raise exception 'Ator autenticado obrigatório para o histórico.'; end if;
 current_data=to_jsonb(new); if TG_OP='UPDATE' then previous=to_jsonb(old); end if;
 event_kind=case when TG_OP='INSERT' then 'criação' else 'alteração' end;
 if TG_TABLE_NAME='marketing_creative_items' then
   content_id=new.id;
   if TG_OP='UPDATE' then
     if old.stage<>new.stage then event_kind='mudança de etapa'; end if;
     if old.approval is distinct from new.approval then event_kind='aprovação'; end if;
     if old.metrics is distinct from new.metrics or old.qualitative is distinct from new.qualitative or old.analysis_status<>new.analysis_status then event_kind='análise'; end if;
     if old.published_at is null and new.published_at is not null then event_kind='publicação'; end if;
   end if;
 elsif TG_TABLE_NAME in ('marketing_creative_comments','marketing_creative_distributions') then content_id=new.item_id;
 elsif TG_TABLE_NAME='marketing_creative_topics' then content_id=new.source_item_id;
 end if;
 if TG_TABLE_NAME='marketing_creative_comments' then event_kind='comentário'; end if;
 insert into public.marketing_creative_events(entity_table,entity_id,item_id,kind,actor_id,before_data,after_data,comment)
 values(TG_TABLE_NAME,new.id,content_id,event_kind,auth.uid(),previous,current_data,case when TG_TABLE_NAME='marketing_creative_comments' then current_data->>'body' else null end);
 return new;
end $$;
revoke all on all functions in schema creative_private from public, anon, authenticated;

DO $$ declare tbl text; begin
 foreach tbl in array array['strategies','topics','sessions','items','distributions','comments'] loop
   execute format('alter table public.marketing_creative_%I enable row level security',tbl);
   execute format('revoke all on public.marketing_creative_%I from anon, authenticated',tbl);
   execute format('grant select, insert on public.marketing_creative_%I to authenticated',tbl);
   execute format('create policy creative_read on public.marketing_creative_%I for select to authenticated using ((select public.marketing_is_admin()))',tbl);
   execute format('create policy creative_insert on public.marketing_creative_%I for insert to authenticated with check ((select public.marketing_is_admin()) and created_by=(select auth.uid()))',tbl);
   if tbl<>'comments' then
     execute format('grant update on public.marketing_creative_%I to authenticated',tbl);
     execute format('create policy creative_update on public.marketing_creative_%I for update to authenticated using ((select public.marketing_is_admin())) with check ((select public.marketing_is_admin()))',tbl);
   end if;
   execute format('create trigger creative_01_stamp before insert or update on public.marketing_creative_%I for each row execute function creative_private.stamp_record()',tbl);
   execute format('create trigger creative_99_audit after insert or update on public.marketing_creative_%I for each row execute function creative_private.audit_record()',tbl);
 end loop;
 foreach tbl in array array['events','ai_runs'] loop
   execute format('alter table public.marketing_creative_%I enable row level security',tbl);
   execute format('revoke all on public.marketing_creative_%I from anon, authenticated',tbl);
   execute format('grant select on public.marketing_creative_%I to authenticated',tbl);
   execute format('create policy creative_read on public.marketing_creative_%I for select to authenticated using ((select public.marketing_is_admin()))',tbl);
 end loop;
end $$;
create trigger creative_02_guard before insert or update on public.marketing_creative_items for each row execute function creative_private.guard_item();
grant usage on sequence public.marketing_creative_items_code_seq to authenticated;

create index creative_strategy_owner on public.marketing_creative_strategies(owner_id);
create index creative_strategy_campaign on public.marketing_creative_strategies(campaign_id);
create index creative_strategy_period on public.marketing_creative_strategies(start_date,end_date);
create index creative_topic_strategy on public.marketing_creative_topics(strategy_id);
create index creative_topic_origin on public.marketing_creative_topics(source_item_id);
create index creative_item_topic on public.marketing_creative_items(topic_id);
create index creative_item_owner on public.marketing_creative_items(owner_id);
create index creative_item_session on public.marketing_creative_items(session_id);
create index creative_item_schedule on public.marketing_creative_items(scheduled_at,stage);
create index creative_item_published on public.marketing_creative_items(published_at) where published_at is not null;
create index creative_session_owner on public.marketing_creative_sessions(owner_id);
create index creative_distribution_item on public.marketing_creative_distributions(item_id);
create index creative_distribution_owner on public.marketing_creative_distributions(owner_id);
create index creative_comment_item on public.marketing_creative_comments(item_id);
create index creative_event_item on public.marketing_creative_events(item_id,created_at desc);
create index creative_event_entity on public.marketing_creative_events(entity_id,created_at desc);
create index creative_event_actor on public.marketing_creative_events(actor_id);
create index creative_ai_strategy on public.marketing_creative_ai_runs(strategy_id,created_at desc);
create index creative_ai_item on public.marketing_creative_ai_runs(item_id);
DO $$ declare tbl text; begin
 foreach tbl in array array['strategies','topics','sessions','items','distributions','comments','ai_runs'] loop
 execute format('create index on public.marketing_creative_%I(created_by)',tbl);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit) values('marketing-creative-pipeline','marketing-creative-pipeline',false,104857600) on conflict(id) do nothing;
create policy creative_asset_select on storage.objects for select to authenticated using(bucket_id='marketing-creative-pipeline' and (select public.marketing_is_admin()));
create policy creative_asset_insert on storage.objects for insert to authenticated with check(bucket_id='marketing-creative-pipeline' and (select public.marketing_is_admin()) and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Assets are immutable; uploading a new version never overwrites approved material.
