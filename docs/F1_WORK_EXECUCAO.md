# Salva Motoca! — entrega da homologação F1 ao ChatGPT Work

**Data-base:** 14/11/2026  
**Repositório:** https://github.com/bonecodesign/salvamotoca  
**Branch integrada:** main; PRs [#38](https://github.com/bonecodesign/salvamotoca/pull/38) e [#39](https://github.com/bonecodesign/salvamotoca/pull/39) já integrados.  
**Supabase ÚNICO:** Salva Motoca, referência yivkqyjdeouxnwtwfekc, sa-east-1, plano Free. **Não criar outro projeto ou branch remota.**  
**Estado atual:** código F1 integrado à main; flag f1TestRequestsEnabled=false; testes Node, Chrome e PostgreSQL isolado aprovados na main; **homologação real não concluída**.

Este arquivo é a instrução de continuidade para o Work. Comece aqui; não refaça levantamento de requisitos já resolvidos. Preserve a F1 e suas decisões. O objetivo é produzir evidências **efetivas**, corrigir defeitos e deixar pronta a decisão de homologação, sem ativar o app nem simular sucesso.

## Regras fixas de execução

1. **Não contratar serviços, trocar de plano, habilitar cobrança/PITR, criar novo Supabase, gerar atendimento real, chamar motoboy/prestador, disparar notificações externas, realizar pagamentos, liberar chat, publicar F1 ou alterar f1TestRequestsEnabled.**
2. **Não reaplicar** migration F1 já presente no banco e não executar rollback remoto. As alterações de código devem ser branch e PR próprios, com CI. Não modificar main diretamente sem revisão.
3. Nunca colocar segredos, JWT, senha, URLs assinadas, dumps de banco ou dados pessoais no GitHub, logs, anotações ou conversas. Usar sessão de login do Work e ambiente privado/segredos do próprio operador. No teste HTTP, somente publishable key e login normal; **nunca service_role**.
4. **Backup + teste de restauração são bloqueio obrigatório para dados reais ou liberação pública.** Para a pré-liberação técnica de um projeto F1 comprovadamente vazio, a única exceção aceita é a reconstrução técnica descrita em `docs/F1_PRELIBERACAO_FINAL.md`; ela permite preparar e revisar o ensaio, mas não ativa a F1 nem substitui a recuperação real antes de lançamento.
5. Se um teste falhar, registrar **FALHOU** ou **BLOQUEADO**, corrigir no ramo isolado e repetir; não marcar como aprovado por suposição.
6. No plano Free, acompanhar consumo de cotas. O teste A/C envia **no máximo um JPEG sintético pequeno**, sem imagem pessoal. O script não cria pedidos, usuários ou prestadores.

## Onde estamos (já concluído nesta conversa)

- PR #38 foi integrado na main, commit 65c58ae0da49662ef4d99f1c3b97f0642491499c.
- PR #39 reforçou o CI na main, commit c6bd7228a5b634e567c62ee8de95048f522a562b.
- Execução comprovada na main: https://github.com/bonecodesign/salvamotoca/actions/runs/43638389661 — 42 testes Node, 5 Chrome, PostgreSQL 17 isolado, três jobs aprovados.
- Supabase ativo, migration 20261114020317_f1_solicitacao_dados_foto_privada aplicada, bucket request-photos privado e limitado a JPEG de até 5 MiB.
- Na última leitura remota: 0 auth.users, 0 service_requests e 0 storage.objects do bucket. **Pode ter mudado; conferir antes dos testes.**
- Seis alertas de RPC SECURITY DEFINER para authenticated; anon não pode executá-las, mas falta validação adversarial com tokens de usuários reais.
- Documento de evidências: docs/F1_RELATORIO_HOMOLOGACAO_2026-11-14.md.
- Procedimento anterior: docs/F1_HOMOLOGACAO_SUPABASE_UNICO.md (algumas frases antigas de PR Draft/ambiente separado foram substituídas pelo presente roteiro).

## Pré-auditoria de automações já adiantada por aqui

Consulta somente de leitura ao Supabase em 14/11/2026:

- Não há Edge Functions implantadas no projeto neste momento (consultar novamente no Work antes de testar).
- O INSERT em public.service_requests aciona o trigger `bj_initial_attempt` (AFTER INSERT). A função `private.bj_track_initial_attempt()` registra `request_id` e `provider_id` em `public.bj_request_attempts`, sem chamar APIs externas no código atual. **Isso não prova ausência de webhooks, notificações ou integrações futuras.** Não inserir pedidos reais por conta desta leitura.
- O trigger `sm_f1_photo_exists_on_insert` valida a foto na inserção ou alteração do caminho.
- storage.objects tem triggers internos de proteção contra exclusão e atualização de timestamp; por isso **remover arquivos exclusivamente pela Storage API** e confirmar resultado.
- Há um precheck de SQL de **leitura apenas**, pronto para o painel: `docs/F1_WORK_PRECHECK_READONLY.sql`. Executar e comparar com o relatório anterior, sem guardar dados pessoais.

## 0. Preparação no Work — sem escrever no banco

1. Abrir GitHub e Supabase em sessão autenticada, usando os conectores do usuário; **não solicitar que o usuário compartilhe senhas na conversa**.
2. Ler este arquivo, o relatório anterior, migrations e testes da F1, RLS do bucket, políticas de pedidos e o estado da main no GitHub. Conferir se a flag continua false.
3. Inspecionar possíveis hooks/triggers/webhooks/Edge Functions/cron/notificações que possam reagir a criação de contas, upload e, futuramente, pedidos. Se houver risco de ação real, **interromper antes de gravar**.
4. Rodar testes existentes em branch de trabalho ou confirmar GitHub Actions: workflow F1 (Node/Chrome/Postgres). Em caso de mudança no código, repetir.
5. Rodar o script **somente em modo planejamento**, sem credenciais:
   node scripts/f1-work-storage-e2e.mjs --plan
6. Conferir que scripts/f1-work-storage-e2e.mjs e tests/f1-work-storage-e2e.test.mjs foram incorporados à main, e que os testes offline passaram. O modo --plan não acessa rede.

## 1. Backup e recuperação — primeiro bloqueio real

1. No painel Supabase atual, consultar Status/Backups e obter a URL de conexão de banco **somente em local privado**. Não alterar o projeto e não gastar com upgrade. Avaliar as instruções vigentes de https://supabase.com/docs/guides/platform/backups e https://supabase.com/docs/reference/cli/supabase-db-dump.
2. Conferir a versão do CLI pelo comando supabase --version e as opções exatas por supabase db dump --help. Na versão instalada, exportar schema, roles e dados, com atenção aos esquemas administrados (Auth, Storage) e à política de retenção. Não supor que o dump cobre arquivos físicos Storage ou configurações de serviço.
3. Salvar dumps privados fora do repositório, protegidos por criptografia/permissões; verificar integridade, escopo e hashes. Nenhuma chave ou senha pode ser enviada para GitHub Actions.
4. **Restaurar em ambiente local DESCARTÁVEL, sem conexões com o Supabase hospedado.** Conferir esquema, checks, RLS, funções e contagens. Registrar precisamente o que a restauração demonstrou e o que não foi copiado (Auth, Storage, metadados/bytes, configurações).
5. Só depois da restauração comprovada criar um arquivo **privado e local** de evidência, nunca versionado, por exemplo /secure/f1-backup-proof.json, com:
   {
     "project_ref": "yivkqyjdeouxnwtwfekc",
     "backup_verified": true,
     "restore_verified": true,
     "scope_reviewed": true,
     "checked_at": "DATA_UTC_ISO_REAL"
   }
   Inserir somente valores verdadeiros efetivamente comprovados. **Se não conseguir restaurar, parar aqui: status BLOQUEADO POR BACKUP.**

## 2. Autenticação e Storage reais A/C — script já preparado

Com backup restaurado e contas fictícias sob controle, sem atendimentos reais:

1. Criar duas contas Auth *fictícias e legítimas* no painel (A, cliente-autor; C, terceiro), de e-mails de teste verificados. O script NÃO cria usuários. Guardar senhas em ambiente privado. Validar que nenhuma conta é prestador real.
2. Criar um arquivo privado de variáveis de ambiente **fora do repositório**, permissões restritas (ex.: /secure/f1-work.env). Preencher as variáveis abaixo apenas no ambiente seguro:
   - F1_SUPABASE_URL=https://yivkqyjdeouxnwtwfekc.supabase.co
   - F1_PUBLISHABLE_KEY=chave_publica_sb_publishable_do_projeto
   - F1_TEST_A_EMAIL / F1_TEST_A_PASSWORD
   - F1_TEST_C_EMAIL / F1_TEST_C_PASSWORD
   - F1_BACKUP_RESTORE_VERIFIED=yes
   - F1_BACKUP_REPORT_PATH=/secure/f1-backup-proof.json
   - F1_WORK_ACK=F1_STORAGE_ONLY_yivkqyjdeouxnwtwfekc
3. Com Node.js 22+ instalado, executar:
   node --env-file=/secure/f1-work.env scripts/f1-work-storage-e2e.mjs --run
4. O script autentica A/C via Auth, gera um **único JPEG sintético pequeno** no bucket privado sob UUID aleatório do autor A, compara bytes baixados por A, exige que C/anônimo não acessem, exige geração de URL assinada apenas por A e remove o único objeto via Storage API.
5. Conferir saída **PASS** de todas as verificações e da limpeza. O script **não** testa prestador B, despacho ou criação de pedido. Se ocorrer falha de limpeza, localizar **apenas o arquivo de teste** e eliminá-lo pela Storage API com a identidade A; não usar DELETE SQL em storage.objects.
6. Não registrar tokens, senhas ou signed URLs no relatório. Resultados aceitos: PASS, FAIL com passo e HTTP status, ou BLOCKED com justificativa. Se o script não for executável no Work, seguir os mesmos passos via painel/browser autenticados e registrar a evidência efetiva, nunca presumida.

**Observação sobre URL assinada:** alguém que já a obteve pode acessar durante sua validade mesmo após troca de prestador; esse comportamento não equivale a falha RLS, mas precisa ser documentado e o prazo permanecer mínimo.

## 3. Prestador B / pedido real fictício — somente após revisar automações

- Inspecionar as operações de criação de pedido, validação de foto e notificação. Se houver disparo automático externo/real ou contato com prestadores, **não criar pedidos** no projeto hospedado. Preferir simulação local isolada.
- Com isolamento comprovado e contas fictícias apropriadas, Work pode elaborar um plano detalhado e solicitar autorização específica antes de gravar pedido fictício; não fazer isso implicitamente a partir deste roteiro.
- Verificar políticas: cliente A, prestador B designado, terceiro C, acesso a foto, endereço exato **somente após pagamento confirmado**, URL assinada, mudança de prestador e encerramento de pedido. **Não simular pagamento real**.
- Testar tentativas adversariais de RPC SECURITY DEFINER apenas em cenário artificial isolado e legitimamente autenticado. Nunca invocar funções de alteração de pedido com IDs reais.

## 4. Dispositivos

- Rodar navegação real em navegador desktop e em viewport móvel via Work. Se o Work não expuser recurso de dispositivo Android físico, **registrar como bloqueio humano**; emulação não equivale a aparelho.
- No Android físico: câmera, galeria, foto grande/EXIF, permissões de localização, teclado, acessibilidade, perda/retorno da internet, troca de conta, retry e encerramento.
- Só marcar "Android físico aprovado" após teste de verdade com evidência. Nenhuma funcionalidade comercial deve ser ativada para esses testes.

## 5. Resultado e fechamento

Registrar os resultados em branch/PR no GitHub, usando a estrutura de docs/F1_WORK_RESULTADOS_MODELO.md. Em cada gate: **PASSOU**, **FALHOU**, **BLOQUEADO** ou **NÃO EXECUTADO** com data, ferramenta, resultado e referência (sem credenciais). 

A F1 só pode ser classificada **HOMOLOGADA PONTA A PONTA** após backup com restauração, HTTP Auth/Storage A/B/C, fluxo seguro com pedido, Android físico, segurança operacional de órfãos/upload, análise de RPCs e aprovação do responsável. Até lá, a classificação permanece **HOMOLOGAÇÃO TÉCNICA PARCIAL** e f1TestRequestsEnabled=false.

Para preparar o projeto até o último instante anterior à ativação, seguir também `docs/F1_PRELIBERACAO_FINAL.md`. Esse checklist separa claramente a reconstrução técnica já comprovável dos gates que dependem de execução real, sem afrouxar os requisitos de lançamento.

## Prompt operacional curto para entregar ao Work

> Continue a homologação da F1 do Salva Motoca! no repositório bonecodesign/salvamotoca. Comece obrigatoriamente por docs/F1_WORK_EXECUCAO.md, docs/F1_RELATORIO_HOMOLOGACAO_2026-11-14.md e scripts/f1-work-storage-e2e.mjs. O projeto Supabase autorizado é somente yivkqyjdeouxnwtwfekc. O código F1 e os testes CI já foram integrados na main. Não crie outro projeto, não contrate serviços, não ative a flag, não publique e não provoque despachos, notificações nem pagamentos reais. Primeiro realize backup privado e restauração comprovada; só depois crie contas de teste e execute testes HTTP de Auth/Storage A/C por script com gate explícito. Avance para B/pedidos apenas com isolamento demonstrado e autorização específica. Faça correções em branch e PR; anote provas reais e bloqueios no modelo de relatório, distinguindo emulação de Android físico. Entregue exatamente o que foi comprovado e o que falta, sem declarar homologação integral enquanto houver gates pendentes.
