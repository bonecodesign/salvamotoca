-- Synthetic BH / Contagem / Betim identities for LOCAL PG17 tests ONLY.
-- Latitude/longitude here are invented fixtures, never device or user location.
insert into public.service_categories(id,code) values(2,'borracharia_delivery');
insert into public.providers(
 id,owner_id,display_name,status,is_active,city,state_code,latitude,longitude
) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '22222222-2222-4222-8222-222222222222','Provedor Ficticio A','approved',true,
 'Belo Horizonte','MG',-19.922,-43.940),
('ffffffff-ffff-4fff-8fff-ffffffffffff',
 '77777777-7777-4777-8777-777777777777','Provedor Ficticio F','approved',true,
 'Belo Horizonte','MG',-19.926,-43.940),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '33333333-3333-4333-8333-333333333333','Provedor Ficticio B','approved',true,
 'Contagem','MG',-20.008,-43.940),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '44444444-4444-4444-8444-444444444444','Provedor Ficticio C','approved',true,
 'Betim','MG',-20.270,-43.940),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '55555555-5555-4555-8555-555555555555','Provedor Ficticio D','suspended',false,
 'Belo Horizonte','MG',-19.921,-43.940),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '66666666-6666-4666-8666-666666666666','Provedor Ficticio E','approved',true,
 'Belo Horizonte','MG',-19.9215,-43.940);
insert into public.provider_services(provider_id,category_id,is_active)
select id,2,true from public.providers;
insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at)
select id,true,pg_catalog.now() from public.providers;
insert into public.f2_provider_capacity(provider_id,service_types,coverage_km)
select id,case when id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
 then array['troca_pneu']::text[] else array['pneu_furado']::text[] end,
 60 from public.providers;
insert into public.service_requests(
 id,customer_id,category_id,service_types,latitude,longitude,
 f2_mode,status,problem_description
) values
('11111111-aaaa-4111-8111-111111111111',
 '11111111-1111-4111-8111-111111111111',2,array['pneu_furado'],
 -19.920,-43.940,'automatic','requested','Foto ficticia não anexada'),
('11111111-bbbb-4111-8111-111111111111',
 '11111111-1111-4111-8111-111111111111',2,array['pneu_furado'],
 -19.920,-43.940,'automatic','requested','Corrida de teste sem dados reais');
