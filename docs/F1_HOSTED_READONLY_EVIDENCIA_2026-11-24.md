# F1 — preflight HTTP do Supabase hospedado, 24/11/2026

**F1_HOSTED_READONLY_CHECKS=4/4; RELEASE=NO_GO.**

[Run 45366923643](https://github.com/bonecodesign/salvamotoca/actions/runs/45366923643), job 138350919026, head d987a74e4ff6d1a2f129ce12eb5452dd394d007b, concluído com sucesso em 24/11/2026 09:37 UTC. Quatro GETs usando somente a chave publicável do aplicativo; sem registrar corpos de respostas.

| Prova | HTTP | Resultado |
| --- | --- | --- |
| Auth settings alcançável | 200 | PASS |
| REST catálogo público, limit=0 | 200 | PASS |
| REST pedidos, anônimo, limit=0 | 401 | PASS |
| REST endereço exato, anônimo, limit=0 | 401 | PASS |

Nenhum login de usuário, POST, RPC, cadastro, upload, pedido ou pagamento. HOSTED_WRITES=NONE. A prova de conectividade é real, mas limitada a requisições anônimas: não certifica acesso autenticado nem Storage hospedado. O run não usa credenciais privadas e não autoriza introduzi-las no CI.

## Próximo gate
A recuperação histórica de testes já foi comprovada na PR #123 e a homologação HTTP local na #124. Para executar o roteiro A/C hospedado, ainda são necessários dois usuários fictícios legítimos, ambiente privado com HTTPS acessível, prova privada de backup dentro do prazo do script e autorização específica. Não substituir autenticação real por inserções SQL em auth.users nem usar service_role no script de teste. Não enviar senhas ao GitHub público. Manter as seis flags desligadas. Android físico continua pendente.
