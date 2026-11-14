-- F1: reversao MANUAL do esquema aditivo no UNICO Supabase.
-- NAO EXECUTAR sem autorizacao explicita e sem inspecao de possiveis pedidos F1.
-- Nao retira fotos pelo SQL; objetos Storage devem ser geridos somente por API.
-- Se houver uploads/pedidos F1, interrompe sem alterar nada: preservar dados.
begin;

do $f1_guard$
begin
  if exists (
    select 1 from public.service_requests
    where motorcycle_brand is not null or motorcycle_model is not null
       or motorcycle_year is not null or service_types is not null
       or photo_path is not null
  ) then
    raise exception 'Rollback bloqueado: existem pedidos F1; preserve os dados';
  end if;
  if exists (
    select 1 from storage.objects where bucket_id = 'request-photos'
  ) then
    raise exception 'Rollback bloqueado: existem fotos no Storage; nao apagar por SQL';
  end if;
end;
$f1_guard$;

drop trigger if exists sm_f1_photo_exists_on_insert on public.service_requests;
drop function if exists public.sm_f1_verify_photo_exists();

drop policy if exists "f1_request_photo_author_upload" on storage.objects;
drop policy if exists "f1_request_photo_participants_read" on storage.objects;
drop policy if exists "f1_request_photo_author_delete" on storage.objects;

alter table public.service_requests
  drop constraint if exists f1_payload_all_or_none_check,
  drop constraint if exists f1_vehicle_data_check,
  drop constraint if exists f1_selected_service_types_check,
  drop constraint if exists f1_photo_path_owned_by_customer;

alter table public.service_requests
  drop column if exists motorcycle_brand,
  drop column if exists motorcycle_model,
  drop column if exists motorcycle_year,
  drop column if exists service_types,
  drop column if exists photo_path;

-- Manter bucket privado (sem objetos) para nao manipular metadados Storage via SQL.
-- A eventual remocao deve ser feita SOMENTE pelo dashboard/API do Storage.
commit;
