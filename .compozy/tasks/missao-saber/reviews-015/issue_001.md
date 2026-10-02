---
status: resolved
file: apps/missao-saber/src/features/learning/components/response-input.tsx
line: 54
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Alinhar teclado, unidades e frações com a correção

## Review Comment

O campo numérico usa inputMode="decimal" para todos os 905 itens numéricos. No celular esse teclado pode não oferecer barra de fração, sinal de menos ou unidade, embora o contrato prometa frações e o catálogo contenha valores negativos. Em fracoes-formatos-2, o rótulo já diz «Seu valor em m», mas a correção rejeita 0,5 e 1/2 sem o sufixo m. O enunciado original nem estabelecia que a unidade de comprimento era um metro. O parser ainda recusava a fração simples 1 / 2 com espaços.

Usar campo textual com teclado capaz de escrever a notação prometida, explicar a barra de fração e considerar implícita a unidade do rótulo. Manter a unidade opcional na correção também para snapshots antigos; mudar somente o item do catálogo deixaria sessões em andamento bloqueadas. Explicitar um metro no enunciado e aceitar espaços em torno da barra sem aceitar expressões ou denominador zero.

Reprodução inicial: response-contract.test.ts falhou para 0,5, 0.5, 1/2, 2/4, 1 / 2, snapshot antigo e teclado. Após os ajustes, os casos passam. A regressão E2E usa decimal sem unidade em desktop e fração com espaços em celular.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
