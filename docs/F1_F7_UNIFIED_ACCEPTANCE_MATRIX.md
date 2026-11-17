# Salva Motoca! — Matriz única de homologação F1–F7 e GO/NO-GO

**Snapshot:** 16/11/2026 · fonte: GitHub `bonecodesign/salvamotoca`.  
**Projeto Supabase:** `yivkqyjdeouxnwtwfekc` existente. **Nenhum dado remoto foi escrito por este pacote.**  
**Estado global:** **NO-GO para piloto e produção.** Esta matriz NÃO equivale à assinatura de aceite ou certificação.

## Regra geral para classificar evidências

- `OFFLINE_TESTED`: código/CI em mocks e bases descartáveis aprovados; **não** comprova serviço real.
- `BLOCKED`: faltam evidências externas exigidas; proibir ativação/escrita/PSP/dispatch.
- `NOT_RUN`: procedimento ainda não executado.
- `FAIL`: houve execução efetiva e falha registrada. Nunca transformar `FAIL` ou `BLOCKED` em `PASS` sem reproduzir e documentar.

O manifesto verificável está em `docs/release-gates-manifest.json`, validado pelo comando `node scripts/release-readiness-offline.mjs`, que **sempre declara `NO_GO`**.

## Matriz dos nove gates

| Gate | Fase associada | Evidência disponível hoje | Prova ainda obrigatória | Estado |
|---|---|---|---|---|
| G0 | Código / pré-lançamento | Testes estáticos, simulações F1–F7 e flags `false`; PRs em revisão | Regressão após consolidar/rebase de todos os PRs, revisão de segurança e conflito | **OFFLINE_TESTED** |
| G1 | Infraestrutura / recuperação | PRs #53 e #58 com ensaio fictício, verificador de hashes e auditoria local | **Backup REAL do único Supabase + restauração independente DB, Auth, Storage bytes/hash** | **BLOCKED** |
| G2 | F1 Auth/Storage/RPC | F1 integrada à main; PRs #54/#59/#60 com testes adversariais offline | A/B/C autenticados, seis RPCs `SECURITY DEFINER`, fotos, RLS, negados por identidade, limpeza e Android | **BLOCKED** |
| G3 | F2/F3 prestadores/orçamento/reboque | PRs #42/#44, simulações de concorrência, custos e equipamentos | Backend real reconciliado, migrations revisadas, dispatch e equipamentos em ambiente seguro | **BLOCKED** |
| G4 | F4 pagamentos e economia | PRs #45/#55/#57; cálculos 10+10, ledger, concorrência e risco mock | **PSP sandbox autorizado**, webhook assinado, split e estorno, disputa, tributação, regras jurídicas e conciliação | **BLOCKED** |
| G5 | F5 atendimento | PRs #48/#49/#57; chat e localização offline, revogação após chegada | Chat/RLS/GPS/notificações reais autorizados após pagamento **comprovado por servidor**; Android | **BLOCKED** |
| G6 | F6 conclusão e mediação | PRs #50/#51/#57; confirmações, prazo 5 min e avaliações em mock | Revisão humana de disputas, autenticação dos envolvidos, transferência somente com saldo PSP validado | **BLOCKED** |
| G7 | Jurídico / LGPD / operação | Documentos e decisões técnicas preparados | Termos e privacidade finais, riscos trabalhistas, tributação, prestadores, suporte, plano de incidentes, monitoramento e aprovação | **BLOCKED** |
| G8 | Piloto assistido | F7 `NO_GO` automatizado; roteiro de pré-lançamento | Teste Android físico, equipe de suporte, participantes/área definidos, contingência e aceite **expresso** do responsável | **BLOCKED** |

## Critérios de dependência

```text
G0 offline: testes e proteção de flags
      |
      v
G1: recuperação REAL DB/Auth/Storage  -- BLOQUEADO
      |
      +--> G2: F1 Auth/Storage/RPC A/B/C
      +--> G3: F2/F3 backend + equipamentos
      +--> G4: F4 PSP + jurídico financeiro
                 | 
           G2 + G3 + G4
                 |
                 v
           G5: F5 chat/GPS
                 |
                 v
           G6: F6 confirmação/mediação
                 |
         G7: jurídico/operação
                 |
                 v
           G8: piloto assistido (somente com nova autorização)
```

**Nenhum resultado de CI sozinho desbloqueia G1–G8.** O grafo é uma sequência de aprovação, não necessariamente uma dependência de desenvolvimento: codificar e testar offline pode continuar, mas chamadas e migrações reais não.

## Matriz operacional de pendências (para revisão e execução)

| ID | Verificação e saída esperada | Referência | Responsável pelo aceite | Estado |
|---|---|---|---|---|
| M-01 | Resolver ordem de PRs, conflitos #47/#56, revisar código final 10+10 | `docs/PR_CONSOLIDATION_PLAN.md` | Revisor técnico + responsável | REVISÃO PENDENTE |
| M-02 | Prova privada G1 de origem, backup, restauração e bytes Storage | `docs/G1_PRIVATE_EXECUTION_PACKET.md`, #53/#58 | Operador e auditor privado | BLOCKED |
| M-03 | Auth A/B/C, foto pequena, RLS, URLs assinadas e cleanup | `docs/F1_WORK_EXECUCAO.md` | Operador após G1 | BLOCKED |
| M-04 | Seis RPCs, localização durante deslocamento, descredenciamento, disputa | #54/#59/#60 | Revisor de segurança após G1 | BLOCKED |
| M-05 | Concorrência no servidor: idempotency-key, versão/CAS, locks e transação | F2/F4/F5 e PR #57 | Revisor técnico | OFFLINE PARCIAL |
| M-06 | Pagamento 10+10, PSP, tarifa, estorno/chargeback, ledger e webhook | PR #57 e documentação financeira | Financeiro/jurídico/PSP | BLOCKED |
| M-07 | Chat pós-pagamento, GPS consentido e expiração na chegada | PR #57, #59 | Produto/segurança | BLOCKED |
| M-08 | Conclusão bilateral, prazo 5min, mediação e avaliação | PR #57 | Produto/suporte | BLOCKED |
| M-09 | Android físico: câmera, GPS, internet instável, conta, acessibilidade | `docs/F7_PLANO_DE_GATES.md` | Testador de dispositivos | NOT_RUN |
| M-10 | Legal, LGPD, direitos dos consumidores, tributação, contratos prestador | Decisões e documentos do projeto | Especialistas/representante legal | BLOCKED |
| M-11 | Monitoramento, alerta de incidentes, plano de reversão e suporte | F7 | Operações | BLOCKED |
| M-12 | GO de piloto assistido com nova autorização específica | F7 | Responsável do projeto | NO_GO |

## Dados que devem compor a evidência futura (fora de espaços públicos se sensíveis)

Para cada M/G: identificador; `PASS|FAIL|BLOCKED|NOT_RUN`; responsável; horário UTC; ambiente; versão/commit; escopo; artefatos privados e hashes; resultado de rollback e limpeza; riscos residuais; revisão/aceite explícito. Não publicar senha, dump, JWT, PII, placa de moto, endereço ou imagem privada.

## Resultado desta rodada

Este pacote entrega **artefatos e testes de preparação**, não operação. Na execução local de CI, deve ser possível demonstrar:
1. contrato financeiro de 10% de cada lado alinhado entre política e F4;
2. flags F1–F6 desligadas e resultados de release `NO_GO`;
3. DAG de PRs com conflitos registrados; nenhuma integração/merge automática;
4. bloqueio de G1 e ausência de alegação de PSP, backup ou restauração real;
5. limites do replay e concorrência de snapshots, exigindo validação futura server-side.

**Não há porcentagem geral de conclusão confiável neste estágio.** Qualquer relatório percentual deverá distinguir código testado offline de função realmente homologada e implantada.
