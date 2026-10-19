---
status: resolved
file: apps/edicaptura/src/editor/canvas.js
line: 859
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Preserve directed endpoints while resizing lines and arrows

## Review Comment

Both numeric resizeSelection and pointer resize replace x/y with the normalized top-left box and x2/y2 with bottom-right. This reverses arrows pointing up or left, and changes negative-slope lines into positive-slope lines. Reproduced with an arrow [x,y,x2,y2]=[150,80,40,20]: applying its unchanged 110×60 size changes it to [40,20,150,80], reversing the arrow without changing requested dimensions. Diagrams can therefore convey the opposite direction after a geometry edit.

Scale endpoints relative to the old bounding box while retaining the original signs/direction; use the same transformation for numeric and pointer resizing. Verify all four direction quadrants, horizontal/vertical lines, unchanged size, undo and exported pixels. Probe: `.cache/review-batch2.cjs`.

## Triage

- Decision: `VALID`
- Notes:

## Resolution

Correção conferida na versão atual pelo revisor em 18/10/2026: testes Node 51/51, três runners Chromium, typecheck e Biome focado sem erros. Regressões verificam orçamento por asset único, resposta IPC tardia, endpoints direcionais/cardinais, foco/Space e rejeição atômica da escala que produziria dimensão zero. Nenhuma alteração de código foi feita pelo revisor. Gate nativo e publicação são estados separados.