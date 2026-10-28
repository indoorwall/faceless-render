-- Faceless Studio — funciones, triggers y cron tal y como están en producción (28/10/2026)
-- Proyecto Supabase: embjkwggqooawqnzkoam. Referencia: no ejecutar a ciegas sobre producción.

-- ===== Cola de trabajos =====
CREATE OR REPLACE FUNCTION public.claim_job()
 RETURNS jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare j public.jobs;
begin
  update jobs set status = 'queued' where status = 'running' and updated_at < now() - interval '10 minutes' and attempts < 3;
  with dead as (
    update jobs set status = 'failed', error = 'Se colgó 3 veces seguidas' where status = 'running' and updated_at < now() - interval '10 minutes' and attempts >= 3 returning video_id, step)
  update videos v set status = 'failed', error = d.step || ': se colgó 3 veces seguidas' from dead d where v.id = d.video_id and d.step not in ('thumbs','learn','analyze');
  select * into j from jobs
   where status = 'queued' and run_after <= now()
   order by created_at limit 1 for update skip locked;
  if j.id is null then return null; end if;
  update jobs set status = 'running', attempts = attempts + 1, updated_at = now() where id = j.id returning * into j;
  return j;
end $function$;

CREATE OR REPLACE FUNCTION public.kick_worker()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform net.http_post(
    url := 'https://embjkwggqooawqnzkoam.supabase.co/functions/v1/worker',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from app_config where key='cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end $function$;

-- Trigger videos_status_change (AFTER UPDATE on videos)
CREATE OR REPLACE FUNCTION public.on_video_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if new.status is distinct from old.status and old.status <> 'failed' and coalesce(new.stage,'') <> 'Volviendo a montar' then
    if new.status = 'scripting' then
      insert into jobs(video_id, step) values (new.id, case when new.script is not null and coalesce(new.review_feedback,'') <> '' and jsonb_array_length(coalesce(new.script->'scenes','[]'::jsonb)) > 0 then 'revise' else 'script' end);
    elsif new.status = 'producing' then
      insert into jobs(video_id, step) values (new.id, 'voice');
    elsif new.status = 'publishing' then
      insert into jobs(video_id, step) values (new.id, 'publish');
    end if;
  end if;
  return new;
end $function$;
-- Triggers videos_touch / jobs_touch -> touch_updated_at() (updated_at = now())

CREATE OR REPLACE FUNCTION public.retry_video(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare j jobs; v_status text; v_payload jsonb := '{}';
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  select * into j from jobs where video_id = p_id and status = 'failed' order by id desc limit 1;
  if j.id is null then raise exception 'No hay paso fallido que reintentar'; end if;
  v_status := case j.step when 'script' then 'scripting' when 'publish' then 'publishing' else 'producing' end;
  if j.step = 'voice' and exists (select 1 from scenes where video_id = p_id) then v_payload := '{"cont":true}'; end if;
  update videos set status = v_status, error = null where id = p_id;
  insert into jobs(video_id, step, payload) values (p_id, j.step, v_payload);
end $function$;

CREATE OR REPLACE FUNCTION public.rerender_video(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if exists (select 1 from scenes where video_id = p_id and (audio_url is null or media_url is null)) or not exists (select 1 from scenes where video_id = p_id) then
    raise exception 'Este vídeo aún no tiene todas las escenas producidas';
  end if;
  update videos set status = 'producing', stage = 'Volviendo a montar', progress = 82, error = null where id = p_id;
  insert into jobs(video_id, step) values (p_id, 'render');
end $function$;

-- ===== Banco de ideas =====
CREATE OR REPLACE FUNCTION public.draw_ideas_internal(p_channel uuid, p_n integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare taken int;
begin
  with pick as (
    select id from idea_bank where channel_id = p_channel and not used
    order by fit desc nulls last, created_at limit p_n for update skip locked
  ), upd as (
    update idea_bank b set used = true from pick where b.id = pick.id returning b.*
  ), ins as (
    insert into videos(channel_id, status, idea_title, idea_angle, idea_reason, idea_evidence, usage, idea_kind, idea_stories, idea_hook, format)
    select channel_id, 'idea_review', title, angle, reason,
      case when source_hint is not null then jsonb_build_array(jsonb_build_object('title', source_hint, 'url', 'https://es.wikipedia.org/w/index.php?search=' || replace(source_hint,' ','+'))) else '[]'::jsonb end,
      '{}'::jsonb, kind, stories, hook, format from upd returning 1
  ) select count(*) into taken from ins;
  if (select count(*) from idea_bank where channel_id = p_channel and not used) < 10
     and not exists (select 1 from jobs where channel_id = p_channel and step = 'refill_ideas' and status in ('queued','running')) then
    insert into jobs(channel_id, step, payload) values (p_channel, 'refill_ideas', jsonb_build_object('then_draw', case when taken < p_n then p_n - taken else 0 end));
  end if;
  return taken;
end $function$;

CREATE OR REPLACE FUNCTION public.draw_ideas(p_channel uuid, p_n integer DEFAULT 5)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if not is_member() then raise exception 'not allowed'; end if;
  return draw_ideas_internal(p_channel, least(greatest(p_n,1),10));
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_daily_ideas()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare c record;
begin
  for c in select id, ideas_per_run from channels where status = 'active' and auto_ideas loop
    if (select count(*) from videos v where v.channel_id = c.id and v.status = 'idea_review') < 3 then
      perform draw_ideas_internal(c.id, coalesce(c.ideas_per_run, 5));
    end if;
  end loop;
end $function$;

-- ===== Claves (Vault, nombres con prefijo fs_) =====
CREATE OR REPLACE FUNCTION public.get_api_keys()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'vault' AS $function$
  select coalesce(jsonb_object_agg(substr(name, 4), decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets where name like 'fs\_%';
$function$;

CREATE OR REPLACE FUNCTION public.set_api_key(p_name text, p_value text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault' AS $function$
declare v_id uuid;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  -- PENDIENTE: añadir FISH_AUDIO_API_KEY y FAL_KEY a esta lista y a api_key_status()
  if p_name not in ('ANTHROPIC_API_KEY','ELEVENLABS_API_KEY','OPENAI_API_KEY','CREATOMATE_API_KEY',
                    'YOUTUBE_API_KEY','PEXELS_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','RENDER_URL') then
    raise exception 'unknown key';
  end if;
  select id into v_id from vault.secrets where name = 'fs_' || p_name;
  if p_value is null or length(trim(p_value)) = 0 then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(trim(p_value), 'fs_' || p_name);
  else
    perform vault.update_secret(v_id, trim(p_value));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.api_key_status()
 RETURNS TABLE(name text, is_set boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'vault' AS $function$
  select k, exists(select 1 from vault.secrets s where s.name = 'fs_' || k)
  from unnest(array['ANTHROPIC_API_KEY','ELEVENLABS_API_KEY','CREATOMATE_API_KEY','OPENAI_API_KEY','PEXELS_API_KEY',
                    'YOUTUBE_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','RENDER_URL']) k
  where public.is_member();
$function$;

CREATE OR REPLACE FUNCTION public.is_member()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists(select 1 from public.members where user_id = auth.uid());
$function$;

-- ===== pg_cron =====
-- fs-worker         * * * * *   select public.kick_worker() where exists (select 1 from public.jobs where (status = 'queued' and run_after <= now()) or (status = 'running' and updated_at < now() - interval '10 minutes'));
-- fs-daily-ideas    30 6 * * *  select public.enqueue_daily_ideas();
-- fs-daily-metrics  15 5 * * *  insert into public.jobs(step) values ('metrics');
