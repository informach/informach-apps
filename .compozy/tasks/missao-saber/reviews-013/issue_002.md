---
status: resolved
file: apps/missao-saber/src/features/content/commercial-curriculum.ts
line: 1985
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Remover o padrão que revela todas as respostas dos simulados

## Review Comment

`verificationSpec()` transforma todas as questões dos quatro simulados em uma escolha cuja resposta correta começa com `Conferir pelos dados:` e contém a solução inteira. Os dois distratores propõem explicitamente trocar a resposta sem refazer a relação ou aceitar a escolha porque parece próxima dos números. Além disso, o enunciado já informa a resposta matemática escolhida pelo estudante fictício. `makeAssessmentBank()` aplica essa transformação a todos os itens de modo `exam` na linha 2017.

Uma reprodução sobre os bancos reais acertou as 48 questões dos simulados usando apenas `options.find(option => option.startsWith('Conferir pelos dados:'))`, sem calcular ou interpretar nenhum problema. A posição aleatória da opção não elimina essa pista textual. Esses acertos entram como evidência objetiva no motor, embora não demonstrem transferência para os problemas reservados prometida em F3.2/F3.5 do plano comercial.

Autorar itens de aplicação independente e análises com alternativas matematicamente plausíveis, sem marcador verbal constante de correção. Questões de verificação podem permanecer quando exigem comparar argumentos, identificar um erro ou conferir passos específicos; os distratores precisam representar raciocínios reais, não anunciar que dispensam o raciocínio. Rever os 48 itens e acrescentar uma verificação de qualidade que identifique esse tipo de resposta denunciada pelo formato.

Este é um defeito de validade didática da transformação atual, distinto do achado010/001 sobre identidade das famílias semânticas.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

Os 48 itens reservados de simulado foram reescritos com explicações e alternativas plausíveis, sem prefixo constante que denuncie a resposta. Os bancos passaram para a versão 2 e seus digests foram recalculados após conferência. O teste de catálogo verifica quantidade, versão, unicidade e ausência do padrão anterior. `71` testes do app e `44` integrações passaram.
