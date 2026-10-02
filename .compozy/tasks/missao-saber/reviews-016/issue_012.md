---
status: resolved
file: apps/missao-saber/src/features/content/skills/orcamento-n2.ts
line: 247
severity: high
author: claude-code
provider_ref:
---

# Issue 012: Preservar necessidades essenciais no exercício de orçamento

## Review Comment

`orcamento-n2-3-4` apresentava como regra prudente pagar contas com corte ou juros, explicitamente incluindo cartão, antes das despesas essenciais. A regra genérica podia direcionar todo o orçamento a uma dívida e deixar alimentação ou remédios para depois.

O exercício agora oferece uma situação concreta, preserva alimentação, saúde e moradia e considera risco de corte, juros e negociação do que não couber, adiando lazer. Evita transformar uma regra isolada em prioridade absoluta. Referência primária consultada: [Banco Central — Como lidar com dívidas](https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Folhetos_Serie_II_Financas_Pessoais/folder_serie_II_como_lidar_dividas.pdf), sobre reorganização, negociação e redução de despesas supérfluas.

Verificação: `src/features/content/review16-content.test.ts`: verifica as condições visíveis, confronta as alternativas com a preservação das necessidades básicas e confere a explicação. Missão versionada e ledger atualizado. Trata-se do conteúdo do exercício, não de orientação individual a uma família.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
