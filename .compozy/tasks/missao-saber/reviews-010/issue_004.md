---
status: resolved
file: apps/missao-saber/src/features/learning/engine.test.ts
line: 262
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Validar soluções sem reutilizar o gabarito declarado

## Review Comment

O teste que afirma aceitar “every authored solution” envia `item.answer`, `item.grading.value` ou `item.grading.order` ao mesmo motor que lê esses campos. Ele comprova o contrato do corretor, mas não recalcula a resposta a partir do enunciado. Por isso o gabarito incorreto de `paridade-5-4` passa normalmente. As 16 asserções quantitativas posteriores cobrem somente uma pequena parte do acervo legado, enquanto os relatórios dos seis lotes declaram conferência independente de 604 itens.

Separar validação de schema/corretor de validação autoral. Para itens quantitativos, manter dados estruturados do cenário e um oráculo independente que derive a resposta; para lógica, alternativas e justificativas, registrar uma conferência item a item com critérios e evidência rastreáveis. Os lotes devem falhar quando houver item sem essa segunda verificação, e não apenas quando IDs, textos ou gabaritos declarados forem diferentes.

## Triage

- Decision: `RESOLVED`
- Notes: O teste circular foi renomeado e limitado ao contrato do corretor. A autoria item a item ganhou ledger independente com 604 hashes, além de oráculos matemáticos específicos, validação estrutural dos bancos, distratores e respostas-modelo.
