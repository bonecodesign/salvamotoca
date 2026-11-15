-- Rollback SEGURO de extensão F4 risk/mock, somente em PostgreSQL 17 descartável.
-- Gate desativado E sem casos ou intenções. Preserva F4 base/double-entry e F1–F3.
-- NÃO EXECUTAR NO SUPABASE HOSPEDADO.
begin;
do $guard$
begin
 if not exists(select 1 from private.f4_release_gate where singleton and not enabled)
 then raise exception 'Rollback de risco F4 bloqueado: gate ativo.'; end if;
 if exists(select 1 from private.f4_mock_risk_cases limit 1)
   or exists(select 1 from private.f4_mock_settlement_intents limit 1)
 then raise exception 'Rollback de risco F4 bloqueado: existem casos ou intenções.'; end if;
end $guard$;
drop trigger f4_mock_risk_hold_settlement on private.f4_mock_risk_cases;
drop function private.f4_queue_mock_settlement_review(uuid,text,boolean,boolean);
drop function private.f4_close_mock_risk_case(uuid);
drop function private.f4_open_mock_risk_case(uuid,text,text,integer);
drop function private.f4_hold_mock_settlement();
drop table private.f4_mock_settlement_intents;
drop table private.f4_mock_risk_cases;
commit;
