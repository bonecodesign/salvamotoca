# Salva Motoca! — Plano de consolidação de PRs e resolução de conflitos

**Revisão de 16/11/2026 · Snapshot do GitHub, não estado atualizado automaticamente.**  
**Decisão:** `NO_GO` para release, pagamento ou atendimento real. O objetivo deste pacote é organizar a **revisão**, não autorizar merges em cadeia nem produzir migrations.

## 1. Diagnóstico verificado no GitHub

A F1 já possui implementação na `main`, mas faltam backup/restauração real, login/Storage/RLS com contas A/B/C, dispositivos e homologação autenticada. Os PRs de F2–F7 seguem em Draft; há duas alternativas de F4 ainda abertas, e somente uma adota a decisão comercial atual.

| PR | Papel | Dependência | Ação de revisão |
|---|---|---|---|
| [#55](https://github.com/bonecodesign/salvamotoca/pull/55) | Regra comercial SM-DEC-045/046 | main | Referência de negócio; conferir conteúdo sobreposto com #57 |
| [#42](https://github.com/bonecodesign/salvamotoca/pull/42) | F2 ofertas | main | Revisar concorrência e integração do orçamento |
| [#44](https://github.com/bonecodesign/salvamotoca/pull/44) | F3 reboque | #42 | Revisar disponibilidade e equipamentos |
| [#45](https://github.com/bonecodesign/salvamotoca/pull/45) | F4 ledger/risco mock | #44 | **Nunca usar sozinho com modelo antigo**; exigir reconciliação #57 |
| [#48](https://github.com/bonecodesign/salvamotoca/pull/48) → [#49](https://github.com/bonecodesign/salvamotoca/pull/49) | F5 offline e RLS candidato | #45 | Preservar flags `false` e tokens fictícios |
| [#50](https://github.com/bonecodesign/salvamotoca/pull/50) → [#51](https://github.com/bonecodesign/salvamotoca/pull/51) | F6 conclusão e suporte | #49 | Verificar duas confirmações, 5min, disputa |
| [#52](https://github.com/bonecodesign/salvamotoca/pull/52) | F7 preflight | #51 | Não converter teste estático em GO |
| [#57](https://github.com/bonecodesign/salvamotoca/pull/57) | Correções 10+10 + integração F2–F7 | #52 | **Candidato técnico principal**. Incorpora mudanças do #56 |
| [#47](https://github.com/bonecodesign/salvamotoca/pull/47) | F4 alternativo legado | main | **Não mesclar**: comissão 15% e modelo incompatível |
| [#56](https://github.com/bonecodesign/salvamotoca/pull/56) | Correção F2–F4 | #45 | **Não duplicar merge**: conteúdo técnico já incorporado em #57 |

F1 em cadeia de revisão separada: **#53 → #58** para backup/restore e **#54 → #59 → #60** para segurança das seis RPCs. Essas cadeias não demonstram deploy ou correção aplicada ao Supabase hospedado.

## 2. Ordem segura de revisão e dependências

1. Tomar SM-DEC-045/046 como **contrato imutável durante a revisão**: dois percentuais de 10% sobre serviços com materiais inclusos, deslocamento à parte e isento. Taxa PSP externa não definida.
2. Revisar F2 e F3 a partir dos PRs originais; confrontar seus modelos de contrato com **o resultado final do PR #57**, não com a versão antiga de 15%.
3. Revisar F4 (#45) e conciliar com #57 antes de considerar merge. Ledger de teste: cliente R$ 293,00, prestador R$ 247,00, plataforma R$ 46,00 no exemplo de serviço R$ 230 + deslocamento R$ 40; sem PSP.
4. Revisar e integrar por dependência **#48 → #49 → #50 → #51 → #52**, adaptando cada base/ref e rerodando todos os testes se houver rebases.
5. Usar **#57 como patch final de compatibilização**, evitando reaplicar #56. Resolver manualmente qualquer sobreposição de #55 e #57 e comparar seus testes. O contrato financeiro `pricing-policy-10x10.js` do #55 foi incluído neste pacote de coordenação para testes de paridade com `f4-finance.js`.
6. Revisar **#53 → #58** e **#54 → #59 → #60** separadamente. Essas implementações são **fixtures e scripts de auditoria**, não migrations do banco existente.
7. Não mesclar, rebater, fechar nem arquivar #47/#56 automaticamente sem decisão de revisão registrada. **Um merge bem-sucedido pode ainda falhar funcionalmente**; CI, dependências e aprovação humana continuam necessários.

**Regra de segurança:** nenhum PR com SQL em `supabase/drafts/` vira automaticamente migration. A futura migration real precisa ser gerada e revisada com a CLI vigente, no momento apropriado, após G1 e autorização específica.

## 3. Conflitos identificados e estratégia de resolução

| Conflito | Risco | Estratégia |
|---|---|---|
| #47 × #45/#57 | Duas máquinas financeiras e regra antiga de 15% | Manter #47 fora da linha de release; registrar decisão humana de depreciação |
| #56 × #57 | Repetir alterações F2–F4 | Preferir #57; #56 apenas referência de origem e histórico CI |
| #55 × #57 | Documentos econômicos duplicados | Reconciliação editorial de mesma SM-DEC-045/046 e testes de paridade |
| F1 #54/#59/#60 × F4/F5 #57 | Localização de prestador sem PSP homologado | Manter tudo em SQL offline; só revisão de integração futura |
| Histórico F1 / banco real | RPCs `SECURITY DEFINER` ainda executáveis | Não ativar, substituir ou revogar em produção antes de G1 e E2E autorizado |
| Estado imutável do simulador × banco real | Dois snapshots podem aceitar o mesmo evento sem lock externo | Backend futuro deve ter idempotency key única, `FOR UPDATE`, CAS/versão, transação e teste de concorrência real |

## 4. Critérios para solicitar um merge futuro (ainda NÃO atendidos)

- Confirmação de divergências resolvidas, revisão de SQL e DDL, owners/RLS, flag `false`, regras de custo, documentação e suíte CI completa após o último rebase.
- Nenhuma chamada externa indevida; nenhum dado, segredo, foto, token, pagamento ou solicitação real como fixture.
- Evidência de rollback de testes, compatibilidade app/backend e plano de regressão e de reversão.
- Comprovação independente de recuperação DB/Auth/Storage (G1) **antes de qualquer DDL ou teste que grave no Supabase hospedado**.
- Autorização humana expressa para etapa de integração/release, em ato separado. **Este documento não autoriza merges ou ativação.**

A representação verificável destas dependências está em `docs/release-gates-manifest.json`. O comando local `node scripts/release-readiness-offline.mjs` verifica seu DAG, os nove gates e as flags; seu resultado termina **sempre** em `NO_GO`.
