# FND-10 — Plano de alerta crítico e contingência sem contratação (candidato OFFLINE)

**Projeto:** Salva Motoca! | **Data:** 18/11/2026 | **Identificador:** SM-PLAN-001  
**Natureza:** proposta técnica/operacional do fundador, **não** ativação do plantão, migração ou compromisso de SLA.  
**Versão:** 0.1 | **Status:** preparo e testes offline; revisão humana/jurídica/operacional pendente.  
**Escopo territorial:** origem em BH, Contagem ou Betim; prestador voluntariamente online; anéis 5/15/60 km (SM-DEC-047/048/050).

## Objetivo e limites do custo zero

Partir de **recursos já existentes**: o projeto Supabase atual, o aplicativo/PWA atual, um telefone e acesso à internet já disponíveis para o fundador, e os workflows GitHub de testes já utilizados. Não contratar fornecedores, não criar Supabase adicional, não ativar telefones pagos, SMS, WhatsApp Business API, gateway de e-mail, plano de monitoramento ou assistente externo. **Custo de nova contratação pretendido: R$ 0**, porém planos gratuitos têm limites e não garantem uptime, entrega de push, acesso à internet ou cobertura humana. É proibido habilitar serviços pagos/overages ou migrar dados sem autorização específica e revisão financeira.

**Distinção operacional essencial:** o sistema pode receber e distribuir chamados de prestadores online a qualquer hora (**SM-DEC-050**); isso **não** prova que o fundador acordado, com bateria/rede, recebe incidentes críticos 24h. Enquanto não houver contingência humana testada, a **liberação comercial 24h fica NO-GO**, mesmo que o protótipo receba solicitações em qualquer horário.

## Arquitetura gratuita prevista (somente para futura homologação)

1. **Registro de ocorrência:** botão de ajuda no app (cliente e prestador) com classificação `general_question`, `service_issue`, `payment_dispute` ou `safety_report`. Registro mínimo, horário do servidor, vínculo autenticado ao pedido, número de protocolo e idempotência. **Ainda não existe ticket real nessa entrega.**
2. **Caixa administrativa no app:** painel seguro com fila ordenada por prioridade/horário, contagem de não lidos e confirmação explícita **“Assumir ocorrência”**. Evitar expor foto, endereço, localização e dados pessoais na tela bloqueada.
3. **Notificação complementar, opcional:** Web Push/PWA pelo navegador com permissão explícita e service worker, caso compatível e homologado no **dispositivo físico**. Não tratar push disparado, gravado, entregue ou exibido como **confirmação de leitura**. Se notificações estiverem negadas, o painel continua como canal consultável, **mas isso não é alerta garantido enquanto o app está fechado**.
4. **Transporte de eventos:** avaliar uso das cotas do Supabase existente (RLS, Auth, tabela de incidentes + fila transacional/outbox e Realtime apenas com autorização futura). Monitorar limites do plano atual. **Não criar migrations, functions, segredos ou triggers hospedados neste PR**. A outbox F5 já existente é apenas **fixture para pós-pagamento**, não deve ser confundida com notificações de segurança/plantão.
5. **Caminho alternativo:** quando push falhar ou canal não estiver comprovado, manter evento na fila e marcar **sem confirmação humana**. Futuro segundo responsável só será acionado depois de designação, aceite, autorização, canal testado e autenticação. Não inserir número pessoal ou e-mail em código público.

## Protocolo de triagem e decisão humana

| Categoria | Automação gratuita possível | Medida conservadora | Resposta humana |
| --- | --- | --- | --- |
| Dúvida geral | Orientação e fila 24h | Não prometer horário de resolução | Próximo expediente efetivamente coberto |
| Problema de serviço | Protocolo + histórico | Não encerrar disputa automaticamente | Mediação humana |
| Pagamento contestado | Prioridade alta + registro de evidências | Bloqueio de repasse enquanto a disputa estiver aberta no **backend autenticado**; nunca estornar/liberar valor por automação | Fundador ou operador autorizado após revisão |
| Segurança física/ameaça | Prioridade crítica + recomendação de pausar/proteger o pedido | Mostrar instrução de procurar emergência oficial em risco imediato; não fingir resgate ou plantão atendendo | Responsável confirmado e procedimentos documentados |

O simulador `f23-support-hybrid-offline.js` categoriza e propõe revisão. O novo `f23-critical-alert-plan-offline.js` calcula **somente estados fictícios**, sem executar proteção financeira, ticket, alertas ou suspensão. Para qualquer ação real, exigir verificação de identidade, sessão, RLS, vínculo com pedido, integridade da origem do evento, logs, auditoria, confirmação do responsável e validação jurídico-financeira.

## Sequência de alerta **proposta para testes**, não SLA aprovado

| Marco ilustrativo | Evento no simulador | Limite |
| --- | --- | --- |
| T0 | Ocorrência registrada na futura fila + indicação visual prioritária | Não declarar envio, entrega ou visualização antes da evidência técnica |
| T+2 minutos | Marcar lembrete **devido** ao fundador se houver canal/escala simulados e nenhuma confirmação | O módulo NÃO toca o celular |
| T+5 minutos | Marcar necessidade de escalonamento | Sem substituto habilitado: **sem cobertura confirmada**, não dizer que alguém assumiu |
| Após confirmação humana | Registrar futuramente identidade, hora, ação e solução no servidor | ACK precisa vir do titular autenticado; não de clique não autenticado, push ou navegador sem sessão |

Os 2 e 5 minutos são parâmetros de **simulação propostos**; não equivalem aos 5 minutos do prestador para responder ao orçamento. Não fixar SLA público nem atraso máximo sem validar disponibilidade do fundador e teste real em Android. Falha persistente de canal, ausência de confirmação, perda de internet ou indisponibilidade do fundador devem gerar **risco de cobertura**, não indicação de incidente resolvido.

## Papel do fundador e continuidade

**Responsável inicial:** fundador (SM-DEC-053). **Substituto:** previsto futuramente, **ainda não designado**, sem login/permissão, contrato, escala ou canal. A escala de atendimento humano regular é **referência seg–sex 9h–18h**, fuso America/Sao_Paulo (SM-DEC-052), mas não comprova que o fundador esteja disponível continuamente. Fins de semana, feriados e madrugadas exigem plano real de contingência; **um indivíduo não deve ser considerado cobertura humana ininterrupta sem escala, descanso e substituição**.

Regras de lançamento recomendadas, condicionadas à revisão do fundador e técnico:
- Antes de aceitar **pagamentos reais** ou abrir o piloto, garantir canal de suporte e incidentes graves confiável nos horários em que houver atendimentos, ou reduzir a operação comercial a **janelas efetivamente cobertas**. Isso exigirá escolha explícita se alterar SM-DEC-050.
- Se não houver humano confirmadamente alcançável para incidente grave, **não anunciar plantão 24h** e manter gate comercial em NO-GO. Um fallback apenas informativo não protege um usuário sob risco grave.
- Quando houver pessoa substituta: aprovação expressa, menor privilégio no painel, MFA quando disponível, teste de recebimento/ACK, revogação e auditoria de ações.
- Não publicar no GitHub dados pessoais, telefones, tokens, senhas, e-mail de destino nem localização de usuários.

## SM-PLAN-002 — central de incidentes do fundador (nova preparação offline)

Foi implementado `f23-founder-incident-desk-offline.js`, **máquina de estados pura em memória** para prever como uma fila administrativa poderia funcionar sem contratar sistemas ou gerar chamados reais. Complementa as regras de triagem F23 e os estados de revisão já esboçados em F5/F6, **sem conectar módulos a pagamentos ou requisições reais**.

### Estados e responsabilidades simulados

| Estado da prévia | Transição permitida | O que não comprova |
| --- | --- | --- |
| `queued_mock` | abertura de caso sintético; prioridade `critical`, `high` ou `routine` | chamado recebido pelo Supabase ou suporte real |
| `escalated_uncovered_mock` | apenas caso **de segurança**, com teste T+5 sem reconhecimento, por `system_mock` | entrega de push ou contato com fundador |
| `acknowledged_mock` | somente papel `founder_mock` com escala/canal **ficticiamente** indicados | identidade real ou que alguém leu um alerta |
| `under_review_mock` | após reconhecimento, a partir de ação do `founder_mock` | revisão ou proteção efetiva do pedido |
| `reviewed_mock` | após revisão e marcação **fictícia** de evidência, com motivo predefinido compatível com categoria | resolução jurídica, atendimento, devolução de dinheiro ou liberação de repasses |

- **Fila do painel**: ocorrências não resolvidas primeiro; segurança antes de pagamentos, depois rotina; ordenar por abertura. Projeção contém identificador sintético, categoria, prioridade, estado, versão e recomendações de proteção, sem texto livre, fotos, endereço, telefone ou GPS. Não é uma interface administrativa autenticada.
- **Auditoria e idempotência**: registrar apenas IDs, ator fictício, tipo, horário e motivo de lista fechada; repetir o mesmo evento com o mesmo ID/conteúdo não duplica efeito; ID reutilizado com conteúdo diferente, evento fora de ordem, campos desconhecidos e ator sem papel permitido devem falhar.
- **Pagamento/segurança**: `recommendHoldSettlementMock` e `recommendPauseRequestMock` são somente avisos. Mesmo após `reviewed_mock`, não liberar recursos reais; o bloqueio de F4 depende da disputa **no backend autorizado**, revisão humana e conciliação PSP. Sem integração com contas ou processamento financeiro.
- **Titular**: o fundador é o único papel humano fictício atualmente permitido. O futuro segundo operador **não** é habilitado neste pacote; a designação requer aprovação e controle de acesso no backend.
- **Não persistência**: o módulo não grava localmente ou na nuvem, não envia eventos, e não faz notificações. Após reinício perde o estado; isso **não é seguro para produção**, onde será obrigatório ledger transacional durável, RLS, prova de origem e logs imutáveis de auditoria.
- **Acesso/privacidade**: o futuro painel não poderá considerar `actorRole: founder_mock` vindo do navegador como autenticação. Identidade deve ser validada no servidor e as pessoas só podem ver ocorrências autorizadas, com minimização de dados.

A suíte F23 agora cobre triagem, fila, duplicação de eventos, adulteração, confirmação, escalonamento, revisão, bloqueio de decisões financeiras e impossibilidade de ações reais. **Nenhuma migração ou nova ferramenta foi contratada.**

## SM-PLAN-003 — persistência em PostgreSQL 17 descartável

**Objetivo:** avançar o ponto que faltava à central `f23-founder-incident-desk-offline.js` (SM-PLAN-002), que até agora mantinha tudo em memória: provar escrita persistente, reabertura em **outra conexão**, exclusão segura de acesso de usuários e recuperação após rollback, sem alterar o Supabase existente.

**Apenas candidato:** `supabase/drafts/f23_incidents_persistence_candidate.sql` cria, somente no PostgreSQL 17 efêmero de CI, duas tabelas de ocorrências e eventos sintéticos, mais um gate privado **desligado por padrão** e uma tabela privada de administradores **sem identidades reais**. Os campos armazenados são UUIDs artificiais, categoria, estado, vínculo de pedido fictício, motivo padronizado, hora e versão. Não há nome, foto, mensagem, telefone, GPS, valor financeiro, endereço, segredo ou contato.

**Camada de acesso candidata:**
- `anon` não executa RPCs; `authenticated` não tem `SELECT/INSERT/UPDATE/DELETE` direto nas tabelas, que continuam sob RLS.
- RPCs `f23_mock_open_case`, `f23_mock_apply_event` e `f23_mock_admin_queue` rodam como `SECURITY DEFINER` com `search_path` explicitamente vazio, sempre exigindo gate habilitado e administrador incluído em lista privada. A identidade do ator vem de `auth.uid()` (simulada por JWT fictício apenas na CI), nunca de argumento livre.
- `case_key` idempotente e `event_key` global único. Retries com mesmo conteúdo não duplicam versões; o mesmo identificador com categoria, motivo, ator ou ação diferente é rejeitado. Cada ação obtém lock `FOR UPDATE` do caso antes da mutação e grava evento de auditoria na mesma transação.
- A fila administrativa expõe só identificador, categoria, prioridade, estado, versão e data. Não há leitura direta por terceiros nem por administrador autenticado no navegador.
- Os estados ainda são **`*_mock`**. Não podem abrir protocolo real, suspender corrida, processar contestação, reembolsar, liberar repasse, operar notificação ou confirmar pessoa de plantão. O backend real exige outra revisão com autenticação e autorização da origem do incidente, antiabuso e integração transacional ao PSP.

**Testes de regressão:** o **mesmo job PostgreSQL 17 já existente** passa a executar `tests/f23-incidents-persistence.sql` (abertura de casos + evento auditável + commit), seguido por `tests/f23-incidents-recovery.sql` em **novo processo psql**, verificando persistência cross-session, RLS/grants, acesso apenas do fundador sintético, falha com gate desligado ou usuário sem permissão, idempotência, colisão, rollback de resolução, revogação/restauração da autorização e **limpeza final de todos os dados + gate desligado**. Não foram criados novos containers, serviços, migrações hospedadas ou jobs de CI.

**Limitações:** sessão PG bem-sucedida não comprova backup/restore verdadeiro do Supabase (G1 segue bloqueado), E2E Auth/RLS com JWT real, persistência em caso de reinicialização completa de infraestrutura, conflitos de pagamentos, dupla escrituração, gestão de acesso por MFA, push no dispositivo ou recuperação pós-crash em produção. A trilha ainda poderá requerer modelo append-only mais rígido e testes de concorrência com atores distintos antes de qualquer deploy.

## Testes gratuitos antes de qualquer ativação

- Node offline: prioridade crítica versus alta, T+2/T+5, ACK apenas em cenário fictício elegível, falta de cobertura, indisponibilidade sem substituto, no-PII nas mensagens, financeiro F4 sem repasse automático e impossibilidade de enviar alertas reais. Executar via workflow F23 já existente, sem testes duplicados.
- Banco descartável (já usado na CI): avaliar RLS, outbox, idempotência, concorrência e rollback com dados sintéticos. O banco hospedado segue intocado.
- **Depois, quando houver aparelho:** testar em Android real o PWA, permissão, som/vibração, bateria, rede suspensa, app fechado, modo não perturbe, múltiplos alertas, perda/reconexão, notificações desabilitadas e efetiva ação humana. Este teste é pendente; nenhum push é garantia.
- **Depois de G1:** validar backup e restauração verdadeiros do Supabase existente, fazer revisão técnica/jurídica e somente então apresentar migração sob autorização separada.

## Gate para operação real — NO-GO até prova suficiente

Checklist de prova futura, todos obrigatórios para liberar o fluxo crítico:
- [ ] Fundador confirma horários reais de cobertura, descanso e indisponibilidades
- [ ] Canal de alerta e acesso seguro funcionando em Android físico
- [ ] Recebimento, perda de rede e confirmação humana auditáveis ponta a ponta
- [ ] Contingência quando fundador não responder, com pessoa autorizada ou política operacional aprovada
- [ ] Registro seguro de incidentes, categoria, status e comunicação transparente ao usuário
- [ ] Pagamentos e repasses protegidos por backend/PSP auditados durante disputa
- [ ] Plano para casos de perigo imediato e canal de emergência oficial
- [ ] Revisão privacidade, jurídico, financeiro e testes com falhas reais controladas
- [ ] G1: backup **e restauração** de DB/Auth/Storage homologados no ambiente existente
- [ ] Aprovação final expressa de ativação comercial

**Situação nesta entrega:** desenho e testes offline somente, nenhum serviço contratado e nenhuma promessa de atendimento ou resolução imediata.
