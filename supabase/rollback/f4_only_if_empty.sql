-- F4 — rollback CANDIDATO para container isolado.
-- NÃO executar no Supabase real sem backup restaurável e revisão operacional.
-- Só funciona se F4 DESLIGADA e todas as tabelas financeiras F4 vazias.
begin;
do $guard$
begin
  if not exists(select 1 from private.f4_release_gate
       where singleton and not enabled)
  then raise exception 'Rollback F4 bloqueado: gate ativo.'; end if;
  if exists(select 1 from private.f4_mock_payment_attempts limit 1)
   or exists(select 1 from private.f4_mock_webhook_receipts limit 1)
   or exists(select 1 from private.f4_mock_ledger_entries limit 1)
  then raise exception 'Rollback F4 bloqueado: existem registros financeiros.'; end if;
end $guard$;
drop function public.f4_quote_preview(uuid);
drop function private.f4_prepare_mock_attempt(uuid);
drop function private.f4_ingest_mock_event(uuid,text,text,integer,text);
drop trigger f4_ledger_no_update_delete on private.f4_mock_ledger_entries;
drop function private.f4_deny_ledger_mutation();
drop table private.f4_mock_ledger_entries;
drop table private.f4_mock_webhook_receipts;
drop table private.f4_mock_payment_attempts;
drop table private.f4_release_gate;
commit;
