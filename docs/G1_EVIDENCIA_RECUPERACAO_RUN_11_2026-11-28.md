# G1 — evidência de recuperação atualizada (2026-11-28)

## Execução comprovada

- Workflow: `G1 — backup cifrado + restauração descartável (artefato privado)`
- Execução: [#11](https://github.com/bonecodesign/salvamotoca/actions/runs/46108597694)
- Estado: **sucesso**
- Início: 28/11/2026 01:40 BRT
- Duração total: 38 s
- Job: `Exportar, restaurar em PostgreSQL 17 e publicar ciphertext temporário` — sucesso (31 s)
- Ref executada: `main` / `01ea268d973e5215ce04d9c89d3f87e8cd5f5748`

## Artefato preservado

- Nome: `SalvaMotoca-G1-ciphertext-46108597694`
- ID: `15249075260`
- Tamanho: 105 KB
- SHA-256: `c12ae3dc70159ace64f9c418b2f545c57749fb04991bf3fe1d49fe8fe09ab3af`

## Conclusão

A rotina executou exportação lógica, restauração descartável em PostgreSQL 17 e publicação apenas do artefato cifrado, sem criar atendimentos, pagamentos ou alterar a operação comercial. Esta evidência atualiza a comprovação de recuperação integral no escopo lógico já homologado.

## Observação de runtime

O GitHub exibiu o aviso informativo de compatibilidade: `actions/upload-artifact@v5` foi forçado pelo runner a executar em Node.js 24. O job concluiu com sucesso; não é falha de backup/restauração. A ação está na versão v5, conforme atualização anterior.
