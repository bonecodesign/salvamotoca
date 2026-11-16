# F1 — revisão e teste adversarial da localização exata (somente OFFLINE)

**Data:** 16/11/2026. **Repositório:** `bonecodesign/salvamotoca`.  
**Projeto Supabase único:** `yivkqyjdeouxnwtwfekc`.  
**Status:** PROPOSTA NÃO APLICADA. **F1 = NO-GO.** Sem login de teste, contas, pedidos, uploads ou transações reais.

## Evidência obtida por leitura no Supabase hospedado

A função existente `public.bj_get_request_location(p_request_id uuid)` é `SECURITY DEFINER`, com `search_path=''`. Ela permite consultar `address_details, latitude, longitude` ao próprio cliente ou ao proprietário do prestador atribuído quando existe `payment_records` com `status='paid'`. Ela **não valida explicitamente**, nessa consulta, `providers.status='approved'`, `is_active`, `service_requests.status`, proposta aceita do prestador selecionado nem timestamp `paid_at`. Esses critérios extras não dispensam um comprovante de PSP válido.

O Supabase tem um `payment_records` com status limitado a `pending|authorized|paid|failed|refunded`, `paid_at` opcional e `UNIQUE(request_id)`. INSERT e UPDATE diretos de `anon` e `authenticated` estão negados nessa tabela. Nenhuma dessas condições demonstra fraude real, porque os testes usam **pagamento de ficção, criado apenas no container**. O problema identificado é uma lacuna potencial de revogação de acesso após mudanças de estado/credenciamento.

## Correção candidata em testes isolados

A proteção proposta **não** substitui a RPC existente no projeto. O arquivo `tests/f1-location-rpc-fixture.sql` cria uma função legada simulada e a alternativa `private.f1_location_hardened_fixture`, **somente no banco de testes PostgreSQL descartável**.

A função candidata:
1. preserva ao **cliente titular** a consulta dos próprios dados;
2. exige um gate **privado do servidor** inicialmente `false` antes de permitir acesso a qualquer prestador;
3. exige que o prestador permaneça dono legítimo, `approved` e `is_active=true`;
4. exige pedido nos estados `accepted` ou `in_progress`, e proposta `accepted` correspondente ao mesmo prestador;
5. exige registro financeiro `paid` com `paid_at` preenchido e não futuro;
6. bloqueia naturalmente um prestador suspenso, inativo, reatribuído, com orçamento recusado ou pedido cancelado/concluído.

**A futura função de produção deve depender da conciliação real F4 com PSP e webhooks assinados.** `payment_records.status='paid'` e `paid_at` por si sós NÃO comprovam pagamento real; podem refletir status legado, erro de integração ou ausência de gestão de chargeback/disputa. Antes da ativação, substituir a verificação provisória por decisão financeira revogável do servidor, compatível com os estados F4/F5/F6. A liberação de localização é necessária durante o deslocamento, mas precisa parar após chegada, cancelamento, suspensão ou disputa. O schema legado ainda não representa todos esses eventos, por isso **não converter este SQL em migration**.

## Testes incluídos

- `tests/f1-location-rpc-adversarial.sql`: titular A, terceiro C, prestador escolhido B, outro prestador D, gate desligado, sessão `awaiting_payment`, liberação apenas para fixture autorizada, suspensão, inativação, reembolso, `paid_at` ausente, orçamento inválido, reatribuição, cancelamento e conclusão.
- Teste de regressão **compara intencionalmente** a consulta atual simulada com a consulta candidata. Uma resposta da *baseline* em cenário fictício indevido não é prova de acesso indevido em produção, pois não há ali registros financeiros.
- `.github/workflows/f1-location-rpc-offline.yml` roda PostgreSQL 17, RLS, roles fictícias e regressão Node da F1, sem chaves/URLs de produção.
- O teste mantém gate privado `false` após `ROLLBACK`. Não há publicação de coordenadas reais.

## Ordem obrigatória daqui em diante

1. Validar a CI local e registrar URL e commit exatos. Falha = corrigir em branch, sem tocar remoto.
2. Comprovar backup real privado **e restauração**, incluindo Auth e escopo dos bytes de Storage; hoje **BLOQUEADO** no PR #53.
3. Reconciliar o banco real com F2–F6, incluindo política de consulta do endereço exato durante F5, PSP confirmado e revogação pós-chegada. A proposta F1 de SQL local é apenas referência de segurança, não solução pronta de F5.
4. Preparar migration versionada real **somente após autorização e revisão**, com plano de rollback/compatibilidade e feature flags do servidor ainda desligadas.
5. Validar Auth A/B/C e RPC com JWT legítimo, testar tentativa de pagamento fictício e revogação no Supabase sob proteção de backup; fazer Android físico.
6. Decisão humana antes de ativar função financeira, chat, GPS ou liberar piloto.

**Não modificar `public.bj_get_request_location` remoto, não copiar o gate mock para produção e não marcar F1 homologada por testes locais.**
