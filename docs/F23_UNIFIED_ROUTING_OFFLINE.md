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

## Dependências restantes

1. Conciliar os PRs empilhados #42 → #44 → ... → #57 → #61 → #62 → #63 → #64 e este PR, sem merge automático e sem integrar o módulo local a um emissor real.
2. Executar G1 de backup/restauração privados com provas de DB, Auth e Storage **antes de qualquer DDL hospedado**.
3. Implementar RPCs reais revisadas e autorizadas para escolha F2/F3, incluindo concorrência e revisão de acesso às fotos, destino do reboque, rota e segurança veicular.
4. Definir raios e política operacional por tipo de serviço; os `1/3/10 km` são **somente exemplos de teste**.
5. Homologar PSP, notificações, Android físico, consentimentos, revisão jurídica e suporte humano. Não enviar novos dados de usuários ou informações privadas à CI.

**Resultado esperado: somente CI offline. `G1=BLOCKED`, `F1–F7=NO_GO`; nenhuma mudança de produção.**
