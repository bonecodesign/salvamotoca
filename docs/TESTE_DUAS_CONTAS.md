# Salva Motoca! — Plano de homologação com duas contas

**Data:** 12/11/2026 (continuação UTC 13/11)  
**Ambiente de testes:** Supabase `yivkqyjdeouxnwtwfekc` • GitHub `bonecodesign/salvamotoca`

## O que já foi validado automaticamente

Em transações SQL revertidas (**ROLLBACK**) foi possível simular papéis distintos sem manter usuários, pedidos ou orçamentos reais:

- Visitante `anon` lê somente as colunas comerciais de profissionais e serviços aprovados;
- Cliente pode ler o próprio pedido e endereço;
- Borracheiro atribuído lê o pedido e cria um único orçamento proposto;
- Cliente vê o orçamento e terceiro sem vínculo não o vê;
- Borracheiro **não** vê endereço exato antes do pagamento;
- Chat pré-pagamento, autohomologação, pedidos por categoria de reboque e envio de pedidos/orçamentos duplicados foram bloqueados.

**Limitação:** testes SQL simulam o uso do RLS, mas não substituem testes completos por navegador, Supabase Auth, e-mail e rede.

## Como testar o aplicativo

1. Baixe o código da branch `feat/importar-mvp` do repositório autorizado. Não use `supabase/schema.sql` (legado).
2. Na pasta do app execute `python3 -m http.server 8080`; abra `http://localhost:8080` em navegador com internet.
3. Use uma janela anônima e outra normal. Cadastre **duas contas controladas por você**, com e-mails distintos, sem compartilhar senhas aqui.
4. Cliente: entre e consulte o mapa gratuito. A lista ficará vazia enquanto não houver prestador aprovado.
5. Prestador: entre na outra janela, solicite cadastro como borracharia delivery. O cadastro deve ficar `pending`, com `providers.is_active=false` e `provider_services.is_active=false`.
6. **Somente após verificar a identidade e o consentimento do prestador**, um administrador autorizado deve aprovar o cadastro e habilitar **a categoria correta** pelo painel do Supabase. Não habilitar reboque nesta fase.
7. Volte à conta do cliente, recarregue e confira o prestador verificado no mapa. Crie apenas um pedido de teste, com endereço fictício para não divulgar informações pessoais reais.
8. Na conta do prestador, confira o pedido e envie orçamento de teste. Na conta do cliente, confirme que ele aparece em "Pedidos".
9. Abra uma terceira sessão sem vínculo: não deve consultar pedidos nem orçamentos alheios.
10. Teste o bloqueio de compartilhamento de endereço do cliente e a indisponibilidade do chat enquanto o pagamento real não existe.

## Aprovação administrativa provisória

No piloto, a homologação deverá ser **manual por conta com permissão de administrador** no projeto Supabase, com verificação do prestador fora da plataforma. Não criar um endpoint público que altere status/ativação de terceiros; o MVP ainda não tem painel administrativo autorizado por funções backend.

A aprovação não pode ser baseada apenas em endereço ou telefone encontrados na internet. Cadastros na prospecção permanecem privados e separados.

## Critérios para não lançar ainda

- Sem usuários de teste validados por navegadores independentes;
- Sem prestador homologado voluntariamente;
- Sem aceite formal de orçamento e mudanças de status protegidas;
- Sem integração de pagamentos reais/split, webhooks, estornos e conciliação;
- Sem fluxo operacional de suporte e regras de cancelamento.

## Não fazer

- Não publicar senha, chave `sb_secret_*` ou `service_role` no GitHub;
- Não marcar `payment_records.status='paid'` manualmente para simular que houve cobrança real;
- Não divulgar telefones e contatos privados de fornecedores no mapa;
- Não afirmar que o aplicativo já atende emergências.

## Teste da nova disponibilidade e orçamento

Com duas contas reais de teste em navegadores distintos, após homologar o prestador:
1. Profissional ativa **Ficar online**. Em outra janela, o cliente atualiza a busca e vê que aceita pedidos.
2. Cliente cria pedido e o profissional envia preço e detalhes.
3. Cliente testa **Recusar e buscar próximo online** usando outro prestador homologado e conectado. A proposta anterior fica registrada.
4. Profissional seguinte envia outro orçamento. Cliente clica **Aceitar** e observa o estado de aguardando pagamento, **sem pagar dinheiro**.
5. No perfil do prestador, clique **Ficar offline**; a lista de novos pedidos não deve incluí-lo.
6. Para validar queda de conexão, interrompa o navegador (ou internet) e confira que após cerca de 90 segundos sem ping ele deixa de aparecer online.

**Não executar chamadas de serviço reais e não ativar cobranças.**

## Regra das duas recusas — teste específico

Depois de aprovar **dois prestadores fictícios com consentimento**, coloque A e B online e use uma única conta de cliente:

1. A envia orçamento; cliente recusa: A fica com **1/2** recusas no mesmo pedido, e B recebe a próxima tentativa.
2. B envia e é recusado: B fica com **1/2**, e A pode receber de novo.
3. A envia outro orçamento, e o cliente recusa: A fica com **2/2**, fora desta solicitação.
4. B envia e recebe segunda recusa: B também sai; o pedido informa que não há próximo elegível.
5. Cliente escolhe **Encerrar esta solicitação**, depois **Criar nova solicitação**. A e B voltam a ser elegíveis online, começando a contagem do zero.

Este teste não deve acionar atendimento nem pagamento real. A lógica foi simulada no banco com `ROLLBACK`, mas o teste com duas contas reais ainda está pendente.
