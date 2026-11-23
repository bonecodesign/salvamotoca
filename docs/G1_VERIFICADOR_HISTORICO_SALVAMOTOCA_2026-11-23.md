# G1 — Verificação do arquivo histórico do Salva Motoca!

**Único projeto autorizado:** Salva Motoca!, repositório bonecodesign/salvamotoca, Supabase de TESTES yivkqyjdeouxnwtwfekc.

O backup real de 22/11/2026 foi criado antes da nova guarda de Auth/Storage do PR #116. Portanto, contém **7 entradas SHA-256 no manifesto**, enquanto o backup recente contém **8**. A versão anterior do verificador só aceitava 8 e rejeitava o histórico, mesmo com integridade comprovada.

## Duas versões aceitas, sem rebaixamento silencioso

- **HISTORICAL_PINNED**: 7 hashes, somente para o arquivo criptografado EXATO anteriormente auditado. SHA-256 do ciphertext fixo: f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678. Declara `G1_MANAGED_SCOPE_NOT_RESTORED=UNKNOWN_LEGACY`.
- **MANAGED_SCOPE_V2**: 8 hashes, mantém todas as guardas de inventário gerenciado Auth/Storage já integradas à main.
- **CI sintética**: G1_SYNTHETIC_CI_ONLY=true permite chaves e backups de teste descartáveis sem carregar qualquer arquivo real em GitHub.

Ambas as versões exigem projeto exato e ambiente TESTES, lista estrita de arquivos, metadados fechados, cobertura COPY das tabelas public, verificação do manifesto, recusa de caminhos não permitidos e inventário Storage objects = 0.

Aceitar o arquivo histórico como íntegro **não comprova restauração dos serviços gerenciados**; Auth/Storage exigem prova independente. O programa continua a imprimir G1_RESTORATION_VERIFIED=FALSE e G1=BLOCKED. Testes adversariais com fixtures fictícias validam divergência de projeto, alteração de SQL, ausência de arquivo, pin criptográfico e preservação das regras V2.

**Nada de outro projeto, nenhuma chave privada real, SQL real ou dados pessoais neste GitHub. Nenhuma ação no banco hospedado. G1=BLOCKED; RELEASE=NO_GO**.
