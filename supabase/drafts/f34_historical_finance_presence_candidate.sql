-- Historical replay overlay, NOT a migration. No real PSP or money changes.
begin;
-- Keep old 15% ledger immutable in meaning: never use it for managed F2/F3.
-- A future versioned real ledger requires separately approved PSP reconciliation.
create function private.f23_guard_legacy_payment()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if exists(select 1 from public.service_requests r where r.id=new.request_id
   and (r.f2_mode is not null or exists(select 1 from public.f2_request_offers o where o.request_id=r.id)))
 then raise exception 'Pagamento legado não se aplica a pedido gerenciado.'; end if;
 return new;
end $guard$;
revoke all on function private.f23_guard_legacy_payment() from public,anon,authenticated;
create trigger f23_no_legacy_payment_on_managed before insert or update on public.payment_records
 for each row execute function private.f23_guard_legacy_payment();

-- Protect historical payment evidence against conversion to managed requests.
create function private.f23_guard_managed_with_legacy_payment()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if new.f2_mode is not null and exists(select 1 from public.payment_records p where p.request_id=new.id)
 then raise exception 'Pedido com pagamento legado não pode mudar de regime.'; end if;
 return new;
end $guard$;
revoke all on function private.f23_guard_managed_with_legacy_payment() from public,anon,authenticated;
create trigger f23_no_managed_with_legacy_payment before update of f2_mode on public.service_requests
 for each row execute function private.f23_guard_managed_with_legacy_payment();

-- Preserve legacy delivery presence and extend it only for a certified tow
-- provider while both F2 and F3 gates are on. No notification side effects.
create function private.f23_presence_eligible(p_provider uuid)
returns boolean language sql stable security definer set search_path='' as $eligible$
 select exists(
  select 1 from public.providers p
  join public.provider_services ps on ps.provider_id=p.id and ps.is_active
  join public.service_categories c on c.id=ps.category_id
  where p.id=p_provider and p.status='approved' and p.is_active
    and (c.code='borracharia_delivery' or (
      c.code='reboque_moto' and private.f3_enabled()
      and lower(btrim(p.city)) in ('belo horizonte','contagem','betim') and p.state_code='MG'
      and exists(select 1 from public.f3_tow_provider_capacity t where t.provider_id=p.id
        and t.verified_by_admin and t.has_ramp and t.has_wheel_chock and t.tie_down_points>=2)
    ))
 );
$eligible$;
revoke all on function private.f23_presence_eligible(uuid) from public,anon,authenticated;
create or replace function public.bj_set_presence(p_online boolean)
returns boolean language plpgsql security definer set search_path='' as $body$
declare v_provider uuid;
begin
 if auth.uid() is null or p_online is null then raise exception 'Acesso não autorizado.'; end if;
 select id into v_provider from public.providers where owner_id=auth.uid() for update;
 if not found or (p_online and not private.f23_presence_eligible(v_provider))
 then raise exception 'Prestador ou modalidade não homologados.'; end if;
 insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at,updated_at)
 values(v_provider,p_online,case when p_online then now() else null end,now())
 on conflict(provider_id) do update set online_requested=excluded.online_requested,
 last_seen_at=excluded.last_seen_at,updated_at=now();
 return p_online;
end $body$;
create or replace function public.bj_ping_presence()
returns boolean language plpgsql security definer set search_path='' as $body$
begin
 if auth.uid() is null then return false; end if;
 update public.bj_provider_presence b set
 online_requested=private.f23_presence_eligible(b.provider_id),
 last_seen_at=case when private.f23_presence_eligible(b.provider_id) then now() else null end,
 updated_at=now()
 from public.providers p
 where p.id=b.provider_id and p.owner_id=auth.uid() and b.online_requested;
 if not found then return false; end if;
 return exists(select 1 from public.bj_provider_presence b join public.providers p on p.id=b.provider_id
 where p.owner_id=auth.uid() and b.online_requested);
end $body$;
revoke all on function public.bj_set_presence(boolean),public.bj_ping_presence() from public,anon,authenticated;
grant execute on function public.bj_set_presence(boolean),public.bj_ping_presence() to authenticated;
-- Public catalog stays legacy delivery-only; F3 matches privately by capacity.
-- Legacy category metadata and commission columns remain untouched.
commit;
