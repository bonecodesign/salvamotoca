-- Ensaio de ROLLBACK NEGATIVO: a reversão deve falhar ao encontrar journal,
-- mesmo que o lançamento ainda esteja na transação corrente.
\set ON_ERROR_STOP on
begin;
select set_config('app.f4_test_only','local_fixture',true);
update private.f4_release_gate set enabled=true;
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_concurrent_mock_001'));
update private.f4_release_gate set enabled=false;
\ir ../supabase/rollback/f4_double_entry_only_if_empty.sql
-- O erro deve ocorrer antes daqui, levando ao ROLLBACK automático da conexão.
