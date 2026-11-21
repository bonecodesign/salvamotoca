# Salva Motoca! — F5, execução pelo Work sem ativação

**Branch:** `feat/f5-atendimento-chat-deslocamento-offline` · base: `feat/f4-pagamentos-protegidos-simulador-seguro` (PR #45) · F4 alternativa paralela: PR #47.

## 0. Limites do trabalho

Não usar atendimento real, notificações externas, Google Maps, geolocalização do aparelho, cobrança, webhook PSP, conta conectada ou transferência. Não alterar Supabase hospedado, senhas, chaves, tokens ou status operacional. Não fazer merge antes de revisão da cadeia F2→F3→F4→F5. Manter flags de F1, F2, F3, F4 e F5 desligadas.

## 1. Revisão dos testes e da prévia

1. Inspecionar `f5-offline-flow.js`, `tests/f5-offline-flow.test.js`, `tests/f5-release-guard.test.js`, `docs/F5_PREVIEW.html` e o contrato F4.
2. Com Node 22: `node --check f5-offline-flow.js` e `node --test tests/f5-offline-flow.test.js tests/f5-release-guard.test.js`.
3. Executar regressões: `node --test tests/f4-finance.test.js tests/f4-release-guard.test.js tests/f4-mock-webhook.test.js tests/f3-tow.test.js tests/f2-flow.test.js` e guardas de F1–F3.
4. Abrir `docs/F5_PREVIEW.html` por servidor **local**, bloqueando conexões externas. Confirmar que não existe captura de localização, chamada de rede, integração de UI de produção, nem "pagamento verdadeiro".
5. Conferir execução da workflow F5 no GitHub Actions; guardar URLs do run, commit SHA e quantidade de testes. Se falhar, corrigir na branch e repetir; não afirmar aprovação sem o run.

## 2. Revisão de segurança e evolução posterior

1. Reconciliar documentação e implementação F4 no PR #45 e as decisões financeiras do PR #47. Não copiar indiscriminadamente estados e nem reescrever pagamentos.
2. Desenhar schema candidato F5 compatível com o Supabase real **sem aplicar migration**: sessão/ACL, chat, presença efêmera, eventos, suporte, RLS, owner, prestador vencedor, bloqueio após cancelamento e tolerância a concorrência.
3. Validar com PostgreSQL 17 descartável, A/B/C/D fictícios e políticas RLS negativas; nunca chamar RPC remota e jamais fingir que eventos mock provam PSP.
4. Testar ataques: chat antes de pagamento, cliente marcando pagamento/chegada, prestador não escolhido, sessão vencida, substituição de prestador, GPS atrasado, falso consentimento, URLs assinadas antigas, deduplicação e corrida de estado.
5. Projetar Realtime e notificações de chegada/novos chats somente como contrato documental. Evitar mensagens de teste que disparem push para pessoas.
6. Elaborar matriz para dispositivos Android (rede intermitente, GPS negado, app em background, bateria, reconexão, troca de contas).

## 3. Gates de liberação

- F1: backup/restauração real, Auth/Storage/RLS e Android homologados.
- F2/F3: PRs aprovados e integração controlada; capacidades do prestador e reboque verificadas.
- F4: PSP escolhido e conciliado, revisão jurídica/financeira, webhooks oficiais e reversão; pagamentos reais **ainda bloqueados**.
- F5: segurança RLS, autenticação, chat e GPS em sessão legítima, notificações, LGPD e teste humano.
- F6: entrega de resumo, confirmação dupla, confirmação do cliente em até 5 minutos, suporte e disputa.
- F7: operação assistida e autorização de lançamento.

**Registro correto:** teste de lógica local não equivale a homologação. Só marcar PASS com evidência correspondente; as fases remotas permanecem BLOCKED/NO-GO.
