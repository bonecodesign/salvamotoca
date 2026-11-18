# Salva Motoca! — G1: impressão digital do catálogo e comparação com restauração privada

**17/11/2026 (BRT) — somente preparação e auditoria estrutural de leitura.**  
**Repositório:** `bonecodesign/salvamotoca` · **Supabase ÚNICO:** `yivkqyjdeouxnwtwfekc` · **Status:** `G1=BLOCKED`, `RELEASE=NO_GO`.

## Verificação da origem feita de verdade

Em 17/11/2026 ~21:27 BRT, foi executada a consulta de leitura `docs/G1_CATALOG_FINGERPRINT_READONLY.sql` no banco hospedado existente, **sem UPDATE/INSERT/DELETE, migração ou criação de conta**. O banco respondeu com PostgreSQL 17, impressões digitais e contagens de catálogo:

| Componente do catálogo | Objetos encontrados |
|---|---:|
| Relations (tabelas e views) | 50 |
| Colunas | 460 |
| Políticas RLS | 20 |
| Funções | 36 |
| Restrições | 201 |
| Índices | 167 |
| Triggers não internos | 13 |
| Buckets | 1 |

Contagens agregadas naquele instante: **0** usuários Auth, **0** sessões Auth, **0** pedidos, **0** propostas, **0** pagamentos, **0** objetos Storage, **11** migrações registradas. Esses números são **referência histórica e não podem ser utilizados como baseline de backup futuro**. Não registrar senhas, nomes de objetos individuais, credenciais ou dados de usuários nos commits.

O advisor de segurança hospedado mostrou **6 RPCs `SECURITY DEFINER` executáveis por `authenticated`**, além de 4 tabelas com RLS sem políticas (aparentemente fechadas aos clientes). O aviso do advisor exige revisão posterior dos seis RPCs; **não foi revogado nenhum direito**, pois mudanças reais requerem autorização, G1 e plano de rollback. A ausência de policies não é prova suficiente de que o conjunto de operações internas está correto.

## Artefatos novos desta etapa

- `docs/G1_CATALOG_FINGERPRINT_READONLY.sql`: **consulta somente leitura** sobre relações, colunas, índices, funções, triggers, políticas, constraints, acl e configuração de buckets. Calcula um digest MD5 por categoria, digest geral e oito contagens. **O MD5 é exclusivamente detector determinístico de divergência, não prova criptográfica de origem e nem substitui SHA-256 dos arquivos exportados.**
- `scripts/g1-catalog-fingerprint-compare.mjs`: `--plan` sem arquivo/rede. Em `--compare --source /caminho-privado/origem.json --restore /caminho-privado/restaurado.json`, compara digests, quantidade de objetos, PostgreSQL 17, projeto autorizado, oito contagens, datas recentes e **data do restore posterior à origem**. Recusa symlinks, mesmo arquivo, caminhos fora do formato e qualquer evidência dentro do checkout Git.
- `tests/g1-catalog-fingerprint-compare.test.mjs`: amostras totalmente inventadas para provar falha se algum componente ou contagem divergir, snapshots antigos, caminho inseguro, outro projeto ou PostgreSQL 16; até digests idênticos resultam obrigatoriamente em `REVIEW_REQUIRED_NO_GO`.
- `.github/workflows/g1-catalog-compare-offline.yml`: executa todos esses testes sem conectar a rede do Supabase, com flags F1–F7 mantidas em modo seguro.

## Procedimento de execução privada quando houver acesso à pasta autorizada

O usuário indicou uma pasta Windows **somente para testes temporários**. **Esta conversa não obteve acesso técnico ao diretório local**; nenhum arquivo foi criado, movido ou removido nele.

Quando houver uma execução local efetivamente conectada ao dispositivo, **não alterar arquivos pré-existentes**. Criar uma única subpasta temporária claramente identificada dentro da pasta autorizada, registrar tudo criado, usar bancos descartáveis sem port-forward e remover **apenas arquivos e diretórios gerados na execução** depois de coletar evidências adequadas. Não limpar artefatos desconhecidos ou pertencentes ao usuário.

**Separação crítica de provas:** se a pasta autorizada for também um checkout Git, **não armazenar dentro dela dumps reais, arquivos Auth, bytes de Storage ou credenciais**, nem fazer upload à CI. Essas provas devem ficar em local criptografado e privado a ser aprovado separadamente; o comparador aceita JSONs privados apenas fora do repositório. Nunca embutir tokens/URLs de conexão em linha de comando compartilhada ou histórico.

### Disponível agora (apenas planejamento)

```powershell
node scripts/g1-catalog-fingerprint-compare.mjs --plan
```

### Futuro — somente após backup real + restore isolado

1. Confirmar documentação e versão atual de backup/restore do Supabase CLI, sem presumir que metadados SQL recuperam bytes de Storage. **Não criar projeto Supabase novo**.
2. Fazer o backup **autêntico** do PostgreSQL/Auth do projeto único, com canal e credenciais privados autorizados, e salvar cópias criptografadas fora do GitHub.
3. Executar `G1_CATALOG_FINGERPRINT_READONLY.sql` **na origem no mesmo intervalo da exportação**, guardando a saída JSON privada; não usar a fotografia histórica acima.
4. Restaurar em PostgreSQL 17 verdadeiramente local, sem túnel ou proxy para produção, sem efeitos externos e sem ativar integrações.
5. Executar a mesma consulta no banco restaurado e comparar os dois arquivos privados:
   ```powershell
   node scripts/g1-catalog-fingerprint-compare.mjs --compare --source "CAMINHO_PRIVADO_ORIGEM.json" --restore "CAMINHO_PRIVADO_RESTORE.json"
   ```
6. Rodar também `scripts/f1-local-restore-audit.mjs` do PR #58 contra a base local descartável e `scripts/f1-private-backup-manifest-check.mjs` do PR #53/58 contra arquivos privados com SHA-256, **sem subir cópias para GitHub/ChatGPT**.
7. **Auth recuperável:** validar estruturas, configurações, chaves/segredos e processo de recuperação de logins em ambiente autorizado, sem provocar e-mails, SMS ou efeitos de produção. `auth.users` restaurado sozinho não valida login.
8. **Storage recuperável:** inventário de metadados e **bytes** de todos os objetos do bucket, com SHA-256 individual e testes de recuperação; um backup só de PostgreSQL **não recupera os arquivos externos**. Mesmo quando há zero objetos, documentar conferência do bucket, políticas e procedimento de restauração de um objeto sintético em ambiente isolado.
9. Auditoria humana independente, escopo e cadeia de custódia, revisão de riscos e decisão formal sobre G1-E01…E08; se faltar um item, `G1=BLOCKED`.

## O que este PR NÃO comprova

- **Nenhum backup real foi extraído**, restaurado ou autenticado; nenhuma operação de restauração real executada.
- A inspeção `SELECT` e o hash não provam que Auth poderá voltar a autenticar, que Storage contém arquivos recuperáveis ou que um serviço reconstruído funcionará.
- Os testes CI usam somente JSONs inventados. Mesmo quando reportarem `structure_match=true`, o resultado deve permanecer `REVIEW_REQUIRED_NO_GO`.
- Não existe autorização para executar F1 real, criar contas, enviar SMS/push, despachar motoboy, ativar PSP, fazer merge ou atualizar o banco hospedado.

**Próxima ação humana necessária:** execução e auditoria de backup/restauração genuínos em local privado com acesso autorizado, antes de qualquer homologação A/B/C do PR #68.

**G1=BLOCKED · F1–F7=NO_GO.**
