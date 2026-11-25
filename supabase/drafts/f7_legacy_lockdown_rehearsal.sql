-- REHEARSAL ONLY. Not a migration. Must be run in a transaction and rolled back.
-- Freeze legacy operational entrypoints before later staged replacement.
do $guard$ begin
 if current_database()<>'sm_history_disposable' then raise exception 'Disposable replay only';end if;
end $guard$;
revoke execute on function public.bj_answer_quote(uuid,boolean),
 public.bj_finish_request(uuid),public.bj_get_request_location(uuid),
 public.bj_ping_presence(),public.bj_set_presence(boolean),
 public.bj_submit_quote(uuid,integer,text) from public,anon,authenticated;

-- Restrictive policies prevent direct REST writes even when a legacy
-- permissive policy or column grant is present. Read permissions unchanged.
do $freeze$
declare t text;
begin
 foreach t in array array['service_requests','service_quotes','request_messages','payment_records','bj_provider_presence'] loop
  execute format('create policy f7_rehearsal_closed_insert on public.%I as restrictive for insert to anon,authenticated with check (false)',t);
  execute format('create policy f7_rehearsal_closed_update on public.%I as restrictive for update to anon,authenticated using (false) with check (false)',t);
  execute format('create policy f7_rehearsal_closed_delete on public.%I as restrictive for delete to anon,authenticated using (false)',t);
 end loop;
end $freeze$;
