# F3 — Modelo de evidências para o Work (NÃO EXECUTADO)

> Este documento é um **modelo vazio**, não comprova homologação real. Não marcar PASSOU sem executar o respectivo cenário.

**Projeto único:** `yivkqyjdeouxnwtwfekc`
**PR de implementação:** #44, empilhado sobre #42.
**Status geral:** HOMOLOGAÇÃO REMOTA BLOQUEADA; F3 NÃO LIBERADA.
**Data de teste remoto:** NÃO EXECUTADO.
**Flag F1:** false · **Flag F2:** false · **Flag F3:** false.

| Gate | Resultado inicial | Evidência efetivamente necessária |
| --- | --- | --- |
| Backup e restauração integral do Supabase existente | NÃO EXECUTADO | Escopo, hashes, restore local de PG/Auth/Storage e exceções |
| CI Node/Chrome/PostgreSQL descartável | NÃO EXECUTADO NESTE RELATÓRIO | Link ao workflow e commit exato |
| Revisão SQL com schema real | NÃO EXECUTADO | Comparação de constraints, RLS, grants e funções legadas |
| Teste RLS HTTP com contas A/B/C/D | NÃO EXECUTADO | Status esperados, tokens não divulgados |
| Registro de foto privada e idempotência | NÃO EXECUTADO | Foto sintética, caminho protegido e retry confirmado |
| Declaração de capacidade e homologação de equipamento | NÃO EXECUTADO | Autoridade administrativa, logs mínimos |
| Distribuição manual e automática de reboque | NÃO EXECUTADO | Elegibilidade, região, peso, cobertura e ordem |
| Orçamentos simultâneos e vencedor único | NÃO EXECUTADO | Itens, deslocamento, estado sem paid |
| Revogação de foto e destino após suspensão | NÃO EXECUTADO | Acesso negado, validade de link assinado curta |
| Notificações e ausência de envio quando indisponíveis | NÃO EXECUTADO | Teste de push, silêncio e bloqueio |
| Android físico: câmera, GPS, rede, acessibilidade | NÃO EXECUTADO | Relatório com aparelhos e execução humana |
| Revisão documental, equipamentos, transporte e seguro | NÃO EXECUTADO | Aprovação humana formal e critérios |
| Reversão controlada com dados zerados | NÃO EXECUTADO | Prova em ambiente autorizado, sem afetar F1/F2 |
| Aprovação para piloto e liberação pública | NÃO EXECUTADO | Decisão registrada do responsável |

**Vocabulário permitido:** PASSOU / FALHOU / BLOQUEADO / NÃO EXECUTADO.

## Incidentes/correções

- PR de correção: —
- Falha original: —
- Reprodução, correção e reexecução: —

## Conclusão

F3 implementada como candidata local e aguardando homologação real. Nenhuma liberação é decorrência automática de PR ou CI aprovado. Não ativar pagamentos, notificações externas, chat, GPS real de prestador ou despacho.
