# F3 — Reboque e transporte de motocicletas | arquitetura e limites

**Projeto:** Salva Motoca! · **branch:** feat/f3-reboque-motos-seguro · **PR:** #44 (empilhado sobre o PR #42/F2).

**Status:** código da F3 construído como candidato em branch isolada. **Não aplicado ao Supabase**, não homologado operacionalmente, não habilitado ao público.

## Dependências confirmadas (GitHub + consulta somente leitura ao Supabase)

1. **F1:** foto privada em bucket \`request-photos\`, dados obrigatórios de marca/modelo/ano, solicitação e localização restrita. A CHECK \`f1_selected_service_types_check\` ativa atualmente **proíbe \`reboque_moto\`**. O candidato F3 troca essa CHECK por validação equivalente que permite o código, adicionando um *trigger fail-closed* que veta pedidos de reboque fora da RPC autenticada com o gate desligado.
2. **F2:** backend candidato \`supabase/drafts/f2_backend_candidate.sql\` **não implantado**. A F3 reutiliza, por dependência, \`f2_request_offers\`, \`f2_quote_items\`, \`f2_ack_offer\`, \`f2_decline_offer\`, \`f2_expire_offers\`, \`f2_decide_quote\`, o helper de distância e políticas de foto. Por isso **a F3 não pode ser implantada antes da F2 homologada**.
3. A categoria \`service_categories.code = 'reboque_moto'\` **já existe no projeto existente**, porém \`paid_in_app=false\`. A F3 não altera essa decisão: sem pagamento, chat, deslocamento nem atendimento real.
4. **F4/F5:** pagamentos, confirmação de pagamento, liberação de endereço exato ao profissional vencedor, chat e rastreamento não estão disponíveis. Nenhum desses recursos é simulado como confirmação efetiva.

## Arquivos e comportamento implementado

| Arquivo | Responsabilidade |
| --- | --- |
| \`f3-tow.js\` | Validação de marca/modelo/ano, peso, serviços combinados, destino, capacidade/equipamentos, geolocalização aproximada, prioridades e orçamento em centavos |
| \`docs/F3_PREVIEW.html\` | Demonstração responsiva e **offline** de reboque, prestadores fictícios e preço total e comissão 10% + 10% sobre serviço |
| \`live-app-current.js\` | Tela de pedido, foto privada F1 e RPC atômica, equipamento declarado, resumo com destino privado para o cliente, convites, itens e escolha do orçamento via RPC F3 |
| \`config.js\` | \`f1TestRequestsEnabled=false\`, \`f2TestOffersEnabled=false\`, \`f3TowEnabled=false\` |
| \`supabase/drafts/f3_tow_backend_candidate.sql\` | **Rascunho SQL não implantável diretamente:** gate F3 falso por padrão, capacidade verificada, pedido/destino, privacidade, convites, orçamentos, seleção e guardas de legados |
| \`supabase/rollback/f3_only_if_empty.sql\` | Reverte apenas a F3 quando desligada e sem dados; preserva tabelas F1/F2 e restaura a CHECK F1 e o helper de foto F2 |
| \`tests/f3-*.js\`, \`tests/f3-*.sql\` e \`.github/workflows/f3-tests.yml\` | Domínio, Chrome responsivo, guardas de flags e PostgreSQL 17 efêmero com RLS e rollback |

### Equipamentos e aprovação

Prestador pode declarar plataforma, carretinha ou caminhonete adaptada, com peso máximo suportado, raio de cobertura, rampa, suporte da roda e amarração. A proposta **não aprova a si própria**: \`verified_by_admin=false\` no cadastro e após toda edição. Somente prestadores aprovados, online, com serviço de reboque habilitado e capacidade certificada são candidatos.

Essa validação digital **não substitui inspeção física**, documentação do veículo e do condutor, requisitos legais de transporte, seguro, capacidade técnica ou aprovação administrativa; isso ainda será homologado.

### Pedido e privacidade

A solicitação F3 deve incluir foto obrigatória, moto com peso estimado e origem via GPS, município/UF do destino, endereço completo **restrito ao cliente** e distância estimada declarada. A distância informada não é cálculo certificado de trajeto. As coordenadas de origem continuam restritas nas colunas F1; o resumo de reboque mostra apenas município, peso e quilometragem estimada, sem exibir endereço exato do destino.

Dados de pedido e destino são inseridos na **mesma transação** pela RPC protegida; o reenvio com a mesma chave só deve retornar o pedido original quando o conteúdo permanece idêntico. O prestador não recebe endereço exato antes de liberação operacional legítima da F4/F5.

A permissão de foto aos convidados também depende de equipamento ainda certificado, prazo do convite e aprovação do prestador. **URLs assinadas já emitidas seguem válidas até expirar**, mesmo após revogação; o aplicativo usa validade curta de 60 segundos. Esse risco deve ser avaliado na homologação.

### Distribuição e orçamento

A F3 usa os convites F2, mas avalia adicionalmente peso máximo, rampa/suporte/amarras, capacidade aprovada, categoria de reboque ativa, demais serviços selecionados, cobertura, sinal recente e recusa anterior.

- Priorização progressiva próxima do solicitante: **1/3/10 km são apenas valores de teste**, não regra definitiva de operação.
- Primeiro modo automático foi conectado à tela. **Modo manual está previsto na RPC**, mas a seleção de rebocadores homologados pela interface precisa de lista autorizada de prestadores antes de disponibilização pública.
- Orçamentos de reboque são discriminados em cada serviço escolhido (com materiais inclusos) e deslocamento obrigatório, total validado no servidor. Um único orçamento vence pelo bloqueio de concorrência F2.
- **Comissão futura:** 10% pago pelo motociclista + 10% descontado do prestador, somente sobre o(s) serviço(s) com materiais inclusos; deslocamento fica fora da base e processamento é separado para o cliente. Nenhum repasse ou cobrança ocorre nesta fase.
- Orçamento aceito passa para \`awaiting_payment\` (não significa \`paid\`). Chat, despacho, rastreamento e transporte não são liberados.

### Segurança de compatibilidade

- A F3 cria gate do banco \`private.f3_release_gate\` **desligado** e exige também a trava F2.
- Gatilho veta inserções de reboque por caminhos não autorizados e alterações de convites F3 com o gate desligado.
- Gatilho na tabela de orçamento evita chamar diretamente \`f2_decide_quote\` para burlar a certificação de reboque.
- O helper de leitura da F2 foi refinado para negar foto/solicitação de reboque a prestador cuja capacidade foi revogada. **O rollback restaura a versão original da F2**.
- RLS mantém o endereço completo do destino visível somente ao próprio cliente. Perfis não convidados não recebem resumo nem foto.
- Tabelas F3 novas não aceitam INSERT/UPDATE/DELETE direto por \`authenticated\`/anon; funções públicas revogam EXECUTE de \`anon\`.
- Cenários SQL são executados somente no PostgreSQL 17 descartável, sem credenciais de produção.

## Gates impeditivos antes da homologação real

1. Concluir backup recuperável e restaurado de F1/F2 no **único projeto Supabase existente**.
2. Revisar/merge do PR #42 e conciliar com o esquema remoto real; revisar SQL F3 em PR separado de migration, sem aplicar a cópia draft.
3. Validar RLS/RPC adversarial por Auth/PostgREST/Storage HTTP com cliente A, rebocadores B/C e terceiro D, com dados fictícios e fotos sintéticas.
4. Homologação humana de equipamento, condutor, documentação e cobertura; limites de peso e condições de transporte.
5. Validar a estimativa da rota, políticas de preços, operações de cancelamento e incidentes; não usar GPS estimado como comprovação de percurso.
6. Notificações, expiração, reoferta, recebimento e perda de rede em dispositivos Android reais; garantir que ausência sem entrega comprovada não penaliza prestador.
7. Homologação de F4 (pagamentos) e F5 (chat/localização) antes de qualquer acionamento comercial.
8. Aprovação humana deliberada e liberação controlada, jamais consequência automática de merge.

**Decisão:** PR #44 é **implementação candidata e preparação testável**, não autorização de implantação, pagamento, reboque real ou lançamento público.
