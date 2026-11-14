# F1 — Relatório de execução Work (MODELO NÃO PREENCHIDO)

> **ATENÇÃO:** este arquivo é um modelo, **não** uma homologação. Substituir campos só após execução real. Usar apenas evidência técnica sem senha, JWT, tokens, URLs assinadas ou dados pessoais.

**Data/hora UTC:** NÃO EXECUTADO  
**Operador:** NÃO DEFINIDO  
**Supabase:** yivkqyjdeouxnwtwfekc (único projeto)  
**GitHub commit testado:** NÃO EXECUTADO  
**Status geral:** NÃO EXECUTADO — NÃO LIBERADO  
**Flag F1:** deve permanecer false até aprovação do responsável

## Registro dos gates

| Gate | Resultado | Evidência / execução (sem dados privados) | Bloqueio e próxima providência |
| --- | --- | --- | --- |
| Estado main / feature flag off | NÃO EXECUTADO | — | Consultar main |
| CI Node/Chrome/Postgres | NÃO EXECUTADO | — | Executar/verificar GitHub Actions |
| Reconstrução técnica do banco vazio (migrations + rollback) | NÃO EXECUTADO | — | Não confundir com backup restaurado |
| Backup privado exportado | NÃO EXECUTADO | — | Verificar escopo, criptografia, hashes |
| Restauração em ambiente local descartável | NÃO EXECUTADO | — | Demonstrar recuperação e diferenças |
| Inspeção de notificações/triggers/despachos | NÃO EXECUTADO | — | Não gravar antes |
| Auth A/C reais | NÃO EXECUTADO | — | Contas fictícias e login HTTP legítimo |
| A: upload JPG e download com bytes iguais | NÃO EXECUTADO | — | Script: scripts/f1-work-storage-e2e.mjs |
| C/anônimo: leitura negada | NÃO EXECUTADO | — | Conferir status 4xx |
| A: signed URL; C negado | NÃO EXECUTADO | — | Nunca guardar signed URL |
| Limpeza do único arquivo de teste | NÃO EXECUTADO | — | Excluir via Storage API |
| Auth/Storage prestador B | NÃO EXECUTADO | — | Exige pedido fictício isolado, plano aprovado |
| Pedido ponta a ponta sem atendimento real | NÃO EXECUTADO | — | Confirmar isolamento/autorizar operação |
| RPC SECURITY DEFINER / acesso adversarial | NÃO EXECUTADO | — | Testes legitimamente autenticados e isolados |
| Retenção e cota de fotos órfãs | NÃO EXECUTADO | — | Definir limites/rotina segura |
| Navegador desktop / viewport móvel | NÃO EXECUTADO | — | Testar Work navegador |
| Android físico (câmera, GPS, internet) | NÃO EXECUTADO | — | Teste humano em aparelho físico |
| Aprovação humana de liberação | NÃO EXECUTADO | — | Não alterar flag |

**Vocabulário permitido para cada gate:** PASSOU / FALHOU / BLOQUEADO / NÃO EXECUTADO. Nunca marcar PASSOU por documentação, teste de unidade ou resultado anterior se o gate exigir teste real.

## Controle do backup

- Caminho dos arquivos privados: **não registrar no GitHub**
- Data da cópia: —
- Conteúdo coberto e excluído: —
- Data da restauração descartável: —
- Verificações comparadas (esquema, contagens, RLS, Auth, arquivos físicos): —
- Diferenças/limites identificados: —
- Backup e restauração efetivamente confirmados: **NÃO**

## Testes HTTP A/C

- Versão Node/CLI executada: —
- Comando utilizado: node --env-file=<privado> scripts/f1-work-storage-e2e.mjs --run
- Registro seguro por etapa (PASS/FAIL, nunca senha/JWT): —
- Foi criado algum objeto de teste? **NÃO EXECUTADO**
- A remoção via Storage API foi comprovada? **NÃO EXECUTADO**
- Houve contas fictícias criadas? **NÃO EXECUTADO**
- Falhas encontradas: —

## Alterações de código

- Branch/PR de correção: —
- Descrição: —
- Testes de regressão: —
- CI do commit corrigido: —

## Conclusão verificável

**Status:** HOMOLOGAÇÃO TÉCNICA PARCIAL — LIBERAÇÃO PÚBLICA BLOQUEADA.

**Pendências impeditivas de liberação pública:** backup restaurável, Auth/Storage remoto A/C/B, pedido seguro isolado, Android físico e limites operacionais. A reconstrução técnica aceita em `docs/F1_PRELIBERACAO_FINAL.md` só pode ser usada para preparar o ensaio; não substitui backup restaurado antes de dados reais ou lançamento. Atualizar somente após provas.

**Recomendação:** manter f1TestRequestsEnabled=false até todos os gates necessários serem aprovados.
