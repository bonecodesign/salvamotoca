# Salva Motoca! — ponte F2/F3: encaminhamento por tipo de serviço (OFFLINE)

**Data da revisão:** 17/11/2026. **Ambiente:** somente testes Node 22 e PostgreSQL 17 descartável no GitHub Actions. Projeto Supabase existente `yivkqyjdeouxnwtwfekc`: **nenhuma alteração**. **Não é implementação de servidor ou migration.**

## Objetivo e descoberta

As propostas originais [F2 (#42)](https://github.com/bonecodesign/salvamotoca/pull/42) e [F3 (#44)](https://github.com/bonecodesign/salvamotoca/pull/44) têm motores separados: borracharia pode selecionar vários serviços básicos; **se o pedido contém `reboque_moto`**, inclusive misturado com `troca_camara` ou `pneu_furado`, precisa seguir **inteiramente o fluxo de reboque F3**, exigindo equipamento validado e capacidade para todos os serviços solicitados.

O [PR #64](https://github.com/bonecodesign/salvamotoca/pull/64) demonstrou convites F2 em anéis de proximidade com `FOR UPDATE`, sem envio real. O [PR #63](https://github.com/bonecodesign/salvamotoca/pull/63) demonstrou outbox F5 pós-despacho em banco efêmero. **São estágios diferentes**: convite para orçamento (F2/F3, pré-pagamento) e notificação do prestador selecionado (F5, após pagamento realmente comprovado por backend/PSP — não implementado).

## Entrega desta rodada

O novo módulo `f23-routing-bridge-offline.js` é **um planejador puro em Node**, sem rede, Supabase, telefone, imagens, GPS publicado ou SDK:

- `identify(request)`: classifica em `F2` ou `F3`. Rota incompatível é rejeitada, nunca reconvertida silenciosamente. O reboque exige categoria correta, dados completos de motocicleta, peso e destino mantido privado.
- `planNextInvitation({request,providers,history,radiiKm,now})`: verifica estado da solicitação, proíbe ampliação automática no modo manual, **aguarda** convite ou orçamento pendente, desconsidera prestadores já convidados e seleciona **somente um candidato** por chamada, respeitando o primeiro anel com prestadores aptos. Retorna só identificador do prestador, fase, anel e flags fictícias, nunca GPS exato, destino ou foto.
- Para F2, a decisão de proximidade foi alinhada com o critério escolhido: **distância primeiro**, com histórico de recusa somente como critério de desempate dentro do anel. O `f2-flow.js` anterior ordenava por histórico antes de distância; a mudança é deliberadamente isolada na ponte, **não altera o módulo F2 nem suas APIs**. O algoritmo futuro de produção precisará decidir explicitamente como ponderar rejeições, equidade e limites.
- Para F3, usa o motor existente que exige homologação da plataforma/carretinha/caminhonete, peso suportado, rampa, pontos de amarração, presença e capacidade para todos os itens. Não transfere para borracharia um pedido misto.
- `quoteDryRun({request,quoteId,serviceCents,travelCents})`: valida itens por F2 ou F3 e calcula o contrato financeiro **10% do serviço ao cliente + 10% descontados do prestador**, com materiais inclusos e deslocamento isento, usando o módulo `f4-finance.js`. A tarifa PSP é desconhecida (`null`), jamais simulada como cobrada.

`tests/f23-routing-bridge.test.js` cobre cenários de aproximação, pedido misto, equipamento/porte, suspensão, presença, não repetição de convites, expiração fictícia de 5min, recusa, modo manual, pedido encerrado, entradas inválidas, privacidade, imutabilidade e paridade financeira entre F2/F3. A CI executa também regressões originais e regras de F4, mais a suíte SQL de F2 e F3 em PostgreSQL isolado.

## Diferenças importantes entre simulação e produto real

| Comportamento | Estado atual |
|---|---|
| Seleção F2/F3 a partir dos serviços solicitados | Candidato de domínio, testável em Node |
| Solicitação de reboque junto de serviço básico | F3 exclusivamente, com equipamento homologado |
| Convite do próximo prestador próximo | Plano offline; não grava nem entrega convite |
| Dois convites concorrentes F2 | Ensaio separado no PR #64 (PostgreSQL efêmero) |
| Despacho pós-pagamento F5 | Outbox fictício no PR #63; **sem PSP real** |
| Acesso ao endereço e GPS exatos | **NÃO AUTORIZADO**, nunca incluídos na resposta |
| Cobrança, chat, suporte, repasse | **DESLIGADOS** |
| Utilização no dispositivo do usuário | **NÃO EXECUTADO**; pasta temporária ainda depende de indicação do usuário |
| Backup e restauração verdadeiros do Supabase | **G1 BLOQUEADO** |
| Ativação comercial | **NO-GO** |

**Nota de segurança:** o histórico entregue ao planejador é usado somente para simulação. Em produção, as decisões de estado devem ser tomadas por transação no servidor, com JWT/Auth e RLS revisados, prova independente do estado da proposta, idempotência, localização protegida, controle de retries e integração real de F2/F3 com PSP validado. Um JSON malicioso não pode ser fonte de autorização.

## SM-DEC-048 — municípios do piloto (18/11/2026)

O fundador aprovou **somente Belo Horizonte, Contagem e Betim (MG)** para a praça inicial. As três cidades formam um conjunto autorizado: F2 e F3 podem selecionar prestadores com base em qualquer uma das três cidades para uma **origem de pedido também em uma delas**, desde que a distância geográfica esteja nos anéis **5/15/60 km** e o prestador esteja homologado, online, compatível e dentro da cobertura que declarou. **Sabará, Nova Lima e outros municípios da RMBH ficam excluídos**, mesmo se estiverem a poucos metros.

A triagem do código Node é uma simulação e **não comprova limites municipais reais** a partir de coordenadas. Antes de ativar o servidor, a origem do chamado e a base do prestador exigem verificação geográfica confiável por servidor; campos de cidade enviados pelo próprio cliente não bastam. **SM-DEC-049 (18/11/2026):** o destino final do reboque pode ser **fora** de BH, Contagem e Betim, desde que o prestador **esteja disponível**, **aceite expressamente atender aquele destino** e **apresente orçamento transparente** (serviço com materiais inclusos e deslocamento). A autorização da praça inicial se aplica à **origem do pedido e à base do prestador**, não ao destino. Os 5/15/60 km medem a busca por prestadores **até a origem**; não definem o limite do percurso do reboque. Não há promessa de rota longa nem aceitação automática, e a tarifa PSP depende de homologação.

As funções SQL candidatas F2/F3 e as fixtures descartáveis são apenas propostas; nenhum SQL foi aplicado ao Supabase. **G1=BLOCKED; RELEASE=NO_GO**.

## Política de proposta para destinos externos — somente offline

- A decisão do prestador é **voluntária e específica para o destino e a rota**, nunca inferida apenas de estar online ou de constar no anel de 60 km.
- O protótipo de domínio `previewTowRouteQuote` exige flags fictícias explícitas de disponibilidade e aceite do destino, além de orçamento itemizado. Retorna apenas município/UF, distância estimada e valores. **Não revela o endereço de destino**.
- A prova real deverá vincular prestador autenticado, pedido, destino/rota, valor, confirmação do cliente e capacidade de transporte por evento auditável e servidor seguro. Nenhuma flag recebida do navegador pode servir como autorização real.
- Os limites 1–500 km para distância estimada e R$ 5.000 para o valor total atualmente encontrados no simulador são validações de teste, **não uma política comercial definitiva de distância/preço**.
- Não há despacho, chat, cobrança, envio de GPS, cadastro real nem alteração do Supabase; `G1=BLOCKED` e `RELEASE=NO_GO`.

## SM-DEC-050 — solicitações a qualquer hora, apenas com prestadores online

**18/11/2026 — fundador aprovou:** o aplicativo pode receber chamadas a **qualquer hora, todos os dias**, mas somente prestadores **voluntariamente online e com presença confirmada recentemente**, homologados, compatíveis e dentro da área de cobertura podem ser candidatos a orçamento F2/F3. O sistema **não impõe escalas ou plantões**. Não usar bloqueio fixo por madrugada, fim de semana ou feriado.

Se nenhum prestador for elegível, apresentar indisponibilidade (não inventar profissional, horário de chegada ou cobertura, e não despachar/cobrar). A eventual retomada posterior de pedido sem candidato demanda política e consentimento próprios, **não aprovados nesta decisão**. As notificações fictícias devem manter timeout justo e não gerar ausências quando não houver prova de entrega.

**A operação do produto 24 horas não cria promessa de suporte humano 24 horas.** `SM-DEC-025` continua vigente; apoio humano, escala de incidentes críticos e mediação fora do expediente seguem abertos em `SM-OPEN-009`. A inexistência de canal humano confiável em incidentes relevantes é um **bloqueio do lançamento real**, não um motivo para considerar a política de horários indeferida.

O planejador F2/F3 offline já não continha restrição por relógio; não foi necessário alterar o seu motor para esta decisão. Os testes adicionados validam horários variados, ausência de online ou heartbeat expirado e não acionamento de notificações/pagamentos reais. Nenhuma alteração em produção: **G1=BLOCKED; F1–F7=NO_GO**.

## Dependências restantes

1. Conciliar os PRs empilhados #42 → #44 → ... → #57 → #61 → #62 → #63 → #64 e este PR, sem merge automático e sem integrar o módulo local a um emissor real.
2. Executar G1 de backup/restauração privados com provas de DB, Auth e Storage **antes de qualquer DDL hospedado**.
3. Implementar RPCs reais revisadas e autorizadas para escolha F2/F3, incluindo concorrência e revisão de acesso às fotos, destino do reboque, rota e segurança veicular.
4. **SM-DEC-047**: os anéis de busca **5/15/60 km** foram definidos pelo fundador em 18/11/2026, para F2 e F3. Seu uso permanece **apenas no roteamento de simulação**; dependem de homologação em campo, definição do método de distância (linha reta versus rota viária), limites geográficos do piloto e capacidade declarada do prestador. Não há promessa de cobertura, tempo de chegada ou despacho.
5. Homologar PSP, notificações, Android físico, consentimentos, revisão jurídica e suporte humano. Não enviar novos dados de usuários ou informações privadas à CI.

**Resultado esperado: somente CI offline. `G1=BLOCKED`, `F1–F7=NO_GO`; nenhuma mudança de produção.**
