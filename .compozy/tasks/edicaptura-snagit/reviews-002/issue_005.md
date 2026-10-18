---
status: resolved
file: apps/edicaptura/src/editor/canvas.js
line: 720
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Prevent valid scaling settings from producing zero pixels

## Review Comment

The allowed 1% image scale can round a small image's dimensions down to zero. Reproduced with a 16×16 raster and setViewTransform({scale:0.01}): displaySize becomes 0×0, then export throws InvalidStateError because drawImage receives a zero-sized canvas. This setting is reachable using the new image-scale control (minimum 1%). Autosave also exports the preview, so this accepted edit cannot be saved until the user undoes or changes it.

Either reject dimensions smaller than one pixel before checkpointing/applying the transform, or consistently clamp rendered/exported dimensions to a minimum of one pixel. Keep prepare, live transforms, displaySize and point mapping consistent. Cover tiny images and narrow images in regression tests. Probe: `.cache/review-batch2.cjs`.

## Triage

- Decision: `VALID`
- Notes:

## Resolution

Correção conferida na versão atual pelo revisor em 18/10/2026: testes Node 51/51, três runners Chromium, typecheck e Biome focado sem erros. Regressões verificam orçamento por asset único, resposta IPC tardia, endpoints direcionais/cardinais, foco/Space e rejeição atômica da escala que produziria dimensão zero. Nenhuma alteração de código foi feita pelo revisor. Gate nativo e publicação são estados separados.