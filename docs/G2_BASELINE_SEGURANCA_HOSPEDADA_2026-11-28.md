# G2 — baseline de segurança hospedada (28/11/2026 BRT)

Escopo: leitura no único Supabase de TESTES `yivkqyjdeouxnwtwfekc`. Nenhuma escrita, login, sessão, usuário Auth, upload, objeto Storage, migration, alteração de função ou operação comercial foi executada.

## Estado da plataforma

- Projeto: `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Health advisor: nenhum achado.
- As quatro tabelas com RLS sem policy continuam em **deny-by-default**; não foi adicionada policy permissiva.
- As seis RPCs legadas continuam `SECURITY DEFINER` e acessíveis apenas a `authenticated`; `PUBLIC` e `anon` não possuem `EXECUTE`.
- As seis têm `search_path` vazio e referenciam `auth.uid()`.

## Interpretação

O alerta do advisor para funções `SECURITY DEFINER` permanece relevante, mas não prova exploração: ele indica que a autorização funcional deve ser comprovada com atores legítimos e isolados. Revogar as funções sem uma rota substituta testada quebraria a jornada e não é uma correção segura.

O ensaio reversível do PR #158 já prova, apenas em PostgreSQL descartável, que as seis rotas podem ser bloqueadas e revertidas sem deixar alterações. Ele não autoriza nem substitui a validação hospedada.

## Condição objetiva para promover G2

Antes de qualquer escrita hospedada, devem coexistir:

1. recuperação G1 apropriada ao escopo de Auth/Storage que será criado;
2. dois ou mais usuários Auth fictícios legítimos, criados por fluxo Auth normal em ambiente privado;
3. roteiro A/B/C que comprove isolamento de dados, emissão curta de URL assinada, negação do terceiro e limpeza via Storage API;
4. nenhuma credencial privada em GitHub, logs ou artefatos;
5. registro privado dos resultados e remoção dos dados fictícios após a execução.

Enquanto esses requisitos não forem atendidos, a decisão é **G2=BLOCKED; RELEASE=NO_GO**.