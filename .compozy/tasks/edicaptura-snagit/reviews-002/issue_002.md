---
status: resolved
file: apps/edicaptura/src/editor/editor.js
line: 545
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Preserve document identity across pending paste and import IPC

## Review Comment

The paste/import handlers await IPC before calling engine.addImage. addImage captures generation only when it is called, so a document transition during IPC is invisible to its guard. Reproduced through the real Ctrl+V handler: begin paste in A, hold pasteImage, open B via onDocument, then resolve pasteImage. The image is inserted and autosaved into B. This can mix content from unrelated captures. A native import dialog prevents ordinary clicks while open but a document event/global capture or delayed file decoding can still cross this boundary.

Capture the active document identity and engine generation before starting IPC, then verify both after it resolves and before mutation. Apply this to both insertion entry points, and retain the decoder-boundary guard. Add renderer regressions with deferred paste/import IPC and a document transition. Probe: `.cache/review-batch2.cjs`.

## Triage

- Decision: `VALID`
- Notes:

## Resolution

Correção conferida na versão atual pelo revisor em 18/10/2026: testes Node 51/51, três runners Chromium, typecheck e Biome focado sem erros. Regressões verificam orçamento por asset único, resposta IPC tardia, endpoints direcionais/cardinais, foco/Space e rejeição atômica da escala que produziria dimensão zero. Nenhuma alteração de código foi feita pelo revisor. Gate nativo e publicação são estados separados.