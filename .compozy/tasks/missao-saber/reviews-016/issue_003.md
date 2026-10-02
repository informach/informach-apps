---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 89
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Retomar a missão usando a trilha do ano escolar vigente

## Review Comment

O dashboard calculava a trilha sucessora na mudança do ano e oferecia retomar uma missão compartilhada. A validação da sessão usava o courseId antigo armazenado. Um perfil do 6º ano na Canguru E que passasse ao 7º via `gradeYear` via a missão de frações disponível, mas recebia `GRADE` ao retomá-la antes de iniciar outra sessão.

A validação usa `resolvedCourse(profile)`, a mesma resolução de ano e trilha adotada pela jornada. Missões que realmente não pertencem à trilha continuam sujeitas à regra de acesso; snapshots anteriores são preservados.

Verificação: `test/review16-pedagogy.integration.ts`: cria sessão, registra resposta, simula ano anterior no perfil, comprova sucessor Canguru B e retoma/responde sem iniciar outra sessão. Reprodução vermelha: GRADE; integração final deve permitir a continuidade.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
