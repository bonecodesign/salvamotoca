# FND-07 — Plano de implantação e marcos de lançamento

**Versão 0.1 — roadmap sujeito à evidência, não cronograma prometido.**

## Objetivo final

Lançar piloto comercial inicialmente em **Belo Horizonte, Contagem e Betim (MG)**, somente com prestadores homologados, transações protegidas e operação de suporte capaz de resolver falhas; a abertura das três cidades depende de validação geográfica confiável (SM-DEC-048).

## Marcos com dependências

| Marco | Entrega | Dependência para avançar | Estado |
| --- | --- | --- | --- |
| M0 — Fundação | Identidade, modelo de negócio, requisitos, documentação básica | Decisões registradas e responsável definido | Em elaboração |
| M1 — MVP técnico | Cadastro, catálogo, localização, presença, fila, orçamento, aceite/recusa | Código revisado, testes integrados e ambiente estável | Parcial |
| M2 — Homologação fechada | Teste real com 2 contas e 2 prestadores fictícios consentidos, cenários de rede e segurança | RLS, Auth e logs revisados | Pendente |
| M3 — Operação assistida | Painel administrativo, notificações, timeout, suporte híbrido 24h digital, referência de expediente humano seg-sex 9h–18h e plantão crítico (SM-DEC-051/052) | Escala efetiva, responsáveis, canal testado, substitutos, tratamento financeiro e resposta a incidentes homologados | Pendente |
| M4 — Pagamento protegido | Pix/cartões, webhooks, split e reembolso com conciliação | PSP homologado, contratos e contas empresariais | Pendente |
| M5 — Conformidade final | Termos, privacidade, contrato de prestador, fiscal e procedimentos | Revisão jurídica e contábil, dados reais minimizados | Pendente |
| M6 — Piloto BH/Contagem/Betim | Prestadores verificados, municípios geograficamente validados, atendimento real monitorado | Aprovação go/no-go de todas as áreas | Pendente |
| M7 — Melhoria e expansão | Indicadores positivos e crescimento sustentável | Dados operacionais reais e segurança mantida | Não iniciado |

## Plano imediato — priorização

**P0, não adiável antes de usuários reais:** finalizar teste E2E com Supabase Auth, segurança de funções privilegiadas, isolamento de pedidos, gerenciamento de sessão e recuperação de falha.

**P1, necessário para piloto assistido:** cadastro/homologação administrativa, notificações de novos pedidos, prazo de resposta, prestadores que ficam offline com pedido atribuído, cancelamento e mediação.

**P2, necessário para comércio real:** PSP e split homologados, comprovantes, conciliação, estorno, contratos e rotina de suporte, confirmação de serviço.

**P3, expansão:** otimização de roteamento, avaliações, prevenção de abuso sofisticada e novas localidades.

## Testes essenciais

1. Visitante vê somente oficinas aprovadas e nenhuma informação pessoal dos donos.
2. Conta não aprovada nunca recebe pedidos.
3. Online voluntário + heartbeat recente é condição de elegibilidade; queda de rede retira elegibilidade sem apagar histórico.
4. Cliente informa pedido sem criar dois registros por repetição de rede.
5. Prestador atribuído dá preço; conta de outro prestador não consegue alterá-lo.
6. Cliente aceita ou recusa; duas recusas do mesmo cliente em pedido único excluem o prestador só naquela rodada.
7. Nova solicitação volta a permitir o mesmo prestador, sem apagar histórico.
8. Sem prestador online o produto não oferece promessa falsa de atendimento.
9. Endereço exato não vaza antes de autorização.
10. Não se pode marcar pagamento como confirmado no navegador; somente sistema financeiro homologado.
11. Cancelamento com valor liquidado exige política de reembolso e revisão apropriada.
12. Auditoria, logs, backup/restore, acessibilidade e testes de carga cumprem critérios medidos.

## Critério Go / No-Go

**Go:** requisitos críticos verificados com evidência, ambiente disponível, especialistas aprovam contratos e fluxo financeiro, prestadores consentidos homologados, suporte ativo e proteção de dados validada.

**No-Go automático:** vazamento de endereço; fraude ou bypass de pagamento; falta de pessoa jurídica para cobrança; prestador não validado; duplicação financeira; ausência de política de estorno; funções administrativas expostas; nenhum canal confiável de suporte; falha em cenários de segurança ou E2E críticos.

## Responsáveis por decisão

| Área | Quem precisa aprovar | Estado |
| --- | --- | --- |
| Produto e marca | Responsável pelo projeto | Validação pendente deste caderno |
| Engenharia | Responsável técnico + testes | A designar |
| Privacidade e jurídico | Profissional jurídico e responsável pelo tratamento | A designar |
| Financeiro/fiscal | Contabilidade e responsável financeiro | A designar |
| Operação e suporte | **Fundador — responsável inicial (SM-DEC-053)**; segundo operador a ser definido futuramente | Papel definido, mas **plantão não homologado**: faltam canal, escala, substituto/contingência e teste de incidente crítico |

## Medição honesta de progresso

Usar progresso por **evidência por marco**, não porcentagem inventada ou ponderada sem método. O percentual de 40% mencionado em discussões anteriores é apenas estimativa subjetiva, não indicador auditado.

## Registro de riscos e alterações

Cada bloqueio deve conter ID, gravidade, evidência, responsável e próxima decisão. Impedir que pendência crítica seja marcada como concluída sem prova verificável.
