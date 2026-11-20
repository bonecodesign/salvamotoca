-- Conjunto de teste somente em PostgreSQL 17 DESCARTÁVEL.
\set ON_ERROR_STOP on
insert into public.service_categories(id,code,paid_in_app)
 values(2,'borracharia_delivery',true);
insert into public.providers(id,owner_id,status,is_active)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '22222222-2222-4222-8222-222222222222','approved',true);
insert into public.service_requests(id,customer_id,provider_id,category_id,
 service_types,status)
 values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
 array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,
 amount_cents,status)
 values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',27000,'accepted');
insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'service','pneu_furado',23000),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,'travel','deslocamento',4000);
update private.f4_release_gate set enabled=true;
begin;
select set_config('app.f4_test_only','local_fixture',true);
select private.f4_prepare_mock_attempt(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
commit;
