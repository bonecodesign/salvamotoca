# F4 — contrato futuro de pagamentos e ledger (arquitetura, NÃO implantação)

**Salva Motoca!** · Etapa F4 · PR #45, baseado no PR #44 (F3), que depende do PR #42 (F2). **Sem autorização de operação financeira.**

## Princípios inegociáveis

1. PSP/contrato e meios de pagamento para Brasil/CNPJ devem ser confirmados **antes** da implementação real. O Stripe Connect não oferece serviço de *escrow* e podem existir prazos máximos de retenção, limitações por país e responsabilidades por chargebacks.
2. Não existe prova de pagamento com redirecionamento, screenshot, retorno da UI, chave Pix apresentada ou resposta HTTP do navegador. A autorização operacional exige **evento autenticado pelo PSP, reconciliação independente, valor exato, moeda, cliente, quote imutável e prestador vencedor**.
3. A comissão é **15% sobre serviços**. Deslocamento e peças não têm comissão. A taxa de processamento, de responsabilidade do cliente por decisão de produto, depende de revisão jurídica de transparência, custo real do PSP e cálculo prévio à confirmação. Não se presume um valor.
4. \`awaiting_payment\` não autoriza o prestador a se deslocar, acessar destino privado, conversar ou iniciar atendimento. A aprovação financeira no futuro é responsabilidade de fluxo server-side homologado.
5. A operação exige tratamento humano de exceções e disputas. A existência de um lançamento contábil não garante dinheiro disponível no PSP.
6. F4 não é independente: F5 chat/deslocamento depende de evento financeiro verdadeiro; F6 confirma conclusão bilateral e mediação; F7 valida piloto e jurídico.

## Modelo de contratos propostos (não existem como endpoints no projeto)

| Operação futura | Cliente/ator | Entrada | Autorização e resultado esperado |
|---|---|---|---|
| \`POST /payments/preview\` | Motociclista autenticado | ID do orçamento aceito | Servidor busca itens originais F2/F3, calcula base 15%, obtém tarifa PSP permitida e mostra discriminação |
| \`POST /payments/attempts\` | Motociclista autenticado | ID do orçamento, chave idempotente, aceite do preço total | Verifica dono, estado \`awaiting_payment\`, quote escolhido e total; cria somente UMA tentativa atômica por versão do orçamento |
| \`POST /psp/webhooks\` | PSP externo | Corpo bruto + headers oficiais | Verifica assinatura na biblioteca oficial, recusa alteração/replay, armazena evento e reconcilia com API PSP, sem confiar nos dados do cliente |
| \`POST /refunds/request\` | Titular/suporte autorizado | Atendimento e motivo | Aplica política, congela repasse, cria solicitação idempotente; não marca \`refunded\` antes da confirmação do PSP |
| \`POST /settlements/review\` | Serviço interno auditado | IDs da tentativa e de conclusões F6 | Verifica confirmação bilateral autêntica, reserva/saldo PSP disponível, inexistência de disputa e política de payout |
| \`POST /settlements/execute\` | Processo financeiro privilegiado | Intenção aprovada | Integração PSP via idempotency-key, reconciliação posterior e auditoria; nunca acessível ao browser |

**Observação:** a tabela é um contrato de design, não autorização para publicar esses endpoints. Os nomes e o PSP são provisórios.

## Estados financeiros e suas origens de verdade

| Estado | Origem autorizada | Pode liberar F5? |
|---|---|---|
| \`preview\` | API interna, apenas leitura | Não |
| \`attempt_created\` | Backend após aceite completo | Não |
| \`processing\` | PSP reconciliado, pagamento ainda não confirmado | Não |
| \`confirmed\` | PSP assinado + reconciliação de ID, total, moeda e titular | Somente após todos os gates operacionais |
| \`refund_requested\` | Política/suporte + operação PSP solicitada | Não; bloquear novos repasses |
| \`refund_confirmed\` | PSP reconciliado com comprovante de estorno | Não |
| \`disputed\` / \`chargeback\` | PSP ou suporte formal, trilha auditável | Bloquear repasse e reavaliar |
| \`settlement_pending\` | Confirmado e concluído pelas duas partes, sem disputa | Não significa que transferência ocorreu |
| \`settled\` | Comprovação PSP de transferência e reconciliação | Não autoriza ações retroativas |

**Retries e corrida:** regras de unicidade sobre \`(provider,provider_event_id)\`, \`(order,quote_version)\` e \`settlement_intent_id\`; processar evento e transição sob lock transacional; gravação por evento, nunca atualizar totais a partir do frontend.

## Modelo contábil conceitual

O candidato \`supabase/drafts/f4_double_entry_mock_candidate.sql\` usa só três contas FICTÍCIAS e eventos \`mock_*\`. Ele é um exemplo simples de **partidas dobradas**, não um ledger de produção nem um extrato Stripe. Para R$ 230,00 de serviço, R$ 40,00 de deslocamento e R$ 10,00 de materiais:

| Evento de teste | Débito | Crédito |
|---|---|---|
| Confirmação mock | \`mock_psp_clearing\` R$ 280,00 | \`mock_provider_payable\` R$ 245,50; \`mock_platform_commission\` R$ 34,50 |
| Estorno mock integral | \`mock_provider_payable\` R$ 245,50; \`mock_platform_commission\` R$ 34,50 | \`mock_psp_clearing\` R$ 280,00 |

**Valores teóricos.** Não incluem tarifa real PSP, impostos, chargeback, saldo indisponível, reserva ou taxa de câmbio. O sentido contábil definitivo depende do modelo jurídico (quem é o recebedor, quando surge a receita e o dever de repasse). O código não faz nenhuma transferência.

### Exigências contábeis para a versão financeira real

- Plano de contas revisado por contabilidade; separar saldo PSP a liquidar, conta bancária, passivo do prestador, receita da plataforma, tarifas PSP, devoluções, tributos, compensações e reservas.
- Cada **journal** tem ID único e linhas imutáveis. Um gatilho/rotina de banco verifica débitos iguais a créditos, moeda comum e correspondência com o evento reconciliado.
- Corrigir erros por *lançamento compensatório*, não edição de registros históricos. Manter origem do evento, hash e referência de PSP; preservar dados sensíveis fora de logs.
- Estado financeiro (PSP) e estado do atendimento (F5/F6) são separáveis: o ledger não marca pedido como \`paid\` por si.
- Retentativas, webhooks repetidos, cancelamentos e exceções respeitam idempotência de ponta a ponta, inclusive após queda do aplicativo, backend e PSP.
- *Settlement* só surge com disponibilidade real confirmada e política de reservas. O mock \`eligibleForHumanReview=true\` não autoriza dinheiro.

## Matriz de testes obrigatórios antes do PSP

| Cenário | Comportamento |
|---|---|
| Evento com assinatura falsa, fora da janela ou corpo alterado | Rejeitar e registrar incidente com dados mínimos |
| Mesmo evento recebido 2 vezes ou em 2 processos | Um único efeito econômico, idempotência persistente |
| ID do evento reaproveitado com quantia/cliente divergente | Bloquear e sinalizar, jamais sobrescrever |
| Confirmação de outro prestador, outra proposta, outro valor ou moeda | Bloquear, congelar e conciliar |
| Estorno antes de pagamento confirmado, ou repetido | Bloquear, sem gerar débito negativo |
| Perda de conexão após operação enviada ao PSP | Consultar status usando chave idempotente, não reenviar sem reconciliação |
| Chargeback ou disputa quando repasse está pendente | Congelar repasse, registrar obrigação e revisão humana |
| Estorno parcial após início do serviço | Regra aprovada e lançamentos compensatórios parciais, com saldo suficiente |
| Tentativa de alterar linhas contábeis ou apagar diário | Negar até a administradores operacionais; revisão auditada |
| Duas solicitações simultâneas de transferência | Uma única intenção e saída PSP, nunca saldo negativo |
| Falha na confirmação de F6 ou caso contestado | Bloquear repasse e acionar mediação |
| Downtime de webhook / callbacks fora de ordem | Persistir inbox, retentar com backoff e reconciliar periodicamente |

## Gates de entrega (somente no futuro)

**Gate A — Arquitetura:** escolher PSP disponível para marketplace brasileiro e obter documentação atualizada, custos, termos, limites temporais e modelo de responsabilidades.

**Gate B — Ambiente:** comprovar backup recuperável PostgreSQL/Auth/Storage do Supabase existente com restauração e controle de rollback. Nunca criar novo projeto ou publicar segredos no repositório.

**Gate C — Implementação revisável:** criar migrations novas por CLI da versão instalada, não aplicar o SQL mock em ambiente remoto; backend de webhook com SDK oficial, cofres de segredos e revisão de segurança. CLI v3 tem diferenças importantes e deve ser consultada antes de qualquer comando.

**Gate D — Homologação isolada:** testar sob Auth/Storage real fictício, dispositivos e *sandbox* do PSP somente com autorização; impedir cobranças, transferências e notificações reais.

**Gate E — Piloto:** aprovações jurídica, fiscal, financeira e de produto; autorização expressa para ativar infraestrutura financeira e depois F5/F6/F7.

**Estado deste documento:** especificação para revisão — **NO-GO** para ativação de pagamentos.
