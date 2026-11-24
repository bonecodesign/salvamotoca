# G1 — seis RPCs privilegiadas: ensaio Neon PG17 (23/11/2026, horário Brasil)

**G1=BLOCKED; RELEASE=NO_GO.** Exclusivamente Salva Motoca!, laboratório Neon Free. Sem alteração no Supabase hospedado, sem pagamento real e sem dados pessoais.

## Montagem isolada
Branch filha `g1-rpc-mock` da baseline. 80 instruções executadas em transação. Base relacional derivada de `20261112201752_initial_borrachaja_mvp_bh.sql` com ampliação sintética dos estados awaiting_payment/no_provider, request_key e tabelas presence/attempts derivadas das migrações aplicadas. Auth.uid e usuários são fixtures; claim via GUC não autentica sessões reais. Não é replay integral de migrações, nem teste de todas as RLS/policies históricas. Nenhum seed real de prospecção utilizado.

Corpos SQL das seis funções extraídos do código main: bj_get_request_location (20261112214828); bj_set_presence, bj_ping_presence, bj_submit_quote (presenca_online_orcamento_e_proximo_prestador); bj_answer_quote e bj_finish_request (duas_recusas_por_prestador_em_cada_solicitacao). ACLs explícitas equivalentes às fontes. Seis SECURITY DEFINER no catálogo; 6/6 search_path vazio; 0/6 EXECUTE PUBLIC; 0/6 EXECUTE anon; 6/6 EXECUTE authenticated. Dono é o executor do laboratório, não necessariamente postgres do Supabase. Não aplicar automaticamente o verificador de owner do ambiente real.

## Resultado real da execução SQL sintética
40 instruções, 17 blocos DO de asserção passaram em transação: cliente vê localização; cliente e prestador pendente não ativam presença; terceiro não vê localização, não envia orçamento nem encerra pedido alheio; prestador aprovado ativa presença e ping; prestador não vê localização antes de pagamento; orçamento abaixo do mínimo rejeitado; terceiro não aceita orçamento alheio (UUID conhecido, sem depender de RLS para ocultá-lo); cliente aceita e status vira awaiting_payment; nenhum pagamento criado pelo aceite; prestador atribuído vê localização após inserção administrativa de registro pago fictício; desativar presença funciona e ping não reativa; encerramento de pedido pago recusado com mensagem esperada. Teste de exceções exige mensagem esperada, não qualquer erro. Ao fim, 1 orçamento e 1 registro de pagamento exclusivamente fictícios permanecem na branch.

Não foi testada toda a lógica de recusa/reatribuição, simultaneidade, cancelamento permitido, autenticação JWT real ou entrega. A função histórica de encerramento trata cancelamento pré-atendimento; não equivale à confirmação bilateral de conclusão comercial. Não confundir regras históricas de comissão com decisões finais.

## Gate
Neon demonstra viabilidade relacional e reduz incerteza de ACL/RPC, mas não reproduz serviços gerenciados Supabase (Auth/Storage/Vault). Restauração do pacote histórico real não executada. Priorizar ambiente privado Supabase compatível com PG17, não multiplicar ensaios sintéticos como substituto de recuperação. Não enviar backup SQL real, credenciais ou dados pessoais a CI pública. Manter G1 bloqueado até evidência da restauração independente.
