-- F1: testes adversariais de cinco RPCs; PG17 DESCARTAVEL, nenhuma rede.
-- A/F: customer; B: delivery provider; T: tow provider; C: terceiro.
begin;
do $$
begin
 if (select quote_enabled or presence_enabled or cancel_enabled from private.f1_rpc_mock_gates where singleton)
 then raise exception 'Gates iniciam ligados'; end if;
 if has_function_privilege('anon','private.f1_guarded_submit_quote(uuid,integer,integer,text)','EXECUTE')
 or has_function_privilege('anon','private.f1_guarded_answer_quote(uuid,boolean)','EXECUTE')
 or has_function_privilege('anon','private.f1_guarded_finish_request(uuid)','EXECUTE')
 or has_function_privilege('anon','private.f1_guarded_set_presence(boolean)','EXECUTE')
 or has_function_privilege('anon','private.f1_guarded_ping_presence()','EXECUTE')
 then raise exception 'RPC de teste aberta a anon'; end if;
 if has_function_privilege('authenticated','private.f1_baseline_submit_quote(uuid,integer,text)','EXECUTE')
 then raise exception 'Replica baseline indevidamente aberta'; end if;
 if has_table_privilege('authenticated','private.f1_quote_pricing_mock','SELECT')
 or has_table_privilege('authenticated','public.service_requests','UPDATE')
 or has_table_privilege('authenticated','public.payment_records','UPDATE')
 then raise exception 'Tabela privada exposta ao papel autenticado'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';

-- DENY third party and gate false
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,4000,'servico com materiais inclusos');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'F2 bloqueada' then raise; end if;
 end;
end $$;

-- DENY third party online
do $$
begin
 begin
  perform private.f1_guarded_set_presence(true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Prestador nao pertence' then raise; end if;
 end;
end $$;

-- DENY third party cancel
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Encerramento financeiro bloqueado' then raise; end if;
 end;
end $$;

reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- DENY provider gate off
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,4000,'servico com materiais inclusos');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'F2 bloqueada' then raise; end if;
 end;
end $$;

-- DENY provider presence gated
do $$
begin
 begin
  perform private.f1_guarded_set_presence(true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'F1/F3 offline' then raise; end if;
 end;
end $$;

-- ASSERT emergency offline permitted
do $$
begin
 if (private.f1_guarded_set_presence(false)) is distinct from false then
  raise exception 'emergency offline permitted'; end if;
end $$;

reset role;

update private.f1_rpc_mock_gates set presence_enabled=true where singleton;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT provider online
do $$
begin
 if (private.f1_guarded_set_presence(true)) is distinct from true then
  raise exception 'provider online'; end if;
end $$;

-- ASSERT heartbeat valid
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from true then
  raise exception 'heartbeat valid'; end if;
end $$;

reset role;

update public.provider_services set is_active=false where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT disabled service heartbeat rejected
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from false then
  raise exception 'disabled service heartbeat rejected'; end if;
end $$;

reset role;

do $$ begin if not (not (select online_requested from public.bj_provider_presence where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then raise exception 'disabled service forced offline'; end if; end $$;

update public.provider_services set is_active=true where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT no resurrection by ping
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from false then
  raise exception 'no resurrection by ping'; end if;
end $$;

-- ASSERT manual re-enable required
do $$
begin
 if (private.f1_guarded_set_presence(true)) is distinct from true then
  raise exception 'manual re-enable required'; end if;
end $$;

reset role;

update public.providers set status='suspended' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT suspended heartbeat blocked
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from false then
  raise exception 'suspended heartbeat blocked'; end if;
end $$;

-- DENY suspended online blocked
do $$
begin
 begin
  perform private.f1_guarded_set_presence(true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'F1/F3 offline' then raise; end if;
 end;
end $$;

-- ASSERT suspended offline allowed
do $$
begin
 if (private.f1_guarded_set_presence(false)) is distinct from false then
  raise exception 'suspended offline allowed'; end if;
end $$;

reset role;

update public.providers set status='approved' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';

-- ASSERT tow service supported
do $$
begin
 if (private.f1_guarded_set_presence(true)) is distinct from true then
  raise exception 'tow service supported'; end if;
end $$;

-- ASSERT tow heartbeat
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from true then
  raise exception 'tow heartbeat'; end if;
end $$;

reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT provider reenabled after suspension
do $$
begin
 if (private.f1_guarded_set_presence(true)) is distinct from true then
  raise exception 'provider reenabled after suspension'; end if;
end $$;

reset role;

update private.f1_rpc_mock_gates set quote_enabled=true where singleton;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- DENY zero service
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',0,4000,'');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Service/travel invalidos' then raise; end if;
 end;
end $$;

-- DENY negative travel
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,-1,'');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Service/travel invalidos' then raise; end if;
 end;
end $$;

-- DENY excess quote
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',500000,1000,'');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Service/travel invalidos' then raise; end if;
 end;
end $$;

-- DENY wrong provider
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',23000,4000,'servico com materiais inclusos');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Prestador, categoria' then raise; end if;
 end;
end $$;

-- DENY contact leak
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,4000,'WhatsApp 999999999');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Contato externo' then raise; end if;
 end;
end $$;

do $$
declare q uuid;
begin
 q:=private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,4000,'Reparo incluso material');
 perform set_config('sm.test_quote_id',q::text,false);
end $$;

-- DENY duplicate quote denied
do $$
begin
 begin
  perform private.f1_guarded_submit_quote('cccccccc-cccc-4ccc-8ccc-cccccccccccc',23000,4000,'servico com materiais inclusos');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Prestador, categoria' then raise; end if;
 end;
end $$;

reset role;
do $
begin
 if not exists(select 1 from private.f1_quote_pricing_mock c
   where c.quote_id=current_setting('sm.test_quote_id')::uuid
   and c.service_cents=23000 and c.travel_cents=4000
   and c.rider_fee_cents=2300 and c.provider_fee_cents=2300
   and c.customer_total_cents=29300 and c.provider_receivable_cents=24700
   and c.materials_included)
 then raise exception 'Split 10+10 ou material incluso incorretos'; end if;
end $;

set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';

-- DENY third party cannot accept
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao ou prestador' then raise; end if;
 end;
end $$;

reset role;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- Nenhuma leitura direta das tabelas privadas pelo cliente.

reset role;

update private.f1_rpc_mock_gates set quote_enabled=false where singleton;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY customer still blocked with gate off
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao F2 bloqueada' then raise; end if;
 end;
end $$;

reset role;

update private.f1_rpc_mock_gates set quote_enabled=true where singleton;

update public.providers set status='suspended' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY suspended provider not accepted
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao ou prestador' then raise; end if;
 end;
end $$;

reset role;

update public.providers set status='approved' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

update public.provider_services set is_active=false where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY inactive category not accepted
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao ou prestador' then raise; end if;
 end;
end $$;

reset role;

update public.provider_services set is_active=true where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

update public.bj_provider_presence set last_seen_at=now()-interval '10 minutes' where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY stale presence not accepted
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao ou prestador' then raise; end if;
 end;
end $$;

reset role;

update public.bj_provider_presence set last_seen_at=now() where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- ASSERT customer accepted own valid quote
do $$
begin
 if (private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true)) is distinct from 'awaiting_payment'::text then
  raise exception 'customer accepted own valid quote'; end if;
end $$;

-- DENY duplicate accept denied
do $$
begin
 begin
  perform private.f1_guarded_answer_quote(current_setting('sm.test_quote_id')::uuid,true);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Decisao ou prestador' then raise; end if;
 end;
end $$;

reset role;

do $$ begin if not ((select status='awaiting_payment' from public.service_requests where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')) then raise exception 'quote acceptance only awaits payment'; end if; end $$;

do $$ begin if not ((select count(*)=0 from public.payment_records)) then raise exception 'no actual payment created by accepting quote'; end if; end $$;

set role authenticated;
set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';

do $$
declare q uuid;
begin
 q:=private.f1_guarded_submit_quote('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',10000,2000,'Reboque com material incluso');
 perform set_config('sm.test_tow_quote_id',q::text,false);
end $$;

reset role;
do $
begin
 if not exists(select 1 from private.f1_quote_pricing_mock p
   where p.quote_id=current_setting('sm.test_tow_quote_id')::uuid
   and p.service_cents=10000 and p.travel_cents=2000
   and p.rider_fee_cents=1000 and p.provider_fee_cents=1000
   and p.customer_total_cents=13000 and p.provider_receivable_cents=11000)
 then raise exception 'Reboque 10+10 incorreto'; end if;
end $;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel gate off
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Encerramento financeiro bloqueado' then raise; end if;
 end;
end $$;

reset role;

update private.f1_rpc_mock_gates set cancel_enabled=true where singleton;

set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';

-- DENY foreign cancel
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Pedido de outro cliente' then raise; end if;
 end;
end $$;

reset role;

insert into public.payment_records(request_id,status) values('ffffffff-ffff-4fff-8fff-ffffffffffff','pending');

update public.payment_records set status='pending' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with pending
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='authorized' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with authorized
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='paid' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with paid
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='refunded' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with refunded
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='failed' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with failed
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='disputed' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with disputed
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

update public.payment_records set status='chargeback' where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- DENY cancel blocked with chargeback
do $$
begin
 begin
  perform private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm !~ 'Analise humana financeira' then raise; end if;
 end;
end $$;

reset role;

delete from public.payment_records where request_id='ffffffff-ffff-4fff-8fff-ffffffffffff';

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- ASSERT no money cancellation permitted
do $$
begin
 if (private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff')) is distinct from 'cancelled'::text then
  raise exception 'no money cancellation permitted'; end if;
end $$;

-- ASSERT cancellation idempotent
do $$
begin
 if (private.f1_guarded_finish_request('ffffffff-ffff-4fff-8fff-ffffffffffff')) is distinct from 'cancelled'::text then
  raise exception 'cancellation idempotent'; end if;
end $$;

reset role;

do $$ begin if not ((select status='cancelled' from public.service_requests where id='ffffffff-ffff-4fff-8fff-ffffffffffff')) then raise exception 'cancellation after no payment only'; end if; end $$;

update private.f1_rpc_mock_gates set presence_enabled=false where singleton;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';

-- ASSERT gate off prevents heartbeat and revokes
do $$
begin
 if (private.f1_guarded_ping_presence()) is distinct from false then
  raise exception 'gate off prevents heartbeat and revokes'; end if;
end $$;

reset role;

do $$ begin if not (not(select online_requested from public.bj_provider_presence where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then raise exception 'gate off invalidates availability'; end if; end $$;

rollback;
do $$
begin
 if exists(select 1 from private.f1_quote_pricing_mock) then
  raise exception 'Quote pricing persisted after rollback'; end if;
 if (select quote_enabled or presence_enabled or cancel_enabled
   from private.f1_rpc_mock_gates where singleton) then
  raise exception 'Gate persisted enabled after rollback'; end if;
 if (select status from public.service_requests
   where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'requested'
 or (select status from public.service_requests
   where id='ffffffff-ffff-4fff-8fff-ffffffffffff')<>'awaiting_payment' then
  raise exception 'Request status persisted after rollback'; end if;
 if exists(select 1 from public.payment_records) then
  raise exception 'Finance test wrote outside rollback'; end if;
end $$;
