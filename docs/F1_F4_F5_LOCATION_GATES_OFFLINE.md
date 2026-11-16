# Salva Motoca! — F1/F4/F5: autorização de localização exata condicionada a pagamento e deslocamento

**16/11/2026 · Candidato técnico puramente OFFLINE · SEM MIGRATION.** Projeto autorizado: `yivkqyjdeouxnwtwfekc`. **F1, F4 e F5 reais continuam desativados, G1=BLOCKED e F7=NO_GO.**

## Problema analisado

O Supabase hospedado contém seis RPCs `SECURITY DEFINER` executáveis pelo papel `authenticated`, inclusive `bj_get_request_location`. O próprio cliente pode consultar seus dados; já o acesso do prestador selecionado usa a existência de `payment_records.status='paid'`. Uma autorização de localização segura no futuro não deve continuar ativa após cancelamento, suspensão, reembolso, disputa, troca de profissional ou chegada. **A leitura do código não é exploração e nenhum vazamento real foi demonstrado.**

O [PR #54](https://github.com/bonecodesign/salvamotoca/pull/54) criou um primeiro endurecimento em PostgreSQL isolado, com gate privado `false`, prestador ativo, proposta aceita, pedido elegível e `paid_at` válido. **Isso ainda não é suficiente para a operação real, pois `payment_records` não atesta um webhook PSP real e não contempla o ciclo F5 nem disputas F4.**

## Extensão preparada neste ramo

O arquivo `tests/f1-location-f4-f5-gates-fixture.sql`, carregado **somente em PostgreSQL 17 descartável**, acrescenta tabelas privadas falsas para autorização financeira e estado de atendimento:

- `private.f1_mock_f4_release_gate`: inicia **false**, assim como o gate F1.
- `private.f1_mock_f4_decisions`: liga `request_id`, `quote_id` e `provider_id` ao valor do serviço, deslocamento e divisão **10% solicitante + 10% prestador**, sem peças como terceira cobrança. O banco rejeita automaticamente números inconsistentes.
- `private.f1_mock_f5_sessions`: só simula acesso do prestador com estado **`en_route`**. Assim que o prestador chega, deixa de expor o endereço nesta consulta, e outros canais de rastreamento também exigirão revogação real.
- `private.f1_location_financial_lifecycle_fixture`: função `SECURITY DEFINER` **privada no banco de teste**, concedida unicamente a `authenticated` na fixture. Verifica identidade por `auth.uid()`, prestador ainda aprovado e ativo, pedido em estado elegível, orçamento vencedor exato, vínculo financeiro consistente, sem `revoked_at`, risco `clear`, `paid_at` não futuro e estágio em deslocamento. Sem as duas flags ativas, só o cliente titular consulta seu próprio endereço.

**Importante:** `NOT_A_PSP_RECEIPT`, `mock_confirmed` e os gates são **simulações**, nunca evidência de dinheiro disponível. O teste liga as flags apenas dentro de uma transação fictícia e executa `ROLLBACK`. O futuro backend deverá criar decisão de autorização somente **após verificar assinaturas PSP e conciliar valor, moeda, pagador, prestador, proposta aceita, reembolsos e riscos** com fonte autenticada. Nunca copiar as tabelas de mock ou ativar flags de teste em produção.

### Exemplo matemático exclusivamente fictício

| Item | Valor |
|---|---:|
| Serviço com materiais incluídos | R$ 230,00 |
| Deslocamento, sem comissão | R$ 40,00 |
| Taxa de 10% do motociclista | R$ 23,00 |
| **Cliente paga, antes da eventual tarifa PSP** | **R$ 293,00** |
| Desconto de 10% do prestador | R$ 23,00 |
| **Base de repasse do prestador** | **R$ 247,00** |
| **Receita bruta teórica plataforma** | **R$ 46,00** |

O teste SQL de integridade rejeita, por exemplo, taxas legadas de 15% e repasse calculado incorretamente. **Não representa split/escrow ou validação do provedor financeiro.**

## Regressões adversariais implementadas

`tests/f1-location-f4-f5-adversarial.sql` demonstra apenas em contêiner descartável:

1. Acesso do titular à própria localização; desconhecido e prestador não selecionado negados.
2. Gate F1 desligado, gate F4 desligado, F4 aguardando confirmação ou F5 antes de deslocamento: prestador negado.
3. Somente dois gates fictícios ligados, pagamento mock coerente, proposta exata, prestador ativo, pedido elegível e `en_route`: acesso simulado temporário.
4. Disputa, reembolso, chargeback e revogação explícita: acesso negado imediatamente.
5. Chegada, serviço iniciado, handoff F6, suporte, conclusão ou cancelamento: acesso negado.
6. Prestador suspenso/inativo, troca de prestador, proposta recusada ou ID de proposta incompatível com F4: acesso negado.
7. Pagamento legado reembolsado, `paid_at` nulo/futuro ou pedido cancelado: acesso negado.
8. Tentativa de adulterar números `10%+10%`: restrição CHECK rejeita.
9. `ROLLBACK`: **ambas as flags voltam a false** e nenhuma alteração fictícia permanece.

A comparação com a consulta legada do PR #54 é de desenho técnico, não de vulnerabilidade explorada. Nenhum IP, usuário, prestador, GPS, foto ou pagamento verdadeiro foi usado.

## Antes de qualquer homologação real

G1 continua bloqueado até prova privada de **backup e restauração do único Supabase**, com Auth, PostgreSQL, metadados e bytes Storage, conforme [PR #58](https://github.com/bonecodesign/salvamotoca/pull/58). Depois disso ainda serão obrigatórios testes Auth A/B/C com JWT legítimo, RLS, PSP sandbox homologado, políticas de privacidade, notificações, Android físico e aprovação humana.

O próximo contrato de produção deve ter sessão financeira autenticada e **revogação no servidor** ao cancelar, trocar prestador ou reembolsar; log mínimo sem endereço exato; TTL curto de localização; prevenção de replay; histórico mínimo para suporte; prova de que a localização não permanece acessível via token ou URL assinada após a expiração aplicável. **Não copiar este SQL para `supabase/migrations`**, não aplicar na base hospedada, não criar dados ou pagamentos e não mudar `config.js`.

**Status: apenas proposta verificada em CI offline; NO-GO para operação.**
