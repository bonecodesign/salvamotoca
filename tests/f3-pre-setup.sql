-- PostgreSQL 17 DESCARTÁVEL: valida que o bloqueio F1 original antecede F3.
-- O candidato F3 altera esta CHECK e instala gatilho fechado.
alter table public.service_requests add constraint f1_selected_service_types_check
check(service_types is null or (
  cardinality(service_types) between 1 and 6
  and array_position(service_types,null) is null
  and service_types <@ array['pneu_furado','troca_camara','troca_pneu',
       'calibragem_valvula','reboque_moto','outro']::text[]
  and not ('reboque_moto'=any(service_types))
));
