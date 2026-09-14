---
status: resolved
file: apps/missao-saber/src/features/content/catalog.ts
line: 225
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Preservar a origem de avaliações antigas para aplicar suspensão

## Review Comment

`assessmentSources()` resolve as fontes de um snapshot comparando a versão registrada em cada item com a versão atual de `contentUnits`. Após publicar um banco v2, uma avaliação em andamento com snapshot v1 deixa de encontrar esse banco e passa a retornar `[]`. O fallback para snapshots anteriores à introdução de `item.source` também procura somente em `assessmentBanks`, embora avaliações da primeira versão tenham sido compostas por itens das missões.

`readSession()`, `recordAnswer()` e `interruptSession()` usam esse resultado para consultar os controles de suspensão (`learning/repository.ts:269,305,406`). Com a lista vazia, a avaliação antiga pode continuar recebendo respostas mesmo quando sua origem está pausada para correção, e o caminho de interrupção deixa de reconhecer a pausa. Isso viola o controle persistente de suspensão entre atualizações do conteúdo.

Reprodução com os módulos reais: um snapshot v1 inicialmente retornou `bank:diagnostic:olitef-n1`; alterar somente a versão do banco atual para v2 fez a mesma chamada retornar `[]`. Um snapshot legado com itens de missões também retornou `[]`.

Separar a identidade operacional da origem de sua versão de conteúdo. Consultar a suspensão pelos IDs persistidos no snapshot mesmo que a versão tenha avançado ou a unidade tenha saído do catálogo corrente; preservar a versão/hash histórica para invalidação de evidência. Incluir compatibilidade dos snapshots legados. Cobrir banco v1 em andamento, publicação v2, suspensão e tentativa de continuar/interromper a avaliação antiga.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

As fontes das avaliações são resolvidas pelas identidades e versões persistidas no snapshot, sem depender da versão atual do catálogo. O fallback legado recupera a origem de bancos e missões antigas. O hash de snapshots passou a ordenar chaves JSON recursivamente, evitando divergência causada pela normalização do JSONB no PostgreSQL. A integração cobre banco v1, publicação v2, remoção da fonte corrente, suspensão e bloqueio da sessão antiga. `44` integrações passaram em banco descartável real.
