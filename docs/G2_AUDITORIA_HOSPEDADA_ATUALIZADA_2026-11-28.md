# G2 — auditoria hospedada atualizada (2026-11-28)

## Escopo e segurança operacional

Auditoria somente de leitura realizada no projeto Supabase TESTES existente em 28/11/2026. Nenhum DDL, dado fictício, usuário, atendimento, pagamento ou configuração comercial foi criado ou alterado.

## Saúde

O verificador de saúde retornou **zero alertas**.

## RLS

O verificador de segurança sinalizou quatro tabelas com RLS habilitado e nenhuma política:

- `public.bj_request_attempts`
- `public.configuracao_comercial`
- `public.ofertas_prospeccao`
- `public.prestadores_prospeccao`

Classificação: **bloqueio por padrão**, pois RLS sem política não concede acesso às linhas. Permanecem sob revisão antes de qualquer exposição funcional.

## Funções SECURITY DEFINER

Foram auditadas as seis funções marcadas pelo verificador:

- `bj_answer_quote`
- `bj_finish_request`
- `bj_get_request_location`
- `bj_ping_presence`
- `bj_set_presence`
- `bj_submit_quote`

Para todas, a consulta de catálogo confirmou:

| Controle | Resultado |
| --- | --- |
| SECURITY DEFINER | Sim |
| `search_path` | vazio/fixado |
| EXECUTE para PUBLIC | Não |
| EXECUTE para anon | Não |
| EXECUTE para authenticated | Sim |
| Corpo referencia `auth.uid()` | Sim |

Conclusão: não há execução pública ou anônima dessas funções. A autorização para usuários autenticados é deliberada e segue exigindo os testes autenticados de ponta a ponta antes do gate de liberação.

## Situação

- Recuperação lógica G1: comprovada na execução #11.
- Saúde hospedada: sem alertas.
- Controles RLS e funções privilegiadas: conferidos sem mutação.
- Liberação comercial: continua **NO_GO** até a homologação autenticada de Auth/Storage e os demais gates formais.
