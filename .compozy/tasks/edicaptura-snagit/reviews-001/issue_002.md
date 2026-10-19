---
status: resolved
file: apps/edicaptura/src/main/main.cjs
line: 382
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Discard monitor capture completing after interruption

## Review Comment

The initial batch checks `active.interrupted` only before awaiting `getScreen`. A monitor resolution/scale/disconnection event can set interruption and start finalization while a screenshot is pending. That pending operation then continues to crop and append an image using changed physical dimensions before finalization joins the segments. `stitchBitmaps` rejects mismatching widths, and retries keep the incompatible segment, leaving previously valid photos unsavable through the interface. This defeats A02 preservation specifically during the asynchronous screenshot boundary.

After the screenshot await, check session identity and interruption before doing any processing or appending. Preserve earlier segments and retain retry after disk failure. Add a regression that holds the screenshot, interrupts the monitor, resolves that screenshot and verifies only earlier frames are saved.

## Triage

- Decision: `VALID`
- Notes: Implementer added the post-await interruption check and a focused pending-frame test during review. A probe against the amended code retained only the previous width-100 frame. Awaiting final regression evidence and triage.

## Resolution

Correção conferida pelo revisor na versão atual; suíte Node 49/49 e renderer passaram em 18/10/2026. Inclui regressão de parada automática, fotos tardias e troca/reabertura concorrente. Evidências em docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-01.md.
