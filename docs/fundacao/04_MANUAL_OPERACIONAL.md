# FND-04 — Manual operacional do piloto

**Versão:** 0.2 — procedimentos internos, não vigentes em atendimento público.  
**Praça inicial aprovada:** Belo Horizonte, Contagem e Betim, MG (SM-DEC-048).  
**Escopo:** mapa gratuito, reparo delivery e reboque intermediados; destino externo de reboque somente mediante concordância, disponibilidade e orçamento prévio.

## 1. Papéis e responsabilidades operacionais

**Solicitante:** informa dados verídicos sobre o problema e a área, aceita ou recusa a proposta, acompanha estado do pedido e registra eventuais falhas.

**Borracheiro:** mantém cadastro correto, comprova habilitação aplicável, decide status online/offline, informa orçamento compatível com a necessidade relatada, aceita ou não assumir a demanda e atualiza etapas do serviço quando disponibilizadas.

**Administração:** realiza validação e aprovação documentada dos prestadores, parametriza áreas e categorias, acompanha incidentes, trata denúncias, implementa controles contra fraude e garante disponibilidade de atendimento de suporte.

**Plataforma:** organiza descoberta e intermediação, preserva evidências digitais, mostra informações confiáveis e não presume que mera conexão à internet equivale à capacidade de atendimento.

## 2. Habilitação de prestadores — procedimento

1. Receber cadastro voluntário com nome comercial e serviços; dados administrativos adicionais por canal privado.
2. Registrar consentimentos/ciências aplicáveis e finalidade de tratamento de dados.
3. Validar titularidade, disponibilidade, capacidade operacional e informações profissionais exigíveis antes do primeiro serviço real; critérios detalhados ainda dependem de revisão jurídica.
4. Conferir endereço de referência e área em que o profissional realmente pode atender.
5. Verificar canal seguro de contato administrativo e procedimento de suporte. **Não publicar telefone ou documento privado no repositório nem em listagem pública.**
6. Aprovar por administrador autenticado, com motivo, hora e auditoria; habilitar apenas serviços efetivamente verificados.
7. Registrar pendências e prazo de revalidação, suspensão e recurso/contestação.
8. Só então permitir o botão online. A seleção depende ainda de sinal recente de conectividade.

**Bloqueio de lançamento:** uma lista de prestadores prospectados não é equivalente a profissionais homologados.

## 3. Abertura de solicitação

**Antes de enviar:** interface informa claramente que mapa é gratuito e que atendimento delivery é serviço pago quando houver integração e disponibilidade. Em teste, exibir aviso inequívoco de que nenhuma assistência real está sendo prestada.

**Dados mínimos do pedido:** uma ou mais categorias compatíveis, descrição, foto do problema, marca, modelo e ano da moto, região aproximada, endereço detalhado protegido e identificador único/idempotente. Não armazenar mais GPS que o necessário.

**Elegibilidade:** cadastro aprovado, todos os serviços solicitados habilitados, online voluntário, heartbeat recente e cobertura declarada; busca progressiva 5/15/60 km, respeitando a praça e elegibilidade. Se nenhum elegível: informar indisponibilidade, sem cobrar, e oferecer encerrar/retentar depois.

## 4. Fluxo de propostas e fila

1. Prestador A recebe pedido válido em estado `requested`.
2. A informa preço e detalhes; o sistema armazena proposta `proposed` e pedido `quoted`.
3. Cliente vê oferta antes de contratar, inclusive composição do preço e condições relevantes.
4. **Aceite:** registra decisão; passa a `awaiting_payment`, sem confirmação de atendimento nem pagamento até provedor financeiro homologado.
5. **Primeira recusa:** A recebe contador 1/2 no mesmo pedido; A volta à fila, mas não é o destinatário imediato da mesma recusa. Buscar outro prestador elegível (zero recusas antes dos que têm uma).
6. **Segunda recusa do mesmo solicitante no mesmo pedido:** contador 2/2; A fica fora somente dessa solicitação.
7. **Sem mais candidato:** status `no_provider`; informar usuário com clareza, sem prometer retorno automático.
8. **Encerramento:** o cliente pode encerrar solicitações de teste em estados permitidos; `cancelled` preserva trilha histórica.
9. **Novo pedido:** recebe outro ID; todas as recusas começam em zero. A administração pode suspender um profissional por razões independentes da fila, com motivação e revisão.

**Se o próprio prestador rejeitar pedido ou ficar offline após atribuição:** aplicar reencaminhamento apenas na fase elegível e de acordo com regra validada; não equiparar recusa do prestador à recusa do orçamento pelo cliente. Após pagamento ou despacho, encaminhar a suporte quando necessário; não cobrar novamente nem redistribuir automaticamente.

## 5. Estados de disponibilidade

- Offline manual: não receber novos pedidos.
- Online manual com heartbeat atualizado: apto a novos pedidos, se habilitado.
- Sem heartbeat por cerca de 90 segundos: inelegível para novo despacho; preservar pedidos anteriores.
- Alternância frequente: monitorar eventual abuso sem punir automaticamente por problemas de conexão.
- Convite e orçamento: janela de 5 minutos conforme SM-DEC-019/030; 10 ausências em 30 dias encaminhadas à revisão, falhas de entrega não contam e não há sanção automática. Notificações reais pendentes; não anunciar SLA.

## 6. Atendimento real — roteiro futuro sujeito a homologação

**Antes do deslocamento:** validação de pagamento pelo servidor/PSP, chat interno após pagamento confirmado, confirmação de disponibilidade e liberação mínima necessária do endereço. Mensagem de saída apenas após autorização.

**Durante:** fluxo candidato testado offline; rastreamento consentido do profissional somente durante deslocamento até a chegada. Prestador apresenta resumo, motociclista tem 5 minutos para confirmar ou contestar; conclusão bilateral, sem aceite por silêncio. Sem homologação real.

**Depois:** recibo, avaliação, abertura de disputa e prazo de suporte conforme regras comerciais finais.

## 7. Exceções e respostas operacionais

| Evento | Resposta mínima | Quem decide |
| --- | --- | --- |
| Ninguém online | Mostrar indisponibilidade; não prometer atendimento | Sistema |
| Prestador não responde | Aguardar prazo documentado; encaminhar conforme regra ainda a implementar | Sistema + revisão |
| Orçamento recusado | Aplicar contagem por pedido e buscar próximo | Sistema |
| Novo pedido do mesmo cliente | Resetar somente contagens da nova solicitação | Sistema |
| Falha de rede | Evitar pedido duplicado e mostrar estado confirmado | Sistema |
| Divergência de preço | Não alterar proposta aceita sem nova ciência do cliente | Suporte + cliente |
| Cliente quer cancelar após pagamento | Suspender automação e avaliar reembolso/serviço conforme lei e contrato | Suporte/financeiro |
| Profissional sinaliza comportamento perigoso | Bloqueio cautelar motivado e revisão humana | Administração |
| Acidente, risco físico ou situação de emergência | Mostrar orientação para buscar serviços públicos competentes; não anunciar capacidade de resgate | Suporte |
| Vazamento de dados | Acionar plano de resposta, contenção, avaliação e eventuais comunicações legais | Responsável designado |

## 8. Suporte e mediação — mínimos para lançar

Criar canal acessível com protocolo, identificação de pedido, tipo de ocorrência, responsável pelo caso e trilha de decisões; proteger dados ao tratar reclamações. Suporte digital recebe relatos 24h; atendimento humano de referência seg–sex 9h–18h e plantão crítico inicial pelo fundador (SM-DEC-051–053). Escala, canal, substituto/contingência e disponibilidade precisam ser comprovados antes do lançamento. Evitar resolução automatizada de incidentes que envolvam segurança, cobrança ou direitos do consumidor.

## 9. Indicadores de controle diário

Online por faixa horária, chamados abertos, tempo até proposta, recusa 1/2 e 2/2, ausência de fornecedor, aceites, falhas de conectividade, reclamações, chargebacks, tempos de suporte, risco de exposição de dados e cancelamentos.

## 10. Checklist de início de operação

- [ ] Empresa e contratos definidos.
- [ ] Prestadores reais homologados e aptos.
- [ ] Pagamento/repasse e reconciliação testados.
- [ ] Disponibilidade e reencaminhamento testados com internet real.
- [ ] Suporte e incidentes com responsáveis definidos.
- [ ] Política de cancelamento e reembolso aprovada.
- [ ] Documentos públicos jurídicos revisados e publicados.
- [ ] Comunicação comercial não promete resgate imediato.
