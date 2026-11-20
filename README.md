# Salva Motoca! Oficial

Marketplace de borracharias, borracharia delivery e reboque de motos para motociclistas e motoboys. **Operação inicial: Belo Horizonte e região metropolitana de MG.**

> **Status: MVP em desenvolvimento — não utilizar para solicitar atendimentos reais ou emergenciais.** O sistema ainda não processa pagamentos nem garante disponibilidade de profissionais.

## Produto oficial

- Aplicativo gratuito e mapa de borracharias gratuito.
- Atendimento de borracheiro no local e reboque de motos mediante orçamento e pagamento na plataforma.
- Escolha do profissional ou busca automática por proximidade/disponibilidade.
- Comunicação dentro do aplicativo, sem divulgação pública de telefone/WhatsApp.
- Comissão de **10% paga pelo motociclista e 10% descontada do prestador**, ambas somente sobre o valor do serviço delivery ou de reboque. A taxa de processamento é apresentada separadamente e é encargo do cliente; deslocamento não integra essa base. Consultar o mapa e ir diretamente à borracharia é gratuito, sem comissão.
- Cadastro e verificação dos prestadores antes de aparecerem no mapa.
- Desenvolvimento priorizando ferramentas gratuitas e custos iniciais mínimos.

## Estado do ambiente de testes conectado

O Supabase **Salva Motoca!** possui a base de testes e o MVP usa as tabelas atuais para autenticação, cadastros pendentes, pedidos e orçamentos de **teste**. Ele não é produção.

- Consulte [docs/INTEGRACAO_SUPABASE.md](docs/INTEGRACAO_SUPABASE.md) antes de qualquer mudança no banco.
- O endereço do pedido permanece protegido até a confirmação de pagamento real, que ainda não existe neste MVP.
- O app segue **não publicado**, sem pagamentos reais, sem atendimento garantido e sem despacho operacional.
- Os fornecedores de prospecção não são prestadores homologados; seu cadastro privado não é publicado.

### Disponibilidade e orçamentos

O prestador aprovado pode ficar **online** ou **offline**; a presença exige comunicação recente com o servidor. Ele informa o orçamento e o cliente decide aceitar ou recusar.

Na mesma solicitação, a primeira recusa mantém o prestador elegível para uma oportunidade futura; a segunda recusa do mesmo solicitante o exclui daquela rodada. Encerrar a solicitação e criar outra reinicia a contagem.

Aceitar o orçamento **não realiza pagamento**. A integração financeira permanece futura.

## Organização e estado de liberação

O banco está criado no Supabase de testes `yivkqyjdeouxnwtwfekc`, com tabelas operacionais, prospecção privada, RLS e migrações versionadas. O código do aplicativo e os testes de MVP estão nesta base; pagamentos e operação comercial ainda exigem homologação.

O estado atual de liberação é **NO-GO**: antes de qualquer piloto com pessoas reais, é obrigatório comprovar backup e restauração isolada, consolidar as mudanças em revisão, validar Auth/RLS com contas separadas e homologar a integração financeira.

Consulte [supabase/README.md](supabase/README.md) para regras de versionamento e [docs/PRODUTO_OFICIAL.md](docs/PRODUTO_OFICIAL.md) para a especificação vigente.

**Não inserir** senhas, tokens, chaves secretas, documentos pessoais, telefones internos de fornecedores nem dados reais de clientes no GitHub.

## Documentação fundadora — Salva Motoca!

O projeto possui um caderno fundador para alinhar negócio, produto, operação, custos, privacidade, governança e implantação, além de minutas jurídicas **não vigentes**:

- [Índice e governança dos documentos](docs/fundacao/00_INDICE_E_CONTROLE_DOCUMENTAL.md).
- [Manifesto, identidade e missão](docs/fundacao/01_MANIFESTO_IDENTIDADE.md).
- [Plano de negócio](docs/fundacao/02_PLANO_DE_NEGOCIO.md).
- [Requisitos e critérios de aceite](docs/fundacao/03_PRD_PRODUTO.md).
- [Manual operacional](docs/fundacao/04_MANUAL_OPERACIONAL.md).
- [Modelo econômico-financeiro](docs/fundacao/05_MODELO_ECONOMICO.md).
- [Mapa jurídico e proteção de dados](docs/fundacao/06_MAPA_JURIDICO_E_PRIVACIDADE.md).
- [Marcos de implantação e critérios de lançamento](docs/fundacao/07_PLANO_DE_IMPLANTACAO.md).
- [Registro de decisões](docs/fundacao/08_REGISTRO_DE_DECISOES.md).
- [Apresentação institucional](docs/fundacao/09_APRESENTACAO_INSTITUCIONAL.md).

Minutas para revisão jurídica: [Termos de Uso](docs/juridico/01_TERMOS_DE_USO_MINUTA.md), [Política de Privacidade](docs/juridico/02_POLITICA_DE_PRIVACIDADE_MINUTA.md), [Adesão do Prestador](docs/juridico/03_ADESAO_DO_PRESTADOR_MINUTA.md) e [Cancelamentos e Mediação](docs/juridico/04_CANCELAMENTOS_E_MEDIACAO_MINUTA.md).

**Nenhuma minuta é contrato vigente ou comprovante de homologação.** Os dados oficiais da empresa, meios de pagamento, obrigações tributárias e funcionamento comercial precisam ser definidos e revisados antes do lançamento.
