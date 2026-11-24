# Homologação de capacidade — F2 a F6 e supervisão (offline)

## Escopo e execução

O script `node scripts/perf-isolated-journeys.js` inicia um servidor HTTP temporário exclusivamente em 127.0.0.1, porta efêmera. Encerra as conexões ao terminar, inclusive em erro. Os dados são sintéticos e não dependem de credenciais, Supabase, Stripe, APIs, fotos reais ou notificações.

| Cenário | Volume | Critério funcional |
|---|---:|---|
| Rajada A | 100 clientes HTTP / 1.000 prestadores | Todos os pedidos distintos concluídos em memória |
| Rajada B | 300 clientes HTTP / 1.000 prestadores | Todos os pedidos distintos concluídos em memória |
| Supervisão A/B/C | 100, 300 e 1.000 sessões + igual número de incidentes | Cinco projeções por cenário; contagens, valores e bloqueios exatos |
| Limites | Duplicata e excesso de 1.000 registros | Falhar fechado |

Cada jornada HTTP executa roteamento F2/F3, itemização, cálculo F4, pagamento sintético, despacho sintético, chegada, início, handoff, resumo e confirmações F6. A revisão humana é apenas candidata; nenhum repasse é autorizado. O cenário usa a mesma referência fictícia de prestador para pedidos independentes: não testa reserva concorrente do profissional. Não é um teste de capacidade operacional do marketplace.

Medidas: duração total, vazão (requisições/s), p50/p95/p99, máximo de latência no cliente e no motor, RSS amostrada. As medidas variam conforme o runner; não constituem SLA. O timeout é defesa da fixture e não meta comercial. O resultado JSON é artefato da CI (somente números e metadados de runtime).

## Aceite e limites

Aprovação exige execução CI bem-sucedida, zero falhas, totais íntegros e manutenção dos bloqueios. O script não declara capacidade do banco, do sistema autenticado ou de uma rede móvel. Não exerce F1 Auth/Storage, transações concorrentes sobre um único pedido, PSP, push, GPS físico, filas de trabalho ou múltiplas instâncias. Não testa produção nem gera autorização para implantar migrations.

## Evidência medida — 24/11/2026

CI [45501646371](https://github.com/bonecodesign/salvamotoca/actions/runs/45501646371), Node v22.23.5, Linux x64; SHA testado `de9e3e04b948e49f1bafbcb451c232cc0021fc8e`. Quatro workflows aprovados (carga, jornada, suporte, supervisão).

| Rajada | Sucesso | Duração total | Vazão | p95 cliente | RSS amostrada |
|---|---:|---:|---:|---:|---:|
| 100 | 100/100 | 236,01 ms | 423,72/s | 218,40 ms | 74,8 MiB |
| 300 | 300/300 | 432,65 ms | 693,40/s | 398,28 ms | 81,1 MiB |

| Projeção administrativa | Passagens | Mediana | Máximo | Bloqueadas / candidatas |
|---|---:|---:|---:|---:|
| 100 sessões + 100 incidentes | 5/5 | 1,42 ms | 56,14 ms | 67 / 33 |
| 300 + 300 | 5/5 | 5,54 ms | 6,84 ms | 200 / 100 |
| 1.000 + 1.000 | 5/5 | 11,11 ms | 18,39 ms | 667 / 333 |

Zero falhas e operações reais. Resultados de uma execução, não SLA. Medidas administrativas são cinco projeções; o máximo não representa uma estimativa robusta de percentis. Não extrapolar para produção.

## Próxima homologação

- PostgreSQL descartável: concorrência de pedidos distintos e contenção no mesmo pedido, integridade e tempos de consulta, limites de conexão.
- Ambiente hospedado TESTES: somente mediante escopo aprovado, backup recente e usuários fictícios controlados; definir orçamento de carga compatível com plano existente antes de testar.
- Dispositivos físicos, rede instável, recuperação e operação humana; PSP de teste somente depois das respectivas travas.

RELEASE=NO_GO.

## Evidência complementar: carga transacional PostgreSQL 17 — 24/11/2026

CI [45507024277](https://github.com/bonecodesign/salvamotoca/actions/runs/45507024277), SHA testado `e0a21e9fb967598967c1b584a95bf33ac98daf9f`. Primeira execução rejeitou endereço interno Docker; guarda corrigida para destino loopback fixo e marcador explícito da fixture. Nenhuma conexão externa.

| Rodada | Aceites concorrentes | Vencedores | Conflitos esperados | Reexecuções financeiras | Journals únicos | p95 aceite | p95 financeiro |
|---|---:|---:|---:|---:|---:|---:|---:|
| 100 pedidos | 200 | 100 | 100 | 200 | 100 | 517,26 ms | 553,21 ms |
| 300 pedidos | 600 | 300 | 300 | 600 | 300 | 502,80 ms | 563,77 ms |

Até 24 conexões simultâneas. 400/400 pedidos coerentes, 400 recibos únicos, 400 journals, 400 replays idempotentes, 1.200 linhas balanceadas; quatro ensaios de desconexão sem commit revertidos, isolamento RLS e limpeza PASS. Zero falhas inesperadas. Os 400 conflitos de aceite são resultados esperados, não falhas. Gates F2/F4 retornaram a false. Os tempos incluem abertura de conexão. Não exercita reserva de um prestador entre pedidos, Auth nativo, F3/F5/F6 persistidos, rede móvel nem capacidade do Supabase hospedado. RELEASE=NO_GO.
