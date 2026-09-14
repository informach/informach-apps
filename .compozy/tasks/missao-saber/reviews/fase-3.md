# Review da fase 3 — experiência do estudante

Data: 13/09/2026. Revisão independente e somente de leitura do código da aplicação, seguindo `cy-review-round`. Contexto do PRD/TechSpec mantido. Novas questões são registradas em `reviews-003`; não repetem os itens das fases anteriores.

## Escopo e mapa

- Páginas públicas: landing `/`, autenticação `/entrar`, demonstração `/experimentar`; identidade CSS própria e demonstração sem persistência nem atribuição de domínio.
- Layout autenticado `(app)` → sessão e e-mail verificado → dashboard da conta; `currentDashboard()` valida o cookie de perfil contra os perfis do responsável antes de usar a seleção.
- Hoje, jornada, revisão, simulados, laboratório, caderno e página de missão; páginas RSC leem o domínio e só passam DTOs selecionados aos componentes cliente. Família, editorial e endpoints operacionais ainda pertencem a F4.
- `controls.tsx` envia início/troca de perfil/trilha para Server Actions; `learning/actions.ts` autentica cada mutação, exige e-mail verificado e valida input antes de chamar o domínio. Criação de perfil exige sessão recente do responsável. `runAction()` expõe erros esperados e retorna referência de incidente para erros internos, sem conteúdo de resposta ou PII nos logs.
- `Player` → actions de resposta/pista/relato → motor/repositório → DTO atualizado. Fluxos distintos de treino e avaliação; pausa via sessão persistida; questões submetidas não são alteradas; chave de requisição permanece em tentativas após falha de conexão.
- `Labs` → funções matemáticas puras; sliders de descontos, malha por botões e organização de peças por seletores. `Notebook` → ações de gravação/remoção com propriedade verificada pelo repositório.

## Resultado

**Clean — ready to merge (escopo de F3).** Cinco questões corrigidas e verificadas. As regras de recomendação passaram em execução independente; a integração PostgreSQL confirmou persistência/isolamento e a execução E2E do implementador aprovou os seis cenários desktop/mobile. O revisor conferiu o código dos cenários e o resultado `.last-run.json`, incluindo troca durante missão, ida ao caderno/retomada da malha e proporção de 16% das barras no caso 60% + 60%. Os achados abaixo preservam a descrição histórica; o Triage registra a resolução.

1. [issue_001.md](../reviews-003/issue_001.md), alta: mudança de perfil mantém a sessão/draft do estudante anterior sob o cabeçalho novo.
2. [issue_002.md](../reviews-003/issue_002.md), alta: resultados diagnósticos ainda não geram orientação de próximo passo.
3. [issue_003.md](../reviews-003/issue_003.md), média: revisão pode selecionar aula não publicada e bloquear o treino disponível; Hoje não exclui gratuita retirada.
4. [issue_004.md](../reviews-003/issue_004.md), média: investigação anunciada como pausável perde configuração ao ir ao caderno ou recarregar.
5. [issue_005.md](../reviews-003/issue_005.md), média: largura mínima dos rótulos distorce as barras proporcionais em telas estreitas.

A rodada pode ser processada por `compozy fix-reviews --name missao-saber`; correções ficam a cargo do implementador, seguidas de revalidação.

## Aspectos bem implementados

Há fluxos funcionais de missão, pista registrada, feedback respeitoso, pausa da sessão, relatório de questão, diagnóstico/simulado e caderno. A fronteira de mutação autentica novamente, não depende apenas do layout. Parâmetros de sessão inválidos/desconhecidos recebem `notFound`; perfis de outra conta não são aceitos pelo cookie. Não foi encontrado envio de gabarito oculto nos DTOs entregues ao Player. A demonstração está claramente separada do progresso real.

Os laboratórios têm controles nativos por teclado, saídas textuais com `aria-live`, nomes acessíveis das células e estado `aria-pressed`. As opções usam radio/fieldset/legend; mensagens de erro usam alert/status; existe link para pular ao conteúdo, foco visível e suporte a preferência de movimento reduzido. Essas propriedades no código não substituem ensaio completo com navegador/leitor de tela. A malha conta lados de buracos e lados compartilhados corretamente nos testes matemáticos.

A página de simulados explica que o percurso é autoral/formativo e não reproduz pontuação, duração oficial ou correção discursiva humana. Isso delimita o produto com clareza. O catálogo continua identificado como piloto.

## Cobertura e limites

| Requisito de F3 | Avaliação |
| --- | --- |
| Hoje/jornada/revisão/simulado/caderno/laboratório | Páginas presentes; recomendação agora respeita disponibilidade e evidência diagnóstica. |
| Player com suporte didático e retomada | Sessão, feedback e troca de perfil para Hoje verificados em desktop/mobile. |
| Diagnóstico orienta o treino | Orientação no servidor, razão do próximo passo e resumo por habilidade implementados; regras e integração verificadas. |
| Três ferramentas manipuláveis com teclado e texto | Persistência por perfil, retomada e escala das barras aprovadas em integração/E2E. |
| Autorização nas mutations | Código, PostgreSQL e fluxos autenticados do navegador verificados. |
| Interface responsiva e acessível | Código, teclado, medidas e screenshots conferidos em desktop/mobile; não substitui auditoria com leitores de tela. |

O laboratório inicial demonstra descontos sucessivos, área/perímetro e distribuição em grupos; ainda não equivale a todos os manipuláveis futuros de frações, reflexão e árvores de contagem mencionados na proposta ampliada. A revisão humana de conteúdo e o piloto com famílias continuam etapas externas.

## Evidência

```text
VERIFICATION REPORT
-------------------
Claim: Verificações estáticas e testes existentes passam no código revisto de F3.
Command: pnpm --filter @informach/missao-saber test; pnpm --filter @informach/missao-saber typecheck
Executed: 2026-09-13 10:58:41 America/Sao_Paulo
Exit code: 0 em cada comando
Output summary: Test Files 2 passed (2); Tests 26 passed (26); tsc --noEmit sem diagnósticos.
Warnings: none
Errors: none
Verdict: PASS
```

Lint adicional executado em components, labs, player/notebook, actions, helpers e páginas: `pnpm exec biome lint apps/missao-saber/src/components apps/missao-saber/src/features/labs apps/missao-saber/src/features/learning/components apps/missao-saber/src/features/learning/actions.ts apps/missao-saber/src/lib/action.ts apps/missao-saber/src/lib/view.ts apps/missao-saber/src/app`; saída `Checked 31 files in 33ms. No fixes applied.`, exit 0.

A primeira tentativa de acessar `http://localhost:3005/experimentar` encontrou o app indisponível (`HttpRequestException`). Essa limitação foi superada na revalidação: o implementador executou os seis cenários E2E desktop/mobile, e o revisor conferiu os testes, resultado persistido e screenshots. A evidência de cada correção está no Triage; esta revisão não declara avaliação humana de aprendizagem ou auditoria completa de acessibilidade.
