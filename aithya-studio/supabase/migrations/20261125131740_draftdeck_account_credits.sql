alter table public.studio_claude_connections alter column project_id drop not null;
create unique index studio_account_credit_provider
  on public.studio_claude_connections(user_id,provider) where project_id is null;

create policy "Read own account credits" on public.studio_claude_connections for select to authenticated
  using(project_id is null and user_id=(select auth.uid()));
create policy "Remove own account credits" on public.studio_claude_connections for delete to authenticated
  using(project_id is null and user_id=(select auth.uid()));

create function aithya_private.connect_draftdeck_account_credit(p_provider text) returns text
language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); connection uuid; token text;
begin
  if owner is null then raise exception 'Sign in to connect an AI account' using errcode='42501'; end if;
  if p_provider is null or p_provider not in ('codex','claude') then raise exception 'Choose Codex or Claude Code'; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.studio_claude_connections(user_id,provider)
    values(owner,p_provider)
    on conflict (user_id,provider) where project_id is null do update set user_id=excluded.user_id
    returning id into connection;
  insert into aithya_private.claude_tokens(connection_id,token_hash)
    values(connection,extensions.digest(token,'sha256'))
    on conflict(connection_id) do update set token_hash=excluded.token_hash;
  return token;
end;
$$;
create function public.connect_draftdeck_account_credit(p_provider text) returns text
language sql security invoker set search_path='' as $$
  select aithya_private.connect_draftdeck_account_credit(p_provider);
$$;
grant usage on schema aithya_private to authenticated;
revoke all on function public.connect_draftdeck_account_credit(text),aithya_private.connect_draftdeck_account_credit(text) from public,anon;
grant execute on function public.connect_draftdeck_account_credit(text),aithya_private.connect_draftdeck_account_credit(text) to authenticated;

create or replace function public.sync_studio_claude_credits(p_token text,p_windows jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_connection uuid;
  v_provider text;
  v_window record;
  v_used numeric;
  v_reset timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_windows) is distinct from 'object'
     or octet_length(p_windows::text)>512 then return false;
  end if;
  select c.id,c.provider into v_connection,v_provider
    from aithya_private.claude_tokens t
    join public.studio_claude_connections c on c.id=t.connection_id
    where t.token_hash=extensions.digest(p_token,'sha256')
      and (c.project_id is null or exists (
        select 1 from public.project_members m join public.projects p on p.id=m.project_id
        where m.project_id=c.project_id and m.user_id=c.user_id and m.status='accepted' and p.archived_at is null
      )) for update of c;
  if not found or not exists(
    select from aithya_private.claude_tokens t
    where t.connection_id=v_connection and t.token_hash=extensions.digest(p_token,'sha256')
  ) then return false; end if;

  perform aithya_private.claude_reset_notifications(v_connection);
  for v_window in select * from jsonb_each(p_windows) order by key loop
    if not ((v_provider='claude' and v_window.key in ('five_hour','seven_day'))
      or (v_provider='codex' and v_window.key in ('primary','secondary')))
      or jsonb_typeof(v_window.value->'used') is distinct from 'number'
      or (v_window.value->>'reset') is null
      or (v_window.value->>'reset') !~ '^[0-9]{1,11}$' then continue;
    end if;
    v_used := (v_window.value->>'used')::numeric;
    v_reset := to_timestamp((v_window.value->>'reset')::double precision);
    if v_used not between 0 and 100 or v_reset<=v_now or v_reset>v_now+interval '8 days' then continue; end if;
    insert into public.studio_claude_windows(connection_id,window_key,used,reset_at,synced_at)
    values(v_connection,v_window.key,v_used,v_reset,v_now)
    on conflict(connection_id,window_key) do update
      set used=excluded.used,
          reset_at=excluded.reset_at,synced_at=excluded.synced_at,
          notified_at=case when studio_claude_windows.reset_at=excluded.reset_at then studio_claude_windows.notified_at end
      where studio_claude_windows.reset_at<=excluded.reset_at and studio_claude_windows.synced_at<=excluded.synced_at
        and (studio_claude_windows.reset_at<excluded.reset_at or studio_claude_windows.used<>excluded.used
          or studio_claude_windows.synced_at<=excluded.synced_at-interval '1 minute');
  end loop;
  return true;
end;
$$;
revoke all on function public.sync_studio_claude_credits(text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_studio_claude_credits(text,jsonb) to anon,authenticated;
