# F2 — Roteiro de homologação real para o Work

**Estado:** código F2 implementado na branch do PR #42, testado com mocks e PostgreSQL 17 descartável. **Não aplicado ao Supabase ativo.**

**Único projeto Supabase:** yivkqyjdeouxnwtwfekc.  
**Referências:** docs/F1_WORK_EXECUCAO.md e docs/F2_DEPENDENCIAS_E_PLANO.md.

## Material disponível

- f2-flow.js: elegibilidade por homologação, todos os serviços, cobertura, distância, presença, recusas, prazos, orçamento itemizado e seleção única.
- docs/F2_PREVIEW.html: simulador local sem rede.
- live-app-current.js: telas reais para capacidades, convites, foto, orçamento itemizado e escolha de vencedor, atrás de duas flags desligadas.
- config.js: f1TestRequestsEnabled=false e f2TestOffersEnabled=false.
- supabase/drafts/f2_backend_candidate.sql: candidato SQL de múltiplos convites, propostas e itens, com RLS e funções autenticadas. **NÃO É MIGRATION PARA APLICAR AO REMOTO.**
- tests/f2-stage-setup.sql + tests/f2-stage-rls.sql: teste no PostgreSQL descartável e transação revertida.
- tests/f2-flow.test.js, tests/f2-release-guard.test.js, tests/f2-browser.test.js e tests/f2-integrated-browser.test.js: Node e Chrome sem comunicação com Supabase.
- GitHub Actions: .github/workflows/f2-tests.yml e regressões F1.

O projeto SQL contém uma trava interna private.f2_release_gate, criada com enabled=false, e retira acesso direto de escrita às novas tabelas. A interface exige as duas flags verdadeiras. A trava não deve ser habilitada automaticamente.

## Gate 0 — Comprovar backup/restauração da F1

Leia primeiro docs/F1_WORK_EXECUCAO.md. Não faça nenhuma gravação no Supabase remoto (inclusive criação de contas, uploads, migrações, convites ou prestadores fictícios) antes de provar backup privado e restauração em ambiente isolado. Documente o escopo de PostgreSQL, Auth, Storage e bytes de arquivos, além das lacunas.

Se o backup não for restaurável, pare e registre BLOQUEADO. Não crie um segundo projeto Supabase ou contrate planos.

## Gate 1 — Reconciliação do esquema real e riscos

Revise, com leitura apenas, a versão main, migrações, RLS, privilégios, triggers e funções, especialmente service_requests, service_quotes, bj_request_attempts e bucket request-photos. Consulte os alertas SECURITY DEFINER existentes e identifique cron, webhooks, Edge Functions, notificações ou terceiros que possam reagir a criação de pedidos.

Revise os efeitos da transição do prestador inicial F1 para vários convidados F2. O prestador anterior precisa perder acesso à foto se não for convidado; somente o vencedor conserva acesso depois do aceite.

## Gate 2 — Execução local e testes adversariais

1. Executar Node e Chrome de F1 e F2. Usar apenas imagens e coordenadas sintéticas.
2. Aplicar tests/f2-stage-setup.sql e supabase/drafts/f2_backend_candidate.sql em PostgreSQL 17 DESCARTÁVEL; rodar tests/f2-stage-rls.sql e descartar a instância.
3. Repetir com esquema real espelhado: providers, presença, categorias, Storage RLS, service_requests, service_quotes e funções legadas. Testar concorrência de dois aceites simultâneos.
4. Validar perfis distintos A cliente, B/C prestadores e D terceiro: autorização, leitura de foto, isolamento dos dados, prestador suspenso, cobertura, incompatibilidade de serviços, reenvio e cancelamento.
5. Confirmar que nenhuma função gera paid, chat, cobrança, notificação externa ou despacho. Testar que orçamento vencido não pode ser aceito.
6. Registrar PASSOU / FALHOU / NÃO EXECUTADO por cenário, sem presumir êxito.

## Gate 3 — Migration remota (somente depois de backup e autorização)

Nunca executar diretamente o SQL em supabase/drafts no projeto hospedado. Reconciliar o candidato com as colunas e grants reais, gerar uma migration versionada com Supabase CLI atual (verificar --help e versão; CLI v3 alterou comportamentos), revisão em PR separado e rollback seguro. Testar em container com dados sintéticos primeiro.

Só aplicar a migration no **mesmo projeto** após evidência de recuperação e autorização operacional explícita. A tabela private.f2_release_gate deve continuar DESLIGADA e as flags de F1/F2 devem continuar false.

## Gate 4 — E2E HTTP real sem operações comerciais

Somente depois do isolamento comprovado, usar contas fictícias consentidas A/B/C/D e foto sintética. Criar ou reproduzir uma solicitação segura, gerar convites, confirmar recebimento pelo prestador, enviar propostas itemizadas, recusar ou escolher uma e comprovar que as demais não vencem. Verificar acesso negado a D e anon, foto acessível só aos participantes autorizados, endereço exato restrito antes do pagamento e estado final awaiting_payment **sem pagamento**.

A regra de 5 minutos é aplicada após confirmação autenticada de abertura do convite. Sem prova, não contar ausência. O timeout de uma proposta também é de 5 minutos. Os lembretes (2 min e 4 min 30 s) e notificações reais devem ser testados no dispositivo, não inferidos do simulador.

Não usar prestadores ou telefones reais. Se houver risco de disparo por trigger, webhook ou notificação, não criar pedidos no projeto hospedado. Preferir ambiente local isolado.

## Gate 5 — Operação, notificações e homologação

- O alerta atual é apenas **visível no app aberto, com vibração opt-in**; não comprova push em background nem entrega real.
- Implementar/validar entrega, reenvio, lembretes, perda de rede, bloqueio de solicitações e consentimento de notificações no dispositivo real.
- Dez ausências confirmadas em 30 dias significam revisão humana; não suspensão automática.
- Homologação administrativa de prestadores depende de documentação privada, revisão humana, trilha de auditoria e LGPD.
- Os raios 1/3/10 km são **exemplos locais**, não parâmetros definitivos aprovados.
- Testar cargas, resiliência, cotas, limpeza de fotos órfãs, reversão e suporte antes de um piloto assistido.

## Gate 6 — Decisão de liberação

Após concluir e comprovar todos os gates, pedir aprovação do responsável. A ordem correta de ativação, se autorizada, é gate do servidor e só então flags da interface em implantação controlada. F2 não pode liberar chat, rastreamento, repasses, cobranças ou despachos: essas funções dependem de F4/F5.

**Enquanto houver qualquer gate impeditivo, status: F2 IMPLEMENTADA EM BRANCH E HOMOLOGADA LOCALMENTE; NÃO LIBERADA.**

## Prompt resumido para o ChatGPT Work

Continue o Salva Motoca! no PR #42. Leia primeiro docs/F2_WORK_EXECUCAO.md e docs/F1_WORK_EXECUCAO.md. Use apenas o Supabase existente yivkqyjdeouxnwtwfekc. O backend SQL F2 é um draft que NÃO deve ser aplicado diretamente. Comprove backup e restauração antes de gravar dados, repita testes em container e execute somente cenários HTTP autenticados seguros e isolados. Não crie outro projeto, contrate serviços, ative F1/F2, envie push real, despache prestadores ou realize pagamentos. Faça correções em PRs isolados e apresente resultados comprovados por gate.
