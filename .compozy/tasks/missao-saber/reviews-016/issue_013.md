---
status: resolved
file: apps/missao-saber/src/features/content/skills/recorrencias.ts
line: 559
severity: medium
author: claude-code
provider_ref:
---

# Issue 013: Permitir concluir que não há ultrapassagem nos dez termos

## Review Comment

O desafio de recorrências deixava o estudante escolher uma PA e uma PG e exigia encontrar quando uma ultrapassava a outra nos dez termos calculados. A ultrapassagem não é garantida nesse intervalo: PA 100+100n e PG 100×1,01ⁿ, de n=0 a 9, não apresentam a PG ultrapassando a PA. A rubrica exigia uma conclusão impossível para escolhas válidas. O texto também permitia comparar dinheiro com população no mesmo eixo.

O desafio pede situações comparáveis na mesma unidade e períodos. Enunciado, passo de investigação, rubrica e apoio familiar aceitam presença ou ausência de ultrapassagem no intervalo, distinguindo observação de previsão além dele.

Verificação: `src/features/content/review16-content.test.ts`: calcula dez termos de um contraexemplo e confere que a investigação e a rubrica aceitam ausência. É alteração no desafio do pack, fora dos seis itens versionados no manifesto.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
