# G1 — preparação portátil PostgreSQL 17.12 no Windows (um comando local, sem Work)

**Projeto autorizado:** único Supabase `yivkqyjdeouxnwtwfekc`. **Destino Windows autorizado pelo usuário:** `D:\boneco\SALVAMOTOCA`. **Status:** `G1=BLOCKED`, `RELEASE=NO_GO`.

## Por que esta etapa

O responsável confirmou por PowerShell que `D:\boneco\SALVAMOTOCA\codigo` existe com Git e Node.js 24, mas **Docker, `psql`, `pg_dump`** não estão disponíveis. Sua cópia local do PR #69 foi sincronizada e executou **11 PASS / 1 SKIP** na suíte G1 de fingerprint (somente o teste de criação de symlink foi ignorado por `EPERM`, sem elevar permissões) e **10 PASS** de HTTP mocks. São testes offline, não uma restauração real.

A próxima preparação é usar **somente os binários portáteis oficiais do PostgreSQL 17.12-1**, para criar posteriormente um PostgreSQL 17 *local descartável* sem contratar serviços, instalar serviço do Windows ou alterar o Supabase existente. Não exigir Docker nem permissões de administrador. Não usar `winget install` automaticamente.

## Origem e verificação dos binários

A EnterpriseDB publicou o artefato `postgresql-17.12-1-windows-x64-binaries.zip` e o sidecar de checksum SHA-256 correspondente.

- [Publicação do fornecedor (EDB, atualização 16/11/2026)](https://github.com/EnterpriseDB/edb-installers/issues/800)
- [Página oficial de binários EDB](https://www.enterprisedb.com/download-postgresql-binaries)
- [Arquivo ZIP do fornecedor](https://get.enterprisedb.com/postgresql/postgresql-17.12-1-windows-x64-binaries.zip)
- [SHA-256 oficial, arquivo .sha256](https://get.enterprisedb.com/postgresql/postgresql-17.12-1-windows-x64-binaries.zip.sha256)
- Digest fixado (do próprio fornecedor): `a2cd8a774389347b70be7748ac4a37ef43cb6ee539c5fc3e85ae264b15e4a04c`.

O script **baixa o sidecar, compara o hash publicado com o hash fixado no código, baixa o ZIP e confere o hash do ZIP antes de descompactá-lo ou executar qualquer binário**. Checa ainda tamanho, estrutura dos paths do ZIP, ausência de `../`, e o `--version` dos binários `postgres.exe`, `pg_ctl.exe`, `initdb.exe`, `psql.exe`, `pg_dump.exe`. Falhas bloqueiam a conclusão, sem instalar alternativas automaticamente. O checksum de transporte não prova, por si só, a origem de um futuro backup.

## Local do script e funcionamento

`scripts/g1-prepare-pg17-portable.ps1`:

- Sem argumentos (ou `-Plan`) imprime o plano **SEM rede e SEM escrever**.
- `-Apply` verifica arquitetura Windows x64, checkout Git correto, branch G1 correta, status Git limpo; **só então** cria o destino `D:\boneco\SALVAMOTOCA\testes-temporarios\postgres17-portatil`.
- Usa apenas o domínio de downloads do fornecedor para os **dois URLs exatos** ZIP e SHA-256. Não aceita URL externa por parâmetro nem credenciais.
- Nunca sobrescreve um ZIP existente: se o arquivo já estiver lá, exige que seja íntegro. Não substitui binários existentes sem manifesto compatível.
- A extração acontece numa subpasta nova de nome aleatório; em caso de falha, apaga somente arquivos temporários que ele próprio criou.
- `pgsql\bin` e um manifesto simples sem segredos ficam sob a pasta autorizada. **Não adiciona PATH global, não instala serviço, não executa `initdb`, não inicializa cluster ou PostgreSQL, não chama `pg_dump`, não faz conexão a Supabase nem restauração real**.
- A execução é idempotente quando já existe uma instalação verificada.
- Windows pode exigir Visual C++ Runtime compatível para iniciar algum binário; se faltar, o script **falha de forma segura**, sem instalar componentes arbitrários. A revisão da instalação de runtime pode ser feita posteriormente com documentação oficial e consentimento.

### Etapa local (um comando, somente após CI Windows aprovada)

É **responsabilidade do operador executar a atualização** em seu PowerShell: esta conversa **não tem acesso ao drive D:**. O comando deverá validar origem/branch/status e sincronizar a branch G1 com `git pull --ff-only` antes de invocar, a partir do checkout atualizado, o script assinado por commit Git. Não executar código remoto por `Invoke-Expression` ou `curl | iex`. `-ExecutionPolicy Bypass` quando necessário vale **somente no processo filho do PowerShell**, não muda políticas permanentes do Windows.

Um exemplo de execução da fase de preparação, depois da sincronização:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\boneco\SALVAMOTOCA\codigo\scripts\g1-prepare-pg17-portable.ps1" -Apply
```

O comando **realiza download de software e escreve unicamente dentro do diretório de testes autorizado**. Será executado apenas por iniciativa do usuário e não libera a F1.

## Resultado esperado

```text
POSTGRESQL_17_12_PORTABLE=READY
DATABASE_CLUSTER=NOT_INITIALIZED
POSTGRES_SERVICE=NOT_INSTALLED
DATABASE_RESTORE=NOT_EXECUTED
SUPABASE_HOSTED_WRITES=NONE
G1_BACKUP_RESTORE=BLOCKED
RELEASE=NO_GO
```

A ferramenta fica disponível em `...\postgres17-portatil\pgsql\bin\` para a fase seguinte de inicialização de cluster descartável **com autenticação e isolamento próprios**. Esta etapa NÃO faz backup de projeto Supabase, não recupera Auth nem bytes de Storage. A execução real G1-E01…E08 continuará condicionada a exportação e restauração independentes verificáveis, plano de segredos e revisão humana. Não colocar dados sensíveis, strings de conexão, dumps ou senhas na pasta do checkout Git.

**Não contratar serviços, não criar projeto Supabase, não alterar o banco hospedado, não fazer merge nem ativar F1–F7.**
