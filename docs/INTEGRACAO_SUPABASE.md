# Integração de testes do Salva Motoca! com Supabase

## Projetos autorizados

- GitHub: `bonecodesign/salvamotoca`
- Supabase de testes: ref `yivkqyjdeouxnwtwfekc`, região `sa-east-1`
- O projeto não atende emergências nem processa dinheiro nesta fase.

## Estrutura REAL do banco (auditada em 12–13/11/2026)

O banco já possui o esquema publicado nas migrations do Supabase, diferente do `supabase/schema.sql` de uma versão anterior. **NÃO executar `supabase/schema.sql` neste projeto.**

| Domínio | Tabelas |
| --- | --- |
| Contas | `app_profiles` |
| Catálogo | `service_categories`, `providers`, `provider_services` |
| Pedidos e orçamentos | `service_requests`, `service_quotes`, `request_messages` |
| Pagamentos (somente modelagem) | `payment_records` |
| Prospecção (PRIVADA) | `prestadores_prospeccao`, `ofertas_prospeccao`, `configuracao_comercial` |

As 36 entradas de prospecção e 40 ofertas cadastradas **não equivalem a prestadores aprovados** e não aparecem no mapa. A tabela `providers` estava vazia no momento da auditoria.

## Front-end conectado

- `config.js` contém somente a URL e **publishable key** do Supabase (informações destinadas ao navegador, nunca uma chave secreta).
- `bootstrap.js` carrega a biblioteca do Supabase fixada em `2.119.0` e `live-app-current.js`.
- `live-app-current.js` usa exclusivamente as tabelas reais, permite consultar o mapa gratuitamente, criar conta, enviar solicitação de cadastro de prestador, abrir pedidos **de TESTE** e registrar orçamentos de teste.
- Cadastro de prestador cria registros `providers` e `provider_services` inativos. Aprovação/habilitação requer verificação administrativa por canal seguro.
- Nenhuma confirmação de pagamento, repasse automático, despacho operacional ou contato externo está habilitada.

## Segurança do endereço

Foi aplicada a migration `20261112214828_restringir_localizacao_pedidos_antes_pagamento`.

- Colunas `address_details`, `latitude` e `longitude` de `service_requests` não podem mais ser lidas diretamente pelo papel `authenticated`.
- A função `bj_get_request_location(uuid)` confere `auth.uid()`, oferece endereço ao próprio cliente, e só o disponibiliza ao prestador quando `payment_records.status = 'paid'`.
- O advisor do Supabase aponta a função como `SECURITY DEFINER` invocável por `authenticated`. Esse uso é proposital, com checagem explícita de titularidade; revisar manualmente e testar com contas separadas antes de produção.
- Nenhuma senha, `service_role` ou chave `sb_secret_*` pode entrar no GitHub ou navegador.

## Para executar localmente

Na pasta do projeto:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` com internet. A autenticação do Supabase poderá exigir confirmação de e-mail. O modo demonstração anterior permanece em `app.js`, mas a configuração atual carrega o modo conectado.

## Verificações recomendadas antes de uso público

1. Conta anônima visualiza somente prestadores aprovados e ativos.
2. Contas de cliente e prestador não conseguem consultar dados pessoais umas das outras.
3. Prestador sem pagamento não consegue ler `address_details`, `latitude` nem `longitude` via REST ou RPC.
4. Cadastro de prestador começa sempre `pending` / inativo; a administração precisa validar o serviço.
5. A criação de orçamento não deve confirmar atendimento ou alterar status financeiro.
6. Testar atualização de sessão, confirmação de e-mail e RLS em dois navegadores independentes.
7. Não habilitar pagamentos reais até implementar webhooks com assinatura, antifraude, split, conciliação e reembolso.

## Proteções adicionais aplicadas no Supabase

- Migration `20261112235714_proteger_pedidos_chat_e_catalogo`: reboque marcado como **não cobrável**, chave `request_key` para idempotência, um orçamento proposto por pedido, chat somente após pagamento confirmado, bloqueio de contatos nos dados comerciais e permissões de leitura pública minimizadas.
- Migration `20261113000025_separar_leitura_publica_de_servicos_da_leitura_do_prestador`: políticas RLS diferentes para visitantes e prestadores, mantendo o mapa público sem acesso ao identificador da conta proprietária.
- `live-app-current.js` transmite uma chave UUID estável por tentativa de pedido e indica repetição caso ocorra conflito de chave.
- Testes SQL com identidades simuladas em transações revertidas verificaram: leitura anônima de prestador e serviço homologado, isolamento de pedidos/orçamentos, acesso ao endereço apenas pelo cliente antes de pagamento, bloqueio de chat antecipado, reboque não cobrável, impossibilidade de autohomologação, duplicação de chave e orçamento.
- Nenhum usuário ou pedido fictício persistiu no banco após os testes.

## Alertas e pendências

- A idempotência por chave UUID reduz duplicações técnicas, mas **ainda não protege contra duas solicitações intencionalmente distintas** nem substitui controle de spam/rate limiting.
- O esquema de prospecção é isolado sem políticas de consulta pública (comportamento desejado).
- É necessário criar ferramenta de homologação administrativa segura e definir método de captura de localização correto para o pedido.
- A busca automática usa distância aproximada: ainda não possui despacho automático confiável.

## Regra nova — presença online e recusa de orçamento (12/11/2026)

**Implementado no banco e na branch:** `bj_provider_presence` guarda disponibilidade escolhida pelo borracheiro, com ping a cada 30 segundos e expiração de conectividade após 90 segundos. `bj_request_attempts` registra até duas recusas por par pedido/prestador; a primeira devolve o profissional à fila e a segunda o exclui somente daquela rodada. As funções protegidas `bj_set_presence`, `bj_ping_presence`, `bj_online_providers`, `bj_submit_quote` e `bj_answer_quote` operam o fluxo.

Migrações no Supabase, todas já aplicadas:
- `20261113002617_presenca_online_orcamento_e_proximo_prestador`
- `20261113002736_separar_visibilidade_publica_e_propria_da_presenca`
- `20261113003015_preservar_historico_de_orcamentos_do_prestador`

O pedido passa de `requested` para `quoted` quando o prestador informa valor. O cliente **aceita** (`awaiting_payment`, sem cobrar nada) ou **recusa**, transferindo o pedido a outro prestador online e homologado; antigos participantes com uma única recusa podem reaparecer depois que os ainda não recusados forem considerados. Sem próximo, o estado vira `no_provider`.

O cadastro administrativo `providers.is_active` permanece separado da disponibilidade escolhida. Sem aprovação administrativa e `provider_services.is_active=true`, não pode ficar online.

**Testes executados:**
- Simulação SQL em transação revertida: troca para próximo prestador, recusa e aceite, bloqueio por terceiros, orçamento histórico do prestador anterior, ausência de pagamentos e ausência de candidato seguinte; arquivo `supabase/tests/presenca_orcamentos_rollback.sql`.
- Simulação de expiração de presença e novo ping com transação revertida: passou.
- Simulação de navegação JS com banco em memória: **12/12 cenários passaram**.

**Pendências:** validação com duas sessões de Auth reais, notificação/atualização automática de pedidos sem botão, raio de cobertura e distância real de deslocamento, tempo de resposta e tratamento de prestador que fica offline com pedido pendente. O usuário ainda precisa atualizar a tela "Pedidos" ou abri-la novamente para carregar novos chamados. Funções `SECURITY DEFINER` expostas a autenticados devem passar por revisão de segurança antes do lançamento. Ver [regras de presença e orçamento](PRESENCA_ORCAMENTO_REGRA_OFICIAL.md).

## Atualização: duas recusas por rodada

A migração `duas_recusas_por_prestador_em_cada_solicitacao` acrescenta `rejection_count` e `last_declined_at` à trilha `bj_request_attempts`, substitui `bj_answer_quote` e cria a RPC `bj_finish_request` para o cliente encerrar um pedido de teste sem registrar conclusão de serviço.

A seleção prioriza prestadores com zero recusas, aceita de volta quem tem uma recusa e exclui apenas os com **duas recusas na mesma solicitação**. Um novo `service_requests.id` zera a contagem. Há teste SQL com `ROLLBACK` em `supabase/tests/duas_recusas_por_rodada_rollback.sql`.
