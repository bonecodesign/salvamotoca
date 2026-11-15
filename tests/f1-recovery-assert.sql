-- F1 / Salva Motoca! — asserts para RESTAURACAO DE FIXTURE, nunca remoto.
do $$
declare
 a int;
begin
 if to_regclass('auth.users') is null
 or to_regclass('storage.buckets') is null
 or to_regclass('storage.objects') is null
 or to_regclass('public.service_requests') is null
 or to_regclass('private.backup_rehearsal_marker') is null
 then raise exception 'Schema completo da fixture nao foi restaurado'; end if;

 select count(*) into a from auth.users;
 if a<>1 then raise exception 'Contagem auth mock nao corresponde'; end if;
 select count(*) into a from public.service_requests;
 if a<>1 then raise exception 'Pedidos sintéticos nao foram restaurados'; end if;
 select count(*) into a from storage.objects;
 if a<>1 then raise exception 'Metadados Storage sinteticos nao foram restaurados'; end if;
 if (select public from storage.buckets where id='request-photos')<>false
 then raise exception 'Bucket synthetic deve ser privado'; end if;
 if not exists(select 1 from private.backup_rehearsal_marker
   where id=1 and note='CI_OFFLINE_SYNTHETIC_ONLY')
 then raise exception 'Marcador de restore ausente'; end if;
 if not (select relrowsecurity from pg_class
   where oid='public.service_requests'::regclass)
 or not (select relrowsecurity from pg_class
   where oid='storage.objects'::regclass)
 then raise exception 'RLS nao foi restaurada'; end if;
 if not exists(select 1 from pg_policies
   where schemaname='public' and tablename='service_requests'
   and policyname='f1_owner_read')
 then raise exception 'Politica RLS nao foi restaurada'; end if;
 if has_table_privilege('anon','public.service_requests','SELECT')
 then raise exception 'Role anon obteve SELECT'; end if;
 if not has_table_privilege('authenticated','public.service_requests','SELECT')
 then raise exception 'Role autenticada perdeu grant de leitura'; end if;
end $$;

-- Usuario legitimamente associado enxerga 1 registro sintético.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 if (select count(*) from public.service_requests)<>1
 then raise exception 'RLS de dono falhou no Postgres de teste'; end if;
end $$;
reset role;

-- Outro usuario ficticio nao enxerga o pedido.
set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
begin
 if (select count(*) from public.service_requests)<>0
 then raise exception 'Terceiro obteve acesso indevido ao mock'; end if;
end $$;
reset role;
