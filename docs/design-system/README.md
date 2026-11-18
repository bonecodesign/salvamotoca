# Salva Motoca! — Design System v0.1
**Data:** 13/11/2026 · **Status:** proposta para revisão · **Marca pública:** Salva Motoca!

## 1. Estratégia de marca
**Promessa:** aproximar motociclistas de borracharias, reparos delivery e serviços de reboque previstos no produto, por meio de localização, orçamento claro e profissionais verificados.
**Públicos:** motociclistas/motoboys, borracheiros e prestadores de reboque.
**Personalidade:** street, direta, solidária, prática e confiável.
**Tom:** humano, simples e respeitoso; não prometer chegada imediata, atendimento 24h nem preço fixo sem evidência.

## 2. Identidade visual em estudo
- **Lockup completo P&B:** lettering caligráfico graffiti “Salva Motoca!” com caminhonete/plataforma levando uma moto, e **pin separado à esquerda com pneu furado/murcho**.
- **Sem aro de pneu circular** ao redor da marca. **Sem cruz médica.**
- **Marca reduzida:** lettering sozinho; **ícone de app:** pin com pneu murcho simplificado.
- **Preto sobre branco e branco sobre preto** são os padrões da identidade. Amarelo/azul-escuro ficam nos elementos funcionais do aplicativo.
- Área de respiro inicial: 1× altura do ponto de exclamação ao redor; validar quando o vetor final estiver pronto.
- Tamanho mínimo de teste: logo completo 240 px, lettering 140 px, ícone 24/32/48/192 px. Evitar redução de ilustrações detalhadas para favicon.
- A arte selecionada é **referência raster**, ainda não o arquivo vetorial exato. O SVG desta pasta é apenas **símbolo esquemático experimental** e não deve substituir a marca aprovada.

## 3. Tokens
| Token | Valor | Finalidade |
|---|---|---|
| --sm-logo-black | #000000 | versão positiva da marca |
| --sm-logo-white | #FFFFFF | versão negativa |
| --sm-ink | #202936 | texto/superfícies escuras |
| --sm-yellow | #F6BF35 | ação e destaque na interface |
| --sm-bg | #EEF2F5 | fundo |
| --sm-surface | #FFFFFF | cartões e formulários |
| --sm-muted | #637081 | texto de apoio |
| --sm-border | #DFE5E9 | divisórias e bordas |
| --sm-success | #137455 | sucesso/online validado |
| --sm-danger | #AD3636 | falha/atenção |
| --sm-info | #265F98 | link e informações |

Contraste calculado: #202936 sobre branco 14,67:1; #202936 sobre amarelo 8,68:1; branco sobre amarelo 1,69:1 (**não usar para texto comum**); #637081 sobre branco 5,04:1.

## 4. Tipografia e layout
- **Logotipo:** lettering manual street; nunca usar como texto pequeno funcional.
- **UI:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
- Escala móvel (tamanho/linha em px): display 32/38; H1 28/34; H2 22/28; H3 18/24; corpo 16/24; apoio 14/20; legenda 12/16 (não para informações críticas).
- Pesos: 400 corpo, 600 labels, 700 títulos, 800 valores.
- Base de espaçamento 4 px: 4/8/12/16/20/24/32/40/48/64.
- Raio: 8 chips, 12 campo/botão, 16 cartão, 24 hero.
- Coluna móvel 360–720 px, margem lateral >=16 px e controles touchscreen preferencialmente >=44×44 px.

## 5. Componentes obrigatórios
| Componente | Estados / conteúdo essencial |
|---|---|
| CTA primário | normal, foco, desabilitado, carregando; “Solicitar orçamento” |
| CTA secundário | “Ver borracharias”, “Recusar proposta” |
| Card de serviço | mapa grátis, reparo no local, reboque conforme disponibilidade |
| Card de prestador | aguardando verificação / homologado / online recente / offline |
| Card de orçamento | preço do prestador + composição + aceitar/recusar |
| Presença | online, offline, conexão perdida, texto explícito |
| Status do pedido | solicitado, cotado, aguardando pagamento, sem prestador, cancelado |
| Aviso de piloto | sempre: “MVP demonstrativo — sem atendimento ou pagamento real” |
| Privacidade | localização exata só na etapa operacional legítima |
| Navegação | Início, Mapa, Pedidos, Perfil; foco visível e label |

**Regras de fluxo:** mapa grátis; orçamento pelo prestador; primeira recusa devolve prestador à fila; segunda o exclui apenas do pedido atual; novo pedido reinicia; pagamento real desativado no MVP.

## 6. Conteúdo e acessibilidade
Dizer “Encontre borracharias”, não “Resgate imediato”; “Nenhum prestador disponível no momento”, não “Alguém chega já”; “Aguardando pagamento”, não “Pago” sem confirmação de servidor. Reboque é modalidade prevista no projeto, não garantia de operação disponível.
**Meta WCAG 2.2 AA:** contraste de texto comum >=4,5:1, grande >=3:1, componentes informativos >=3:1 quando aplicável; não depender só da cor. Foco visível, labels, legibilidade a 200%, teclado, linguagem de erro e prefer-reduced-motion. Tamanho mínimo WCAG AA dos alvos de ponteiro é 24×24 CSS px, com exceções; o projeto adotará 44 px para ações principais.
Referência: https://www.w3c.br/traducoes/wcag/wcag22-pt-BR/

## 7. Governança e entregáveis
O material nesta pasta é **isolado** do app e não modifica `styles.css`, `assets/icon.svg`, `assets/icon-192.png` ou `manifest.webmanifest`. Não fazer merge antes de validar marca e aplicação.
**Próximos gates:** vetor definitivo a partir da arte escolhida; variantes P&B; teste de redução em 24–192 px; revisão com usuários e prestadores; testes visuais, acessibilidade e INPI antes de uso comercial.
**Arquivos:** `tokens.css`, `icon-pin-prototipo.svg`, `preview.html`.
**Documentação de referência:** FND-01, FND-03, PRODUTO_OFICIAL e estilos atuais.