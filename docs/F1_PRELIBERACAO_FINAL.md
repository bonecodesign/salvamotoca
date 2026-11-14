# F1 — Pré-liberação controlada

**Aplicativo:** Salva Motoca!  
**Projeto Supabase único:** `yivkqyjdeouxnwtwfekc`  
**Estado obrigatório nesta fase:** `f1TestRequestsEnabled=false`  
**Finalidade:** deixar a F1 pronta para a execução real controlada, sem publicar, ativar, cobrar, despachar ou usar dados reais.

## Decisão de governança

A F1 pode avançar até a condição de **pronta para execução controlada** mediante prova de reconstrução técnica do banco vazio: migrations versionadas, testes PostgreSQL descartáveis, rollback ensaiado, CI aprovado e verificação remota somente leitura.

Isso **não equivale a um backup restaurado do projeto hospedado**. Portanto, não autoriza lançamento público, ativação da flag, inclusão de dados reais, pagamentos, chat, notificações ou atendimento. Antes de qualquer operação comercial ou dado de produção, backup privado e restauração descartável continuam obrigatórios.

## Evidências já aceitas para a pré-liberação

| Item | Situação | Evidência |
| --- | --- | --- |
| Código F1 integrado | PASSOU | PRs #38 e #39 na `main` |
| Flag de envio desligada | PASSOU | `config.js`: `f1TestRequestsEnabled=false` |
| Migrations e rollback F1 | PASSOU | workflow PostgreSQL descartável aprovado |
| Regras de formulário e retry | PASSOU | testes Node F1 |
| Navegador desktop e viewport móvel | PASSOU | job Chrome do workflow F1 |
| Banco remoto sem massa de testes F1 | PASSOU | precheck somente leitura |
| Bucket privado e RLS | PASSOU | migration + precheck remoto |
| Backup restaurado do projeto hospedado | BLOQUEADO | exige dump privado e restore fora do projeto |
| Auth/Storage HTTP real A/C | NÃO EXECUTADO | preparado por script, sem credenciais no repositório |
| Pedido fictício isolado | NÃO EXECUTADO | exige revisão final e autorização específica |
| Android físico | NÃO EXECUTADO | exige teste humano em aparelho real |

## Condição exata para iniciar a execução controlada

Todos os itens abaixo devem estar verdadeiros ao mesmo tempo:

- [ ] Confirmar novamente que a flag continua `false`.
- [ ] Executar `docs/F1_WORK_PRECHECK_READONLY.sql` e registrar somente contagens/estado, nunca dados pessoais.
- [ ] Confirmar que não há Edge Function, webhook, cron ou integração que possa contatar pessoas, cobrar ou despachar.
- [ ] Verificar que `request-photos` está privado, JPEG até 5 MiB e sem objetos não esperados.
- [ ] Ter autorização específica do responsável para criar contas Auth fictícias e gravar no máximo um JPEG sintético.
- [ ] Quando houver dados reais ou intenção de lançamento: comprovar antes backup privado + restauração descartável. A exceção de reconstrução técnica não cobre esse cenário.

## Pacote de execução final já preparado

| Ação controlada | Artefato | Limite |
| --- | --- | --- |
| Inspeção sem escrita | `docs/F1_WORK_PRECHECK_READONLY.sql` | somente SELECT |
| Conferência de proteção antes da escrita | `node scripts/f1-work-storage-e2e.mjs --plan` | offline, sem rede |
| Auth/Storage A/C | `scripts/f1-work-storage-e2e.mjs --run` | duas contas fictícias, um JPEG sintético, limpeza obrigatória |
| Evidência | `docs/F1_WORK_RESULTADOS_MODELO.md` | sem senhas, JWTs, URLs assinadas ou PII |
| Teste humano | seção Android abaixo | sem ativar operação comercial |

O modo `--run` continua bloqueado por padrão: exige ACK explícito do projeto, publishable key, duas identidades distintas e prova privada de recuperação. Ele não cria pedido, prestador, orçamento, pagamento, chat ou notificação.

## Roteiro de Android físico

Executar apenas com conta fictícia e, antes de qualquer lançamento, registrar PASSOU/FALHOU/BLOQUEADO:

1. Abrir o formulário com a flag ainda desligada e confirmar que nenhum pedido é enviado.
2. Validar câmera e galeria em foto de teste, imagem acima do limite, cancelamento e EXIF.
3. Validar permissões de localização, negação de permissão, teclado, leitor de tela e contraste.
4. Alternar entre rede ativa, perda de rede e retorno; confirmar que não surge pedido duplicado.
5. Trocar de conta durante preenchimento/upload; confirmar que dados e imagem não cruzam identidades.
6. Confirmar que nenhum telefone, WhatsApp, chat, pagamento, prestador ou despacho é exposto/acionado.

## Última barreira antes da ativação real

Não alterar `f1TestRequestsEnabled` nesta etapa. A ativação só pode ser proposta em PR separado depois de:

1. backup privado restaurado e conferido;
2. Auth/Storage real A/C aprovado e limpo;
3. pedido fictício isolado aprovado, sem integrações externas;
4. Android físico aprovado;
5. revisão das RPCs privilegiadas, rotina de fotos órfãs e limites operacionais;
6. aprovação humana expressa para a liberação.

Enquanto qualquer item estiver pendente, a classificação obrigatória é **HOMOLOGAÇÃO TÉCNICA PARCIAL — LIBERAÇÃO PÚBLICA BLOQUEADA**.
