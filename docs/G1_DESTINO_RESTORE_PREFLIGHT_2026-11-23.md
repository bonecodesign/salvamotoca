# G1 — preflight do destino de recuperação (23/11/2026, horário Brasil)

**G1=BLOCKED; RELEASE=NO_GO.** Escopo somente Salva Motoca!. Consulta SELECT ao projeto de TESTES original, sem alterar banco, roles, configurações ou outros projetos. Ambiente atual sem postgres/initdb/pg_ctl/psql/pg_restore/Docker/Podman/Supabase CLI/age e sem resolução DNS dos repositórios de instalação testados.

## Catálogo real atual (não é inventário do instante do backup)
- PostgreSQL 17.11; projeto ACTIVE_HEALTHY em São Paulo; organização Free; um projeto visível nesta conexão; nenhuma branch de desenvolvimento.
- Extensões instaladas: pg_stat_statements 1.11, pgcrypto 1.3, uuid-ossp 1.1 (schema extensions), supabase_vault 0.3.2 (schema vault), plpgsql 1.0 (pg_catalog).
- 27 tabelas base auth, 10 storage, 3 policies F1 em storage.objects (INSERT autor, SELECT participantes, DELETE autor). 11 triggers não internos gerenciados em storage.buckets/objects; nenhum em auth no resultado. Comparar catálogo e versões do destino antes de importar. As 26/7 seções COPY históricas não equivalem à contagem atual de tabelas; há exclusões e possível evolução de schema, investigar sem inferir perda.

## Procedimento de decisão
- Neon PG17 disponível para ensaios fictícios, mas supabase_vault ausente. Não mascarar extensão ou simular recuperação integral.
- Supabase Free permite até dois projetos ativos por conta, limite transversal às organizações administradas; a visibilidade de um projeto nesta conexão não garante cota livre. Verificar autorização da organização e custo zero antes de provisionar segundo projeto. Não consultar nem modificar outros projetos para liberar cota. Clone físico gerenciado exige plano pago; não contratar. Um projeto vazio novo não é recuperação por si só.
- Se houver destino Supabase isolado e sem custo, validar versão, schemas gerenciados, roles, funções de Auth/Storage, extensões e ausência de dados de negócio. Separar credenciais do original e destino; verificar identidade do alvo e bloquear operação externa, API/integrações reais; revisar exposição de Data API, default ACL e RLS antes de dados. Não carregar backup privado por chamadas SQL do chat ou CI pública. Usar executor privado com psql e age e caminho de acesso ao arquivo cifrado autorizado. Sem esse executor, destino remoto sozinho não resolve o gate.
- Preferir stack Supabase local privada com Docker se a cota não estiver disponível. Usar pacote histórico autenticado de 7 hashes já existente. Revisar roles.sql, schema.sql, data.sql e história; reconciliar schemas e dados gerenciados com versão do destino, sem ignorar erros ou substituir tabelas gerenciadas cegamente. Validar policies customizadas Storage separadamente, conforme documentação; sem bytes físicos no backup. Conferir ACL, RLS, contagens, funções, triggers, histórico, sessões e lacunas de configuração. Não fazer restore sobre o projeto original.

Referências: https://supabase.com/docs/guides/platform/billing-on-supabase ; https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore ; https://supabase.com/docs/guides/platform/clone-project ; https://supabase.com/docs/guides/local-development/restoring-downloaded-backup .

Nenhum projeto novo criado nesta rodada, nenhum backup refeito, nenhum dado privado transferido. Próxima intervenção: autorização explícita da organização para verificar/provisionar destino gratuito, ou acesso a executor privado com stack local. Não declarar restauração concluída.
