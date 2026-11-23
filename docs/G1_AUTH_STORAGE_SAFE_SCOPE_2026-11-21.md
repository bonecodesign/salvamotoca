# G1 — guarda de escopo Auth/Storage, backup SQL lógico (21/11/2026)

**Salva Motoca!** — Supabase existente, APENAS TESTES: `yivkqyjdeouxnwtwfekc`. `G1=BLOCKED`, `RELEASE=NO_GO`. Sem alterações na base hospedada e sem acionar o backup real.

## Lacuna concreta

O exportador `scripts/g1-actions-backup-real.sh` preserva os dumps lógicos (roles, esquema de aplicação, dados de aplicação, esquema e histórico de migrations) e um inventário básico do schema `public`. **Não há comprovação de recuperação do serviço Auth, sua configuração externa ou da configuração/bits dos objetos do Storage.** O SQL de backup não substitui uma restauração real de um serviço Supabase compatível. A [documentação oficial de recuperação da plataforma](https://supabase.com/docs/guides/self-hosting/restore-from-platform) separa a recuperação de banco da transferência de objetos físicos do Storage e de funções Edge.

A trava existente abortava em `storage.objects > 0`, mas não bloqueava nem tornava explícita a exclusão de outros registros gerenciados, como `auth.users`, identidades, sessões ou refresh tokens. O bucket privado permanecia fora do escopo restaurável do pacote.

## Leitura direta do Supabase de testes nesta rodada — sem linhas pessoais

| Escopo | Inventário encontrado |
|---|---|
| auth.users | 0 |
| auth.identities | 0 |
| auth.sessions | 0 |
| auth.refresh_tokens | 0 |
| auth.mfa_factors | 0 |
| auth.flow_state | 0 |
| storage.objects | 0 |
| storage.buckets | 1 |
| Bucket | `request-photos` (privado, JPEG, 5 MiB) |
| Políticas `storage.objects` | 3; hash SHA-256 de metadados verificado em 22/11/2026 |
| Edge Functions implantadas | 0 |

**Inventário é uma fotografia; não prova nenhuma restauração, nem cobre todas as configurações externas de Auth, Storage e ambientes.**

## Proteções novas, sem reexecutar trabalhos anteriores

1. `scripts/g1-actions-backup-real.sh`: lê somente contagens de **seis tabelas gerenciadas Auth**, `storage.objects`, quantidade de policies de `storage.objects` e **configuração visível do bucket**. Faz isso antes e depois dos dumps. Aborta se qualquer contagem de Auth ou Storage for positiva, se houver mudança no conjunto de buckets, se o bucket ficar público, se o MIME/tamanho não corresponder, ou se as policies deixarem a contagem de referência.
2. `scripts/g1-verify-managed-scope.py`: programa offline com rejeição por padrão (fail closed), conferindo estrutura JSON e valores. Nunca lê registros privados ou arquivos do Storage. A configuração atual do bucket é **uma referência de TESTES**, não uma política permanente nem indicação de que o bucket possa ser restaurado automaticamente.
3. `source_managed_scope_before.json`: novo inventário empacotado somente **dentro do `tar.gz.age` cifrado**, listado no `manifest.sha256`. A exportação rejeita mudança nos metadados entre antes/depois.
4. `scripts/g1-verify-encrypted-bundle.py`: a verificação offline exige o novo arquivo dentro do pacote criptografado, valida SHA-256 e recusa Auth gerenciado não recuperável, arquivos Storage ou divergência de configuração. Pacotes antigos sem esse metadado **não devem ser aprovados** por engano.
5. `manifest.txt` descreve honestamente limitações: `auth_managed_schema_recovery_proven=false`, `storage_bucket_configuration_recovery_proven=false`, `storage_physical_objects_included=false`, `g1_restoration_verified=false`.
6. Testes: mocks **sem rede** para Auth com usuários/identidades, bucket tornado público, políticas alteradas e objetos físicos. Ensaio PostgreSQL 17 usa registros inventados e uma referência falsa, sem credenciais reais.

## Limites preservados

- Uma série de dumps SQL independentes + comparações de inventário não é um snapshot transacional atômico; a versão atual ainda precisa de prova de consistência real após restaurar.
- A guarda **recusa** registros Auth em vez de inventar uma rotina de restauração do serviço Auth. Isso preserva o escopo de testes, mas precisa ser ampliado futuramente antes de uma operação real com clientes.
- Guardar JSON contendo definição do bucket não é o mesmo que **recriar e homologar** políticas, bytes, permissões, URLs assinadas ou configurações externas.
- Além da contagem, um **SHA-256 do catálogo completo de `pg_policies` de `storage.objects`** agora protege a exportação contra mudanças de textos, papéis, permissividade, comandos e predicados, mesmo que a quantidade de políticas permaneça igual. O hash é calculado por `SELECT`, sem exportar textos de policies nem linhas pessoais, lido antes/depois e guardado apenas no arquivo cifrado. A referência é específica da base de TESTES de 22/11/2026; alterações intencionais exigem atualização revisada dessa referência.
- Este teste detecta *drift* estrutural, **não comprova isolamento funcional, autenticidade de origem, transferência de objetos ou restauração**. O comparador geral de catálogo já desenvolvido no PR #69 continua separado, sem duplicação.
- Não há backup verdadeiro porque o segredo `G1_SUPABASE_DB_URL` ainda é rejeitado (`PASSWORD_REJECTED` na [execução #44964994102](https://github.com/bonecodesign/salvamotoca/actions/runs/44964994102)). Não repetir com o mesmo segredo.
- Não acessar nem movimentar chaves privadas AGE guardadas no Dropbox. Nunca copiar dados confidenciais para GitHub Actions ou PRs.

**Complemento 22/11/2026:** auditoria SQL de somente leitura confirmou três políticas e assinatura SHA-256 `c75f54c93a080d4552558ce59539c2e8813a645b5dfdfe44ebd328839aad2254` sobre o JSONB ordenado de `pg_policies`. Os testes fictícios passam a rejeitar mudança sem alteração na contagem, drift entre pré/pós-exportação e pacote cifrado recriado com novo manifesto de checksums. Nenhum dado de cliente, objeto de Storage ou senha foi exportado nesta verificação.

**Resultado correto desta etapa:** uma proteção adicional de integridade e escopo. Não é recuperação real nem liberação comercial. `G1=BLOCKED`; `RELEASE=NO_GO`.

## Reconciliação de código — 22/11/2026

A lógica deste documento foi transportada do PR #108 para uma branch criada sobre a `main` que já integra os PRs #109–#115. A guarda manual do #111, a identificação da pasta Dropbox do #114 e os testes relacionais do #115 foram preservados. Nova consulta direta **apenas SELECT** em 22/11/2026 reconfirmou zero registros Auth gerenciados, zero Storage objects, três policies com hash esperado, e bucket request-photos privado/JPEG/5 MiB. **Nenhuma exportação real, restauração real ou alteração hospedada foi feita nesta etapa. G1=BLOCKED; RELEASE=NO_GO.**
