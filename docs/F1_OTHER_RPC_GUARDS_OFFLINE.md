# Salva Motoca! — F1: cinco RPCs restantes, revisão adversarial OFFLINE

**Data:** 16/11/2026. **Alvo documental:** Supabase existente `yivkqyjdeouxnwtwfekc`. **Não é migration. Não aplicar em produção.**

**Estado:** F1 técnica parcial; G1 (backup e restauração reais DB/Auth/Storage) continua **BLOQUEADO**. `f1TestRequestsEnabled=false`. Não houve credenciais, conta fictícia hospedada, atendimento, pagamento ou atualização do Supabase real.

## Escopo verificado por SQL somente de leitura

Além da localização já estudada nos [PRs #54](https://github.com/bonecodesign/salvamotoca/pull/54) e [#59](https://github.com/bonecodesign/salvamotoca/pull/59), foram lidas as definições atualmente instaladas das outras **cinco funções `SECURITY DEFINER` acessíveis por `authenticated`**:

| RPC atualmente instalada | Verificação observada | Restrição adicional preparada em fixture |
| --- | --- | --- |
| `bj_submit_quote` | Verifica `auth.uid()`, proprietário/estado do prestador, pedido atribuído e `status='requested'`; o valor recebido é único | Gate no servidor inicialmente falso; exige serviço ativo, presença recente, serviço + deslocamento (materiais embutidos), comissão de 10% para cada lado e limite do orçamento |
| `bj_answer_quote` | Exige cliente dono do pedido, proposta `proposed`, pedido `quoted` e prestador atribuído; aceita e muda pedido para `awaiting_payment` | Revalidar aprovação/atividade do prestador, categoria ativa, presença, estado, preço vinculado e ausência de registro financeiro antes do aceite |
| `bj_finish_request` | Função de encerramento/cancelamento pré-atendimento: bloqueia registros `authorized`/`paid` | Na ausência de PSP conciliado e política de estornos, **qualquer** registro em `payment_records` bloqueia o encerramento automático e exige suporte; preserva cancelamento sem movimentação financeira |
| `bj_set_presence` | Ativa prestador próprio, aprovado, ativo e com categoria `borracharia_delivery` ativa | Gate do servidor para ficar online, categoria `borracharia_delivery` **ou** `reboque_moto`; desligar continua permitido com gate falso |
| `bj_ping_presence` | Atualiza heartbeat de prestador próprio, aprovado, ativo e que pediu online | Revalida gate, serviço ativo e heartbeat recente; revoga disponibilidade se serviço/credenciamento deixar de ser válido, sem reviver sessão antiga por heartbeat |

**Não foi demonstrado acesso indevido no Supabase real.** Os comportamentos acima são conclusões de leitura estática das funções hospedadas em 16/11/2026. Nenhuma execução autenticada A/B/C foi efetuada devido ao G1 bloqueado.

## Implementação preparada no repositório

- `tests/f1-other-rpcs-security-fixture.sql`: PostgreSQL 17 **descartável** com roles, tabelas e identidades inteiramente inventadas; cinco réplicas de **comportamento** legado com funções privadas e cinco variantes propostas `private.f1_guarded_*`, com gates `false`.
- `tests/f1-other-rpcs-adversarial.sql`: testes por identidades sintéticas A (motociclista), B (borracharia), C (terceiro) e T (reboque), incluindo negação por titularidade, orçamento duplicado, contato externo, prestador suspenso/inativo, serviço não habilitado, coração online expirado, valores de serviço/deslocamento inválidos, orçamento não precificado e contestação/estorno antes do cancelamento; tudo submetido a `ROLLBACK`.
- `tests/f1-other-rpcs-static.test.mjs`: verifica escopo, contratos 10%+10%, grants restritivos, gates inicialmente desligados e prevenção de regressão de modo offline.
- `.github/workflows/f1-other-rpcs-security.yml`: executa apenas no PostgreSQL 17 criado no GitHub Actions; **nenhum token de Supabase, PSP, endereço real ou foto**.

### Exemplo financeiro do teste, sem dinheiro real

Orçamento do prestador: **R$ 230,00 de serviço com materiais inclusos** + **R$ 40,00 de deslocamento**. A taxa do motociclista é R$ 23,00; total hipotético do cliente R$ 293,00 (antes da eventual tarifa PSP). A comissão do prestador é R$ 23,00; repasse-base R$ 247,00; receita bruta teórica da plataforma R$ 46,00. **Não há linha extra para peças.**

O aceite deve permanecer em `awaiting_payment`; não confirma fundos, não abre chat real, não atribui automaticamente GPS/endereço, nem autoriza repasse. Encerramento de solicitação com registro financeiro requer fluxo de suporte e conciliação.

## Limite essencial de segurança

As funções `private.f1_guarded_*` são **protótipos de testes**, não uma alteração de comportamento real. Enquanto as antigas `public.bj_*` permanecerem diretamente executáveis pelos mesmos usuários, uma função alternativa adicionada não garante segurança: a substituição/revogação precisa ser desenhada como **mudança única versionada, compatível com o app, devidamente revisada e homologada**. Não usar `SECURITY DEFINER` para contornar erro de RLS sem revisão; validar se é necessário no desenho final.

Além disso, a presença para reboque deve ser compatibilizada com F3/F5 e sua política de disponibilidade; a fixture apenas demonstra o modelo esperado.

## Ordem de execução autorizável futuramente

1. **G1:** comprovar backup binário + restauração privada e independente do banco existente, Auth e bytes Storage (PRs #53/#58). Se G1 falhar, parar.
2. Revisar as funções reais, seus owners, grants, filas/trigger e versão do app. Gerar migration somente com ferramentas e procedimento atuais, **não a partir da fixture**.
3. Revisar integração financeira F2–F6 e PSP/Stripe sem converter status mock em prova de pagamento.
4. Testar autenticado A/B/C, prestadores legítimos controlados, RLS, SQL injection, concorrência, expiração de sessão, cancelamento e rollback seguro, preservando zero atendimentos externos.
5. Testar Android físico, LGPD, suporte, estornos e fiscalização de disponibilidade; aprovação humana específica antes de ativar F1.

**Release = NO-GO.** Testes PostgreSQL descartáveis e CI não autorizam alterar o projeto real, executar migrations, criar usuários ou gerar corridas de despachos.
