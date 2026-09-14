---
status: resolved
file: apps/missao-saber/src/components/controls.tsx
line: 80
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Trocar de perfil deve sair da sessão do estudante anterior

## Review Comment

Depois de `selectProfileAction`, o seletor apenas executa `router.refresh()`. Se a família seleciona B enquanto está em `/missao/<sessão-de-A>`, a URL permanece apontando para A e `sessionView()` continua carregando a sessão de A, embora o cabeçalho indique B. O Player também guarda a sessão em estado local. Como as mutações verificam corretamente o proprietário responsável, mas não o cookie selecionado, as respostas feitas nesse contexto continuam indo ao histórico de A. No caderno, um rascunho local também pode sobreviver à mudança de props e ser salvo no perfil recém-selecionado. É uma mistura de contextos dentro da família, não acesso a outra conta.

Ao mudar o perfil, navegar para `/hoje` e reinicializar os componentes vinculados ao estudante. Garantir que a interface da missão identifique o perfil real e que estado local de caderno/player não transite entre perfis por reutilização de componentes. Testar a troca de A para B durante uma missão e durante um rascunho de caderno, verificando URL, cabeçalho e destino da próxima tentativa/anotação.

## Triage

- Decision: `VALID`
- Notes: Correção relida: troca de perfil navega a `/hoje` e atualiza o servidor, desmontando a missão ou caderno anterior; componentes de laboratório são identificados por perfil. E2E `journey.spec.ts` executado pelo implementador aprovou os seis cenários desktop/mobile, incluindo Sol→Lua durante uma missão, URL `/hoje` e cabeçalho do novo perfil. Código do teste e `test-results/.last-run.json` (`passed`, sem falhas) conferidos pelo revisor em 13/09/2026. A montagem do caderno também é abandonada pela mesma navegação; não há transferência de rascunho nessa troca.
