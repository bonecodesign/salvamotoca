-- Preparação COMMITADA somente no Postgres descartável da pipeline F2.
\set ON_ERROR_STOP on
begin;
insert into public.service_categories(id,code) values(2,'borracharia_delivery');
insert into public.providers(id,owner_id,status,is_active,latitude,longitude) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','approved',true,-19.925,-43.939),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','approved',true,-19.926,-43.938);
insert into public.service_requests(id,customer_id,category_id,provider_id,service_types,
 latitude,longitude,status) values (
 '77777777-7777-4777-8777-777777777777',
 '11111111-1111-4111-8111-111111111111',2,null,array['pneu_furado'],
 -19.924,-43.938,'requested');
insert into public.service_quotes(id,request_id,provider_id,amount_cents,status)
values
('88888888-8888-4888-8888-888888888801',
 '77777777-7777-4777-8777-777777777777',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10000,'proposed'),
('88888888-8888-4888-8888-888888888802',
 '77777777-7777-4777-8777-777777777777',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',12000,'proposed');
insert into public.f2_request_offers(id,request_id,provider_id,status,offered_at,delivered_at,
 replied_at,quote_id) values
('99999999-9999-4999-8999-999999999901',
 '77777777-7777-4777-8777-777777777777',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quoted',now(),now(),now(),
 '88888888-8888-4888-8888-888888888801'),
('99999999-9999-4999-8999-999999999902',
 '77777777-7777-4777-8777-777777777777',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','quoted',now(),now(),now(),
 '88888888-8888-4888-8888-888888888802');
update private.f2_release_gate set enabled=true;
commit;