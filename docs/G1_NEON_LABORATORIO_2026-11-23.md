# G1 — laboratório Neon PostgreSQL 17 (23/11/2026)

**G1=BLOCKED; RELEASE=NO_GO.** Complementa G1_WORK_HANDOFF_2026-11-22.md e G1_AUDITORIA_REAL_PRE_RESTORE_2026-11-23.md; não substitui o requisito de recuperação integral.

## Execução real
- Organização Neon Free; projeto exclusivo `salvamotoca-g1-laboratorio`, região São Paulo, PostgreSQL 17.12, compute 0.25 CU conforme retorno de criação. Tentativa de definir suspensão manual rejeitada pelo plano; criação com defaults aceita. Nenhum upgrade solicitado.
- Branch `g1-baseline` preservada; branch filha `g1-ensaio-sintetico` usada para testes SQL exclusivamente fictícios.
- Preflight: `pg_stat_statements`, `pgcrypto`, `uuid-ossp` disponíveis, não instaladas; `supabase_vault` não disponível no catálogo. Schemas auth/storage/vault ausentes; roles anon/authenticated/service_role/supabase_admin/supabase_auth_admin/supabase_storage_admin ausentes.
- Fixture inspirada em PR #115: três tabelas, FK, trigger de auditoria SECURITY INVOKER, RLS e função SECURITY DEFINER com search_path explícito. Duas linhas de proprietários, duas notas, duas linhas de auditoria. FK inválida rejeitada com SQLSTATE 23503. RLS com papel não proprietário e identidade fictícia via GUC: atores 1/2 viram respectivamente notas 101/102; ator 3 viu zero. GUC não é identidade confiável de produção. ACL: EXECUTE permitido ao leitor e negado ao outro papel; INSERT negado ao leitor. Baseline sem schema de fixture confirmada.

## Limites
- Ensaio SQL funcional, não dump/restore nem execução de migrações reais. Nenhum conteúdo do backup, credencial ou dado de prospectado enviado ao Neon. Supabase hospedado intacto. Não há prova de restauração real.
- Neon PG17 puro não é destino compatível para os cinco SQLs históricos sem adaptação e não reproduz Auth/Storage/Vault gerenciados. Não falsificar dependências ou ignorar erros para obter PASS. Manter backup cifrado intacto.
- Próximo: ambiente privado Supabase compatível, restaurar pacote autenticado, confrontar inventários e testar RPCs/ACL/RLS. Neon permanece laboratório de testes relacionais sintéticos; eventual uso de dados reais exige revisão de privacidade e procedimento compatível aprovado. Não ativar operações comerciais.
