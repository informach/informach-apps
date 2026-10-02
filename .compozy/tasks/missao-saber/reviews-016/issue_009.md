---
status: resolved
file: apps/missao-saber/src/app/api/jobs/weekly-report/route.ts
line: 60
severity: medium
author: claude-code
provider_ref:
---

# Issue 009: Retornar falha HTTP quando o resumo semanal falha

## Review Comment

O job contabilizava entregas com falha, mas respondia HTTP 200 e status ok. O cron usa `curl --fail`, portanto a execução podia aparecer como bem-sucedida mesmo com falha de envio.

A resposta usa HTTP 503 e status failed quando `falhas > 0`, mantendo as contagens de enviados, ignorados e falhas e a idempotência das entregas.

Verificação: `test/backend-review.integration.ts`: provoca falha do contrato de envio no job real e verifica HTTP 503. Reprodução anterior: recebia 200.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
