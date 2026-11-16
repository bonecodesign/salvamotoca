# F1 — Pré-verificação PRIVADA de integridade dos backups

**Data:** 16/11/2026. **Projeto permitido:** somente `yivkqyjdeouxnwtwfekc`.  
**Estado:** roteiro e testes sintéticos concluídos/pendentes de CI. **Backup real e restauração permanecem BLOQUEADOS até comprovação independente.**

O arquivo `scripts/f1-private-backup-manifest-check.mjs` foi adicionado para verificar **localmente**, em um computador/ambiente privado do responsável, se os arquivos de uma tentativa de backup existem e correspondem a seus tamanhos e hashes SHA-256. Ele não acessa Supabase, GitHub, Stripe ou qualquer outro serviço, não executa dump, não faz restauração, não faz upload e **não lê o conteúdo do backup em logs**.

## Pré-requisitos

1. Seguir `docs/F1_WORK_EXECUCAO.md` e `docs/F1_BACKUP_RECOVERY_PREP_2026-11-15.md` para fazer **uma cópia verdadeira em ambiente privado**, sem expor URL de conexão, senhas nem dumps.
2. Criar/guardar fora do repositório os arquivos de `schema`, `roles`, `data`, `storage_inventory` e um `restore_report` (e arquivos binários para cada objeto presente no Storage); identificar as limitações de exportação do Auth e de componentes gerenciados.
3. Criar manifesto JSON **privado** com estas propriedades, cada objeto `artifacts.*` contendo `file` (caminho absoluto fora do repo), `sha256` (64 caracteres hexadecimais) e `bytes` (tamanho inteiro do arquivo).

### Estrutura do manifesto

```json
{
  "version": 1,
  "project_ref": "yivkqyjdeouxnwtwfekc",
  "backup_source": "existing_supabase_project",
  "checked_at": "ISO-8601 do momento da verificacao",
  "storage_object_count": 0,
  "artifacts": {
    "schema": {"file": "/secure/schema.dump", "sha256": "SHA256_REAL", "bytes": 123},
    "roles": {"file": "/secure/roles.dump", "sha256": "SHA256_REAL", "bytes": 123},
    "data": {"file": "/secure/data.dump", "sha256": "SHA256_REAL", "bytes": 123},
    "storage_inventory": {"file": "/secure/storage-inventory.json", "sha256": "SHA256_REAL", "bytes": 123},
    "restore_report": {"file": "/secure/restore-report.json", "sha256": "SHA256_REAL", "bytes": 123}
  }
}
```

Os valores da amostra **não são evidências válidas**. O arquivo `storage-inventory.json` deve conter `{"objects":[]}` se a checagem real de Storage mostrar zero objetos. Caso haja objetos, cada item de `objects` deverá declarar `bucket_id`, `object_name` e os mesmos campos `file,sha256,bytes` para o backup binário local. O `restore-report.json` deve usar `target:"disposable_local_postgres"`, `completed:true`, `rls_verified:true`, `auth_scope_reviewed:true`, `storage_metadata_reviewed:true`, `external_effects_disabled:true` e `storage_object_count` consistente, **somente se cada item foi de fato verificado**.

### Execução

```bash
node scripts/f1-private-backup-manifest-check.mjs /secure/private-manifest.json
```

O programa exige hashes/tamanhos exatos, arquivos reais não vazios, manifestos recentes, distinção dos arquivos e cobertura coerente do inventário de objetos. Só mostra um resumo das verificações, sem URLs, tokens, registros Auth ou conteúdo do backup.

O resultado válido é deliberadamente **`REVIEW_REQUIRED_NO_GO`**. Mesmo que todos os hashes coincidam, isso **não prova que o arquivo veio do Supabase nem que a restauração teve sucesso**: um manifesto artificial poderia ter hashes válidos. A verificação independente da restauração por um operador responsável, em banco local descartável, continua obrigatória.

**Não fazer upload do manifesto, dump ou relatório privado ao GitHub nem anexá-los ao ChatGPT.** Não usar esse verificador para preencher `backup_verified=true` ou `restore_verified=true` automaticamente no script de Auth/Storage. As regras F1 seguem com `f1TestRequestsEnabled=false`.

## CI e limitações

`tests/f1-private-backup-manifest-check.test.mjs` cria apenas arquivos simulados no diretório temporário do runner e verifica recusa de hash alterado, duplicação, inventário incoerente, projeto diferente, data vencida e autodeclaração. Esses testes não entram em contato com o projeto hospedado.

**Gate G1 real:** permanece `BLOCKED` até backup real e restauração verdadeira e auditada. A homologação A/B/C, as migrações futuras F2–F6, cobrança Stripe e lançamento permanecem proibidas por esse bloqueio.
