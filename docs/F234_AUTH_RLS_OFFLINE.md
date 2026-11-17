# Salva Motoca! — simulação autenticada A/B/C e defesa RLS F2–F5

**17/11/2026 — APENAS PostgreSQL 17 descartável no GitHub Actions.**  
**Não é autenticação real do Supabase, migration, teste HTTP, PSP ou autorização de F1.**  
Repositório `bonecodesign/salvamotoca`; único Supabase existente `yivkqyjdeouxnwtwfekc` permanece inalterado.

## Objetivo

O [PR #66](https://github.com/bonecodesign/salvamotoca/pull/66) demonstrou exclusividade de orçamento, sessão financeira e fila pós-despacho, mas sua função interna recebe um **UUID do ator fornecido como parâmetro fictício**. Antes de integrar qualquer camada a um backend definitivo, é preciso provar que as operações de clientes e prestadores não podem ser autorizadas somente porque alguém enviou um UUID conhecido. Este PR cobre os **contratos de acesso**, sem alegar verificação de JWT.

## Perfis fictícios e cenários

| Papel no ensaio | Acesso esperado | Acesso negado |
|---|---|---|
| Anônimo (`anon`) | Nenhum cartão de orçamento ou RPC mock | Consultar, aceitar, cancelar ou ler sessão |
| Motociclista A | Ver ofertas dos seus pedidos; aceitar uma; cancelar apenas pedido antes de aceite | Mudar o preço, ver dados restritos, cancelar automaticamente após aceite |
| Prestador B | Ver apenas seus próprios orçamentos; depois da seleção, ver estado sanitizado da sessão | Aceitar em nome do cliente, consultar proposta de outro prestador, receber GPS privado |
| Prestador concorrente | Ver sua proposta, inclusive após perdê-la | Ler sessão da proposta vencedora, aceitar ou obter chat |
| Terceiro C | Nenhum cartão de orçamento ou sessão alheia | Ler, cancelar, selecionar, alterar valores ou abrir suporte indevido |

### Proteções que estamos exercitando

1. **Identidade não enviada no corpo da RPC simulada:** funções públicas `public.f234_mock_accept_as_customer` e `public.f234_mock_cancel_as_customer` obtêm `auth.uid()` no servidor fictício, sem argumento `p_actor_id`. A função interna ainda recebe o UUID artificial **apenas do wrapper**.
2. **RLS na projeção de orçamento:** tabela descartável `public.f234_mock_quote_cards` tem política `TO authenticated USING (customer_id=auth.uid() OR provider_owner_id=auth.uid())`. O `SELECT` concedido é **somente por colunas** necessárias; `customer_id`, `provider_owner_id` e `private_note` não são selecionáveis. Prestadores só veem suas próprias propostas; o cliente vê as do pedido que lhe pertence.
3. **Menor privilégio:** funções internas de pagamento, quote e outbox permanecem no esquema privado sem `EXECUTE` para `anon` ou `authenticated`. Os wrappers `SECURITY DEFINER` de teste têm `search_path=''`, `auth.uid()` verificado, gate privado **false por padrão**, concessão `authenticated` explícita e `REVOKE PUBLIC`.
4. **Projeções sem dados privados:** `read_quote` e `read_session` emitem somente campos de orçamento/estado marcados como `mockOnly`. Nunca retornam localização exata, fotos, telefone, ID interno do dono prestador, dados de processamento, acesso a chat ou autorização real de pagamento.
5. **Concorrência sob perfis de teste:** duas conexões com a *mesma identidade fictícia A* tentam aceitar propostas diferentes. Uma vence; a segunda é bloqueada. Prestador B e terceiro C não conseguem aceitar nem ler pedidos alheios.
6. **Rollback e ausência de dinheiro:** testes executam `BEGIN ... ROLLBACK`; depois verificamos que não restaram orçamentos aceitos, pagamentos simulados, mensagens ou sessões financeiras. A prova concorrente posterior nunca cria evento de PSP, nem mesmo mock.

## Arquivos incluídos

- `tests/f234-auth-roles-fixture.sql`: esquema `auth.uid()` comportamental, mapeamento fictício de proprietários de prestador, cartões RLS/colunas e wrappers com verificações de titularidade; função de sincronização de status após mudança de proposta.
- `tests/f234-auth-roles-adversarial.sql`: anônimo, A/B/C, vencedor/concorrente, colunas restritas, alteração não autorizada, estados, rollback.
- `tests/f234-auth-roles-race.sh`: duas sessões PostgreSQL reais com `SET ROLE authenticated` e um **claim fictício**, contagem de vencedores e recusa de terceiros/prestadores.
- `tests/f234-auth-roles-contract.test.mjs`: garantias estáticas, RLS, gates e NO-GO.
- `.github/workflows/f234-auth-rls-offline.yml`: executa PostgreSQL 17 isolado e testes anteriores do handoff.

## Riscos explicitamente NÃO resolvidos

**O principal:** a simulação define `request.jwt.claim.sub` com `SET LOCAL`, recurso que um administrador de banco pode manipular. **Isso não valida a assinatura de JWT ou a sessão Auth do Supabase.** Nem RLS em PostgreSQL descar­tável prova que as políticas verdadeiras do Supabase estão idênticas. Em particular:

- As quatro funções públicas `public.f234_mock_*` são **somente protótipos SQL de teste**, não devem ser copiadas para o Supabase. Um `SECURITY DEFINER` exposto sem checagens corretas pode contornar RLS e criar grave vulnerabilidade. Requer revisão posterior da interface com função invoker/autorização real, sem confiar em dados manipuláveis.
- A própria tabela `f234_mock_quote_cards` é uma **projeção redundante exclusivamente do ensaio**; eventual implementação real deve derivar de schema aprovado e RLS/roles verificadas, sem duplicar fonte de verdade desnecessariamente.
- Ainda faltam G1 de backup/restauração verdadeiros de DB/Auth/Storage, autenticação HTTP genuína A/B/C com JWT validado, revisão dos seis RPCs SECURITY DEFINER já existentes, fotos e GPS privados, PSP sandbox assinado, Android físico, notificações, homologação e aceite humanos.
- Nenhum acesso ou arquivo temporário no **dispositivo do usuário** foi necessário. Se houver teste local, usar exclusivamente a pasta que o usuário indicar previamente, seguido de limpeza.

## Evidência esperada

O CI deve informar aprovação dos contratos Node e SQL adversarial; duas sessões competindo geram **uma** proposta vencedora e **nenhuma** cobrança, aviso real ou lançamento financeiro. O manifesto de release deve seguir `G1=BLOCKED`, `RELEASE=NO_GO`, `HOSTED_SUPABASE_CHANGES=NONE`.

**Não fazer merge automaticamente, não converter fixtures em migration, não ativar F1–F7.**
