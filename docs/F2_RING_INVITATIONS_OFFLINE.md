# Salva Motoca! — F2: convites escalonados por proximidade (somente PG17 offline)

**17/11/2026 · Proposta de homologação, não de produção.** Repositório `bonecodesign/salvamotoca`. Único Supabase existente `yivkqyjdeouxnwtwfekc` **não alterado**.

## Motivação e escopo

O usuário aprovou a preferência de **notificar primeiro os prestadores mais próximos e ampliar o raio gradualmente**. O motor F2 existente já tem filtragem por distância Haversine, cobertura declarada, serviços selecionados, presença voluntária recente, aprovação e horário de resposta. O trabalho desta rodada acrescenta uma **camada isolada** para testar o avanço de etapa e a deduplicação transacional.

**Conceito importante:** F2 convites para enviar orçamento acontecem **antes do pagamento**; a fila F5 no [PR #63](https://github.com/bonecodesign/salvamotoca/pull/63) é para o aviso ao **prestador já selecionado após um pagamento autorizado**. São tarefas diferentes e não devem ser fundidas. Este PR **não aciona nem copia para o banco real** qualquer das filas.

## Implementação sob teste

- `tests/f2-ring-invites-fixture.sql`: adiciona uma tabela privada de avanço por pedido e registro de convites com `UNIQUE(request_id,provider_id)`. O avanço `private.f2_mock_advance_ring` trava a **solicitação via `FOR UPDATE`**, impedindo duas rodadas simultâneas. Se há convite ativo, responde `waiting` sem criar outro.
- A função prioriza **prestadores dentro do mesmo anel**, em ordem de distância, antes de ampliar a abrangência. Exige serviços compatíveis, aprovação, presença recente, cobertura declarada e categoria borracharia. O reboque permanece reservado à F3. Se não há candidatos num anel, pode investigar o seguinte; se há convite aguardando resposta, não avança.
- `tests/f2-ring-seed.sql`: localizações e identidades **inventadas**, inclusive dois prestadores próximos, um intermediário, um distante, um suspenso e um incompatível.
- `tests/f2-ring-adversarial.sql`: testa primeiro o candidato mais perto, outro do mesmo raio, avanço posterior para maior distância, ausência de convite duplicado, abertura pelo prestador correto, recusa voluntária, expiração de 5 minutos **após abertura fictícia** e cancelamento de pendências se o pedido deixa de estar elegível. Termina com `ROLLBACK`.
- `tests/f2-ring-race.sh`: **duas sessões PostgreSQL concorrentes** disputam o avanço de um único pedido. Espera um registro `invited_mock`, outro `waiting` e exatamente um convite.
- `tests/f2-ring-contract.test.mjs` e `.github/workflows/f2-ring-invitations.yml`: testam contrato e modelo legado em banco descartável.

## Parâmetros e política de proteção

**Decisão SM-DEC-047 (18/11/2026): 5, 15 e 60 km são os três anéis aprovados pelo fundador.** A configuração continua **somente simulada** neste PR; nenhum convite externo foi habilitado. O terceiro anel permanece subordinado à capacidade e área declaradas pelo prestador, à elegibilidade e aos gates de lançamento. Neste candidato, apenas **um prestador por etapa operacional** recebe o convite em simulação. O seguinte é considerado somente se o anterior recusar, expirar corretamente ou se não houver prestador elegível naquele anel.

| Situação fictícia | Regra |
|---|---|
| Convite criado | Não significa notificação entregue, nem gera ausência |
| Convite aberto pelo prestador | Começa janela simulada completa de 5 minutos |
| Sem abertura | Após 5 minutos do convite, pode tentar próximo prestador, **sem contar ausência** |
| Convite aberto sem resposta | Após 5 minutos da abertura, expira; revisão de ausência depende de futura prova de entrega e política humana |
| Recusa voluntária | Abre próxima busca; não conta ausência |
| Suspensão ou serviço incompatível | Prestador excluído imediatamente da próxima seleção |
| Pedido aceito/fora de `requested` | Revoga convites pendentes e impede expansão |
| Modo manual | **Não** é convertido automaticamente em expansão |

A regra de **10 ausências em 30 dias** continua dependente de processo de revisão humana; **não há suspensão automática**. Este ensaio **nunca** declara aviso entregue, ausência contabilizada, dinheiro recebido ou deslocamento autorizado.

## Privacidade e proibições

As tabelas e funções `private.f2_mock_*` possuem RLS, `SECURITY INVOKER`, sem `EXECUTE`/tabela para `anon` ou `authenticated`; exigem gate privado que nasce `false` e marcador exclusivo `disposable_pg17`. Nenhum prestador recebe endereço exato, imagem, telefone ou localização do cliente em resposta da função — apenas identificadores fictícios necessários ao teste. O fluxo real de acesso a foto/solicitação exige revisão RLS adicional.

A execução da CI usa somente um banco PostgreSQL descartável no GitHub Actions. **Não executa SQL no Supabase hospedado, não envia push/SMS/e-mail, não realiza cobranças, não cria usuários, não faz merge nem aciona seu dispositivo**. Caso seja necessário testar localmente, os arquivos serão temporários e só serão criados **na pasta indicada pelo usuário**, com limpeza documentada.

## Próximos passos de produção (não autorizados ainda)

1. Homologar em campo os raios já definidos (5/15/60 km), o método de medição da distância, a política intermunicipal, tempos, máximo de convites simultâneos e regras por região com base em testes e operação, pois os números da fixture não são política aprovada.
2. Integrar a elegibilidade à F2 real, revisar concorrência, Auth/RLS, mudanças de localização/serviços, status de orçamentos, acesso de foto e gestão de ausências sem dano ao prestador.
3. Construir **outbox real com provedor de mensagens autorizado**, idempotência de emissão e confirmação verificável; não confundir ACK de abertura com entrega push.
4. Validar F3 reboque, suporte e custos, além de testar Android, internet instável e GPS controlado **após G1 real de backup e restauração**.

**Estado: teste offline, nenhum lançamento. `G1=BLOCKED`, `RELEASE=NO_GO`.**
