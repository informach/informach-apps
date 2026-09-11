# Nova página de vendas do Cozya

Implementação de 11/09/2026, a partir da proposta aprovada pelo usuário. Entrega no aplicativo Next.js existente; publicação em produção é uma etapa separada.

## Resultado

A home apresenta o Cozya como organização da rotina de quem cozinha: receitas, semana, porções, compras, preparo e repetição. A primeira dobra usa a chamada “Seu jantar resolvido antes de a fome chegar”, fotografia editorial e um planejamento legível. As demais seções demonstram o uso, conectam jantar e marmita, apresentam o acervo e explicam a oferta.

Capturas reais da implementação: [primeira dobra](evidence/home-primeira-dobra.png), [página no computador](evidence/home-desktop.png) e [página no celular](evidence/home-mobile.png). O pequeno indicador “N” pertence ao servidor de desenvolvimento.

## Conferência da proposta

| Requisito | Entrega |
| --- | --- |
| Benefício principal e CTA | Hero com convite para planejar a primeira semana; condições do teste junto ao botão |
| Demonstração antes do cadastro | Três abas acessíveis: semana, compras e cozinha; estado local e reinício do exemplo |
| Porções coerentes | Receitas autorais do acervo inicial e funções reais de ajuste/consolidação do aplicativo |
| Compras após mudar o plano | Aviso de atualização pendente; quantidade anterior permanece até atualizar; marcações alteradas são limpas e as demais preservadas |
| Preparo | Ingredientes escalados e quatro etapas marcáveis da omelete |
| Marmitas | Fotografia de duas refeições e duas marmitas, com explicação de quatro porções |
| Captura com IA no contexto do acervo | Exemplo visual de texto organizado, modalidades foto/texto/voz e revisão antes de salvar |
| Repetir a semana | Exemplo interativo copia dois horários vazios e preserva a quarta-feira já planejada |
| Preço atual | R$ 14,90/mês e R$ 149/ano; valores e economia derivados do catálogo existente |
| Oferta clara | 50 créditos por mês nos dois ciclos, total anual em destaque, Free e limites do teste explicados |
| Confiança | FAQ nativo; sem avaliações, depoimentos, números de usuários ou resultados financeiros inventados |
| Direção visual | Creme, marinho e laranja; imagens editoriais geradas para a página; tipografia do Cozya; componentes e textos em HTML |
| Celular e acessibilidade | Verificado em 320, 390, 768 e 1440 px; teclado, foco, menu, redução de movimento e áreas principais de toque de pelo menos 44 px |
| Busca e compartilhamento | Título, descrição, canonical, Open Graph e Twitter alinhados à nova proposta; imagem social 1200 × 630 |
| Carregamento | Fotografias WebP, dimensionamento responsivo via Next Image, preload da imagem principal e carregamento adiado da segunda fotografia |

O CTA fixo no rodapé móvel era opcional na proposta. A entrega usa os convites distribuídos na página e mantém os controles da demonstração livres. A composição de captura usa texto de exemplo em um caderno visual; não é uma chamada real à IA. A demo de repetição mantém as duas semanas visíveis em sequência no celular para permitir comparação sem um controle adicional.

## Qualidade e correções encontradas durante a implementação

- O loading global anterior envolvia a home em streaming: com JavaScript desativado, o visitante recebia a tela de carregamento e o conteúdo permanecia oculto. O componente foi preservado e aplicado somente aos grupos `(app)` e `(auth)`. A página pública entrega seu conteúdo legível diretamente. A organização segue a [documentação oficial sobre escopo de loading por grupos de rotas](https://nextjs.org/docs/app/getting-started/project-structure#opting-for-loading-skeletons-on-a-specific-route), consultada via Context7.
- Controles do exemplo são habilitados após a hidratação, evitando aceitar ações antes de seus eventos estarem disponíveis. Sem JavaScript, o conteúdo, a oferta, o FAQ e os links continuam disponíveis; a demonstração explica que precisa de JavaScript. O aplicativo autenticado continua dependendo dele.
- Checkboxes têm a área inteira da linha como alvo. O foco por teclado permanece visível; as abas aceitam setas e recebem foco ao avançar de etapa.
- Textos da interface demonstrativa foram ampliados após inspeção visual. Ingredientes não somáveis mostram a observação de conferência, incluindo a receita correspondente.
- Links de navegação também funcionam quando acionados a partir de Termos ou Privacidade.
- Componentes e animações da antiga home sem uso foram retirados. A paleta da página é local ao marketing e preserva o tema do aplicativo e do onboarding.

## Imagens e limites da entrega

As duas fotografias e a imagem social foram geradas com a ferramenta integrada de imagens. Os [prompts e arquivos](imagens-implementacao.md) estão registrados. As fotografias são editoriais e não representam teste culinário humano das receitas.

As demonstrações não chamam IA, Stripe ou endpoints de gravação. A seleção feita nelas não é transferida para uma conta. Os links mensais e anuais mantêm os parâmetros existentes do onboarding; catálogo, preços e identificadores Stripe não foram alterados nesta implementação.

Não foi realizada publicação ou compra real nesta entrega. A validação de funcionamento publicada e as sessões com pessoas do público continuam como etapas operacionais da proposta; conversão comercial e métricas de desempenho em usuários reais ainda não foram medidas.

## Verificação

Verificações concluídas em 11/09/2026, após as últimas alterações funcionais:

| Comando | Resultado | Código de saída |
| --- | --- | --- |
| `pnpm check` | 812 arquivos verificados, sem erros ou correções | 0 |
| `pnpm typecheck` | 11 tarefas aprovadas, 10 reutilizadas do cache; Cozya executado novamente; 10,336 s | 0 |
| `pnpm exec turbo test --concurrency=1` | 6 tarefas aprovadas, 5 reutilizadas do cache; Cozya executado novamente; 27,241 s | 0 |
| `pnpm --filter @informach/cozya e2e` | 7 testes de navegador aprovados, em 53,7 s | 0 |
| `pnpm exec turbo build --concurrency=1 --cache=local:r` | 4 aplicativos compilados, sem cache de tarefas; 3 min 16,91 s | 0 |
| `git diff --check` | Nenhum erro de espaços em branco | 0 |
| `git diff --exit-code -- packages/config/src/products.ts packages/billing/src/seeds/credit-pricing.ts` | Catálogo e preços de créditos sem alterações | 0 |

A suíte de testes soma **1.124 testes em 98 arquivos**: Cozya 85/19, Agenda 461/31, AI Core 71/9, Billing 185/23, Auth 216/8 e Emails 106/8. Os resultados em cache são identificados acima; não representam nova execução desses pacotes.

Os sete testes de navegador cobrem login por código, cadastro e verificação de e-mail, a jornada de editar receita/planejar/comprar/cozinhar/retomar no celular, cancelamento do microfone sem solicitação paga, ciclo completo da demonstração, responsividade/teclado/redução de movimento/tema escuro previamente salvo/menu/navegação legal e leitura da oferta/FAQ/links sem JavaScript. A execução utilizou o servidor local existente com `E2E_REUSE_EXISTING_SERVER=1` e as configurações de teste documentadas no projeto.

A inspeção final no navegador apresentou **zero erros e zero avisos no console**. As duas fotografias estavam carregadas e decodificadas; na largura de 390 px, a página também media 390 px, sem transbordamento horizontal. As capturas vinculadas acima são da versão final.

A primeira tentativa de compilação foi interrompida pela proteção de HTTPS do Agenda, porque o ambiente local utiliza URLs HTTP. A execução final utilizou URLs HTTPS de exemplo, seguindo a configuração de CI, e credenciais fictícias de serviços externos somente no processo de compilação. Nenhum arquivo de ambiente foi alterado. Essa compilação é evidência de validação; a publicação deverá gerar seu próprio artefato com as configurações reais de produção.

```text
VERIFICATION REPORT
-------------------
Claim: A nova home foi implementada e passou nas verificações locais de qualidade, tipos, testes, navegação e compilação.
Command: Comandos e escopo registrados na tabela acima.
Executed: 11/09/2026, após as últimas alterações funcionais.
Exit code: 0 em todos os comandos finais.
Output summary: 812 arquivos; 11 tarefas de tipos; 6 tarefas de testes; 7 testes de navegador; 4 aplicativos compilados.
Warnings: Playwright informou precedência de FORCE_COLOR sobre NO_COLOR; Git informou conversão LF/CRLF da configuração local.
Errors: Nenhum erro nas execuções finais. A tentativa inicial de build e a correção do ambiente estão documentadas acima.
Verdict: PASS para o escopo local verificado. Publicação e compra real não foram executadas.
```
