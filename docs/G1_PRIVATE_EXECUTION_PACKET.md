# Salva Motoca! — Pacote de execução privada G1 (backup e restauração)

**Versão:** 16/11/2026 · **Supabase autorizado:** único projeto existente `yivkqyjdeouxnwtwfekc`. **Estado: `G1=BLOCKED`, `F1=NO_GO`.**  
Este documento prepara a operação privada, mas **NÃO a executa, NÃO gera backup nem requer serviços adicionais**. Nenhum dump, senha, JWT, URL de conexão, fotos ou manifesto privado pode ser enviado ao GitHub ou ao ChatGPT.

## O que está pronto, e o que não está

Os scripts foram desenvolvidos e testados em ramos da F1:

- [PR #53](https://github.com/bonecodesign/salvamotoca/pull/53): `scripts/f1-private-backup-manifest-check.mjs`, verifica hashes, tamanhos e inventário de objetos de arquivos **já existentes** no disco privado; recusa declaração de prova integral.
- [PR #58](https://github.com/bonecodesign/salvamotoca/pull/58), baseado no #53: `scripts/f1-local-restore-audit.mjs`, verifica catálogo, ACL/RLS, seis RPCs e contagens **de uma restauração que tenha ocorrido realmente no PostgreSQL 17 local**. `docs/F1_SOURCE_COUNTS_READONLY.sql` é o modelo de SELECT para capturar contagens na origem.
- Ambos os testes de CI usaram **dados sintéticos**; há prova de que a ferramenta rejeita confundir fixture com backup real.

**Não realizado:** extração real de schema/roles/data, cópia real de bytes do Storage, teste completo de recuperação de Auth/configurações, restauração independente de backup real e assinatura de evidências pelo responsável.

## Dependências e responsáveis

| Papel de execução | Atribuição necessária |
|---|---|
| Responsável pelo projeto | Autorizar especificamente quando iniciar o procedimento G1 privado, conferir custo zero e ausência de ações externas |
| Operador com acesso privado | Verificar CLI `supabase --version` e `supabase db --help`, origem/conexão do ÚNICO projeto, gerar e proteger os artefatos reais |
| Auditor de recuperação | Validar de forma independente origem, integridade, restauração, Auth, políticas, Storage bytes/metadata e relatório do rollback; não depender só do valor de um campo `true` |
| Revisor técnico de segurança | Conferir inexistência de execução remota/mutation indevida, segregação de segredos, controle dos backups e limitações documentadas |

Um único operador pode desempenhar mais de um papel, mas **a validação independente deve se apoiar em evidência verificável, não na mera autodeclaração**.

## Sequência operacional — somente mediante nova autorização

1. **Preparar local privado:** instalar PostgreSQL 17 e ferramentas compatíveis, sem abrir porta externa nem túnel/port-forward para o Supabase. Testar base descartável em `127.0.0.1`; nunca usar o banco hospedado como destino da restauração.
2. **Checar versão atual das ferramentas:** `supabase --version`, `supabase db --help`, `supabase db dump --help` (se disponível na versão). Confirmar na documentação oficial as opções exatas e quais partes gerenciadas não entram no dump. **Não copiar comandos antigos de forma irrefletida.**
3. **Capturar origem em leitura apenas:** verificar `docs/F1_SOURCE_COUNTS_READONLY.sql` do PR #58, executar exclusivamente no momento do backup e guardar `captured_at` e JSON fora do repositório. Contagens da conversa ou de CI nunca são baseline da cópia real.
4. **Exportar artefatos privados:** schema, roles, dados e metadados, registrar versão SQL, hora, operação e resultado; coletar separadamente **bytes dos objetos Storage** de forma legitimamente autorizada. Conferir os limites de recuperação de Auth/configurações. Não ativar sistema nem criar usuário.
5. **Restaurar apenas em banco PostgreSQL 17 DESCARTÁVEL**, com nome `f1_restore_disposable`, sem integrações ou gatilhos com efeito externo. Conferir retorno de todos os comandos, índices, extensões, funções, owners, grants e políticas RLS. Isolar artefatos e computador usados para a operação.
6. **Executar os dois verificadores privados**, na branch do PR #58 (onde os arquivos efetivamente existem), com os arquivos já gerados fora do repositório:

   ```bash
   # Pré-verificação segura sem conexão:
   node scripts/f1-local-restore-audit.mjs --plan

   # Após backup/restore REAL: hashes e inventário de arquivos privados.
   node scripts/f1-private-backup-manifest-check.mjs /secure/private-manifest.json

   # Após confirmação de que 127.0.0.1 é PostgreSQL LOCAL, não túnel remoto:
   node scripts/f1-local-restore-audit.mjs \
     --local-db f1_restore_disposable \
     --expected /secure/f1-source-counts.json \
     --port 5432
   ```

   As variáveis de ambiente locais, caso necessárias, precisam ficar em espaço privado. O script usa `F1_LOCAL_PGPASSWORD` apenas para o PostgreSQL LOCAL. **Nunca usar a senha do Supabase remoto aqui**.
7. **Auditar Auth e Storage de verdade:** restaurar/verificar os arquivos binários, seus hashes, políticas e recuperação de Auth/configurações aplicáveis. Estar com metadados `storage.objects` presentes **não** significa ter recuperado fotos. Não executar login no ambiente de produção sem plano aprovado.
8. **Registrar prova e limitações em relatório privado:** origem comprovada, escopo exportado, hashes, resultados de comandos e restauração, lista de objetos, resultado de teste de leitura, reversibilidade e assinatura/aceite do responsável. Se qualquer evidência estiver ausente, marcar **`BLOCKED`**.
9. **Retenção/limpeza:** definir prazo e criptografia dos backups, descartar base local somente após revisão do relatório, apagar sob responsabilidade do operador com mecanismo seguro. Não abrir acessos a dados sensíveis por testes não autorizados.

## Evidências mínimas para uma decisão G1 (nenhuma presente hoje)

| ID | Evidência requerida | Estado inicial |
|---|---|---|
| G1-E01 | Exportação privada comprovadamente derivada do projeto correto, com versões e escopo | `NOT_VERIFIED` |
| G1-E02 | Integridade SHA-256, tamanho e inventário dos artefatos reais | `NOT_VERIFIED` |
| G1-E03 | Restauração isolada realmente executada e resultado das verificações PostgreSQL 17 | `NOT_VERIFIED` |
| G1-E04 | Catálogo, RLS/ACL, policies e contagens comparados com a captura da origem | `NOT_VERIFIED` |
| G1-E05 | Recuperabilidade de Auth e configurações, com limites claramente registrados | `NOT_VERIFIED` |
| G1-E06 | Bytes dos objetos Storage e metadados verificados, ou inventário zero comprovado | `NOT_VERIFIED` |
| G1-E07 | Impedimento de disparos externos, isolamento da restauração e plano de rollback | `NOT_VERIFIED` |
| G1-E08 | Relatório privado com responsável, hora UTC, falhas e aprovação de revisão | `NOT_VERIFIED` |

**Aprovação da G1 não significa aprovação da F1**: depois vêm G2 de Auth/Storage/RPC A/B/C, Android físico e homologação funcional.

## Limitações que não podem ser contornadas

- CI local não comprova origem dos dumps, integridade de Auth/Storage recuperado, nem login/PSP hospedados.
- O plano Free ou qualquer plano não autoriza presumir capacidade de PITR, snapshot integral, restore com um clique ou contrato de backup.
- O script `f1-private-backup-manifest-check` retorna `REVIEW_REQUIRED_NO_GO`; o script `f1-local-restore-audit` também. Isso é proposital e NÃO deve ser alterado para dar GO.
- Se surgir a necessidade de serviço pago, novo projeto, mudança de plano, gravação remota ou implantação, **parar e pedir autorização específica**. O uso deste roteiro **não** autoriza nenhuma dessas ações.

**Próximo bloqueio real:** a extração, restauração e auditoria privadas ainda dependem do responsável/operador e das condições de acesso. A fase de desenvolvimento pode avançar em paralelo sem modificar o Supabase.
