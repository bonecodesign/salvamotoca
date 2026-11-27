# G1 — evidência de backup lógico e restauração descartável

Data: 27/11/2026 (BRT)  
Escopo: Supabase de **TESTES** `yivkqyjdeouxnwtwfekc`; nenhuma operação comercial.

## Execução comprovada

- Workflow: `G1 — backup cifrado + restauração descartável (artefato privado)`
- Execução manual: [#10](https://github.com/bonecodesign/salvamotoca/actions/runs/46026655124)
- Commit: `e29f94af75931a0d766c6ab7d9d0771845c65683`
- Resultado: **success**, 47 s.
- Banco de origem: somente leitura para exportação lógica.
- Destino de restauração: contêiner PostgreSQL 17 efêmero, descartado ao término.
- Validações aprovadas pelo workflow:
  - integridade SHA-256 do dump;
  - restauração de tabelas do schema `public`;
  - confirmação explícita de que o ambiente Supabase de TESTES não foi alterado.

## Artefato atual

| Campo | Valor |
|---|---|
| Nome | `SalvaMotoca-G1-ciphertext-46026655124` |
| ID | `15212403787` |
| Tamanho | 107.641 bytes |
| Digest | `sha256:d9acc78e6371f1fdbb2ef35c23b1baa623fc7494ef51793e5da8eebcf5d2a618` |
| Retenção | até 04/12/2026 12:38 BRT |
| Conteúdo | dump SQL cifrado com age + manifesto, armazenado como artefato privado do GitHub |

## Delimitação honesta

Esta evidência prova recuperação lógica dos schemas `public`, `private` e `supabase_migrations`, usando stubs estritamente temporários para referências de Auth e papéis no banco descartável.

Ela **não** prova recuperação integral gerenciada de Auth, bytes de Storage ou cópia durável externa ao GitHub. O workflow falha deliberadamente se houver objetos em Storage, para não alegar cobertura inexistente. A decisão de liberação permanece **NO-GO** até os gates restantes de G1/F7.

## Correções que tornaram a prova possível

- PR #187: recriação do schema `public` no destino descartável.
- PR #188: inclusão do schema `private` no dump lógico.
- PR #189: stub vazio de `auth.users` somente no laboratório.
- PR #190: papéis sem login somente no laboratório.

Nenhuma dessas alterações escreve no Supabase hospedado.
