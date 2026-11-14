# F1 — Homologação no único Supabase | Procedimento seguro

**Projeto:** Salva Motoca. **Banco remoto:** PostgreSQL 17.11, Supabase ativo. **Status:** procedimento preparado; **não executado como Auth/Storage E2E remoto**.

Este roteiro foi montado para **não criar outro projeto Supabase, não contratar plano pago, não usar fotos ou endereços reais e não publicar chamados**. O PR #38 está em Draft, com envio F1 desativado.

## 1. Verificações já feitas, sem alterar banco

Em 14/11/2026, consultas de leitura confirmaram:

- A migration `20261114020317_f1_solicitacao_dados_foto_privada` consta aplicada; não rodá-la de novo.
- Cinco colunas da F1 existem, aceitam NULL em pedidos legados e têm CHECKs correspondentes.
- Trigger `sm_f1_photo_exists_on_insert` habilitado.
- Bucket privado `request-photos` com MIME `image/jpeg` e limite de 5 MB.
- Papéis autenticados sem SELECT irrestrito em `service_requests`; `address_details`, latitude e longitude não são expostos diretamente.
- No momento da consulta havia **0 solicitações** e **0 objetos** em `request-photos`.

Essas observações **não equivalem** a testes HTTP de permissões. Não dão garantia sobre tentativas feitas após a consulta.

## 2. Cópia recuperável — obrigatória antes de inserir dados de teste

No plano Free, o Supabase não oferece os mesmos backups diários dos planos pagos; a documentação recomenda `supabase db dump`. O backup **não** copia os bytes das fotos no Storage. Como ainda não há fotos, isso simplifica a primeira verificação, mas exige política para quando houver dados reais.

Documentação oficial:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

**Execução exclusivamente no computador do responsável ou ambiente privado sob seu controle**, nunca em workflow público:

1. Instalar Supabase CLI compatível e Docker; ler `supabase --version` e `supabase db dump --help` antes de usar (CLI v3 mudou padrões).
2. No Dashboard **Connect** do projeto atual, obter a **URL de conexão do banco**. Nunca colocar essa URL, senha, token de acesso nem arquivos `.sql` privados no GitHub ou nesta conversa.
3. Em diretório local privado com permissões restritas, usar `supabase db dump --db-url ... -f schema.sql`, `--role-only` para `roles.sql` e `--data-only --use-copy` para `data.sql`, seguindo as opções da CLI instalada. Usar nomes com data/hora, verificar códigos de saída e tamanhos dos três arquivos.
4. Verificar explicitamente **o que foi incluído/excluído** (o dump da CLI pode excluir esquemas administrados, como Auth/Storage); nunca assumir que uma cópia de `public` é recuperação completa de contas, credenciais, Storage, Auth ou configurações.
5. Proteger/exportar a cópia para armazenamento privado cifrado, com redundância fora do serviço de origem. **Não** enviar dumps para o PR.
6. **Testar a restauração em ambiente PostgreSQL/Supabase local descartável**, sem modificar o projeto hospedado; verificar tabelas, políticas, funções e números de registros. Confirmar manualmente quais componentes (Auth, bucket, configurações e arquivos Storage) exigem recuperação à parte.

**Critério de saída:** registrar internamente data da cópia, hashes, escopo exato, responsável e evidência de restauração. Sem restauração validada, marcar `backup pendente` — não fechar gate.

## 3. Ensaio Auth + Storage via API real (somente com contas fictícias controladas)

O conector de administração consultado oferece SQL, migrações e auditoria, mas **não oferece operações para efetuar login de contas fictícias nem upload/download Storage HTTP como usuário**. A execução real depende de acesso HTTP e duas ou três contas de teste legitimamente autenticadas, com credenciais guardadas fora do repositório. Nunca fabricar um JWT de usuário a partir de privilégios administrativos nem testar como `service_role` (bypassa RLS).

Condições **antes** do teste:

- Backup recuperável verificado.
- Confirmar que não há automação que transforme um pedido de teste em notificação, orçamento, deslocamento ou chamado real.
- Não inserir pedidos `service_requests` nem atribuir prestadores reais no primeiro ensaio. Começar **só** com um arquivo órfão fictício, em `request-photos`, de nome aleatório sob o ID de cliente A.
- Duas contas com credenciais de teste legítimas: A (autor) e C (terceiro). Prestador B será ensaiado **se e somente se** houver cadastro de teste aprovado e operação de pedidos comprovadamente isolada.
- JPEG sintético pequeno, sem rosto, placa, endereço, EXIF verdadeiro ou dado pessoal. Usar caminho `<uid-A>/<uuid-aleatorio>.jpg`; não sobrescrever arquivos (`upsert: false`).

Testes mínimos de Storage, nesta ordem:

| Identidade | Ação | Resultado esperado |
| --- | --- | --- |
| Anônimo | Listar/baixar arquivo privado | Negado / sem dados |
| A | Fazer upload no próprio namespace | Permitido; JPEG <= 5 MB |
| A | Baixar o arquivo original por API autenticada | Permitido |
| C | Baixar arquivo de A usando seu token | Negado |
| C | Gerar URL assinada para arquivo de A | Negado |
| A | Gerar URL assinada com prazo 60 segundos | Permitido |
| A | Tentar enviar arquivo em namespace de C | Negado |
| A | Excluir **somente o órfão criado nesta execução**, via **API Storage** | Permitido |
| A/C | Confirmar inexistência do arquivo após exclusão | Sem arquivo |

**Limite de URLs assinadas:** não compartilhar ou registrar o token na URL. Quem obtiver uma URL assinada válida poderá usá-la até expirar, independentemente da troca posterior de prestador. A troca impede gerar **novas** URLs, mas não revoga imediatamente as anteriores.

O teste com **prestador B** exige pedido fictício, equipe de teste e barreira verificada contra atendimento real; não pode ser iniciado apenas adicionando `provider_id` a um pedido qualquer. Ao testar reatribuição, verificar que B perde **novas autorizações**, C ganha e nenhuma localização detalhada fica acessível antes do pagamento. Fazer limpeza controlada sem exclusões SQL de `storage.objects`.

**Em caso de falha:** interromper antes de criar pedido, preservar as evidências técnicas sem conteúdo pessoal e eliminar apenas o arquivo de teste comprovadamente órfão via Storage API. Não desligar RLS, não usar chave `service_role` para obter um falso resultado positivo e não executar o script de rollback em produção.

## 4. Verificação de aparelhos

- Chrome desktop com dados fictícios, campos completos, serviços múltiplos e cancelamento.
- Android **físico**: câmera/galeria, permissões, foto grande, conectividade instável e rolagem/teclado.
- EXIF/GPS: a suíte já ensaia no Chrome real o reprocessamento de uma imagem sintética com IFD GPS e a ausência do bloco EXIF no JPEG gerado; testar também em aparelho Android físico.
- Recuperação de erro de upload/insert, perda de sessão, troca de usuário, `request_key` duplicada, links assinados e leitura negada ao terceiro.
- Nenhum desses ensaios deve produzir despacho, pagamento, notificação pública ou contratação.

## 5. Liberação

`f1TestRequestsEnabled: false` é somente proteção de interface. **Não é autorização no servidor**. Manter em `false` até cumprir os passos acima, analisar avisos de segurança e revisar PR #38.

**Sem backup confirmado, sem Auth/Storage HTTP reais, sem Android físico: F1 em revisão técnica, não homologada para público.**

## Limites de custo

- Não criar segundo projeto/branch hospedado no Supabase, contratar Pro, habilitar PITR ou integração paga.
- Consultas de leitura e testes automatizados existentes não criam serviços cobrados, mas uso de GitHub Actions/Supabase conta para os limites do plano; acompanhar cotas.
- Não iniciar teste de carga, envio em massa ou automação recorrente no serviço ativo.
