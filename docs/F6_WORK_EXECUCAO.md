# Salva Motoca! — F6, conclusao, mediacao e avaliacao (simulador offline)

**Data:** 15/11/2026. **Estado:** somente modelo de dominio e testes locais; **NO-GO** para ativacao.

**Cadeia:** F1 integrado (homologacao real pendente) → F2 #42 draft → F3 #44 draft → F4 #45 draft → F5 #48 e #49 drafts → **F6** (este ramo). A F4 paralela #47 e o plano Stripe #46 estao anotados com checklist de conciliacao. Nao mesclar como ativacao.

## Atualização 16/11/2026 — repasse condicionado ao contrato 10% + 10%

O modelo comercial vigente (SM-DEC-045/046) usa **serviço com materiais inclusos + deslocamento separado**. A comissão de 10% do motociclista é acrescida ao pagamento dele e a de 10% do prestador é descontada do repasse. Nenhuma comissão incide sobre deslocamento.

A ponte `f456-financial-bridge-offline.js` preserva, em cenário **puramente fictício**, esses valores até o resumo, as duas confirmações e a revisão: serviço R$ 230 + deslocamento R$ 40 → cliente R$ 293 antes do PSP; repasse-base prestador R$ 247; plataforma R$ 46 brutos. Nenhum evento F6, nem dois usuários confirmando, autoriza transferência. Disputa, reembolso ou chargeback suspende até a candidatura **mock** a revisão humana.

A F6 real deverá validar o recibo conciliado do PSP, a existência de saldo e as regras de estorno, além das confirmações autênticas; **não depender de recibos F5/F6 locais, flags ou browser**. Detalhes em `docs/F456_RECONCILIACAO_CONTRATO_10X10.md`.

## Entregas

- `f6-offline-completion.js`: maquina de estados **pura**, sem rede, banco, PSP, chat real ou terceiros. Entrada exige `F5_LOCAL_HANDOFF_NOT_REAL`, nunca comprova pagamento. Flags reais sempre falsas.
- `tests/f6-offline-completion.test.js`: testes de resumo, foto ficticia opcional, confirmacao bilateral, prazo de 5 minutos, diferencas/mediacao, contestacao tardia, nota de 1–5, idempotencia, isolamento de terceiros e ordenacao.
- `tests/f6-release-guard.test.js`: F1–F6 desligadas e nenhum efeito na interface real.
- `.github/workflows/f6-tests.yml`: CI Node 22 com regressao F5.

## Regras operacionais candidatas

1. Prestador que concluiu o atendimento envia **resumo obrigatorio**; foto do resultado e opcional. Na simulacao so um marcador `F6_SYNTHETIC_PHOTO_ONLY`, nunca arquivo ou URL.
2. Janela de **5 minutos** para o motociclista visualizar o resumo e confirmar. A janela inicia com o resumo do prestador. Confirmacao exatamente na fronteira e valida; fora do prazo vai para suporte. **Silencio nao e confirmacao.**
3. A finalizacao exige **confirmacao de ambos**. Cliente pode confirmar antes do prestador, mas nao conclui sozinho. A confirmacao do prestador nao libera repasse por si.
4. Divergencia pode ser aberta antes ou depois da confirmacao bilateral e bloqueia a finalizacao financeira; o suporte de demonstracao e somente textual, nao representa uma equipe ou decisao humana verdadeira.
5. Avaliacao 1–5 estrelas feita apenas pelo motociclista, uma vez, depois da dupla confirmacao. Nao publicar ou alterar reputacao real.
6. Toda transferencia e proibida neste modulo. O `settlementCandidate()` retorna sempre `authorized=false`. A futura F4/PSP deve reconfirmar pagamento, disponibilidade, risco e nenhuma disputa.
7. Um prazo encerrado, falha de notificacao ou dispositivo offline NUNCA gera confirmacao automatica, nota ou saque.

## Nao implementado e necessario antes do lancamento

- Auth real, RLS/migrations versionadas de confirmacoes e avaliacoes, reconciliacao financeira, fila de suporte, transicoes concorrentes em PostgreSQL, foto privada e URLs assinadas, politicas LGPD, notificacoes comprovadas, testes Android reais, mecanismos de auditoria e operacao assistida.
- Determinar juridicamente se casos sem confirmacao do cliente podem ser conciliados por revisao humana; **nenhuma aprovacao automatica**.
- Ligar `f6CompletionEnabled` e a infraestrutura de pagamentos demanda decisao futura explicita. **Nao alterar main nem o Supabase atual.**

## Validacao

Executar `node --check f6-offline-completion.js` e
`node --test tests/f6-offline-completion.test.js tests/f6-release-guard.test.js`;
depois conferir run do GitHub Actions e regressao F5. Relatar PASS apenas com evidencia.
