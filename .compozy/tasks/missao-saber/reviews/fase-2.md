# Review da fase 2 — conteúdo, aprendizagem e persistência

Data: 13/09/2026. Revisão independente, seguindo `cy-review-round`, com leitura completa dos 14 arquivos de conteúdo/aprendizagem/billing inicialmente presentes e do catálogo compartilhado de produtos. F1 foi revalidada e sua única questão está resolvida. Nenhum arquivo de aplicação foi modificado pelo revisor.

## Mapa do escopo

- `content/{finance,geometry,combinatorics,reasoning}.ts` → `authoring.ts` → tipos e schemas Zod → `catalog.ts`: 24 aulas, 144 atividades, 12 habilidades e quatro cursos com compatibilidade de ano escolar. Diagnósticos e simulados selecionam itens do próprio banco autoral. Nenhuma referência a PDFs oficiais entra nesse fluxo.
- `learning/service.ts` autentica o domínio por `userId` fornecido pelo futuro boundary, valida inputs Zod e compatibilidade da trilha, consulta acesso/estado editorial e chama o repositório. Ele constrói o DTO de sessão que omite gabarito e pistas ainda não solicitadas.
- `learning/repository.ts` → Drizzle e schema `missao_saber`: propriedade verificada por perfil/conta; lock da linha de `core.users` serializa mutações da mesma família, inclusive criação de perfis, respostas, pistas, caderno e limpeza. Esse lock é mais abrangente que o lock de sessão proposto e sustenta a exclusão mútua entre esses fluxos. Sessões congelam aula/versão, têm chave de requisição e respostas têm UUID e unicidade por item.
- `learning/engine.ts`: correção no servidor, domínio por novidade/famílias/dias, calendário de revisão e resumo semanal em `America/Sao_Paulo`.
- `billing/repository.ts` → `@informach/billing/getProSubscription`, filtrado por `app: missao-saber`; `billing/service.ts` seleciona produtos próprios, resolve limite Individual/Família e injeta IDs de preço do ambiente. Checkout/portal completos e endpoints externos serão revisados em F4.

## Resultado

**Clean — ready to merge (escopo de F2).** As cinco questões registradas foram corrigidas e verificadas, incluindo a retenção de correção em banco descartável. Rodada: `reviews-002`, cinco resolvidas e nenhuma pendência. A rechecagem de publicação/retirada agora ocorre sob os mesmos locks editoriais, em ordem estável, e confere novamente a trilha atual antes do insert. A integração testa retirada antes de iniciar a sessão. Esta conclusão não substitui a revisão humana do banco autoral nem encerra as demais fases.

1. [issue_001.md](../reviews-002/issue_001.md), alta: oito enunciados de gavetas permitem alternativas matematicamente válidas que recebem erro; explicitar o mínimo/garantia mais forte.
2. [issue_002.md](../reviews-002/issue_002.md), alta: as 144 atividades usam feedback idêntico para todos os distratores, e as pistas 2/3 não constituem suporte gradual específico.
3. [issue_003.md](../reviews-002/issue_003.md), alta: a primeira prática de porcentagem já agenda revisão para 30 dias depois; separar diversidade de famílias e etapas espaçadas.
4. [issue_004.md](../reviews-002/issue_004.md), média: todas as aulas usam a sequência previsível de alternativas certas 1/2/3/1/2/3.
5. [issue_005.md](../reviews-002/issue_005.md), média: histórico, agregados e exportação não aplicam a retenção de correção de avaliações incompletas.

Revalidação em 13/09/2026: os oito enunciados foram esclarecidos, 288 mensagens distintas por distrator foram introduzidas, a ordem das respostas tem 24 padrões diferentes e o calendário segue recuperação espaçada em dias sucessivos. As questões preservam a descrição original do defeito; o campo Triage registra o estado atualizado. A execução independente de integração com PostgreSQL às 11:26:37 America/Sao_Paulo aprovou 9 testes e encerrou a questão 005. A rodada também é compatível com `compozy fix-reviews --name missao-saber`.

## Aspectos sólidos

As contas e justificativas dos 144 itens foram lidas; não foi identificado gabarito aritmético errado nessa leitura. Os oito enunciados originalmente ambíguos foram esclarecidos. Os testes existentes cobrem unicidade, alternativas, DTO sem gabarito e 16 resultados quantitativos. O pipeline deixa a aprovação humana explícita, sem declarar que testes substituem revisão pedagógica.

A autorização por proprietário é verificada antes de ler/mutar sessões; o lock comum da conta evita corridas entre perfis, respostas e limpeza. Replay idêntico não duplica tentativa e payload diferente para um item já respondido gera conflito. Ajuda é registrada no servidor antes da resposta e só progride na questão atual; diagnóstico/simulado rejeitam pedidos de pista. Conteúdo fica congelado na sessão e respostas corretas não são fornecidas pelo cliente. A assinatura de outro app não concede acesso: o wrapper compartilhado filtra o cliente por app e somente status elegíveis. Perfis excedentes ficam disponíveis no histórico após redução de plano.

## Requisitos e limites

| Requisito de F2 | Avaliação |
| --- | --- |
| Banco piloto autoral 144/24/12 e quatro trilhas | Estrutura confirmada; enunciados e feedback corrigidos, aguardando revisão humana de publicação. |
| Correção, validação, retomada e idempotência | Caminhos revistos e integração com PostgreSQL aprovada, incluindo replay concorrente e isolamento entre responsáveis. |
| Domínio conservador por novidade e ajuda | Regra evita certificar mera repetição, exclui diagnóstico e usa calendário corrigido de revisão espaçada. |
| Feedback gradual e contextual | 288 devolutivas distintas e pistas graduais específicas verificadas. |
| Políticas distintas de avaliação | Sessão, histórico e exportação respeitam o embargo; verificação antes/depois em PostgreSQL aprovada. |
| Entitlement por app e limites familiares | Reuso do contrato compartilhado e validações coerentes; ativação Stripe/fluxos externos pertencem a F4/F5. |

Telas, endpoints autenticados, experiências manipuláveis, operação editorial e validação comercial/humana não foram tratados como prontos nem como faltas de F2.

## Verificação executada

```text
VERIFICATION REPORT
-------------------
Claim: Os testes unitários existentes de conteúdo e motor passam; isto não elimina as questões encontradas no review.
Command: pnpm --filter @informach/missao-saber test
Executed: 2026-09-13 10:32:42 America/Sao_Paulo
Exit code: 0
Output summary: Test Files 1 passed (1); Tests 23 passed (23).
Warnings: none no comando de testes
Errors: none
Verdict: PASS
```

Lint executado: `pnpm exec biome lint apps/missao-saber/src/features packages/config/src/products.ts`, exit 0, 15 arquivos e um aviso de import `sql` não usado em `learning/repository.ts`. Por ser capturado pelo linter, não gerou questão de review.

Reproduções independentes via `pnpm --filter @informach/db exec tsx -e ...` (leitura dos módulos, sem DB; exit 0):

```json
{"lesson":"porcentagem-1","singlePracticeDay":true,"families":6,"level":"building","dueAt":"2026-10-10T12:00:00.000Z","firstQuestionWrongFeedbackVariants":1,"answerIndexes":[0,1,2,0,1,2]}
{"items":144,"identicalFeedbackItems":144,"positionPatterns":["0,1,2,0,1,2"],"colorQuestion":"Com 3 cores disponíveis, quantas peças bastam para garantir pelo menos 4 da mesma cor?","twelveGuaranteesFour":true,"marksTwelveCorrect":false}
```

Não houve migração, cobrança, envio de e-mail ou teste em banco de produção durante este review.

### Revalidação das correções

```text
VERIFICATION REPORT
-------------------
Claim: Testes unitários e typecheck passam após as correções de F2; as quatro correções de conteúdo/motor foram reproduzidas independentemente.
Command: pnpm --filter @informach/missao-saber test; pnpm --filter @informach/missao-saber typecheck
Executed: 2026-09-13 10:58:41 America/Sao_Paulo
Exit code: 0 em cada comando
Output summary: Test Files 2 passed (2); Tests 26 passed (26); tsc --noEmit sem diagnósticos.
Warnings: none
Errors: none
Verdict: PASS
```

Saída da reprodução independente de conteúdo/motor com asserções:

```json
{"originalActivities":144,"distinctDistractorMessages":288,"answerPositionPatterns":24,"clarifiedGuarantees":8,"spacedIntervalsDays":[1,3,7,14,30],"verdict":"PASS"}
```
