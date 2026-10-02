---
status: resolved
file: apps/missao-saber/src/features/learning/components/player.tsx
line: 157
severity: medium
author: claude-code
provider_ref:
---

# Issue 006: Levar o foco ao novo enunciado ao continuar

## Review Comment

Depois de clicar em Continuar, o painel de feedback e seu botão saíam do DOM, sem destino de foco. O estudante usando teclado ou tecnologia assistiva perdia a posição na atividade; a pergunta seguinte aparecia sem foco.

O enunciado recebe tabIndex=-1 e foco programático quando muda o ID da questão. Isso oferece um ponto de leitura e continuidade sem acrescentar uma parada extra ao percurso normal de Tab.

Verificação: `e2e/review-experience.spec.ts`: responde, abre a devolutiva, continua e exige que o novo enunciado tenha foco. Antes a asserção falhava; a navegação é verificada nos dois projetos. Leitor de tela físico não foi homologado.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
