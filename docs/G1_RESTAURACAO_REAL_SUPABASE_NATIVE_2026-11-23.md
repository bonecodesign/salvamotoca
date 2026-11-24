# G1 — restauração real comprovada em Supabase Native isolado (23/11/2026 BRT)

**G1_REAL_BACKUP_RESTORE=PASS — pacote histórico de TESTES; RELEASE=NO_GO.** Esta evidência substitui a afirmação histórica de que a restauração real não ocorreu. O aceite do escopo de recuperação integral futura e a homologação de produção permanecem separados.

## Infraestrutura e proteção
- GitHub Actions [run 45304227988](https://github.com/bonecodesign/salvamotoca/actions/runs/45304227988), conclusão success: artefato público 14880186521 (278.825.439 bytes) com executáveis/cache oficiais Supabase CLI 3.2.0, PostgreSQL 17.12.0.000-r0, Auth v2.198.0-r0, Storage v1.96.0-r0 e PostgREST v16.5-r0, lock e hashes conferidos após transporte privado. Não contém backup real, identidade privada, credenciais reais ou dados pessoais. Run anterior 45304166718 forneceu pacote parcial 14879484495. Não confundir CI pública com restauração privada.
- Runtime local Native iniciado com banco, REST, Auth e Storage saudáveis; API somente loopback, conta de sistema exclusiva, sem link com projeto hospedado, sem Docker e sem contratação de serviço. Base public vazia antes do restore; 27 tabelas Auth e 12 Storage; extensões pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.2 e uuid-ossp 1.1.
- Arquivo histórico cifrado já guardado no Dropbox e Biblioteca privada, SHA-256 f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678, 24.484 bytes. A identidade foi tratada somente para a recuperação autorizada, normalizada temporariamente e autenticada com age; nenhum segredo divulgado. A cópia original não foi sobrescrita.

## Importação real
9 membros, 7/7 hashes SHA-256 verificados, project_ref de TESTES conferido. Os cinco SQL (roles, schema, data, history_schema, history_data) importados juntos com psql --single-transaction e ON_ERROR_STOP=1, retorno 0. Comparação por multiconjunto de linhas COPY, incluindo valores completos sem imprimi-los, com timezone UTC e formato ISO:
- 13/13 blocos public: 80 registros; 36 prospectados, 40 ofertas, 1 configuração e 3 categorias.
- 26/26 blocos Auth: 0 registros.
- 7/7 blocos Storage: 1 linha de configuração de bucket, 0 objetos.
- 1/1 bloco de histórico: 11 migrações.
- **47/47 blocos iguais, 0 divergências.** Inventário das 13 tabelas RLS/policies igual; 16 FKs conferidas por anti-join, sem violações; nenhum índice inválido.

## Correção indispensável de segurança (somente destino local)
O dump lógico não continha as 3 policies em storage.objects; as ACLs default do novo ambiente concediam EXECUTE a anon nas 6 funções privilegiadas e permissões implícitas de objetos public. Não declarar restore seguro apenas pelo retorno zero do psql.
- Reconciliar ACLs de objetos public: revogar grants de tabelas, sequences e funções para PUBLIC/anon/authenticated/service_role **somente no destino isolado**, reaplicar os 79 grants explícitos de objetos do schema.sql autenticado, preservar EXECUTE PUBLIC do trigger sm_f1_verify_photo_exists (comportamento original).
- Recriar exatamente as 3 policies de foto (upload, leitura de participantes e exclusão de foto não vinculada) da migration 20261114020317_f1_solicitacao_dados_foto_privada.sql. RLS de storage.objects permaneceu habilitada.
- Comparação com o Supabase de TESTES atual por SELECT somente leitura, antes de inserir fixtures. Hashes MD5 sobre JSON canônico ordenado de metadados, não sobre dados de pessoas:

| Categoria | Entradas | Digest igual origem/destino |
| --- | ---: | --- |
| ACL de colunas | 36 | 84150992bbd2954ae5d09390c5c5fe5c |
| Constraints | 65 | fd84a3e8ef482daf0a20d42eb26c1f41 |
| ACL de funções | 29 | 469d646c768a49b16cbf3ff02f47cf50 |
| Definições de funções public/private | 9 | b74739d2d4f1c667a84be82426a2d42a |
| Índices | 29 | 45b96029b2305a33a2753c95aa18619f |
| Policies public e storage.objects | 20 | 281ac188b19a9776aa6acea92265d7f6 |
| ACL de relações e sequences | 234 | 169d2028a98afc99ed18aa1a99fe57cf |
| RLS e proprietários das tabelas | 13 | 6e7ac4f0cd5fc614b1f6c5158fbb80ca |
| Triggers públicos não internos | 2 | 10e04649575d9ab755f3ea9205d52e4c |

**9/9 categorias de catálogo coincidiram integralmente.** 0/6 SECURITY DEFINER executáveis por anon. 17 policies public e 3 policies Storage. Bucket request-photos privado, JPEG, limite 5 MiB. MD5 usado como comparação de catálogo, não para autenticação criptográfica.

## Teste funcional da recuperação real
Após a verificação de igualdade do backup, foram criados localmente 3 usuários fictícios (cliente, prestador e terceiro) por Auth admin **somente do runtime descartável** e autenticados com senhas efêmeras, usando JWTs reais locais; nenhuma conta foi criada no hospedado. 34 verificações aprovadas. Login dos 3 atores; presença permitida ao prestador homologado, negada a terceiro/anônimo; upload JPEG sintético permitido ao autor, negado a namespace alheio; download do autor com igualdade exata de bytes; terceiro/anônimo/prestador não designado negados; inserção de pedido com foto válida; prestador designado passa a ler foto, terceiro continua negado; RLS retorna somente pedido do participante; colunas de localização/endereços bloqueadas; RPC localização anônimo bloqueado, cliente autorizado, prestador sem pagamento não recebe dados; orçamento permitido apenas ao prestador atribuído, decisão apenas ao cliente; aceite muda para awaiting_payment e nenhum pagamento foi criado. Nenhum fornecedor ou sistema externo contatado.
Não foi realizado teste de URL assinada, troca de prestador após emissão de URL, encerramento bilateral, aparelho físico ou pagamento; não confundir os testes de restauração com homologação F1 completa.

## Escopo e próximos passos
- Recuperação real do banco histórico de TESTES e segurança funcional representativa **comprovadas**. Este não é backup integral de um futuro ambiente com usuários ou objetos: a origem tinha zero usuários Auth e zero objetos físicos, o pacote antecede inventário gerenciado V2; a restauração exigiu recuperação das policies e ACLs via fontes verificadas. Secrets, configurações externas, bytes de Storage quando existirem, Auth gerenciado com dados reais, Edge Functions e consistência transacional de múltiplos dumps continuam fora da prova. Não usar este resultado para liberar produção.
- A etapa seguinte é incorporar reconciliador verificável/fail-closed ao procedimento, produzir evidência de encerramento do ambiente temporário, atualizar o handoff e revisar gate G1 do escopo de testes. Supabase hospedado acessado apenas via SELECT; nenhuma operação comercial ativada. Não refazer o backup histórico por falta de restauração — a restauração ocorreu.
