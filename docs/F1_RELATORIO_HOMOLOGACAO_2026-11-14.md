# Relatório de homologação técnica da F1 — 14/11/2026

**Aplicativo:** Salva Motoca!  
**Referência:** PR #38 integrado na `main` (commit `65c58ae0da49662ef4d99f1c3b97f0642491499c`).  
**Projeto:** único Supabase `yivkqyjdeouxnwtwfekc`, plano Free, região `sa-east-1`.  
**Classificação:** **HOMOLOGAÇÃO TÉCNICA PARCIAL — LIBERAÇÃO PÚBLICA BLOQUEADA**.

Este documento reúne evidências efetivamente obtidas. Consultas do banco foram **somente leitura**; não foram criados usuários, pedidos ou arquivos de teste no projeto hospedado. Não foi feito restore nem backup comprovadamente recuperável.

## 1. O que foi verificado na versão integrada

- [x] PR #38 fechado e integrado na `main`; módulo `request-f1.js`, workflow e arquivos de testes presentes.
- [x] `config.js` na `main` mantém `f1TestRequestsEnabled: false`. A interface de envio F1 segue bloqueada.
- [x] Workflow de teste executado com sucesso na revisão do PR #38: Node, Chrome com viewport móvel e PostgreSQL 17 descartável.
- [x] CI da F1 reforçado no PR #39 para testar **também a `main`** em mudanças relevantes, incluindo `config.js` no filtro de PR. Execução efetiva na `main` deve ser conferida após integrar o PR #39; a criação deste relatório não comprova essa execução.
- [x] Projeto Supabase `ACTIVE_HEALTHY`, PostgreSQL 17.11, migration `20261114020317_f1_solicitacao_dados_foto_privada` registrada.
- [x] Campos, quatro CHECKs F1 e políticas RLS presentes; o bucket `request-photos` é **privado**, limitado a **5 MiB**, MIME `image/jpeg`.
- [x] À data da consulta: **0 usuários Auth**, **0 pedidos**, **0 pedidos com foto F1**, **0 objetos** no bucket.
- [x] Usuário `anon` **não possui** SELECT em `public.service_requests` nem EXECUTE em nenhuma das seis RPCs `bj_*` privilegiadas verificadas. RLS está ativada em `storage.objects` e `service_requests`.
- [x] Usuário `authenticated` não tem SELECT irrestrito de `service_requests`, nem leitura direta de `request_key`, `address_details` ou `latitude`. SELECT da coluna `photo_path` depende de RLS por participante.
- [x] O Supabase Health Advisor retornou **0 alertas** nesta consulta.

## 2. Segurança — ressalvas

- O Security Advisor sinaliza **6 funções SECURITY DEFINER executáveis por usuários autenticados**: `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence`, `bj_submit_quote`. O privilégio `anon` está revogado nessas seis funções, mas é necessário teste adversarial HTTP **autenticado** antes da liberação.
- O Security Advisor sinaliza 4 tabelas com RLS e sem política (INFO). A ausência de política pode ser intencional para tabelas internas; não conceder acesso automaticamente.
- O bucket concede SELECT em metadados da tabela `storage.objects` ao papel `anon` por grants de plataforma, **mas não há política RLS anônima para o bucket privado**. Portanto, não concluir exposição com base apenas em grant.
- Os testes de segurança em PostgreSQL descartável não substituem o caminho completo Auth/REST/Storage real.
- Uma URL assinada válida continua acessível até vencer (uso atual previsto até 60 s), mesmo que a autorização futura seja retirada.
- A flag desativada no frontend é proteção de liberação, **não um bloqueio de API**. Há risco de uploads autenticados excessivos antes de haver cota e expiração de órfãos.

## 3. Pendências impeditivas da homologação completa

- [ ] **Backup restaurável do projeto existente** com escopo verificado, execução privada e teste de restauração. Exportação de dados Postgres não equivale a backup de bytes do Storage. Nenhum dump nem restauração foram verificados nesta rodada.
- [ ] **E2E remoto Auth + Storage** com contas fictícias legítimas A/B/C: upload do próprio namespace, negar leitura ao terceiro, permitir leitura ao prestador designado, negar download não autenticado, signed URL, recuperação após perda de rede, limpeza segura por Storage API.
- [ ] **E2E de pedido no Supabase**: só após backup e isolamento de qualquer automação de notificações ou despacho; não criar atendimento comercial real.
- [ ] **Teste em Android físico**, câmera/galeria, logout, GPS, perda de rede e retries.
- [ ] **Políticas operacionais de limites, antifraude, limpeza de imagens órfãs e revisão adversarial das RPCs privilegiadas**.
- [ ] Revisão deliberada da flag, checklist de publicação e validação humana antes de ativar o envio F1.

### Acesso e segurança operacional

Os conectores administrativos disponíveis permitem SQL e leitura de metadados, mas não disponibilizam uma sessão HTTP legítima de usuário fictício nem um navegador Android físico. Uma tentativa de acesso HTTPS direto ao endpoint do projeto, a partir do ambiente de execução, falhou por **DNS indisponível**. Por isso, **não** houve teste real da API Auth/Storage, nem deve ser registrado como aprovado.

O banco está vazio, mas a simples ausência de dados **não equivale a comprovar backup restaurável**. Não criar usuários de teste ou efetuar upload no projeto hospedado antes da preparação de recuperação e das garantias contra acionamento real.

## 4. Gate de liberação

**Decisão:** manter `f1TestRequestsEnabled=false` e status **NÃO LIBERADO** até preencher todos os itens bloqueadores. O código F1 pode permanecer integrado à `main` e receber correções/tests sem iniciar serviços reais.

**Links de evidência:**
- PR #38 (merge F1): https://github.com/bonecodesign/salvamotoca/pull/38
- Último workflow antes do merge F1: https://github.com/bonecodesign/salvamotoca/actions/runs/43636960110
- PR #39 (CI na main): https://github.com/bonecodesign/salvamotoca/pull/39
- Roteiro de execução completa: `docs/F1_HOMOLOGACAO_SUPABASE_UNICO.md`.

O status de CI da `main` após a alteração do workflow é evidência separada; preencher apenas após uma execução real.
