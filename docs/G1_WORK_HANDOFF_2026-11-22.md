# Salva Motoca! — G1: estado consolidado após recuperação criptográfica (23/11/2026 UTC)

**STATUS INALTERADO: G1=BLOCKED; RELEASE=NO_GO.** Este texto substitui interpretações históricas incorretas de que o backup real não existiria. **O arquivo existe, foi decifrado autenticamente e seus SQLs foram verificados — mas nenhum banco PostgreSQL 17 isolado foi efetivamente restaurado.**

**Repositório público:** `bonecodesign/salvamotoca`, `main`. **Projeto Supabase existente apenas de TESTES:** `yivkqyjdeouxnwtwfekc`, sa-east-1, PostgreSQL 17.11. Não alterar o hospedado, não contratar serviços e não ativar a operação comercial.

## Evidência real já obtida — não refazer

1. [GitHub Actions Run 9](https://github.com/bonecodesign/salvamotoca/actions/runs/45074685352) conectou ao PostgreSQL, exportou o SQL e cifrou arquivo `SalvaMotoca-Supabase-TESTES-20261122T215644Z-run45074685352.tar.gz.age`.
2. O arquivo **existe** no Dropbox `/Aplicativos/Salva Motoca G1 Backup/backup-testes`. A pasta anterior `/Apps/Salva Motoca/backup-testes` é **outra pasta**, motivo da falsa ausência. [PR #118](https://github.com/bonecodesign/salvamotoca/pull/118) corrigiu o pin de identidade do cofre em `main`. O backup tem **24.484 bytes** e SHA-256 do **arquivo cifrado** `f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678`.
3. **Segunda cópia verificada por igualdade de bytes** na Biblioteca pessoal ChatGPT `App: Salva Motoca! / G1 - Backups criptografados`. Não houve upload de SQL em claro nem chave para essa Biblioteca.
4. As duas cópias da identidade privada age no Dropbox eram idênticas, mas sua representação textual estava malformada: hífen ausente no prefixo e checksum Bech32 inválido. A estrutura codificada da chave foi normalizada **somente em área temporária privada** e conferida pela chave pública da própria identidade. A decifragem criptográfica do backup real passou em X25519, HMAC de cabeçalho e ChaCha20-Poly1305 do payload. **A identidade corrigida não foi publicada, armazenada em chat nem sobrescrita no Dropbox; arquivos temporários locais foram eliminados após a análise.**
5. **O pacote SQL verdadeiro foi validado**, com 9 entradas, **7 de 7 SHA-256 do manifesto íntegros**, `project_ref` exato e `environment=TESTES`. O dump `data.sql` tem instruções `COPY` para **13 de 13 tabelas públicas**, 36 prestadores prospectados, 40 ofertas, 1 configuração e 11 migrações; o inventário declarou 0 usuários Auth e 0 objetos Storage.
6. **Conferência independente via SELECT no Supabase de testes**: as contagens `36/40/1/11` e as 13 tabelas com respectivos estados RLS e números de policies **correspondem ao backup**. O Supabase hospedado continua saudável e **não foi alterado**.
7. [PR #119](https://github.com/bonecodesign/salvamotoca/pull/119) integrada: `scripts/g1-repair-age-identity-offline.py` reproduz a normalização local, exige chave pública correspondente e autenticação completa do arquivo age; [CI #45102371821](https://github.com/bonecodesign/salvamotoca/actions/runs/45102371821) passou com **chaves/dados apenas fictícios**. Detalhes na [evidência G1 de 23/11](G1_CHAVE_RECUPERADA_PACOTE_ABERTO_2026-11-23.md).
8. Integrações anteriores permanecem: PRs #110/#111 autorização manual imutável; #114 e #118 preflight Dropbox; #115 ensaio relacional PG17/RPC com fixtures; #116 guarda Auth/Storage. O PR #108 permanece Draft desatualizado e **não deve ser mesclado diretamente**.

## O que NÃO foi provado

- **Nenhuma restauração real dos cinco arquivos SQL foi executada em segunda instância PostgreSQL 17.** Este ambiente de execução não possui servidor PG17 isolado nem Docker, e a conta Supabase conectada dispõe de um único projeto de testes existente e **nenhuma branch**. Não sobrescrever esse projeto saudável, não criar projeto pago nem transferir segredos reais a CI pública para contornar o bloqueio.
- **Backup SQL lógico não recupera automaticamente** Auth gerenciado, configuração externa, bytes de Storage, secrets, fornecedores ou Edge Functions; o backup é do formato histórico **anterior** à guarda de inventário Auth/Storage do PR #116 (não aplicar o verificador atual de 8 hashes sem tratamento versionado).
- Cinco dumps SQL separados podem não representar snapshot transacional único. Comparação por contagem, hash e estado RLS não elimina todas as divergências.
- Quatro tabelas públicas com RLS habilitada e 0 policies podem representar deny-by-default; seis RPCs SECURITY DEFINER requerem testes funcionais de autorização com atores fictícios. Não alterar ACLs reais sem auditoria.

## Próxima ação realmente pendente

**Executar restauração isolada verdadeira do pacote histórico já decifrável:** abrir a identidade de forma privada com o reparador offline do PR #119, verificar o pacote de 7 hashes e importar os cinco SQLs para uma instância PostgreSQL 17 **descartável, independente da hospedada**, cuidando de roles e dependências Supabase; comprovar tabelas/contagens, migrações, policies, RLS, ACLs, triggers, funções e FK. O uso de dados reais de prospectados deve permanecer privado, sem logs ou artifacts públicos. Tratar Auth/Storage como cobertura incompleta e registrar lacunas.

**Não executar novo backup só porque a chave textual estava malformada.** O backup e seus bytes já foram recuperados e validados. **G1=BLOCKED; RELEASE=NO_GO até restauração independente e gates de segurança.**
