# Salva Motoca! — G1: handoff consolidado após PRs #115 e #116

**Atualizado em:** 22/11/2026 (horário de Brasília). **G1=BLOCKED; RELEASE=NO_GO.**  
**Repositório:** `bonecodesign/salvamotoca` — público, branch `main`.  
**Supabase permitido:** `yivkqyjdeouxnwtwfekc`, projeto existente de **TESTES**, região sa-east-1, PostgreSQL 17.  
**Sem produção, sem novos custos, sem dados pessoais em GitHub e sem alterações SQL de escrita no hospedado.**

## Estado comprovado — consultar antes de trabalhar

1. **Autenticação PostgreSQL corrigida para execução de exportação:** o run manual [#45074685352](https://github.com/bonecodesign/salvamotoca/actions/runs/45074685352) registrou `G1_DB_CONNECTION_AUTHENTICATED=PASS`, `G1_STORAGE_OBJECTS_EMPTY=PASS` e resposta de envio cifrado ao Dropbox com tamanho/content_hash válidos. Isso **não prova** que o arquivo persistiu no cofre auditado.
2. **Divergência do destino:** a listagem completa e recente via conector Dropbox da pasta `/Apps/Salva Motoca/backup-testes` continha somente o arquivo de identidade privada age `SalvaMotoca-G1-age-private-key-2026-11-21.txt` (187 bytes); **nenhum** `SalvaMotoca-Supabase-TESTES-*.tar.gz.age`. O arquivo da chave **não** foi lido, baixado, removido, movido ou compartilhado nesta investigação. A identidade do token Dropbox **do GitHub Actions** não foi comprovada como sendo a mesma conta/pasta do conector.
3. **Correções de segurança integradas à main:**
   - [#110](https://github.com/bonecodesign/salvamotoca/pull/110), [#111](https://github.com/bonecodesign/salvamotoca/pull/111): autorização manual imutável via job `guard`; não depender de variável administrativa mutável;
   - [#114](https://github.com/bonecodesign/salvamotoca/pull/114): preflight `files/get_metadata` com o token privado do runner, compara hash do identificador do cofre esperado e falha fechado **antes de consultar o banco**;
   - [#115](https://github.com/bonecodesign/salvamotoca/pull/115): ensaio PostgreSQL 17 real **com dados fictícios** para FK, trigger, RLS, ACL, criptografia `age` e recuperação, e 11 testes da auditoria offline de seis RPCs. [CI #45094263841](https://github.com/bonecodesign/salvamotoca/actions/runs/45094263841) `SUCCESS`;
   - [#116](https://github.com/bonecodesign/salvamotoca/pull/116): guarda de escopo Auth/Storage (contagem de users/identities/sessions/refresh/mfa/flow, objetos, bucket e SHA-256 das policies) antes/depois do dump. Recusa mudanças e pacotes cifrados com inventário gerenciado ausente/forjado. Testes adversariais preservam guards de Dropbox/autorização. [CI #45094678247](https://github.com/bonecodesign/salvamotoca/actions/runs/45094678247) `SUCCESS` após atualizar fixture antiga ao novo manifesto.
4. **Leitura real mais recente via Supabase SELECT:** Auth: users/identities/sessions/refresh_tokens/mfa_factors/flow_state = 0; Storage objects=0, buckets=1, policies `storage.objects`=3 e hash `c75f54c93a080d4552558ce59539c2e8813a645b5dfdfe44ebd328839aad2254`; bucket `request-photos` privado, JPEG, 5 MiB. Essa fotografia é estrutural, não é prova de recuperação.
5. **PR #108 continua Draft desatualizado** com conflitos após as integrações recentes. A maior parte dos testes/guards foi transportada por #115/#116 **sem substituir** os controles atuais. [PR #108](https://github.com/bonecodesign/salvamotoca/pull/108) **não deve ser mesclado diretamente**. Há documentos históricos nesse ramo; reutilizar apenas depois de comparação com a `main`.

## Limitações técnicas não resolvidas

- A autenticação do PostgreSQL e a resposta de upload de arquivo cifrado **não são** evidência de persistência no cofre esperado, muito menos de restauração.
- O backup lógico SQL **não reconstitui** serviço Auth, configuração externa de Auth, bytes físicos do Storage, secrets, instalações de Edge Functions ou fornecedores externos. O novo guard aborta quando o escopo gerenciado atual diverge do recorte SQL conhecido. Um bucket sem objetos não prova restauração de objetos.
- Cinco dumps separados podem sofrer deriva de conteúdo mesmo se as contagens permanecerem iguais: **não há snapshot transacional único comprovado**. Impedir modificações no ambiente de homologação durante a exportação e comparar conteúdos/restauração em ambiente isolado.
- As seis RPCs `SECURITY DEFINER` executáveis por `authenticated` e quatro tabelas `public` sem policies requerem análise funcional de autorização A/B/C sem dados reais. Contagem de policies ou referência estática a `auth.uid()` não prova isolamento.

## Próxima sequência segura e pendências exclusivamente humanas

1. **Chave privada age:** o responsável deve baixar e conferir uma cópia local protegida, fora de pastas sincronizadas e fora do GitHub. Preservar o original até validar a cópia. Nunca colar a chave ou seu conteúdo em chat, issue, commit, runner ou artifact. Não mover nem excluir a única cópia identificada automaticamente.
2. **Token Dropbox de Actions:** conferir diretamente, sem expor o token, se tem `files.metadata.read` e `files.content.write` e se aponta para o mesmo **App Folder** inspecionado. O conector Dropbox do ChatGPT e o token do GitHub são contextos diferentes.
3. **Somente após 1 e 2**, disparar de forma explicitamente autorizada o `workflow_dispatch` manual em `main` com a confirmação própria. A execução deve passar pelo preflight de identificação, pelas travas Auth/Storage, exportar apenas a base de testes e enviar **somente** o `.age`.
4. Confirmar o arquivo cifrado **por leitura independente no destino privado**, sem publicar o arquivo, manifesto, secret ou chave. Conferir tamanho, hash e projeto.
5. Restaurar em PostgreSQL 17 **local/isolado e descartável**, sem links de pagamento, despacho, notificações ou credenciais reais, comprovando dados, migrações, RLS, ACL, funções, FKs, triggers e os limites dos serviços gerenciados.
6. Registrar evidências G1-E01...G1-E08 como `PASS`, `FAIL` ou `BLOCKED`, com horários/URLs seguros. **Não transformar CI fictícia em aprovação de recuperação real.**

## O que pode ser feito autonomamente enquanto as pendências persistirem

- Auditar código `main`/PRs, CI, documentação e somente metadados Supabase/Dropbox.
- Criar correções e testes exclusivamente offline em branches e PRs revisáveis.
- Não fazer DDL/DML em Supabase, não alterar Auth/Storage, não disparar backup real ou uploads privados, não tocar na chave, não contratar serviços, não ativar operações comerciais.
- Manter `G1=BLOCKED` e `RELEASE=NO_GO` até haver restauração **real** comprovada e avaliação dos demais gates.
