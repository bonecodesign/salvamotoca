# G1 — ensaio F1 em Neon PG17 (23/11/2026, horário Brasil)

**G1=BLOCKED; RELEASE=NO_GO.** Escopo exclusivamente Salva Motoca!, PostgreSQL 17 do laboratório Neon gratuito. Não é restauração do pacote real nem homologação do serviço gerenciado Supabase.

## Execução comprovada
- Branch filha independente `g1-f1-mock`, a partir da baseline limpa; nenhuma alteração no Supabase hospedado.
- Executadas 24 instruções de `tests/f1-stage-setup.sql` e 9 da migração `supabase/migrations/20261114020317_f1_solicitacao_dados_foto_privada.sql` em transação, sem os delimitadores BEGIN/COMMIT originais, com concessão local de roles ao executor para simular atores.
- Verificação do catálogo: bucket request-photos privado, limite 5242880 bytes; 3 policies Storage e 4 constraints F1.
- Executadas 28 instruções selecionadas de `tests/f1-stage-rls.sql`, incluindo 12 blocos DO de asserção, com aprovação integral dos blocos selecionados. Verificados privacidade, grants por coluna (endereço/GPS/request_key não legíveis), upload autorizado e bloqueio de namespace de terceiro, criação de pedido com foto existente, consulta de recuperação por foto/cliente, compatibilidade legada, rejeição de payload parcial e foto inexistente, RLS de prestador atribuído, terceiro, revogação/transferência de acesso e anônimo.
- Ao fim: 2 solicitações fictícias e 1 metadado fictício de foto; fixture permanece na branch. Não houve upload de bytes, JWT real ou dado pessoal.
- Não executados os dois blocos DELETE de fotos vinculadas/órfãs, nem o rollback final do script original; portanto não declarar a suíte F1 completa como PASS. Auth.uid e storage.foldername são stubs de teste e a claim via GUC não é autenticação confiável em produção.

## Inventário GitHub
A árvore main consultada contém 4 SQLs em supabase/migrations e 7 em supabase/applied, além de schema, drafts, rollback e testes. Igualdade numérica com 11 migrações do inventário histórico não comprova equivalência de versões, ordem ou conteúdo. Não executar seeds de prospecção nem drafts no Neon; não reconstruir o dump real a partir de mocks.

## Gate restante
Restaurar o pacote real autenticado em ambiente privado compatível com Auth/Storage/Vault Supabase, verificar contagens, políticas, ACL, triggers, funções e comportamento. O Neon puro continua útil para testes SQL, mas não satisfaz esse gate. Sem custos novos contratados, sem liberação comercial.
