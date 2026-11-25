-- Prove the freeze against actual historical DDL, then roll it back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.providers(id,owner_id,display_name,city,state_code,latitude,longitude,status,is_active,approved_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Fixture','Betim','MG',-19.925,-43.939,'approved',true,now());
insert into public.provider_services(provider_id,category_id,is_active) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,true);
insert into storage.objects(bucket_id,name) values ('request-photos','11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg'),('request-photos','11111111-1111-4111-8111-111111111111/88888888-8888-4888-8888-888888888888.jpg');
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.bj_set_presence(true);
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.service_requests(id,request_key,customer_id,category_id,provider_id,service_types,motorcycle_brand,motorcycle_model,motorcycle_year,photo_path,latitude,longitude,problem_description)
values('77777777-7777-4777-8777-777777777777','77777777-7777-4777-8777-777777777777',auth.uid(),2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',array['pneu_furado'],'Honda','CG 160',2024,'11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg',-19.924,-43.938,'Fixture');
reset role;
\ir ../supabase/drafts/f7_legacy_lockdown_rehearsal.sql
do $test$
declare f text;r text;
begin
 foreach f in array array['bj_answer_quote(uuid,boolean)','bj_finish_request(uuid)','bj_get_request_location(uuid)','bj_ping_presence()','bj_set_presence(boolean)','bj_submit_quote(uuid,integer,text)'] loop
  foreach r in array array['anon','authenticated'] loop
   if has_function_privilege(r,'public.'||f,'EXECUTE') then raise exception 'Legacy RPC exposed: % %',r,f;end if;
  end loop;
 end loop;
 if not has_function_privilege('anon','public.bj_online_providers()','EXECUTE') then raise exception 'Catalog regression';end if;
 if (select count(*) from pg_policies where schemaname='public' and policyname like 'f7_rehearsal_closed_%' and permissive='RESTRICTIVE')<>15 then raise exception 'Incomplete freeze';end if;
end $test$;
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$
begin
 begin perform public.bj_set_presence(false);raise exception 'Presence bypass';exception when insufficient_privilege then null;end;
 begin perform public.bj_submit_quote('77777777-7777-4777-8777-777777777777',27000,'Fixture');raise exception 'Quote bypass';exception when insufficient_privilege then null;end;
 begin perform public.bj_ping_presence();raise exception 'Ping bypass';exception when insufficient_privilege then null;end;
end $test$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $test$
begin
 begin perform public.bj_finish_request('77777777-7777-4777-8777-777777777777');raise exception 'Finish bypass';exception when insufficient_privilege then null;end;
 begin perform public.bj_get_request_location('77777777-7777-4777-8777-777777777777');raise exception 'GPS bypass';exception when insufficient_privilege then null;end;
 begin perform public.bj_answer_quote('77777777-7777-4777-8777-777777777777',true);raise exception 'Answer bypass';exception when insufficient_privilege then null;end;
 begin
  insert into public.service_requests(id,request_key,customer_id,category_id,provider_id,service_types,motorcycle_brand,motorcycle_model,motorcycle_year,photo_path,latitude,longitude,problem_description)
  values('88888888-8888-4888-8888-888888888888','88888888-8888-4888-8888-888888888888',auth.uid(),2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',array['pneu_furado'],'Honda','CG 160',2024,'11111111-1111-4111-8111-111111111111/88888888-8888-4888-8888-888888888888.jpg',-19.924,-43.938,'Fixture');
  raise exception 'Direct insert bypass';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
do $test$ begin
 if (select count(*) from public.service_requests)<>1 or (select count(*) from public.service_quotes)<>0 or (select count(*) from public.payment_records)<>0 then raise exception 'Unexpected mutation';end if;
end $test$;
rollback;
do $test$ begin
 if not has_function_privilege('authenticated','public.bj_set_presence(boolean)','EXECUTE') or exists(select 1 from pg_policies where policyname like 'f7_rehearsal_closed_%') or exists(select 1 from auth.users) then raise exception 'Rollback incomplete';end if;
end $test$;
\echo F7_LEGACY_FREEZE=PASS SIX_RPC_DENIED=PASS RESTRICTIVE_POLICIES=15 ROLLBACK=PASS HOSTED_WRITES=NONE RELEASE=NO_GO
