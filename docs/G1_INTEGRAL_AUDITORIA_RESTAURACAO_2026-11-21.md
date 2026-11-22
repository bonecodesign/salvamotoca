# Salva Motoca! — G1: auditoria de recuperação funcional (21/11/2026, horário de Brasília)

**Somente leitura no Supabase de TESTES `yivkqyjdeouxnwtwfekc`. Nenhum usuário cadastrado, nenhuma operação comercial e nenhum SQL alterado. `G1=BLOCKED`, `RELEASE=NO_GO`.**

## Revisão do GitHub antes de criar código

Na `main`, já existem os scripts de exportação cifrada com `age`, verificadores de todas as tabelas `public`, RLS e quantidade de policies, prova de `pg_dump`/`pg_restore` PostgreSQL 17 e verificações adversariais. PRs #91, #104, #105, #106 e #107 foram mesclados; o gatilho automático excepcional de login foi removido. Última tentativa real [GitHub Actions #44964994102](https://github.com/bonecodesign/salvamotoca/actions/runs/44964994102): `PASSWORD_REJECTED`. Portanto **não repetir tentativas remotas até corrigir o secret**.

O [PR #69](https://github.com/bonecodesign/salvamotoca/pull/69), ainda aberto em **ramo antigo empilhado**, já possui um comparador de fingerprints de oito classes de catálogo e contagens para a restauração privada. Não recriar o comparador nem mesclar a pilha antiga sem revisar contra `main`. Este pacote complementa essa ferramenta com prova **funcional** dos dados restaurados.

## Fotografia de catálogo do projeto de testes, só SELECT

| Objeto ou característica | Encontrado | O que já temos | Lacuna real |
|---|---:|---|---|
| `public` — tabelas | 13 | `CREATE TABLE` e `COPY` checados dinamicamente | Restauração verdadeira dos registros ainda não executada |
| `public` — tabelas com RLS ativa | 13 | Ativação e quantidade de políticas no dump verificadas | Predicados e direitos efetivos precisam ser validados após restauração |
| `public` — políticas RLS | 17 | Quantidade por tabela conferida | Qualificadores e `WITH CHECK` não conferidos pelo verificador atual |
| `public` — funções | 8 | Podem estar incluídas no `schema.sql` | Falta prova de invocação e de ACLs após restauração |
| `public` — `SECURITY DEFINER` executáveis por `authenticated` | 6 | Advisor de segurança confirma o status | Revisão individual de autorização e controle de ownership antes do lançamento |
| `public` — chaves estrangeiras | 16 | `schema.sql` pode conter as constraints | Integridade referencial não era exercitada após restauração |
| `public` — triggers não internos | 2 | `schema.sql` pode conter as definições | Comportamento após recuperação não era exercitado |
| `auth` — tabelas | 27 | `auth.users` e `auth.sessions` = 0 | A estrutura gerenciada, dados e parâmetros externos de Auth **não foram restaurados** |
| `storage` — tabelas | 10 | `storage.objects` = 0; guarda interrompe backup se >0 | Metadados, políticas e recuperação futura de bytes físicos não comprovados |
| `storage` — políticas | 3 | Presentes no projeto | Recuperação e acesso do bucket ainda não comprovados |
| `storage` — buckets | 1 | `request-photos`, **privado**, `image/jpeg`, limite 5 MiB | Recriação de configuração e políticas precisa ser exercitada em instância Supabase isolada |
| Histórico de migrações | 11 | Dump específico já preparado | Restauração histórica real ainda pendente |
| Extensões | 5 | `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` | Compatibilidade, Vault e chaves mestres exigem ensaio separado |

**Observação de segurança:** o advisor exibiu quatro tabelas com RLS e nenhuma política, além de seis funções `SECURITY DEFINER` acessíveis a autenticados. RLS sem política pode representar bloqueio intencional por padrão, e função definer pode ser necessária para um fluxo de negócio; nenhuma dessas descobertas autoriza alterar `GRANT`, `REVOKE`, funções ou tabelas remotamente. Referências do Supabase:
- [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- [Função SECURITY DEFINER acessível](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## O que foi acrescentado neste pacote

`tests/g1-functional-relational-recovery-pg17-offline.sh` exerce uma prova **real** dentro de **dois bancos PostgreSQL 17 descartáveis, com registros totalmente fictícios**:

1. Cria dois atores falsos, duas tabelas associadas por FK, uma tabela de auditoria, uma função de trigger, um trigger, duas políticas RLS, uma função `SECURITY DEFINER` de exemplo com EXECUTE revogado para `PUBLIC` e concedido somente a um ator.
2. Executa `pg_dump` **nativo**, mantendo os `GRANT`/`REVOKE`; empacota, calcula SHA-256, criptografa por `age` com chave efêmera, decifra, verifica hashes e restaura em **segundo banco descartável**.
3. Faz importação de dados com triggers de usuário desabilitados **somente naquela sessão/DB sintético** (para não duplicar auditoria), depois prova que um novo INSERT gera exatamente um evento. `session_replication_role` não deve ser transferido mecanicamente para Supabase hospedado: depende de privilégios e do procedimento oficial de recuperação.
4. Verifica **validação de chaves estrangeiras** (recusa referência inexistente), isolamento RLS entre os dois atores fictícios, RLS ativa, permissões SELECT sem INSERT, `SECURITY DEFINER` com permissão de EXECUTE restrita e trigger funcional após restauro.
5. Os resultados esperados são marcadores `PASS` apenas para a *fixture*; jamais mudam `G1=BLOCKED` ou `RELEASE=NO_GO`.

**Limite explícito do teste de RLS:** o cenário fictício usa variável de sessão simulando identidade e **não** é modelo seguro para produção; usuários reais utilizam autenticação Supabase e claims confiáveis. A fixture não verifica as funções de negócio verdadeiras nem seu código, e não conecta ao Supabase.

## O que ainda falta para G1 real

1. Atualizar o **secret PostgreSQL do Environment protegido GitHub**. O erro de autenticação foi comprovado; não repetir com senha sabidamente recusada.
2. Exportar o backup verdadeiro ao destino privado, proteger a chave `age` independentemente do backup e verificar a integridade do pacote.
3. Restaurar de verdade em instância Supabase local compatível e isolada. **Não** aplicar `DROP SCHEMA` ou `session_replication_role` da fixture no banco hospedado.
4. Comparar funções/ACLs/predicados RLS, triggers, FKs, migrations e extensões contra o catálogo de origem, reutilizando a abordagem do PR #69 após revisão.
5. Exercitar recuperação de Auth (schema e parâmetros do serviço) e Storage (bucket, policies, metadados, bytes físicos se futuramente existirem). O backup SQL por si só não guarda as configurações externas nem os bytes de Storage.
6. Registrar evidências privadas, revisar as seis RPCs definer e manter lançamento comercial bloqueado até os demais gates.

**Nada foi contratado, nenhum dump privado foi exportado e nenhum dado hospedado foi modificado neste pacote.**
