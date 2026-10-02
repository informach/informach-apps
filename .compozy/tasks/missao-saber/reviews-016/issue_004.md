---
status: resolved
file: apps/missao-saber/src/app/(app)/revisao/page.tsx
line: 33
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Mostrar orientação quando não há revisões na trilha atual

## Review Comment

A lista de revisões filtrava as habilidades da trilha atual, mas o estado vazio consultava todas as evidências do perfil. Após sair da Mirim para a OBMEP, evidências apenas de habilidades antigas produziam uma página sem revisões e sem orientação para começar.

O estado vazio usa a coleção já filtrada. A página oferece a primeira prática e o acesso à jornada quando não existem habilidades acompanhadas na trilha atual.

Verificação: `src/features/learning/review-page.test.ts`: renderiza a página real com estados calculados pelo motor e uma trilha sucessora sem habilidades em comum. Verifica a orientação e o link; antes, ambos faltavam.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
