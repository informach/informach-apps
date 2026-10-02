---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 981
severity: medium
author: claude-code
provider_ref:
---

# Issue 008: Aplicar a desativação do resumo ao lote já selecionado

## Review Comment

Desativar o resumo semanal atualizava a preferência da família, mas não a política de descadastro consultada pelo dispatcher. Se o job já tivesse selecionado o destinatário antes da desativação, ainda enviaria o resumo depois.

A desativação insere o bloqueio da categoria `missao.weekly-report` na mesma transação. O dispatcher o verifica antes do envio; reativar remove esse bloqueio. Um envio já entregue ao provedor não pode ser desfeito por esta regra.

Verificação: `test/backend-review.integration.ts`: seleciona o lote, desativa pela função real e continua o job com PostgreSQL e dispatcher locais. Antes havia uma entrega; depois, zero.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
