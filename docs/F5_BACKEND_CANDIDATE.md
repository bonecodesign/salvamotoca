# F5 — backend RLS MOCK para revisao e CI (NAO implantar)

**Data:** 15/11/2026. **Branch:** `feat/f5-backend-rls-mock-candidate`, baseada no PR #48 (F5, que depende de F4 #45 → F3 #44 → F2 #42). **Estado de liberacao: NO-GO**.

## Entrega desta rodada

- `supabase/drafts/f5_backend_rls_mock_candidate.sql` — schema candidato **somente para PostgreSQL 17 descartavel**, sem migracao versionada e sem conexao ao Supabase hospedado. Adiciona:
  - `private.f5_mock_release_gate`: unica chave `enabled=false` por padrao; nenhum grant a clientes;
  - `private.f5_mock_enabled()`: helper limitado a usuarios autenticados com contexto `app.f5_test_only=local_fixture` E gate habilitado por administrador do container; nunca trate como mecanismo real de autorizacao financeira;
  - `public.f5_mock_sessions`: associa cliente, prestador homologado, pedido, proposta aceita e recibo explicitamente ficticio. O pedido operacional permanece `awaiting_payment`, nunca `paid`;
  - `public.f5_mock_messages`: mensagens de teste limitadas a 2000 caracteres, autor e etapa validados em trigger; usuario nao pode gravar diretamente;
  - `public.f5_mock_latest_location`: somente ultima posicao; leitura curta (<= 120s) somente durante `en_route` com consentimento e prestador ativo.
- `tests/f5-backend-rls-mock.sql`: testes de A/B/C (clientes distintos, prestador escolhido, invasor), gate desligado, contexto ausente, sem privilegio de escrita, GPS antigo, chegada, prestador suspenso e rollback transacional. Fixtures voltam a zero.
- `.github/workflows/f5-backend-rls-mock.yml`: banco PostgreSQL 17 descartavel, testes SQL + regressao Node da F5. Nao usa credenciais, rede ou infraestrutura do Supabase existente.

## Limites deliberados

**NADA disso e backend de producao.** Nao ha servico PSP, recibo assinado, saldo, repasse, geolocalizacao real, notificador, mapa, retencao de conversas, RPC operacional ou fila de atendimento. O recibo `F5_LOCAL_FIXTURE_NOT_PSP` nao e prova de pagamento. O teste de roles nao prova Auth de usuarios reais nem Storage/Reatime remoto. O contexto por GUC existe exclusivamente para testes e jamais substitui checagem do PSP. RLS de producao requer modelo redesenhado, revisao de security definer e testes de ponta a ponta.

A fixture minima de F2 usada neste CI nao corresponde ao esquema completo hospedado (pode ter divergencias). Qualquer migracao futura precisa ser criada pelo Supabase CLI apropriado, apos verificar a versao, reconciliar estrutura, analisar seguranca e fazer backup com restauracao real. A F1 continua bloqueada para a homologacao real.

## Evidencias e roteiro

1. Conferir CI no commit do PR, inclusive falhas reais; marcar PASS apenas depois de ver log verde.
2. Se SQL falhar, corrigir no ramo isolado e repetir, sem executar no Supabase remoto.
3. Reconciliar #45 e #47 antes de transformar qualquer mock em estado financeiro.
4. Desenhar e revisar RBAC/RLS **de producao** com conta cliente, prestador escolhido, outros prestadores, suporte e anon; revogacao imediata por cancelamento/suspensao, erros concorrentes, expiracao da sessao e troca de conta.
5. Revisar termos LGPD e retenção de conversa/posicao e notificacoes. Realizar E2E em Android e com Supabase hospedado somente depois de gates e autorizacao.

**Nao realizar merge automatico, ligar flags ou publicar o aplicativo.**
