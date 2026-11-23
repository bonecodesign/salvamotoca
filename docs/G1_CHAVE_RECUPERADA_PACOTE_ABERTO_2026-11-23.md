# G1 — chave recuperada e pacote verdadeiro descriptografado (23/11/2026 UTC)

**Sem chave privada, conteúdo SQL ou dados pessoais neste documento.**

- O arquivo de identidade age das duas pastas privadas Dropbox foi lido por meio do conector autorizado **somente em ambiente efêmero protegido**. As duas cópias eram idênticas, mas inválidas para a CLI: faltava o separador no prefixo Bech32 e o checksum de apresentação não era válido.
- Os 32 bytes de chave privada no payload Bech32 permaneceram matematicamente válidos; uma representação canônica local, **não compartilhada**, produziu exatamente a chave pública anunciada no cabeçalho. Criptografia X25519, HMAC do cabeçalho e ChaCha20-Poly1305 do payload do backup real passaram sem modificação do ciphertext.
- Backup original: `SalvaMotoca-Supabase-TESTES-20261122T215644Z-run45074685352.tar.gz.age` (24.484 bytes), já preservado no Dropbox App Folder e na Biblioteca ChatGPT; SHA-256 público do **ciphertext** `f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678`.
- Inventário cifrado do formato histórico (9 entradas, 7 hashes SHA-256): **7/7 PASS**; `project_ref=yivkqyjdeouxnwtwfekc`, ambiente TESTES, `storage_objects=0`, `auth_users=0`.
- Dumps SQL: `COPY` das 13/13 tabelas de `public` presentes; 36 `prestadores_prospeccao`, 40 `ofertas_prospeccao`, 1 `configuracao_comercial`; 11 versões de migração. As contagens e o inventário das 13 tabelas (RLS e número de policies) **correspondem** à consulta independente SELECT no Supabase de testes, que não sofreu alterações.
- Foi adicionada uma ferramenta de reparo **somente local, com arquivos privados**, testada exclusivamente por fixture age sintética na CI. A chave real e o SQL real **não** foram gravados neste repositório, na CI, em issues ou logs.

## Limites

A descriptografia e os checksums foram comprovados; **nenhum PostgreSQL 17 isolado estava disponível neste ambiente**, nem há segunda instância Supabase existente na organização para restauração independente sem alterações/custos. O banco hospedado de testes está saudável e não deve ser sobrescrito para simular uma prova de recuperação. **Restauração real de SQL, RLS, ACL, gatilhos, extensões e Auth/Storage não foi realizada.**

**G1=BLOCKED; RELEASE=NO_GO** até restauração isolada e testes completos. A versão corrigida da chave privada só existiu no ambiente privado temporário da análise; a chave inválida armazenada no Dropbox não foi modificada. Para uso futuro, executar o reparador offline com o original, gravando em destino local privado separado e conferindo a autenticação do .age, nunca em CI ou chat.
