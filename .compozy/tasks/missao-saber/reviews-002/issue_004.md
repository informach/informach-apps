---
status: resolved
file: apps/missao-saber/src/features/content/authoring.ts
line: 25
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Remover o padrão previsível de posição do gabarito

## Review Comment

`options.splice(index % (wrong.length + 1), 0, answer)` coloca a resposta certa sempre na sequência de posições 1, 2, 3, 1, 2, 3. A inspeção das 24 aulas confirmou que todas compartilham exatamente esse padrão. Após poucas correções o aluno pode responder por posição, acumulando acertos em famílias novas sem demonstrar a estratégia que o motor considera aprendida. Os simulados também herdam posições do catálogo.

Distribuir a ordem das alternativas sem uma regra simples visível entre as questões. Preferir um embaralhamento registrado no snapshot da sessão, para que retomada e replay mantenham a mesma ordem; não reembaralhar em cada renderização. Caso a ordem seja editorial e estável por versão, revisar sua distribuição ao longo do catálogo. Testar a estabilidade da retomada e evitar a sequência periódica atual sem criar um teste probabilístico sujeito a flakiness.

## Triage

- Decision: `VALID`
- Notes: Ordem estável por hash de item/opção substituiu a rotação periódica. A inspeção executada das 24 aulas encontrou 24 padrões distintos. A ordem compõe o snapshot persistido e não é recalculada na retomada da sessão. Testes existentes: 26 passed.
