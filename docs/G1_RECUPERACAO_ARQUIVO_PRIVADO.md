# Salva Motoca! — G1: conferir pacote de backup PRIVADO sem restaurar

**Estado em 19/11/2026:** verificador de integridade preparado e testado **somente com dados sintéticos**. O backup real do Supabase `yivkqyjdeouxnwtwfekc` **NÃO FOI CRIADO**. O Supabase existente continua sendo exclusivamente o ambiente de **testes/homologação**. `G1=BLOCKED; RELEASE=NO_GO`.

## Para que serve

O novo programa `scripts/g1-verify-encrypted-bundle.py` confere, **sem rede e sem extrair SQL individual para pastas**, a estrutura de um backup `.tar.gz.age` criado pelo candidato do PR #86.

- **Exige** uma chave de identidade age mantida privadamente pelo fundador; não usa tokens Dropbox nem conexão com Supabase.
- Descriptografa com `age` em diretório temporário local de trabalho, que é apagado ao encerrar. Essa remoção **não equivale a apagamento físico seguro** dos blocos SSD; executar apenas em dispositivo confiável com criptografia de disco, sem sincronização automática da pasta temporária.
- Rejeita links simbólicos, tipos não-regulares, caminhos inesperados, travessia de diretórios (`../`), membros duplicados, faltantes, volumes excessivos e metadados fora dos limites. **Nunca utiliza `tar.extract` para escrever os arquivos SQL em disco.**
- Confere o `manifest.sha256` contra **6 arquivos internos**: roles, schema, dados, schema/histórico de migrações e inventário inicial. O manifesto e seus valores não devem ser copiados para repositório público.
- Confirma a referência exata do projeto, classificação `TESTES`, tipo de exportação, escopo declarado, os 8 contadores do inventário e `storage.objects=0`; identifica comandos **`COPY public.<tabela>` genuínos** para as 3 tabelas de prospecção/configuração essenciais.
- Encerra **sem imprimir dados pessoais**, dumps, credenciais ou conteúdo de tabelas; a saída pública limita-se a PASS/REJECT e `G1=BLOCKED`.

**Não é recuperação completa:** este script confere a **integridade** do arquivo criptografado, não prova que o SQL seja aplicável a uma instância Supabase, nem restaura DB/Auth/RLS/Storage. Um SQL pode passar nas verificações e ainda falhar no `psql` por dependências de extensões ou versões.

## Execução privada futura

Usar máquina confiável ou ambiente privado isolado, com Python 3 e `age` instalados, fora do GitHub Actions **público**:

```bash
python3 scripts/g1-verify-encrypted-bundle.py \
  --archive "/diretorio-privado/SalvaMotoca-Supabase-TESTES-....tar.gz.age" \
  --identity "/diretorio-privado/identidade-age.txt"
```

A chave **privada** age nunca pode estar em GitHub Secrets, PR, Actions, comentários, anexos de chat ou logs. Seu caminho aparece apenas nos argumentos locais do programa, não seu conteúdo. Não fazer upload do `.age` ou do `.tar.gz` para um repositório público.

O programa recusa utilização no GitHub Actions, exceto com marcador explícito de **teste sintético** `G1_SYNTHETIC_CI_ONLY=true`; essa opção **não é autorização** para fornecer dados/chaves reais ao runner.

## Cobertura automatizada de segurança

O teste `tests/g1-actions-backup-fake-e2e.sh` fabrica um backup **inteiramente fictício** com comandos de Supabase e Dropbox interceptados localmente. Sem secret, host hospedado ou credencial. Ele verifica:

1. Criptografar e decifrar corretamente a fixture, conferir manifesto e os seis SHA256 **sem extrair SQL** pelo novo verificador.
2. Recusar `.age` autenticado criptograficamente que tenha seus bytes adulterados.
3. Recusar TAR descriptografável com entrada maliciosa `../../unsafe.sql`.
4. Recusar um dump SQL alterado dentro de uma cifra válida, mas com manifesto SHA256 antigo.
5. Preservar os testes existentes de `pg_dump`/`pg_restore` PostgreSQL17 descartável, rejeição de Storage com objetos, inventário alterado, dados essenciais omitidos e resposta Dropbox com hash errado.

**Critério para G1 real:** após configuração de secrets, executar exportação verdadeira em `main` com confirmação e destino privado, conservar a identidade `age` exclusivamente com o fundador, validar o backup pelo verificador e **restaurar de fato** o conteúdo numa instância Supabase local descartável compatível (DB, RLS, grants, Auth e metadados de Storage; bytes de Storage separadamente se houver). Comparar as contagens com o inventário cifrado e registrar divergências. Só assim considerar `G1=PASS`; nunca promover automaticamente o aplicativo a produção comercial.

## Próxima etapa pendente

Para restauração real, validar procedimentos oficiais de uma **instância Supabase local completa**, não apenas PostgreSQL vazio. A gravação no Supabase de testes segue bloqueada pela diretriz G1 até haver backup e recuperação comprovados. Não contratar serviços, não criar projeto hospedado adicional e não mesclar PR sem autorização.

Fontes:
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/deployment/ci/backups
- https://github.com/bonecodesign/salvamotoca/pull/86
