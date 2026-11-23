# G1 — Auditoria independente pré-restauração (23/11/2026)

**Estado: G1=BLOCKED; RELEASE=NO_GO.** Este é um resultado de auditoria **real** do pacote cifrado existente, não de restauração em PostgreSQL.

## Verificações executadas em ambiente efêmero

O backup `SalvaMotoca-Supabase-TESTES-20261122T215644Z-run45074685352.tar.gz.age` (24.484 bytes) foi lido de uma cópia temporária autorizada, sem publicar a identidade age ou conteúdo SQL. SHA-256 do **ciphertext**: `f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678`.

Um verificador local independente com `cryptography`, seguindo as primitivas do [formato age v1](https://c2sp.org/age@v1.1.0), conferiu a chave pública contra os bytes privados localmente normalizados, derivou a chave de envelope por X25519 + HKDF, verificou HMAC do cabeçalho e autenticou o payload ChaCha20-Poly1305. O arquivo tar.gz resultante foi processado **em memória**, sem persistir os SQLs em disco, e as **7 de 7 entradas de SHA-256 do manifesto** passaram. Pacote com **9 arquivos esperados**, projeto de testes correto, 13/13 cabeçalhos COPY de tabelas de `public`.

## Conteúdo do dump — somente metadados agregados

| Verificação | Resultado |
| --- | --- |
| Tabelas públicas | 13; RLS habilitada nas 13 |
| Tabelas RLS sem políticas | 4 (precisam revisão, podem ser deny-by-default intencional) |
| Definições `CREATE POLICY` | 17 |
| Definições de funções em `schema.sql` | 9 `CREATE OR REPLACE FUNCTION` |
| Grants/Revoke | 83 `GRANT` e 7 `REVOKE` |
| Blocos `COPY public` | 13 blocos; **80 linhas de dados** |
| Blocos `COPY auth` | 26 blocos; **0 linhas de dados** |
| Blocos `COPY storage` | 7 blocos; **1 linha de metadados** |
| Migrações | 11 versões no histórico |
| Contagem do inventário | 36 prestadores prospectados, 40 ofertas, 1 configuração, Auth users 0, Storage objects 0 |
| Extensões presentes no SQL | `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` |
| Criação de esquemas `auth` e `storage` no `schema.sql` | **Ausente**, dependem de provisionamento prévio compatível |
| Comandos de banco diretamente destrutivos (`DROP DATABASE`, `ALTER SYSTEM`, etc.) | 0 pelas regras do scanner; **não é prova completa contra todos os riscos** |

O dump inclui `COPY auth` e `COPY storage` mesmo com zero usuários e zero objetos físicos; o único registro de Storage corresponde ao metadado que precisa existir no serviço base. Portanto, **não basta importar cegamente os cinco SQLs em um PostgreSQL 17 vazio**. Primeiro é necessário provisionar um ambiente local Supabase compatível com seus schemas, funções, roles e extensões. As 80 linhas de `public` incluem mais que as 77 linhas das três tabelas de prospecção/configuração; não tratá-las como dados substituíveis sem auditoria.

## Por que a restauração não foi executada aqui

O ambiente efêmero ofereceu Python e biblioteca `cryptography`, mas **não** disponibilizou binários `postgres`, `initdb` ou `pg_ctl`. O gerenciador Debian não conseguiu resolver os hosts de distribuição (sem conexão/DNS), de modo que não foi possível instalar PostgreSQL 17. Uma consulta somente de leitura ao Supabase de testes mostrou que ele permanece saudável, mas não foi usado como destino de restauração, por segurança. A conta não tinha branch de Supabase pronta para uso.

**Nenhum SQL real foi enviado ao GitHub, nenhuma chave foi compartilhada, nenhum backup foi sobrescrito, nenhuma instância Supabase hospedada foi modificada.**

## Próximo requisito de aceite G1

Disponibilizar PostgreSQL 17 **com base de serviços Supabase compatível** em ambiente isolado (Docker/Supabase local ou máquina privada independente), executar importação com isolamento e autenticação da chave privada, conferir roles, tabelas, 80 registros públicos, RLS/policies, funções, índices, grants, 11 migrações e a configuração de Storage; confirmar ausência de dados Auth, validação das extensões e ausência de falhas em importação. Dados privados nunca em logs, issue, PR ou artifact públicos. Reavaliar lacunas Auth/Storage e consistência de snapshot separadamente.

**Somente após recuperação real e testes funcionais o G1 pode mudar de BLOCKED; não liberar operações comerciais automaticamente.**
