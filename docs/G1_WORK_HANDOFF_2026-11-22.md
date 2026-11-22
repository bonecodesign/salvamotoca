# Salva Motoca! — entrega operacional G1 ao ChatGPT Work

**Atualizado em:** 22/11/2026 (America/Sao_Paulo).  
**Escopo:** preparação de recuperação integral e auditoria, sem lançamento.  
**Repositório:** `bonecodesign/salvamotoca` (PÚBLICO) · `main` protegida por revisão.  
**Único Supabase autorizado:** `yivkqyjdeouxnwtwfekc`, TESTES, sa-east-1, PostgreSQL 17.11.  
**PR de continuidade:** [#108](https://github.com/bonecodesign/salvamotoca/pull/108) (Draft, **não mesclado**).  
**Última CI conhecida:** [#44979545525](https://github.com/bonecodesign/salvamotoca/actions/runs/44979545525) — **SUCCESS** no commit `37c74f6406d2084e1a7c2b45aa576963c2250535`. Conferir head e CI novamente antes de agir.  
**Decisão obrigatória até existir prova real:** `G1=BLOCKED`; `RELEASE=NO_GO`.

## Ordem de leitura / deduplicação

1. Leia **este handoff** e o estado atual da `main`, do PR #108, dos comentários e dos GitHub Actions. Verifique diffs e eventuais mudanças posteriores, inclusive trabalhos já feitos por outras conversas/Work.
2. Consulte os documentos já existentes, sem recriar tarefas resolvidas:
   - `docs/G1_AUTH_FAILURE_DIAGNOSTICO_2026-11-21.md`: último login remoto e correção administrativa sem publicar senha;
   - `docs/G1_BACKUP_ACTIONS_MANUAL_PREPARACAO.md`: workflow manual e requisitos de proteção/Dropbox;
   - `docs/G1_AUTH_STORAGE_SAFE_SCOPE_2026-11-21.md` **na branch do PR #108**: proteção de Auth/Storage e hash das policies;
   - `docs/G1_INTEGRAL_AUDITORIA_RESTAURACAO_2026-11-21.md` **na branch do PR #108**: matriz relacional, seis RPCs;
   - `docs/G1_PRIVATE_EXECUTION_PACKET.md`: evidências G1-E01 a G1-E08, modo de recuperação privada;
   - `docs/F1_WORK_EXECUCAO.md`: sequência F1 posterior, **não antecipar escrita real**.
3. Não repetir PRs já integrados #91, #100–#107. O [PR #69](https://github.com/bonecodesign/salvamotoca/pull/69) contém comparador histórico de fingerprints do catálogo num ramo antigo empilhado: examinar antes de qualquer reuso/merge, **não duplicar nem mesclar automaticamente**.
4. As mudanças do #108 já cobrem: restauração PostgreSQL17 fictícia, FK, triggers, RLS, ACL, RPCs, Auth/Storage vazios e bloqueio por alterações no **SHA-256 das políticas Storage** sem mudar a quantidade. A CI acima passou; isso **não** significa restauração real nem teste funcional de contas.

## O bloqueio principal, na ordem certa

**A. Credencial PostgreSQL do GitHub Environment `g1-backup-testes`**  
- Última tentativa real **somente leitura**: [run #44964994102](https://github.com/bonecodesign/salvamotoca/actions/runs/44964994102) → `FAIL:PASSWORD_REJECTED`. Nenhum backup ou upload feito.
- O conector Supabase funciona, mas **não valida a senha do Secret no GitHub Actions**. Não repetir diagnóstico com o mesmo valor e não reiniciar banco/trocar senha às cegas.
- Work: usar interfaces autenticadas, se estiverem disponíveis, para verificar **sem revelar** o endpoint de Session Pooler indicado em Supabase > Connect; conferir projeto, usuário `postgres.yivkqyjdeouxnwtwfekc`, porta `5432`, banco `postgres`, TLS e percent-encoding da senha. Acesso a secrets pode exigir atualização **manual pelo responsável** em GitHub > Settings > Environments > `g1-backup-testes` > `G1_SUPABASE_DB_URL`. **Nunca solicitar a senha no chat ou registrá-la em GitHub/relatórios.**
- Se a atualização segura não for possível com as permissões reais, marcar `BLOCKED_BY_ADMIN_SECRET` e prosseguir **apenas com tarefas offline/read-only**. Não criar gatilho `push` temporário para contornar `workflow_dispatch`.
- Após comprovação de atualização do Secret, executar **no máximo uma** tentativa manual do diagnóstico de autenticação com `SELECT 1` em `main`, sem backup, uploads, dump ou alterações. Se falhar, parar e registrar somente categoria de erro.

**B. Backup privado real somente após A=PASS e preflight**  
- Revalidar com as docs atuais Supabase CLI, o workflow `.github/workflows/g1-supabase-backup-manual.yml` e o exportador `scripts/g1-actions-backup-real.sh`, se integrados à `main`. O fluxo ainda requer `workflow_dispatch`, variável `G1_BACKUP_ENABLED`, `G1_AGE_RECIPIENT` (somente chave pública), token privado de Dropbox, permissões do Environment e confirmação humana.
- Checar que o destino permanece **privado** em Dropbox App Folder `/backup-testes`, que só o arquivo **age cifrado** pode sair do runner, e que o escopo Auth/Storage é explicitamente bloqueado quando não recuperável. Nunca exportar dumps, senhas, identities, chaves privadas ou artefatos para o GitHub público, comentários, logs ou este chat.
- Confirmar capacidade/quota **sem contratar serviços**. Se Auth/Storage tiverem registros/objetos ou políticas divergirem, a rotina atual deve **falhar fechado**; não desabilitar a proteção apenas para concluir backup. Capturas com contagens iguais ainda não garantem snapshot transacional.
- Não modificar o projeto hospedado para fazer caber no backup. Não mesclar o PR #108 nem executar fluxo real sem revisão dos gates aplicáveis.

**C. Restauração e prova efetiva (não substituíveis por mocks)**  
- Só aceitar cópia privada comprovadamente oriunda do projeto certo, verificações SHA-256, desconexão de pagamentos/despachos, restauração em PostgreSQL17 **local/isolado e descartável**, comparação do catálogo/funções/RLS/ACL/FKs/triggers e inventários do momento da exportação.
- Separar prova de recuperação do banco SQL de prova de **serviço Auth**, **políticas e configuração de Storage**, **bytes físicos de Storage**, secrets/configuração externa e Edge Functions. Se o bucket estiver vazio, demonstrar o estado vazio na origem e documentar que o procedimento **não foi testado com objetos reais**.
- Registrar cada evidência G1-E01 a G1-E08 como `PASS`, `FAIL` ou `BLOCKED`, com hora UTC, ação efetivamente executada e links para evidência não sensível. NÃO alterar status para GO por um resultado de CI sintético.

## Segurança funcional pendente (pode preparar offline já)

As seis RPCs `SECURITY DEFINER` de `public` executáveis por `authenticated` são `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence`, `bj_submit_quote`. Há quatro tabelas `public` com RLS ativa e sem policy (podem ser bloqueios deliberados); revisar comportamento antes de alterar grants. Executar testes de autorização A/B/C **somente em fixture isolada enquanto G1 estiver bloqueado**, nunca pedidos/IDs/usuários reais. O acesso à localização do motociclista **antes de pagamento** é área crítica; preservar sigilo e jornadas já definidas.

## O que Work pode avançar agora (sem depender de credenciais)

- Conferir status e segurança de PRs/CI/documentos existentes, corrigir apenas lacunas demonstráveis em branch Draft; tests offline sem secrets e README de evidências.
- Comparar ferramentas e limitações oficiais de recuperação Supabase/Dropbox/Actions, sem custos novos.
- Preparar checklist e teste adversarial de recuperação de catálogo/RLS/ACL e Auth/Storage, **não duplicando** ferramentas do #69 e #108.
- Auditar permissões/fluxos via SELECT e fontes documentadas; **não executar DDL/DML**, não alterar Auth/Storage, não criar usuários, não disparar pagamentos, notificações, logística ou operações comerciais.
- Produzir relatório de evidência atualizado no GitHub, com bloqueios que dependem de administração humana; manter `G1=BLOCKED` e `RELEASE=NO_GO`.

## Restrições incontornáveis e critério de encerramento

**Sem novos custos, planos pagos, projeto Supabase adicional, ambientes pagos, pagamentos, PSP, entregas, lançamento, flag F1, deploy comercial, merge automático, SQL de escrita no hospedado ou credenciais no texto.** Não alterar repositório ou Supabase do FraldaCycle.

Ao terminar, Work deve informar **(1)** o que verificou e o que efetivamente executou, **(2)** URLs de PR e CI, **(3)** qual bloqueio permaneceu, **(4)** tarefas exatas de administração humana, se houver, e **(5)** status G1/RELEASE sem confundir preparação com recuperação real.
