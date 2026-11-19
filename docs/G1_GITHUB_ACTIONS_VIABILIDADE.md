# G1 — Verificação de viabilidade do GitHub Actions para backup Supabase

**Data da verificação:** 18/11/2026 (Brasil). **Projeto:** Salva Motoca!  
**Repositório:** `bonecodesign/salvamotoca` — público.  
**Supabase EXISTENTE:** `yivkqyjdeouxnwtwfekc` — ambiente de testes/homologação, não operação comercial.  
**Situação:** `G1=BLOCKED` até backup **verdadeiro** + restauração **verdadeira** verificados fora do ambiente hospedado. `RELEASE=NO_GO`.

## O que foi verificado diretamente no GitHub

1. Repositório público e `main` possui somente `.github/workflows/f1-tests.yml`; a branch base deste PR (#84) contém **15 workflows adicionais** em revisão empilhada, incluindo F2/F3/F4/F5/F6/F7. Não supor que workflows de Draft já estão na `main`.
2. GitHub Actions está executando jobs com sucesso. Exemplos: https://github.com/bonecodesign/salvamotoca/actions/runs/44432370522, https://github.com/bonecodesign/salvamotoca/actions/runs/44431197040. O PostgreSQL 17 já é exercitado em containers **descartáveis** nos testes offline.
3. **Preço:** os runners hospedados padrão são gratuitos para repositórios públicos. Isso não inclui ferramentas/serviços externos pagos nem implica segurança de armazenamento dos dados do backup. Não solicitar larger runners nem compras.
4. Não existe workflow de backup real do Supabase configurado no repositório. A integração GitHub disponível no ChatGPT pode ler e alterar arquivos e acompanhar jobs, porém **não permite inspecionar/definir Actions Secrets nem disparar qualquer workflow manualmente**. As configurações de secrets e o acesso a um destino privado precisam de verificação pelo proprietário no GitHub.
5. `workflow_dispatch` exige que o arquivo do workflow esteja inicialmente na branch padrão (`main`) para aparecer no botão **Run workflow**. Este PR fica em **Draft**; **não fazer merge automático**. Não há autorização de operação comercial, mas executar um backup não é ativar F1.

## Prova extra executável sem risco (este PR)

O workflow `.github/workflows/g1-backup-restore-offline.yml` roda apenas ao abrir/atualizar PR que altere **este arquivo ou este documento**. Não recebe secrets, não faz checkout de fontes não confiáveis, não estabelece conexão com Supabase e não exporta nenhum artefato.

- Inicia container PostgreSQL 17 efêmero no runner Linux;
- insere **duas linhas fictícias** sem identificação de pessoa;
- cria dump local com `pg_dump` do **container de testes**;
- confere integridade SHA-256;
- cria **outro banco local** no mesmo runner e executa `pg_restore`;
- valida que as duas linhas foram recuperadas e apaga os arquivos temporários;
- declara expressamente `G1_REAL_BACKUP_RESTORE=BLOCKED`.

**Atenção:** este teste só comprova a viabilidade do **runner e do cliente PostgreSQL**, não valida exportação, configuração Auth, objetos Storage nem recuperação dos registros reais do Supabase.

## Como fazer o backup **real** com Actions, sem expor dados

A Supabase fornece guia oficial para GitHub Actions: https://supabase.com/docs/guides/deployment/ci/backups . Esse guia apresenta exportação de roles/schema/data por CLI, com conexão em `SUPABASE_DB_URL`. **A própria Supabase avisa para nunca colocar dumps num repositório público**.

**Conectividade importante:** GitHub-hosted runner utiliza IPv4; o host direto `db.<ref>.supabase.co` pode estar em IPv6. Utilizar **Session Pooler** compatível com IPv4 (dados exatos do painel **Connect** do projeto) como URL de banco, armazenada em secret. Não contratar IPv4 add-on só para este backup. **Não confundir o project ref com URL de conexão de Postgres em GitHub Actions.**

Arquitetura mínima indicada para etapa posterior:
1. **Workflow dedicado** com apenas `workflow_dispatch` manual, sem `pull_request`, `push`, `schedule` ou execução de contribuições não revisadas. Definir `permissions: contents: read` e política de execução apenas de `main` revisada.
2. Criar ambiente `g1-backup-testes` com secrets **restritos a esse ambiente**, regras de branches aprovadas e revisão manual, quando disponível. Guardar apenas a **URL do Session Pooler** como `SUPABASE_DB_URL` e credenciais de escrita do **destino privado** se necessárias; confirmar o modelo de acesso no Github por conta própria. Evitar logar URLs e desativar shell verbose.
3. Confiar em ação de setup CLI revisada e versão fixa, e comandos `supabase db dump --remote="$SUPABASE_DB_URL"` para roles, schema, data e históricos necessários. **Não executar `supabase db reset --remote` ou `db push`**.
4. **Criptografar** localmente no runner **antes** de qualquer transmissão. Guardar arquivo criptografado em **destino privado e independente do GitHub público** (por exemplo, Dropbox do fundador, com conexão/API e escopo mínimo configurados). Validar integridade e acesso privado; apagar temporários antes do fim do job. Não enviar dumps como GitHub Artifacts (num repositório público eles podem ser acessíveis por leitores); não criar commits de backup.
5. Validar em **etapa isolada** restauração do DB lógico + Auth compatível em instância local Supabase apropriada; conferir contagens preservadas e estrutura. Os **objetos físicos de Storage** não estão incluídos no dump Postgres; exportar separadamente se houver. O backup criptografado precisa estar acessível após terminar o runner (os discos efêmeros são descartados).
6. **Só após toda a prova** marcar G1 aprovado. O projeto de testes continua de testes; nenhum despacho, pagamento, notificação ou operação comercial é autorizado.

### Pendências que impedem rodar backup real agora

- [ ] Verificar e configurar ambiente e secrets no GitHub via interface administrativa (a integração do ChatGPT não dá acesso a isso)
- [ ] Selecionar e configurar destino privado de backup, garantindo que nenhuma credencial/arquivo entra no repositório público
- [ ] Aprovar workflow dedicado de backup **após revisão de segurança** e colocá-lo na branch padrão para permitir execução manual
- [ ] Executar backup real pela conexão Session Pooler e registrar apenas logs **sem dados**
- [ ] Restaurar em ambiente local isolado e conferir DB + Auth + Storage físico quando aplicável
- [ ] Reclassificar o G1 somente após backup e restauração comprovados

## Referências oficiais

- GitHub Actions gratuitos em repositórios públicos: https://docs.github.com/en/actions/concepts/billing-and-usage
- Supabase CLI backup usando Actions e IPv4/Session Pooler: https://supabase.com/docs/guides/deployment/ci/backups
- Proteção de secrets e ambientes: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- Risco de divulgação de secrets em runners: https://docs.github.com/en/actions/concepts/security/compromised-runners
- Acesso a artifacts em repositórios públicos: https://docs.github.com/en/rest/actions/artifacts
- `workflow_dispatch` na `main`: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
