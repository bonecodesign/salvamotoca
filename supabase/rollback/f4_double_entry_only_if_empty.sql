-- F4 — rollback APENAS da extensão contábil MOCK, com gate desligado e journals vazios.
-- Não executar em Supabase real. Mantém o backend F4 base e F1/F2/F3 intactos.
begin;
do $safe$
begin
 if not exists(select 1 from private.f4_release_gate
   where singleton and not enabled)
 then raise exception 'Rollback contábil F4 bloqueado: gate ativo.'; end if;
 if exists(select 1 from private.f4_mock_journals limit 1)
  or exists(select 1 from private.f4_mock_journal_lines limit 1)
 then raise exception 'Rollback contábil F4 bloqueado: existem partidas.'; end if;
end $safe$;
drop function private.f4_mock_settlement_review(uuid,boolean,boolean,boolean);
drop function private.f4_post_mock_double_entry(bigint);
drop trigger f4_journal_balance_on_header on private.f4_mock_journals;
drop trigger f4_journal_balance_on_line on private.f4_mock_journal_lines;
drop trigger f4_mock_journal_immutable on private.f4_mock_journals;
drop trigger f4_mock_lines_immutable on private.f4_mock_journal_lines;
drop function private.f4_check_mock_journal_balance();
drop table private.f4_mock_journal_lines;
drop table private.f4_mock_journals;
commit;
