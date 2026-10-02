---
status: resolved
file: apps/missao-saber/src/features/labs/components/labs.tsx
line: 85
severity: medium
author: claude-code
provider_ref:
---

# Issue 007: Não prometer salvamento na exploração sem perfil

## Review Comment

CicloDeDescoberta afirmava «As duas linhas ficam salvas com o experimento» também na demonstração pública e no laboratório embutido na missão, onde não existe profileId nem botão para salvar. Previsão e observação eram perdidas ao sair, contrariando a indicação visível.

A descrição agora acompanha a capacidade real da instância: no laboratório com perfil orienta usar o botão de salvar; na exploração informa que os dados ficam somente nessa tela e serão descartados ao sair. O comportamento de persistência por perfil permanece coberto pelos testes existentes.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
