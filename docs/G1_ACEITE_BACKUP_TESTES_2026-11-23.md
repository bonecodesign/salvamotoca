# G1 — consolidação do aceite do backup histórico de TESTES

**G1_REAL_BACKUP_RESTORE=PASS; RELEASE=NO_GO.** Aceite técnico limitado ao backup histórico de TESTES, com evidências reais no relatório [restauração Native](G1_RESTAURACAO_REAL_SUPABASE_NATIVE_2026-11-23.md). Integração formal concluída na main pelo [PR #123](https://github.com/bonecodesign/salvamotoca/pull/123). Não autoriza gravações remotas ou operação comercial.

## Critérios comprovados
- Backup real cifrado em dois locais privados; identidade autenticada; 7/7 hashes.
- Restauração independente dos cinco SQLs em Supabase Native PG17, 47/47 blocos COPY iguais (80 registros public, 11 migrações); 16 FKs válidas, 9/9 categorias de catálogo após reconciliação, 34 verificações funcionais Auth/JWT e Storage locais. Encerramento do ambiente temporário registrado.
- Supabase original consultado somente em leitura. Não houve contratação de novos serviços.
- As diferenças de ACL e as três policies Storage não incluídas no dump foram resolvidas localmente; não mascarar esses requisitos em recuperações futuras.

## Procedimento reproduzível, limitado ao pacote histórico
1. Obter runtime público pelo workflow G1 Native (agora manual-only, após merge, confirmação PREPARAR_RUNTIME_PUBLICO). Transferir somente executáveis/cache oficiais e lock, checar SHA-256; nenhum dado/chave real em runner público.
2. Em ambiente privado Linux, iniciar PG17 Supabase independente, manter portas locais, nenhuma integração real e validar base vazia, versões e schemas. Abrir arquivo histórico somente no ambiente privado usando identidade corrigida temporariamente, verificar pelo verificador G1, importar cinco SQLs em transação com ON_ERROR_STOP. Confirmar igualdade de cada bloco COPY antes da reconciliação.
3. A rotina `scripts/g1-reconcile-historical-local.py` exige arquivo histórico pinado, caminho data-dir real com PG_VERSION 17 e postmaster local, porta, psql executável e pgpass local protegido; recusa CI pública. A confirmação explícita é RECONCILIAR_SOMENTE_COPIA_LOCAL_DESCARTAVEL. O SQL associado valida endereço loopback, identidade do diretório de dados, banco, usuário, inventário histórico, bucket, e cinco fingerprints de estrutura ANTES de alterar grants. Reconcilia ACLs de objetos/colunas e policies conhecidas. A transação só confirma se 9/9 fingerprints de catálogo e as verificações de segurança coincidirem. Divergência reverte as alterações; não atualizar os pins automaticamente para fazer passar.
4. Conferir novamente registros, testar atores fictícios e remover o ambiente temporário. Preservar somente evidências agregadas. Não executar este reconciliador sobre dump futuro nem usar endereço remoto.

## Teste da rotina nova
[Run 45306106782](https://github.com/bonecodesign/salvamotoca/actions/runs/45306106782): SUCCESS, oito testes unitários (processo, porta, caminho, versão, CI pública e ordem dos gates), e prova negativa em PostgreSQL 17 descartável: G1_WRONG_DESTINATION_REJECTED=PASS; G1_FIXTURE_UNCHANGED=PASS. A reconciliação equivalente foi executada no restore real anterior; a nova rotina consolidada ainda não foi executada positivamente ponta a ponta com o arquivo histórico real. Não confundir esses testes negativos com uma segunda restauração real.

## Fora deste aceite
- Recuperação de contas reais, objetos físicos de Storage quando existirem, segredos/Vault externo, parâmetros de Auth, configurações e integrações externas, Edge Functions, consistência de snapshot entre cinco dumps independentes: escopo de recuperação futura/produção não comprovado por um backup de testes sem usuários/objetos.
- Homologação F1 hospedada e física, operações comerciais e release têm gates próprios. Manter NO_GO.
- Não repetir backup histórico por falta de evidência: a prova existe. As evidências estão integradas à main; manter testes de recuperação futuros proporcionais ao escopo dos dados.
