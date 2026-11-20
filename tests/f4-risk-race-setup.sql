-- Somente CI PostgreSQL 17 descartável. Gera UM journal fictício no banco local.
\set ON_ERROR_STOP on
begin;
select set_config('app.f4_test_only','local_fixture',true);
update private.f4_release_gate set enabled=true;
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_concurrent_mock_001'));
commit;
