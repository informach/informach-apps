---
status: resolved
file: apps/edicaptura/src/editor/canvas.js
line: 88
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Count shared raster assets once when reopening a composition

## Review Comment

Duplicating an image object preserves its assetId and correctly reuses one raster in the live editor. However, prepare decodes and adds its dimensions to rasterPixels for each annotation, before overwriting the same Map entry. A composition accepted during editing and saving can therefore become impossible to reopen. Reproduced in Chromium with a 200×100 base plus one 1000×1000 transparent image duplicated 100 times: live editor has one unique raster, but prepare rejects the saved composition with “Composição excede o orçamento de 100 megapixels.” This also creates unnecessary repeated asset reads and decoding for smaller compositions.

Deduplicate image assets by assetId before reading, decoding and budgeting; maintain conflict checks for inconsistent contents of the same asset. Cover duplicate raster objects through actual save/read/reopen and verify they retain one unique asset and correct positions. Probe: `.cache/review-batch2.cjs`.

Recheck: prepare/read/decode deduplication is corrected. The `library:save` IPC still evaluates `JSON.stringify(data.annotations).length > 70_000_000` before deduplicating shared asset payloads. Repeated dataUrl strings therefore consume the total budget repeatedly (e.g. a single 25 MB encoded PNG referenced by three objects), even though only one raster exists and its per-asset/pixel budgets pass. Apply the save-size budget to unique assets plus annotation metadata, preserving rejection for genuinely oversized inputs.

## Triage

- Decision: `VALID`
- Notes:

## Resolution

Correção conferida na versão atual pelo revisor em 18/10/2026: testes Node 51/51, três runners Chromium, typecheck e Biome focado sem erros. Regressões verificam orçamento por asset único, resposta IPC tardia, endpoints direcionais/cardinais, foco/Space e rejeição atômica da escala que produziria dimensão zero. Nenhuma alteração de código foi feita pelo revisor. Gate nativo e publicação são estados separados.