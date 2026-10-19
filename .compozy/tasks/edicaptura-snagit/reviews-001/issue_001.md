---
status: resolved
file: apps/edicaptura/src/editor/editor.js
line: 245
severity: critical
author: claude-code
provider_ref:
---

# Issue 001: Preserve edits when reopening or switching active documents

## Review Comment

The initial batch prepares the incoming document before persisting the current document. Clicking the current library card first reads the old saved document and then passes it to `open`; activation saves the latest editor snapshot but activates the earlier disk snapshot, resetting revisions and making the old content appear saved. A subsequent autosave overwrites the latest content. Reproduced in the actual renderer with isolated IPC: the visible title reverted to `A edit while saving` while persisted metadata contained `A newest`. A related transition race allows edits after `persist` takes its snapshot but before activation completes to be discarded.

Do not reload the active document from a stale read. Preserve its live editor state, and make switching an atomic transition after all dirty revisions are saved (or disable edits during that transition). Add regressions for clicking the current card with dirty content and editing while a save is pending. This addresses A01/A09; serialized opening alone does not serialize editor mutations.

## Triage

- Decision: `VALID`
- Notes: Implementer added same-ID preservation and a revision-draining activation loop during this review. Awaiting final regression evidence and triage.

## Resolution

Correção conferida pelo revisor na versão atual; suíte Node 49/49 e renderer passaram em 18/10/2026. Inclui regressão de parada automática, fotos tardias e troca/reabertura concorrente. Evidências em docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-01.md.
