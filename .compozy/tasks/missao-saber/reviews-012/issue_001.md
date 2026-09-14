---
status: resolved
file: apps/missao-saber/src/features/content-maintenance/service.ts
line: 38
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Permitir manutenção da versão que originou o relato

## Review Comment

`setContentAvailability()` resolve exclusivamente `findContentUnit(data.lessonId)` no catálogo atual e rejeita qualquer versão/hash anterior. A tela de manutenção também renderiza somente `contentUnits`, enquanto o relato mostra IDs e apenas oito caracteres da sessão, sem consulta autorizada do snapshot relatado. Assim, depois de publicar v2, um relato tardio sobre v1 não permite conferir o enunciado/gabarito original nem invalidar o hash dos itens de v1 pelo fluxo disponível. Marcar o item atual invalida o hash de v2, e a tentativa problemática de v1 continua influenciando autonomia, revisão e relatório. Isso contraria F5.2–F5.3 mesmo quando a publicação incrementa corretamente a versão.

Fornecer uma consulta restrita da sessão/atividade vinculada ao relato e permitir registrar a invalidação de sua revisão congelada. Derivar a proveniência e o `itemHash` desse snapshot no servidor, inclusive para itens de avaliações mistas; manter separada a decisão de disponibilidade do catálogo atual para não suspender ou invalidar a correção por engano. Não aceitar snapshot ou hash arbitrário enviado pelo navegador. Preservar as tentativas originais e oferecer a versão atual como destino da retomada.

Evidência: guarda em `service.ts:38–43`, construção das invalidações em `service.ts:60–63`, contexto resumido em `app/(app)/manutencao/page.tsx:126–129` e renderização do catálogo atual a partir de `page.tsx:178`. O teste de `family-observation.integration.ts` invalida v1 **antes** de construir v2, chama diretamente o repository e não cobre relato tardio através do serviço autorizado. Acrescentar o cenário publicar v2 → receber relato de sessão v1 → consultar contexto → invalidar só v1 → conferir projeção e integridade dos dois snapshots.

Esta é uma lacuna funcional da manutenção histórica, diferente do vínculo de itens de avaliações mistas já corrigido em reviews-009/issue_002.

## Triage

- Decision: `RESOLVED`
- Notes: A manutenção carrega no servidor o snapshot exato ligado ao relato e deriva versão, atividade e hash sem confiar no navegador. A invalidação histórica não pausa a versão corrigida atual; a integração cobre v2 publicada após uma sessão v1.
