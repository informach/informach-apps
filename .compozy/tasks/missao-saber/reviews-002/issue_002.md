---
status: resolved
file: apps/missao-saber/src/features/content/authoring.ts
line: 34
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Implementar pistas graduais e feedback por erro real

## Review Comment

O requisito 3 do PRD pede erros específicos e pistas graduais. A factory recebe apenas uma pista por questão, completa as outras duas com a introdução inteira da aula e a frase genérica "Organize uma tentativa...", e atribui exatamente a mesma explicação a todos os distratores. A inspeção executada das 144 atividades encontrou 144 com uma única mensagem distinta entre os erros. Por exemplo, em `porcentagem-1-1`, escolher 25 (confundir taxa com reais) e escolher 120 (responder preço final em vez de desconto) provoca a mesma resposta, sem distinguir as estratégias equivocadas.

Representar no conteúdo as três pistas específicas, progressivas, e o diagnóstico correspondente a cada distrator. A segunda pista deve ajudar a construir uma representação ou passo intermediário; a terceira deve dar suporte adicional concreto. A correção precisa nomear o erro plausível da alternativa escolhida, com linguagem respeitosa e explicação pertinente. É possível compartilhar estratégias entre famílias de itens, desde que os passos se adaptem ao problema e não se limitem a repetir objetivo/introdução. Adicionar validações e exemplos de teste que demonstrem essa diferenciação.

## Triage

- Decision: `VALID`
- Notes: Adicionado `feedback.ts` com 288 mensagens por distrator; ladder atual passa de conceito a pista contextual e resolução guiada. Execução independente confirmou duas mensagens distintas em cada um dos 144 itens. Um diagnóstico numérico incoerente no distrator 60 de fracoes-2-3 foi corrigido durante a revalidação e relido. A revisão pedagógica humana continua necessária antes da publicação comercial. Testes existentes: 26 passed; typecheck sem diagnósticos.
