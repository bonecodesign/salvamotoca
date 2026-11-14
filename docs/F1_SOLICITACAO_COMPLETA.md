# F1 — Solicitação completa | Salva Motoca!

**Estado em 14/11/2026:** PR #38 aberto como **Draft**, sem merge. A interface F1 permanece bloqueada na configuração da branch. Foi constatado por consulta somente de leitura que a migration F1 **já está aplicada no único Supabase**. O código da interface não foi publicado por este trabalho.

> Esta página registra o estado verificado, não autoriza migrações, publicação de pedidos, pagamentos, reboque ou despacho real. A procedência e a hora exata da aplicação remota não foram estabelecidas.

## O que já existe

- Formulário do motociclista com marca, modelo, ano, descrição, endereço de atendimento, **foto obrigatória** e seleção de múltiplos tipos de serviço.
- Revisão explícita dos dados antes de enviar. Foto original JPG/PNG/WebP de até 8 MB; o código do app propõe conversão para JPEG de até 5 MB e largura/altura máxima de 1600 px, removendo EXIF por redesenho em canvas.
- Caminho privado da foto no padrão `<customer_id>/<request_key>.jpg`, com URL assinada de validade de 60 segundos.
- Banco com campos próprios para veículo e serviços, `request_key` para evitar duplicação e validação de foto existente por trigger `SECURITY INVOKER`.
- Compatibilidade com o aplicativo antigo: ou todos os campos F1 estão nulos, ou todos são preenchidos.
- `reboque_moto` continua bloqueado no frontend e pelo CHECK do banco até a integração de F3.
- O fluxo não habilita pagamento, repasse, chat após pagamento, aceite de socorro ou despacho comercial.

## Infraestrutura — um único Supabase

A decisão é usar **somente** o projeto Supabase Salva Motoca, sem novo projeto/branch ou contratação de plano pago. O ensaio automatizado usa PostgreSQL 17 temporário no GitHub Actions.

### Verificação remota realizada em 14/11/2026

| Verificação somente de leitura | Resultado |
| --- | --- |
| Histórico de migração | `20261114020317_f1_solicitacao_dados_foto_privada` consta como aplicada |
| Cinco colunas F1 | Presentes e aceitam NULL para preservar clientes legados |
| CHECKs da F1 | Quatro regras encontradas, incluindo conjunto completo, serviços, veículo e caminho da foto |
| Trigger da foto | `sm_f1_photo_exists_on_insert` está habilitado |
| Bucket `request-photos` | **Privado**, JPEG, limite de 5 MB |
| Políticas do Storage | INSERT do autor; SELECT do autor ou prestador designado; DELETE de órfão do próprio autor |
| Privilégios das solicitações | `authenticated` não tem SELECT geral e não pode ler diretamente endereço detalhado nem latitude; `anon` não lê `photo_path` |
| Contagem observada | 0 solicitações totais, 0 pedidos F1, 0 fotos no bucket |
| Repositório | PR #38 segue Draft; configuração F1 da branch permanece `false` |

Estas verificações são de **esquema, privilégios e metadados**. Não provam que Auth, HTTP, upload, URL assinada ou regras de sessão funcionam com usuários reais.

A migration já aplicada **não deve ser reaplicada**, e seu arquivo histórico não deve ser reescrito para simular uma nova migração. Correções futuras de esquema precisam ser novas migrações versionadas, revisadas e aprovadas. O SQL de reversão em `supabase/rollback/f1_solicitacao_sem_dados.sql` contém travas de segurança e **não foi executado**.

## Testes automatizados

- **32 testes Node**: validações, fluxos simulados do app, upload, retry por foto, troca de sessão e GPS, cancelamento e bloqueio da flag.
- **5 testes em Chrome real**: prévia em desktop, largura móvel de 375 px, seleção de serviços, foto fictícia, bloqueio de reboque, validação de tipo, remoção de EXIF/GPS por processamento real e rejeição de JPEG corrompido, sem solicitações de rede.
- **PostgreSQL 17 descartável**: migration, RLS com perfis de teste, preservação de pedidos legados, rejeição de dados F1 parciais, visibilidade por usuário e reversão de esquema sem dados.
- **GitHub Actions:** jobs `validar-f1`, `navegador-f1` e `sql-isolado-f1` em CI para cada alteração; consultar a execução mais recente associada ao commit do PR #38.

Comandos locais de verificação:

```bash
node --test tests/request-f1.test.js tests/f1-app-flow.test.js tests/f1-preview.test.js tests/f1-release-guard.test.js
node --check live-app-current.js
node --check request-f1.js
```

O teste em navegador exige `playwright-core@1.56.1` e Chrome/Chromium instalado; o CI executa ambos, sem conexão com Supabase.

## Auditoria de segurança e limite dos alertas

O Supabase retornou seis avisos `authenticated_security_definer_function_executable`: `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence` e `bj_submit_quote`.

- As definições consultadas fazem checagens de `auth.uid()`, titularidade, prestador autorizado e/ou status; a função de endereço condiciona a leitura do prestador ao pagamento marcado `paid`.
- Os avisos exigem revisão contínua e testes adversariais. **Não são automaticamente prova de exposição**, e revogar EXECUTE indiscriminadamente interromperia fluxos necessários.
- Também foram encontrados quatro alertas informativos de tabelas com RLS habilitada sem políticas; a finalidade privada delas deve continuar preservada.
- Referências: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

A preparação da foto foi centralizada em `request-f1.js` (`preparePrivatePhoto`), usada pela interface do pedido e diretamente pelos testes do Chrome. O teste gera JPEG sintético com IFD de GPS e confirma que o JPG reprocessado não contém o marcador EXIF; o processamento real também rejeita arquivos corrompidos com MIME falsificado. Esse ensaio não substitui Android físico.

A flag `f1TestRequestsEnabled: false` **é uma trava do aplicativo, não uma garantia de bloqueio da API**. O bucket de fotos e a estrutura de banco já existem no projeto remoto: antes de promover o uso público, revisar limites de upload, proteção contra spam, orfandade e acesso via clientes diretos.

## Pendências objetivas para homologação

1. **Backup recuperável:** confirmar exportação segura da base e teste de restauração, guardados fora do repositório. O Supabase Free não inclui os backups diários dos planos pagos; um backup completo **ainda não foi comprovado**. Não guardar segredos, usuários ou dados pessoais no GitHub.
2. **E2E Auth + Storage reais:** somente após autorização do procedimento e com contas fictícias controladas, testar cliente A, prestador B designado, terceiro C e acesso anônimo. Testar upload de JPEG, visualização, URLs assinadas, revogação de acesso após troca do prestador, recuperação de rede e remoção de órfão.
3. **Fluxo completo no projeto único:** não criar pedidos reais por acidente. Antes de inserir pedidos de teste, isolar prestadores, notificações, orçamentos e eventual despacho; realizar limpeza auditável. O banco contém os campos, mas esta operação não foi executada.
4. **Dispositivos:** conferir em Android físico e desktop, incluindo cancelamento da revisão, permissões de câmera, tamanho/EXIF, perda de conexão, saída da conta, entrada em outra conta e duplicação após retry. O teste Chrome com viewport de celular **não equivale a Android físico**.
5. **Abusos/retensão:** política de prazo e limpeza de fotos órfãs via API Storage, cotas e limitação de taxa sem serviços pagos novos.
6. **Liberação deliberada:** só depois dos itens acima, revisar PR #38, decidir merge e autorizar a ativação da F1. Não liberar chat, pagamentos nem reboque como efeito colateral.

## Segurança operacional

- Não executar migração F1 novamente no banco, nem a reversão, sem revisar estado atual e eventual perda de dados.
- Não publicar configuração de chaves secretas nem credenciais de contas fictícias.
- Não criar outro Supabase nem contratar serviços.
- Não considerar o teste de fixtures PostgreSQL como prova de autorização real do Supabase Auth/Storage.
- A `main` e o PR continuam separados: a estrutura remota existir não significa que a nova interface esteja no ar.

## Procedimento operacional de homologação

O roteiro detalhado para **backup recuperável, ensaio real de Auth/Storage com contas de teste, acesso por perfis, limpeza via API, restrições de custo e Android físico** está em `docs/F1_HOMOLOGACAO_SUPABASE_UNICO.md`. Preparar esse procedimento não equivale a executá-lo. O acesso HTTP direto do ambiente de execução estava indisponível; apenas consultas de banco via conector, o CI do GitHub e testes Chrome locais foram executados.

## Endurecimento concluído no código da branch

- Ao alterar a conta autenticada, o cliente agora descarta **GPS**, foto assinada em memória, pedidos, cotações, prestador selecionado e chaves de upload pendentes. Callback de GPS atrasado é ignorado.
- Processos assíncronos de consulta e envio verificam a identidade antes de reutilizar dados ou gravar pedido; uma troca de conta durante upload impede o INSERT posterior.
- Na recuperação de erro de chave única (código `23505`), o pedido é localizado por `customer_id` + `photo_path`, sob RLS, em vez de filtrar por `request_key` (coluna **sem SELECT** para authenticated). Esse privilégio foi confirmado no Supabase existente por consulta somente de leitura. O teste de PostgreSQL isolado verifica a consulta autorizada.
- O CI contém um **guardião de liberação** que exige `f1TestRequestsEnabled: false`, a chave pública sem segredos e a manutenção da busca de pedidos por colunas autorizadas. Esse guardião terá de ser alterado intencionalmente quando a homologação real terminar.
- Os testes automatizados de sessão/duplicidade usam conta e GPS simulados; **não** equivalem a testes de usuário em Auth/Storage remoto.

### Riscos remanescentes de pré-lançamento

- **Sem controle de upload server-side específico de F1 além de permissões, tipo e tamanho do bucket.** A flag do navegador não impede diretamente um cliente autenticado de consumir cota Storage dentro de suas permissões. Planejar limitação por usuário, prazo de descarte de órfãos e métricas antes da abertura pública.
- Os links assinados já emitidos conservam validade por até 60 segundos; trocar o prestador impede novas autorizações, não invalida imediatamente links existentes.
- Enquanto houver apenas um Supabase, ensaios remotos que gravem dados dependem primeiro de backup recuperável e bloqueio comprovado contra notificações/despachos reais.
