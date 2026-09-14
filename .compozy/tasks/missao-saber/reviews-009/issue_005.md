---
status: resolved
file: apps/missao-saber/src/features/learning/recommendation.ts
line: 6
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Aplicar o limite de perfis também nas recomendações

## Review Comment

`availableLessons()` recebe somente `paid` e suspensão. Depois de um downgrade de Família para Individual, o segundo e o terceiro perfis ainda enxergam recomendações e botões de missões pagas em Hoje, Jornada, Revisão e Simulados porque a conta continua com `paid=true`. O serviço finalmente rejeita o início com `PROFILE_LIMIT`, deixando a política canônica divergente entre interface e servidor. Jornada ainda mantém uma terceira implementação parcial da regra.

Fazer as telas consumirem a mesma decisão de `lessonAvailability()`, incluindo curso, ano e `profileAllowed`, ou expor do dashboard um conjunto de lições já autorizado para o perfil selecionado. Manter o servidor como autoridade. Cobrir um perfil excedente após downgrade e conferir que histórico e conteúdo gratuito permanecem acessíveis enquanto ações pagas aparecem bloqueadas com a explicação correta.

## Triage

- Decision: `VALID`
- Notes: As telas desconhecem a posição autorizada do perfil. O dashboard passará a expor essa decisão e todas as superfícies usarão a função canônica para bloquear ações pagas e mostrar a causa, preservando histórico e conteúdo gratuito.
