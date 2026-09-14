---
status: resolved
file: apps/missao-saber/src/lib/env.ts
line: 18
severity: medium
author: claude-code
provider_ref:
---

# Issue 001: Registrar as variáveis MISSAO no ambiente de build do Turbo

## Review Comment

As cinco variáveis novas (`MISSAO_EDITOR_IDS` e os quatro `MISSAO_*_PRICE`) não constam de `tasks.build.env` em `turbo.json`. A orientação de build do `CLAUDE.md` exige registrar as variáveis novas nesse contrato. O dry run de `turbo build --filter=@informach/missao-saber --dry=json`, com um valor sentinela de `MISSAO_EDITOR_IDS` no processo pai, confirma que nenhuma aparece entre as entradas especificadas/configuradas do build. Assim, um build pelo workspace não recebe esses valores no modo estrito nem os considera no cache, ao contrário da execução direta do app.

Adicionar os cinco nomes à lista de build e confirmar pelo dry run que eles são reconhecidos. Como as rotas do scaffold são dinâmicas e ainda não consomem esse catálogo, não há evidência de valores vazios permanentemente embutidos no bundle ou de um checkout quebrado nesta fase; o defeito confirmado é a integração incompleta do contrato de configuração.

## Triage

- Decision: `VALID`
- Notes: Corrigido em `turbo.json`. Em 13/09/2026, o dry run com valores sentinela confirmou `PASS: 5 MISSAO variables specified and 5 configured in Turbo build dry run.` (exit 0). Os valores reais não foram lidos ou expostos.
