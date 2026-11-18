# Salva Motoca! — prontidão Auth/HTTP F1–F5 (sem execução hospedada)

**Verificação real somente leitura: 18/11/2026 00:07:52 UTC (17/11/2026, 21:07 Brasília)**.  
**Projeto único:** `yivkqyjdeouxnwtwfekc`; PostgreSQL **17.11.0.019**, `ACTIVE_HEALTHY`.  
**Estado:** `G1=BLOCKED` — `G2=NOT_RUN` — `F2–F5 hosted=NOT_IMPLEMENTED/NOT_TESTED` — `RELEASE=NO_GO`.

## Verificado realmente no Supabase hospedado (consultas SELECT, SEM mutações)

- Contagem naquele instante: **0 Auth users; 0 service_requests; 0 objetos em request-photos**. Nenhuma conta A/B/C disponível e nenhum fluxo HTTP com usuário legítimo executável hoje.
- Bucket `request-photos`: **privado**, `image/jpeg`, no máximo **5.242.880 bytes**; `storage.objects` com RLS habilitada.
- `public.service_requests`, `service_quotes`, `providers`, `payment_records` e `bj_provider_presence`: RLS habilitada. As políticas presentes incluem `requests_participants_read` e `quotes_participants_read`. Confirmação por políticas estáticas **não** substitui teste com JWT real.
- **Acesso direto por colunas:** papel `authenticated` pode ler `id`, `customer_id`, `provider_id`, `photo_path` após RLS, porém **NÃO** possui SELECT de `latitude`, `longitude`, `address_details` ou `request_key` em `service_requests`. `anon` não tem SELECT dessas colunas. O script futuro exige 4xx quando A/B/C tentam consultá-las diretamente.
- **Localização exata por RPC:** `public.bj_get_request_location(p_request_id uuid)` é `SECURITY DEFINER`, verifica `auth.uid()` e concede resultado ao cliente dono ou ao prestador atribuído **apenas com `payment_records.status='paid'`**. É uma checagem de **código SQL somente leitura**, não prova de segurança comportamental com usuário real. A RPC não será invocada antes de G1.
- **Foto diferente de GPS:** a política `f1_request_photo_participants_read` permite leitura do JPEG pelo autor ou **prestador atribuído ao pedido**, mesmo antes de `paid`. Isso serve para orçamento no modelo F1; deverá ser reavaliado na F2 com múltiplos candidatos e proteção de dados pessoais. Não confundir foto para orçamento com liberação de endereço/GPS do socorro.
- **Seis RPCs legadas** permanecem `SECURITY DEFINER` e executáveis para `authenticated`, não para `anon`. `bj_submit_quote(p_request_id,p_amount_cents,p_details)` usa um valor único e **não implementa ainda** a decomposição F2/F3 serviço + deslocamento.
- **Incompatibilidade relevante:** `requests_customer_create` atualmente exige `provider_id IS NOT NULL`, `category='borracharia_delivery'`, prestador aprovado/presente. Portanto o fluxo F1 hospedado **não é** automaticamente compatível com a futura F2 que começa sem prestador escolhido e disputa múltiplos orçamentos, nem com F3 reboque. Só revisar a integração por meio de migration versão 2 e plano de cutover **depois de G1 real e revisão humana**; não tentar operar F2/F3 via RPC F1 legada.

Este inventário não coletou dados pessoais, fotos, senhas ou JWT. SQL reexecutável: `docs/F125_HOSTED_CATALOG_READONLY.sql`.

## Novo ensaio HTTP pós-G1, preparado mas NÃO executado

`scripts/f125-http-auth-readonly.mjs` é um **teste pré-aprovado por gates**, não um cliente autorizado a criar dados:

- **Padrão `--plan`**: sem rede, sem autenticação, sem criação de arquivo. É o único modo usado livremente nesta fase.
- **`--run-readonly`, explicitamente autorizado após G1:** verifica três contas Auth existentes A (cliente), B (prestador atribuído na F1) e C (terceiro), suas sessões via `/auth/v1/user`; compara os UUIDs distintos; lê via `GET` somente `id,photo_path` do pedido sintético e `id,request_id` do orçamento; exige que A/B vejam o que lhes compete e C não veja. Testa negação da leitura direta de `latitude`, `longitude`, `address_details` e `request_key`. Testa JPEG sintético já existente no Storage: A/B autorizados, C/anônimo e endpoint público negados.
- **NÃO invoca nenhuma RPC `bj_*`**, não gera URLs assinadas, não cria usuários, upload, pedido, orçamento, pagamento, chat, GPS, dispatch, notificação ou repasse; não grava dados em disco. Único POST permitido é o de **login Auth com senha**: apesar de não criar registros comerciais, o login **pode gravar dados de sessão/último acesso no Auth**, por isso **também exige G1**.
- Exige chave **`sb_publishable_`**, URL exata do único Supabase, prova G1 **privada e recente (até 7 dias)**, aprovação/revisão humana G1, confirmação de automações isoladas, ACK de uso único, credenciais A/B/C legítimas fornecidas em ambiente privado, IDs de pedido/orçamento **SINTÉTICOS já existentes** e caminho `UUID_A/UUID.jpg` com prefixo do usuário A. Nunca aceita `service_role`, chaves secretas ou origem de rede diferente.
- A/B positivos têm pré-condição: solicitação F1 com `provider_id` atribuído ao prestador B e orçamento B já registrado. Como **não há usuários ou solicitações no projeto**, essas fixtures **NÃO existem**. **Não criar dados agora**; exigir plano posterior de criação isolada aprovado depois de G1 e revisão de efeitos externos.
- A função de validação do relatório privado verifica estrutura/datas e exige sinalização humana; isso é um **bloqueio operacional**, NÃO validação criptográfica de que backup/restauração realmente aconteceu. O auditor precisa verificar os artefatos G1-E01…E08 de maneira independente, fora do GitHub e desta conversa.

### Chamada futura, somente depois dos gates

```bash
# 1. Agora: APENAS modo plano (sem rede)
node scripts/f125-http-auth-readonly.mjs --plan

# 2. FUTURO, após aprovação expressa, G1 REAL e fixtures sintéticas já existentes.
# NUNCA salvar variáveis privadas no GitHub ou compartilhar senhas na conversa.
node --env-file=/pasta-privada/f125-readonly.env scripts/f125-http-auth-readonly.mjs --run-readonly
```

`/pasta-privada` é um **exemplo de documentação, não caminho criado**. O operador escolherá o local privado e, se envolver o dispositivo do usuário, aguardará a **pasta temporária indicada por ele**. Não utilizar diretório indicado por outra pessoa nem copiar dados sensíveis para CI.

## Matriz de aceitação F1–F5 (sem falsear status)

| ID | Prova necessária | Hoje |
|---|---|---|
| G1 | Backup/restauração reais DB + Auth + Storage bytes, auditoria independente | **BLOCKED** |
| H-01 | Criar/validar A/B/C legítimos e fixture sintética F1 sob isolamento e aprovação | **BLOCKED por G1** |
| H-02 | JWT real A/B/C, `/auth/v1/user` e RLS GET de pedido/orçamento no Supabase | **NOT_RUN** (script preparado) |
| H-03 | Negar consulta direta de GPS/endereço e `request_key` aos três | **CATALOG_READ_ONLY**; HTTP NÃO EXECUTADO |
| H-04 | Foto JPEG própria visível para A e B e negada a C/anônimo | **CATALOG_READ_ONLY**; HTTP NÃO EXECUTADO |
| H-05 | RPC `bj_get_request_location`: dono vs prestador não pago/pago; mudança de estado, cancelamento/revogação | **NOT_RUN**; requer fixture + revisão da RPC |
| H-06 | Seis RPCs F1 `SECURITY DEFINER`, inclusive tentativas adversariais de B/C e rollback | **NOT_RUN**; aprovado só em mocks |
| H-07 | F2/F3 v2: orçamentos múltiplos, reboque misto, seleção única, Auth/RLS real e transição de versão | **BLOCKED** (API hospedada legada incompatível) |
| H-08 | F4 PSP sandbox real: assinatura, valores serviço/deslocamento, 10%+10%, conciliação e idempotência | **BLOCKED** |
| H-09 | F5 notificação/chat/GPS após pagamento realmente validado e privacidade | **BLOCKED** |
| H-10 | Android físico, câmera, rede instável, limpeza, acessibilidade e consentimentos | **NOT_RUN** |

**Em hipótese alguma um HTTP GET ou um `PASS` de CI habilita F1–F7 no projeto hospedado.**

## Dependências de revisão antes de liberar

1. **G1**: relatório privado de backup, restauração independente, hashes, Auth e Storage.
2. **Compatibilidade**: revisar migração F1→F2/F3, assinatura única legada `bj_submit_quote`, ACL de foto antes de pagamento para múltiplos fornecedores, `SECURITY DEFINER` e revogação de acessos antigos.
3. **Fixturing**: preparar A/B/C e dados artificiais somente com autorização específica após G1, sem notificações reais e sem PSP.
4. **Homologação**: executar script HTTP A/B/C e validações de sessão/Storage, registrar PASS/FAIL/BLOCKED com hora, commit, ambiente e limpeza; continuar RPCs e Android como fases separadas.

**Nenhuma conta ou banco foi alterado pelo presente pacote. `G1=BLOCKED`, `RELEASE=NO_GO`.**
