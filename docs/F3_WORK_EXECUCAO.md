# F3 — Roteiro de homologação real para o ChatGPT Work

**Salva Motoca!** · **PR #44** (dependente de PR #42/F2) · **Supabase único:** \`yivkqyjdeouxnwtwfekc\`.

**Status nesta passagem:** código candidato implementado em branch isolada; **sem implantação, sem atendimentos reais e com as flags F1/F2/F3 desligadas**. Este documento NÃO comprova backup, homologação HTTP, equipamento ou liberação.

## Regras inegociáveis

Não contratar planos, ativar F1/F2/F3, criar outro Supabase, usar prestadores reais, aceitar serviços reais, enviar notificações externas ou testar pagamentos. Não registrar credenciais, tokens, fotos ou endereços privados no GitHub. **Não executar \`supabase/drafts/f3_tow_backend_candidate.sql\` diretamente no projeto hospedado.** Não usar dados sintéticos no projeto ativo antes de provar backup/restauração e isolamento.

## Gate 0 — Pré-requisitos F1 e F2

1. Ler primeiro \`docs/F1_WORK_EXECUCAO.md\`, \`docs/F2_WORK_EXECUCAO.md\` e \`docs/F3_DEPENDENCIAS_E_PLANO.md\`.
2. Confirmar que PR #42 foi revisado e integrado, ou executar F3 no banco **local** com a branch F2 como dependência. PR #44 tem base F2: após merge de F2, rebase/retarget PR #44 para a \`main\` em um PR revisado, sem misturar mudanças de fases.
3. Conferir o único Supabase existente, apenas por leitura, e demonstrar **backup privado, integridade e restauração comprovada**, com escopo PostgreSQL/Auth/Storage (incluindo bytes dos objetos). Sem backup recuperável, marcar BLOQUEADO e não efetuar DDL remoto nem criar testes Auth.
4. Confirmar flags \`f1TestRequestsEnabled=false\`, \`f2TestOffersEnabled=false\`, \`f3TowEnabled=false\`, categoria \`reboque_moto.paid_in_app=false\`, e ausência de migração F3 aplicada.

## Gate 1 — Ensaio de código sem rede

1. Executar \`node --test tests/f3-tow.test.js tests/f3-release-guard.test.js\`.
2. Executar \`tests/f3-browser.test.js\` em Chrome/Chromium real, com conexão HTTP bloqueada. Conferir 375px e campos de privacidade.
3. Validar \`live-app-current.js\`, \`f3-tow.js\`, \`index.html\`, \`sw.js\`, \`config.js\` e regressões F1/F2.
4. Usar \`.github/workflows/f3-tests.yml\` para testes reais de PostgreSQL 17 descartável:
   - \`tests/f2-stage-setup.sql\`, \`tests/f3-pre-setup.sql\`
   - \`supabase/drafts/f2_backend_candidate.sql\` (SOMENTE no banco descartável)
   - \`tests/f2-stage-rls.sql\` para impedir regressão F2
   - \`supabase/drafts/f3_tow_backend_candidate.sql\` (SOMENTE no banco descartável)
   - \`tests/f3-stage-rls.sql\` (dentro de transação e ROLLBACK)
   - \`tests/f3-rollback-guard.sh\` e \`supabase/rollback/f3_only_if_empty.sql\`.
5. Se a imagem ou o script falhar, corrigir em PR próprio e repetir. Não marcar aprovado com base apenas no documento.

## Gate 2 — Análise do schema REAL antes da migration

A F1 instalada bloqueia \`reboque_moto\` na CHECK original. A F3 propõe substituí-la **junto** de trigger fail-closed e gate servidor. Isso exige reconciliação cuidadosa dos constraints reais, grants por coluna e triggers Storage, incluindo mudanças desde o PR #42.

Conferir cenários de segurança:
- cliente A pode criar pedido com foto e destino privado; D (terceiro) não pode ler;
- B/C só recebem convite se equipamento certificado e peso suportado, categoria e serviços habilitados, presença recente e área compatível;
- ao remover certificação, B perde novo acesso ao resumo e à foto, mesmo com convite ainda existente;
- chamadas de \`f2_ack_offer\` e \`f2_decide_quote\` não contornam o gate/certificação F3;
- aceitar a mesma proposta duas vezes ou aceitar duas diferentes sob corrida só pode produzir **um** vencedor;
- reenvio com mesmo \`request_key\` e conteúdo divergente deve ser bloqueado;
- o destino exato não pode aparecer em resposta destinada a prestador antes de pagamento real autorizado;
- o esquema jamais cria \`paid\` ou simula chat, despacho, transportador ou repasse.

Analisar \`SECURITY DEFINER\` e RLS com titulares A/B/C/D. Validar os helpers e permissões com esquema local idêntico ao remoto. O test fixture atual é reduzido e **não substitui** inspeção completa.

## Gate 3 — Migration e rollback

Usar CLI da versão instalada (\`supabase --version\`, \`supabase migration new --help\`); Supabase CLI v3 mudou operações locais/remotas. Criar migration em PR separado a partir do SQL candidato reconciliado, adicionar versão adequada, validação do advisor e do rollback. **Não aplicar ao remoto** sem restauração comprovada e autorização operacional específica.

Rollback da F3 só é aceitável quando o gate está desativado **e não existem dados F3 nem pedidos de reboque**; a restauração deve preservar políticas F2 e a CHECK F1 original. A migração, se futuramente aplicada, deve manter server gate \`enabled=false\` e três flags da interface desligadas.

## Gate 4 — E2E remoto com usuários fictícios, somente em ambiente controlado

Se os Gates 0–3 estiverem efetivamente aprovados e a operação autorizada, testar HTTP/Auth/REST/Storage com contas fictícias controladas (A cliente, B e C prestadores, D terceiro). Não ativar nem contatar serviços reais:

1. Declarar equipamento de B/C via API. Confirmar que o próprio prestador não consegue definir \`verified_by_admin=true\`.
2. Em homologação controlada, simular certificação administrativa com trilha de auditoria.
3. Criar pedido completo de reboque com foto sintética, marca/modelo/ano, peso, origem e destino **fictícios**.
4. Verificar caminho da foto, chave idempotente, distribuição conforme capacidade, região, serviços e validação do servidor.
5. Gerar duas propostas itemizadas, mostrar deslocamento separado, expirar uma e aceitar outra; bloquear segundo aceite.
6. Comprovar que D, anon e prestador não selecionado não leem dados privados; testar revogação de certificação, expiração e cancelamento.
7. Confirmar sem ambiguidade: **nenhum pagamento, chat, despacho, geolocalização real de prestadores ou envio de notificações externas**.

Se não for possível isolar triggers, notificações e prestações reais, **não criar pedidos no projeto hospedado**. Registrar BLOQUEADO, não simular aprovação.

## Gate 5 — Segurança e operação real (dependência humana)

- Conferir documentos de veículos de reboque e condutores, regras legais e seguros aplicáveis, amarração, rampa, peso admissível, inspeção presencial ou documentação equivalente.
- Aprovar área de cobertura e parâmetros de busca; os raios 1/3/10 km são exemplos de teste.
- Homologar precisão de rota e preço; distância autodeclarada é apenas estimativa e não substitui medição real.
- Validar notificações de 5 minutos, lembretes, app em segundo plano, falha de rede, GPS, câmera/galeria e acessibilidade em Android físico. O Work não substitui o teste de aparelho real.
- Definir suporte, políticas de avaria, incidentes, cancelamentos, fotos, retenção, LGPD e mediação.
- Somente após homologação financeira F4 e acompanhamento F5 considerar ativar chat, endereço exato, transporte e repasses.

## Gate 6 — Decisão de prontidão

Use \`docs/F3_RESULTADOS_MODELO.md\` para registrar PASSOU / FALHOU / BLOQUEADO / NÃO EXECUTADO, data, evidências sem segredos, PRs e responsáveis.

**Status permitido antes de completar os gates: F3 IMPLEMENTADA E TESTADA LOCALMENTE; HOMOLOGAÇÃO REAL PENDENTE; NÃO LIBERADA.**

### Prompt curto ao Work

> Continue a F3 do Salva Motoca! no PR #44 (empilhado sobre o PR #42). Leia primeiro \`docs/F3_WORK_EXECUCAO.md\`, o roteiro da F1 e o da F2. Utilize apenas o Supabase existente \`yivkqyjdeouxnwtwfekc\`. Não crie projeto, não contrate plano, não ative F1/F2/F3, não despache ninguém nem faça pagamentos ou notificações reais. Primeiro comprove backup com restauração; depois reconcilie SQL com esquema real e teste em PostgreSQL descartável. O arquivo \`supabase/drafts/f3_tow_backend_candidate.sql\` é somente candidato e não deve ser aplicado diretamente. Faça correções e migrations apenas em PRs revisáveis, sem credenciais. Entregue os gates aprovados, evidências e bloqueios reais, distinguindo simulação, HTTP e Android físico.
