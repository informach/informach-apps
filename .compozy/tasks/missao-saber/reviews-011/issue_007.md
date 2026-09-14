---
status: resolved
file: turbo.json
line: 42
severity: medium
author: claude-code
provider_ref:
---

# Issue 007: Remover as últimas variáveis da arquitetura editorial

## Review Comment

O schema e o snapshot 0047 já removem `missao_saber.releases`, e o código operacional usa `content-maintenance`, mas a configuração de build ainda declara `MISSAO_EDITOR_IDS` e `MISSAO_EDITOR_EMAILS`. Ao mesmo tempo, as variáveis ativas `MISSAO_CONTENT_MANAGER_IDS` e `MISSAO_CONTENT_MANAGER_EMAILS` não entram na lista `build.env` do Turbo. Além de preservar nomes de uma arquitetura eliminada, isso deixa a autorização de manutenção fora do contrato e do hash de ambiente do build.

Substituir os dois nomes antigos pelos nomes de manutenção atuais, revisar os ambientes/documentação e adicionar uma verificação simples de que não restam identificadores `MISSAO_EDITOR_*`, rotas `/editorial` ou imports de `features/editorial`. Manter a migration 0047 e o schema sem `releases`, como já estão.

## Triage

- Decision: `RESOLVED`
- Notes: As variáveis MISSAO_EDITOR_* foram retiradas do Turbo, exemplos e produção. A permissão operacional usa MISSAO_CONTENT_MANAGER_* e não controla publicação.
