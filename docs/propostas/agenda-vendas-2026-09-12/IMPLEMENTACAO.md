# Página inicial da Agenda da Turma — implementação

12/09/2026 · Proposta aplicada no código do app e verificada localmente.

A home apresenta a promessa **“A rotina da escola não precisa morar na sua cabeça.”** e demonstra como mensagem e anexo viram providências. O visitante pode experimentar antes do cadastro e entender a diferença entre o gratuito e a continuidade oferecida pelo Pro.

[Ver abertura no desktop](implementacao/abertura-desktop.png) · [Ver abertura no celular](implementacao/abertura-mobile.png) · [Página completa](implementacao/desktop.png) · [Página no celular](implementacao/mobile.png) · [Tema escuro](implementacao/desktop-escuro.png)

## O que foi aplicado

| Proposta | Implementação |
| --- | --- |
| Benefício emocional com explicação concreta | Nova abertura, copy, título e descrição de compartilhamento. Entrada manual pelo Teams, Batista ID e outros canais explicitada. |
| Prova visual antes do cadastro | Recado e anexo ilustrativos na abertura; demonstração com passeio, prova e material. |
| Prazo da escola separado de planejamento | O botão de preparo define 17/09 como escolha da família e preserva a autorização em 16/09. |
| Interação compreensível | Conclusão com feedback acessível; nada é enviado à escola. Ao trocar de cenário, a demonstração volta ao estado inicial. |
| Utilidade recorrente | Rotina, preparo para amanhã, responsáveis, segundo adulto e lembretes apresentados com identificação do Pro. |
| Confiança | Exemplo de retificação importada e confirmada, revisão da fonte e histórico. FAQ explica as limitações de automação e conclusão. |
| Oferta clara | Mensal selecionado inicialmente. Anual mostra R$ 199,00/ano, equivalente mensal e economia. Valores calculados pelo catálogo existente. |
| Continuidade até o cadastro | CTA gratuito para /signup; Pro conserva plan=pro e cycle=mensal ou anual. A apresentação anual compartilhada também é usada na escolha de plano do app. |
| Visual responsivo | Fonte Plus Jakarta Sans carregada pelo Next, logotipo e tokens existentes, contraste ajustado, temas claro/escuro e redução de movimento. |
| Menos componentes desnecessários | Navegação pública simplificada; removidos os antigos blocos de comparação, passos repetidos, menu móvel e tracker substituído. |
| Medição sem conteúdo escolar | Eventos estritos de visita, CTA e demonstração; relatório agregado atualizado; explicação na página de privacidade. |

A demonstração usa somente dados fictícios e estado local. Não aceita conteúdo real, não chama IA e não consome créditos. As cinco importações gratuitas são apresentadas como concessão única por conta verificada. A franquia de 70 créditos mensais do Pro, o custo de voz e as condições do push continuam explícitos.

## Métricas e banco

A variante atual é **family-routine-v1**. O endpoint aceita apenas campos enumerados, verifica origem, limita o corpo a 1 KB e aplica limite de requisições. Erros de gravação do novo contrato retornam falha, sem guardar detalhes privados no log.

- **landing_view:** uma visualização visível por montagem da home. Voltar à página pode contar novamente.
- **landing_cta:** posição, plano e ciclo; combinações repetidas são deduplicadas durante aquela montagem.
- **landing_demo:** cenário e ação de seleção, planejamento ou conclusão, também deduplicados.
- **qualified_visit:** mantém o significado anterior de primeiro clique de cadastro. O novo CTA e esse evento são gravados em uma única operação. Clientes anteriores com POST vazio continuam aceitos.

Não há cookie de atribuição, identificador de visitante ou associação individual da visita ao pagamento. O relatório separa os eventos agregados dos indicadores existentes de ativação, retenção e faturamento. Os números não representam visitantes únicos nem uma análise causal de conversão.

A migração **0039_agenda_landing_context**, gerada pelo Drizzle, acrescenta apenas uma coluna JSONB nullable à tabela de eventos. Foi aplicada no PostgreSQL local e verificada com inserções reais e limpeza dos registros de teste por ID. Não exige backfill nem reescreve os eventos antigos.

Para uma publicação futura, aplicar a migração antes do novo código e do relatório. A alteração aditiva mantém compatibilidade com o código anterior; uma reversão de aplicação pode conservar a coluna. O ALTER TABLE ainda requer lock breve de catálogo. Nenhuma migração ou publicação foi executada em produção nesta etapa.

## Verificação

Os testes de navegador usam o app real em desenvolvimento, com CSP ligada. Apenas a chamada de analytics é interceptada para não poluir métricas: o contrato HTTP é testado separadamente e a persistência tem testes contra PostgreSQL local. Cadastro gratuito, mensal e anual navegam de verdade até /signup, sem criar contas nem compras.

A verificação cobre 1440, 768, 390 e 320 px, nos dois temas; ausência de rolagem horizontal; teclado na demonstração e FAQ; redução de movimento; navegação pela página de privacidade; ausência de chamadas de IA; preservação do prazo escolar e deduplicação de eventos. A inspeção adicional de contraste dos textos visíveis não encontrou valores abaixo dos limites usados após os ajustes. Isso não substitui uma auditoria completa de acessibilidade com tecnologias assistivas.

As capturas aguardam uma interação confirmar a hidratação e preservam o caret nativo. Isso evita que a própria captura do Playwright altere atributos de inputs durante a hidratação. O indicador do Next nas imagens pertence ao ambiente de desenvolvimento.

```text
VERIFICATION REPORT
-------------------
Claim: Nova home implementada, fluxos de cadastro e demonstração verificados, persistência das métricas validada e build de produção gerado.
Command:
  pnpm exec biome check apps/agenda-da-turma/src apps/agenda-da-turma/scripts apps/agenda-da-turma/e2e/sales-page.spec.ts apps/agenda-da-turma/test/integration/landing-events.test.ts apps/agenda-da-turma/playwright.marketing.config.ts packages/db/src/schema/agenda-family.ts
  pnpm --filter @informach/agenda-da-turma test
  pnpm --filter @informach/agenda-da-turma test:integration
  pnpm --filter @informach/agenda-da-turma typecheck
  pnpm --filter @informach/db typecheck
  pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.marketing.config.ts
  $env:BETTER_AUTH_URL = 'https://agenda-da-turma.informach.com.br'
  $env:NEXT_PUBLIC_APP_URL = 'https://agenda-da-turma.informach.com.br'
  pnpm --filter @informach/agenda-da-turma build
Executed: 12/09/2026, nesta implementação; evidência consolidada às 09:41 UTC.
Exit code: 0 em todas as verificações finais.
Output summary:
  Checked 385 files. No fixes applied.
  Test Files 37 passed (37); Tests 498 passed (498).
  Test Files 4 passed (4); Tests 35 passed (35).
  typecheck do app e do banco: tsc --noEmit, exit 0.
  Playwright: 5 passed (15.7s).
  Compiled successfully in 30.3s; Finished TypeScript in 26.6s.
  Generating static pages using 11 workers (50/50).
  Capturas: errors []; fonte Plus Jakarta Sans confirmada.
Warnings: Playwright informa conflito entre NO_COLOR e FORCE_COLOR, sem efeito nos testes. O primeiro build usou URLs HTTP locais e foi recusado pelo guard existente; a execução final usou URLs HTTPS no processo de build, sem alterar .env.local.
Errors: none na verificação final.
Verdict: PASS
```

O relatório de piloto também foi executado em modo de leitura com sucesso. O build não equivale a homologação do runtime publicado: conversão, Core Web Vitals em produção, entregas reais de e-mail/push e cobrança precisam ser observados no ambiente de destino. Nenhuma alegação de ganho de vendas foi adicionada à página.

## Capturas do app

- [Abertura desktop](implementacao/abertura-desktop.png) e [celular](implementacao/abertura-mobile.png).
- [Página completa desktop](implementacao/desktop.png) e [celular](implementacao/mobile.png).
- [Tema escuro desktop](implementacao/desktop-escuro.png) e [celular](implementacao/mobile-escuro.png).
- [Demonstração no celular](implementacao/demonstracao-mobile.png).

A [proposta original](PROPOSTA.md) e o [protótipo conceitual](conceito.html) permanecem como registros da etapa aprovada. As imagens desta implementação são capturas do app.
