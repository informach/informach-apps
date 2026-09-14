---
status: resolved
file: apps/missao-saber/src/features/content/commercial-curriculum.ts
line: 787
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Corrigir o gabarito do ciclo de paridade

## Review Comment

O item `paridade-5-4` afirma que a sequência começa em 5 e soma 8 a cada passo, depois pergunta qual resto por 2 aparece em todos os termos. Como o início é ímpar e o incremento é par, todos os termos têm resto 1. O gerador usa `stage % 2`; para o estágio 2 isso produz resposta 0 e coloca 1 entre os distratores. A própria explicação diz corretamente que somar um número par preserva o resto do termo inicial, contradizendo o gabarito.

Derivar a resposta da paridade do valor inicial, corrigir a alternativa e revisar os snapshots/versionamento antes da publicação. Adicionar um teste independente com os três valores iniciais e incrementos, calculando o resto sem reutilizar a resposta armazenada.

## Triage

- Decision: `RESOLVED`
- Notes: O resto passou a ser derivado do valor inicial. Um oráculo independente calcula e verifica os três cenários da sequência de paridade.
