---
status: resolved
file: apps/edicaptura/src/editor/editor.js
line: 474
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Retain keyboard focus when updating the object list

## Review Comment

renderObjects replaces every button on selection and every editor change. Selecting an object removes the focused button from the DOM; moving with an arrow does the same. In a three-object renderer probe, clicking the first item left document.activeElement as BODY, and the next Tab returned to the first object instead of advancing to the second. Keyboard activation follows the same click handler. This defeats the new list’s stated purpose of accessible keyboard selection and makes repeated navigation unreliable.

Keep object rows stable by annotation ID or explicitly restore focus to the corresponding ID after rendering; handle removal by selecting a sensible neighbor. Verify Tab/Shift+Tab and Enter/Space selection, arrow movement, deletion and reordering using the real UI, checking activeElement as well as editor state. Probe: `.cache/review-batch2.cjs`.

## Triage

- Decision: `VALID`
- Notes:

## Resolution

Correção conferida na versão atual pelo revisor em 18/10/2026: testes Node 51/51, três runners Chromium, typecheck e Biome focado sem erros. Regressões verificam orçamento por asset único, resposta IPC tardia, endpoints direcionais/cardinais, foco/Space e rejeição atômica da escala que produziria dimensão zero. Nenhuma alteração de código foi feita pelo revisor. Gate nativo e publicação são estados separados.