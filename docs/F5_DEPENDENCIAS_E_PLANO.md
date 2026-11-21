# Salva Motoca! — F5, atendimento, chat e deslocamento

**Estado:** candidata OFFLINE em branch isolada. **NÃO homologada para operação real, sem Supabase remoto alterado.**

**Cadeia de dependências:** F1 integrada à main (homologação real pendente) → F2 PR #42 (draft) → F3 PR #44 (draft) → F4 PR #45 (draft) → F5 (este ramo). O PR #47 contém alternativa F4 paralela sobre main: **não mesclar ou somar as implementações financeiras sem reconciliação de regras/arquivos e revisão humana**.

## Atualização de integração 16/11/2026 — SM-DEC-045/046

O novo contrato de F4 passa a calcular **10% do serviço (materiais inclusos) acrescidos ao pagamento do solicitante + 10% do serviço descontados do repasse do prestador**, com **deslocamento sem comissão**. O cliente precisa visualizar seu preço incluindo a taxa de 10% **antes de aceitar a proposta**; peças não entram como terceira linha. A taxa do PSP, quando aplicável, continua separada e depende de confirmação legal e do processador.

O módulo `f456-financial-bridge-offline.js` conecta a cotação aceita às máquinas F5/F6 com **fixture marcada como não PSP** e bloqueia risco, cobrança antiga de 15%, orçamento com materiais separados e pagamento com ID/valor diferentes. Ele **não é backend e não cria autorização real**.

O backend F5 futuro só poderá liberar chat/endereço exato/GPS após confirmação externa de pagamento assinado **pelo total cobrado do motociclista**, conciliação da proposta e do prestador vencedor, ausência de estorno/disputa, elegibilidade atual e gates reais. `f4_mock_payment_attempts` e eventos locais nunca substituem esses controles.

## O que a F5 deve permitir após homologação real

1. Após orçamento F2/F3 aceito, a F4 deve comprovar pagamento em servidor com evento PSP autenticado, identificadores do pedido, da proposta e do prestador vencedor, moeda, valor, conciliação e inexistência de bloqueios.
2. Só então liberar **chat privado entre as duas partes**, endereço exato do atendimento e botão de deslocamento do prestador. Retorno do navegador, status editado por cliente, recibo fictício e ledger mock não liberam nada.
3. Prestador informa saída e sua posição ao motociclista durante todo o deslocamento ativo, com autorização de localização, autenticidade, precisão e expiração; pausar imediatamente quando chegar, perder elegibilidade, ocorrer cancelamento ou disputa.
4. Prestador registra chegada; motociclista é avisado. O rastreamento termina, com minimização e expurgo de coordenadas sensíveis.
5. Prestador inicia serviço, registra resumo e entrega à F6 (comprovação, confirmação do motociclista em janela de 5 minutos, confirmação bilateral, divergência, suporte, avaliação e eventual elegibilidade de repasse). **F5 não transfere recursos nem encerra financeiro.**

## Entregue AGORA — somente simulação, sem ativação

- `f5-offline-flow.js`: motor de estados sem rede, sem banco, sem PSP, sem GPS de dispositivo. O "pagamento" só existe como fixture `F5_LOCAL_FIXTURE_NOT_PSP` e o resultado tem `realPaymentVerified=false` e todas as permissões reais = false.
- `tests/f5-offline-flow.test.js`: testes unitários de ordenação, participantes, replay/collisions, GPS sintético, retenção só do último ponto, chegada, suporte e passagem à F6.
- `docs/F5_PREVIEW.html`: prévia interativa local, sem qualquer carregamento remoto, prestador ou cobrança.
- `config.js`: `f5OperationsEnabled: false`; mantém F1/F2/F3/F4 igualmente desligadas.
- `tests/f5-release-guard.test.js`: garante flags e ausência de integração à interface real.
- `.github/workflows/f5-tests.yml`: CI de sintaxe, unidade e regressões das fases anteriores.

**Não implementado:** mensagens persistentes, RLS de chat, auth e autorização server-side, realtime, background GPS, API de mapa/rota, notificações confiáveis, auditoria real, segurança de conteúdo, revogação de sessões, pagamentos, política de retenção e testes em dispositivo. Nenhum código do simulador é autorização do backend.

## Modelo mínimo do backend FUTURO (não criar migration remota agora)

- `service_session`: `request_id`, `accepted_quote_id`, `customer_id`, `provider_id`, `payment_attempt_id` verificado no servidor, `status`, versão, criação, timestamps de saída/chegada e estados de risco.
- `conversation_message`: `session_id`, remetente autenticado, conteúdo filtrado, server timestamp, idempotency-key, políticas de retenção. Chat permitido apenas ao par associado à sessão autorizada e suporte com escopo próprio, nunca `anon`.
- `provider_live_presence`: última localização com TTL curto (não percursos históricos por padrão), leitura pelo cliente daquele atendimento e, quando necessário, suporte devidamente autorizado. Fechar na chegada, cancelamento, vencimento da sessão ou descredenciamento.
- `session_event`: log mínimo append-only com transições e auditabilidade, **sem GPS exato, tokens, URL assinada ou conversa em texto**.
- Operações futuras: `authorize_f5_session`, `mark_departure`, `upsert_presence`, `mark_arrival`, `start_service`, `request_support`. RPCs com auth, ownership, RLS, `FOR UPDATE`, checagem de versão, idempotência e validação de F4 diretamente no servidor.
- Transições com pagamentos estornados, chargeback, disputas, prestador suspenso ou trocado devem bloquear ou congelar acesso, aplicar regras de segurança e permitir tratamento humano. Revogar URLs e canais; URLs assinadas antigas exigem prazo mínimo e mitigação específica.

## Princípios de privacidade, segurança e produto

- Localização exata do motociclista, destino do reboque, imagens e dados de contato só mediante necessidade operacional e **pagamento efetivamente reconciliado**; os convites F2/F3 usam resumo restrito e permissões próprias.
- Somente o prestador homologado e selecionado informa sua própria localização. Posição expira rapidamente; dado inválido ou antigo não deve ser mostrado como atual.
- Ausência de GPS não pode produzir falso movimento; fallback seguro exige aviso e suporte sem inventar rastreamento.
- Todos os eventos de localização e mensagens reais exigem processo de tratamento de dados, retenção definida, segurança de rede, proteção contra abuso, spam, assédio e LGPD.
- Distinguir envio, entrega e leitura de notificação; não afirmar que o cliente viu a chegada só porque houve escrita no banco.
- Chat normal fecha em status de conclusão F6; chat de suporte permanece disponível nas divergências, sob escopo e retenção separados.
- **Nenhum botão/flag de frontend basta para ligar atendimento.** O motor offline não tem qualquer endpoint de autorizar ação real.

## Critérios de aceite futuros

1. F1 backup e restauração DB/Auth/Storage demonstrados; F2/F3/F4 integradas e homologadas; migrações F5 revisadas e aplicadas apenas após autorização.
2. Testes A/B/C/D: titular, prestador eleito, prestador não escolhido, terceiro e `anon` não podem atravessar RLS/tenant, nem em reconexão/troca de conta.
3. Tentativa de marcar pagamento no navegador, inventar GPS, inserir mensagem de terceiro ou sinalizar chegada por cliente deve falhar por backend.
4. Evento financeiro tardio, duplicado, reversão, disputa, perda de rede e troca de prestador devem bloquear acesso ou seguir política auditada.
5. Realtime e Android físico com permissões de GPS, app em background, offline/online, revogação e bateria; notificações conferidas.
6. Interface acessível, confirmação de localização, consentimento, comunicação de preço e política de cancelamentos revisados.
7. F6 nunca liquida sem duas confirmações reais e revisão dos bloqueios financeiros.

**Decisão de lançamento:** NO-GO. Esta entrega é somente uma base demonstrativa e testável para revisão.
