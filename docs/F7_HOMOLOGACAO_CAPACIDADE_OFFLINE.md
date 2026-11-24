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

## Próxima homologação

- PostgreSQL descartável: concorrência de pedidos distintos e contenção no mesmo pedido, integridade e tempos de consulta, limites de conexão.
- Ambiente hospedado TESTES: somente mediante escopo aprovado, backup recente e usuários fictícios controlados; definir orçamento de carga compatível com plano existente antes de testar.
- Dispositivos físicos, rede instável, recuperação e operação humana; PSP de teste somente depois das respectivas travas.

RELEASE=NO_GO.
