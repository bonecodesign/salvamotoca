# G1 — integração segura de testes offline provenientes do PR #108

**Data:** 22/11/2026 (horário de Brasília). **Repositório público**, ambiente Supabase TESTES `yivkqyjdeouxnwtwfekc`. **G1=BLOCKED; RELEASE=NO_GO**.

## Origem sem retrabalho

O [PR #108](https://github.com/bonecodesign/salvamotoca/pull/108) desenvolveu verificações reais de recuperação de dados **fictícios** em PostgreSQL 17, além de auditoria de metadados das seis RPCs `SECURITY DEFINER`. O PR #108 permanece Draft e diverge da `main` após as correções integradas #109–#114; uma integração direta ameaçaria desfazer a autorização manual imutável e a verificação do cofre Dropbox.

Este pacote reaproveita os arquivos existentes do #108 na **base atual da `main`**, sem recriar o algoritmo nem mesclar o ramo desatualizado.

## Incluído neste PR

- `tests/g1-functional-relational-recovery-pg17-offline.sh`: `pg_dump` de PostgreSQL 17, cifra `age` com identidade descartável, restauração numa segunda base descartável, e testes de FKs, triggers, grants, RLS e execução de funções fictícias;
- `docs/G1_RPC_PRIVILEGES_READONLY.sql`: consulta **SELECT** de metadados de funções, sem buscar dados pessoais ou devolver corpos SQL;
- `scripts/g1-verify-rpc-privileges-offline.py`: validador offline que falha em alterações inesperadas das seis RPCs;
- `tests/test_g1_rpc_privilege_audit.py`: 11 testes adversariais fictícios;
- fluxo `g1-backup-restore-offline.yml`: executa automaticamente o ensaio PostgreSQL e a suíte RPC a cada PR que altere esses arquivos, sem secrets.

## Escopo preservado e limites

- **Não** modifica `scripts/g1-actions-backup-real.sh`, `tests/g1-actions-backup-fake-e2e.sh`, `.github/workflows/g1-supabase-backup-manual.yml`, o GitHub Environment nem o Dropbox;
- não realiza testes de usuário autenticado real, reconstituição de Auth/Storage nem restauração real do banco hospedado;
- as proteções complementares de **Auth/Storage** do PR #108 (incluindo inventário gerenciado antes/depois e manifesto cifrado) **não foram transferidas neste pacote**. Exigem port separado, testado a partir da `main`, para preservar a guarda de autorização e o cofre Dropbox;
- **não** colar saída de SQL, segredo, chave privada ou inventário em logs públicos; CI usa dados fictícios;
- nenhum pagamento, despacho, alteração de RLS em produção, custo ou serviço comercial é autorizado.

**Critério de aceite deste pacote:** GitHub Actions 1 job `SUCCESS`, sem conexão hospedada nem uso de segredos. Isso comprova somente o código **offline**. **G1=BLOCKED; RELEASE=NO_GO**.
