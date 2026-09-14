---
status: resolved
file: apps/missao-saber/src/features/family/components/family-controls.tsx
line: 309
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Permitir downgrade antes de criar o primeiro perfil

## Review Comment

A F4 permite assinar sem cadastrar um estudante fictício, portanto uma assinatura Família com zero perfis é um estado válido. Nesse estado, `retainedProfileId` começa vazio e todo botão de mudança Família → Individual fica desabilitado por `option.requiresRetainedProfile && !retainedProfileId`. O próprio backend aceitaria a seleção vazia porque `retainProfilesForSmallerPlan()` exige `min(limit, owned.length)`, que é zero. A interface impede justamente o downgrade do fluxo sem perfis que a fase passou a suportar.

Exigir seleção somente quando existe mais de um perfil ou quando a quantidade armazenada excede a capacidade de destino. Com zero perfis, permitir o agendamento sem ID; com um, selecionar o único automaticamente; com mais de um, manter a escolha explícita. Adicionar testes de componente ou jornada para os três casos.

## Triage

- Decision: `RESOLVED`
- Notes: A interface permite downgrade com zero perfis, escolhe automaticamente quando existe um e exige escolha apenas quando há mais de um. O backend mantém a validação pela quantidade real.

