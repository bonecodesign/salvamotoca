-- Native CI overlay only. No activation marker inserted here.
begin;
create or replace function private.f5_mock_enabled()
returns boolean language sql stable security definer set search_path='' as $native$
 select auth.uid() is not null and current_database()='postgres'
  and private.f56_fixture_context()
  and exists(select 1 from private.f5_mock_release_gate where enabled);
$native$;
create or replace function private.f6_mock_enabled()
returns boolean language sql stable security definer set search_path='' as $native$
 select auth.uid() is not null and current_database()='postgres'
  and private.f56_fixture_context()
  and exists(select 1 from private.f6_mock_release_gate where enabled);
$native$;
create or replace function private.f23_mock_require_admin()
returns void language plpgsql security definer set search_path='' as $native$
begin
 if private.f56_fixture_context() is distinct from true
 or not exists(select 1 from private.f23_mock_support_gate where enabled)
 or auth.uid() is null or not exists(select 1 from private.f23_mock_admins where user_id=auth.uid())
 then raise exception 'F23 acesso administrativo negado';end if;
end $native$;
commit;
