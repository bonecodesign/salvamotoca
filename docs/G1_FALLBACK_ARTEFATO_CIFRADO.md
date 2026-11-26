# G1 — fallback temporário por artefato cifrado do GitHub Actions

Este procedimento é um caminho temporário quando a cópia Dropbox não está disponível.

## O que o workflow comprova

- exportação lógica consistente das schemas `public` e `supabase_migrations`;
- ausência de objetos em Storage antes da exportação;
- restauração do SQL em PostgreSQL 17 descartável;
- presença de ao menos uma tabela pública após a recuperação;
- cifragem com o recipient AGE já protegido no Environment;
- retenção de apenas sete dias do ciphertext como artefato privado do GitHub.

## O que ele não comprova

- restauração de Auth e Storage gerenciados;
- bytes físicos de Storage;
- cópia independente e durável no Dropbox;
- liberação comercial.

O workflow só pode ser executado manualmente na `main`, protegido pelo Environment `g1-backup-testes`, e não altera o Supabase hospedado.
