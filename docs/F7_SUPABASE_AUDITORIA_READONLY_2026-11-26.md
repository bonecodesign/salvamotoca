# Evidência — auditoria hospedada somente leitura (26/11/2026 BRT)

## Escopo e salvaguardas

Esta conferência usou exclusivamente consultas de leitura no único projeto Supabase de TESTES. Não criou usuários, sessões, objetos Storage, registros operacionais, migrations, políticas, funções, chaves, buckets ou pagamentos. Não altera a decisão de lançamento: `RELEASE=NO_GO`.

## Resultado do advisor de segurança

O advisor, consultado em 26/11/2026, mantém os mesmos achados já documentados na matriz F7:

- **INFO (4):** `public.bj_request_attempts`, `public.configuracao_comercial`, `public.ofertas_prospeccao` e `public.prestadores_prospeccao` têm RLS habilitado e nenhuma policy; o acesso permanece fechado por padrão.
- **WARN (6):** as RPCs legadas `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence` e `bj_submit_quote` continuam `SECURITY DEFINER` executáveis por `authenticated`.

Nenhuma correção foi aplicada remotamente. A proposta local e reversível do PR #158 não é autorização de implantação; qualquer alteração depende de backup G1 atual, revisão de impacto e autorização específica.

## Logs no período conferido

No intervalo de 25/11/2026 19:00 BRT a 26/11/2026 19:00 BRT, a leitura dos logs registrou rotinas de infraestrutura e um erro de catálogo:

- `relation "public.quotes" does not exist` em 26/11/2026 16:57:54 BRT;
- reinicialização normal do serviço Auth e avisos de depreciação de configuração gerenciada.

O erro de `public.quotes` é classificado como **divergência a investigar**, não como alteração nem incidente confirmado. A tabela operacional conhecida é `public.service_quotes`. Antes da homologação G2, revisar o cliente, teste ou consulta que ainda referencia `public.quotes`; não criar tabela de compatibilidade nem alterar o schema hospedado para silenciar o log.

## Atualização posterior de G1 (27/11/2026 BRT)

A condição de G1 citada na versão inicial deste registro foi superada em parte: a execução manual [#10](https://github.com/bonecodesign/salvamotoca/actions/runs/46026655124) exportou um snapshot lógico do Supabase de TESTES, restaurou-o com êxito em PostgreSQL 17 descartável e publicou somente o artefato cifrado privado de retenção curta. A evidência completa está em [G1_EVIDENCIA_RECUPERACAO_ARTEFATO_2026-11-27.md](G1_EVIDENCIA_RECUPERACAO_ARTEFATO_2026-11-27.md).

Isso comprova a recuperação lógica dos schemas `public`, `private` e `supabase_migrations`, mas **não** recupera Auth gerenciado, bytes de Storage nem uma cópia externa durável. Portanto, a pendência de G1 é agora de **cobertura integral e durabilidade**, não de ausência de snapshot/restauração.

## Efeito nos gates

- **G1 atual:** recuperação lógica comprovada; cobertura integral de Auth/Storage e cópia independente durável permanecem pendentes.
- **G2 hospedado:** bloqueado — requer as salvaguardas G1 aplicáveis e autorização específica antes de criar sessões fictícias, usar Storage ou validar RPCs.
- **G4:** bloqueado — sandbox Stripe exclusivo ainda não configurado.
- **Decisão:** `RELEASE=NO_GO`.
