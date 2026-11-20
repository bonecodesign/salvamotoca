-- ATENÇÃO: teste histórico de uma fase ANTERIOR do piloto. NÃO EXECUTAR novamente.
-- O banco atual exige presença online e bloqueia INSERT direto de service_quotes.
-- Para o teste atualizado, use supabase/tests/presenca_orcamentos_rollback.sql.
-- Conservado apenas como documentação da evolução das regras de segurança.

-- Salva Motoca! — teste de RLS com identidades fictícias.
-- Executar apenas como admin no SQL Editor de banco autorizado.
-- Todos os INSERTs abaixo são revertidos via ROLLBACK.
-- Não gera e-mails. Não habilita pagamentos nem atendimento real.
-- IMPORTANTE: não remover o ROLLBACK do final.

begin;

insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000111','cliente-borracha-teste@example.invalid'),
('00000000-0000-4000-8000-000000000222','prestador-borracha-teste@example.invalid'),
('00000000-0000-4000-8000-000000000333','terceiro-borracha-teste@example.invalid');

insert into public.providers(id,owner_id,display_name,city,state_code,status,is_active,approved_at)
values('10000000-0000-4000-8000-000000000001',
'00000000-0000-4000-8000-000000000222','Prestador Teste de RLS','Belo Horizonte','MG','approved',true,now());

insert into public.provider_services(provider_id,category_id,is_active)
values('10000000-0000-4000-8000-000000000001',2,true);

insert into public.service_requests(id,customer_id,provider_id,category_id,problem_description,address_details,status,request_key)
values('20000000-0000-4000-8000-000000000001',
'00000000-0000-4000-8000-000000000111','10000000-0000-4000-8000-000000000001',
2,'Pneu furado em moto de teste','Rua Exemplo, 123','requested',
'30000000-0000-4000-8000-000000000001');

set local role anon;
do $$ begin
 if (select count(*) from public.providers)!=1 then raise exception 'Anon: prestador não visível'; end if;
 if (select count(*) from public.provider_services)!=1 then raise exception 'Anon: serviço não visível'; end if;
 if has_column_privilege('anon','public.providers','owner_id','select') then raise exception 'Anon: vazamento do owner_id'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.service_requests)!=1 then raise exception 'Cliente: pedido não visível'; end if;
 if (select count(*) from public.bj_get_request_location('20000000-0000-4000-8000-000000000001'))!=1
  then raise exception 'Cliente: endereço não visível'; end if;
 begin
  insert into public.request_messages(request_id,sender_id,body)
  values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000111','Chat antecipado');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Chat pré-pagamento permitido'; end if;
 denied:=false;
 begin
  insert into public.service_requests(customer_id,provider_id,category_id,problem_description,status)
  values('00000000-0000-4000-8000-000000000111',null,3,'Reboque não habilitado','requested');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Reboque indevidamente cobrável'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000222',true);
insert into public.service_quotes(request_id,provider_id,amount_cents,details,status)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',10000,'Orçamento fictício','proposed');
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.service_requests)!=1 then raise exception 'Prestador: pedido não visível'; end if;
 if (select count(*) from public.bj_get_request_location('20000000-0000-4000-8000-000000000001'))!=0
  then raise exception 'Prestador: endereço vazou antes do pagamento'; end if;
 begin
  insert into public.service_quotes(request_id,provider_id,amount_cents,status)
  values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',11000,'proposed');
 exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'Orçamento duplicado foi aceito'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true);
do $$ begin
 if (select count(*) from public.service_quotes)!=1 then raise exception 'Cliente: orçamento não visível'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000333',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.service_requests)!=0 then raise exception 'Terceiro: pedido alheio visível'; end if;
 if (select count(*) from public.service_quotes)!=0 then raise exception 'Terceiro: orçamento alheio visível'; end if;
 if (select count(*) from public.bj_get_request_location('20000000-0000-4000-8000-000000000001'))!=0
  then raise exception 'Terceiro: endereço vazou'; end if;
 begin
  insert into public.providers(owner_id,display_name,city,state_code,status,is_active,approved_at)
  values('00000000-0000-4000-8000-000000000333','Autohomologação','Belo Horizonte','MG','approved',true,now());
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Terceiro conseguiu se autohomologar'; end if;
end $$;

reset role;
do $$ declare denied boolean:=false; begin
 begin
  insert into public.service_requests(customer_id,provider_id,category_id,problem_description,status,request_key)
  values('00000000-0000-4000-8000-000000000111','10000000-0000-4000-8000-000000000001',2,
  'Pedido duplicado','requested','30000000-0000-4000-8000-000000000001');
 exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'Pedido duplicado aceito'; end if;
end $$;

rollback;
-- Todos os dados fictícios acima foram desfeitos; nenhum estado real foi alterado.
select 'PASSOU: simulação RLS finalizada sem dados persistidos' as resultado;
