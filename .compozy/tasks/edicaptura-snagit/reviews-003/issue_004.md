---
status: resolved
file: apps/edicaptura/src/editor/library.js
line: 28
severity: low
author: claude-code
provider_ref:
---

# Issue 004: Explain current video limits without internal batch terminology

## Review Comment

The Preferences dialog tells users that metadata and conversion are `previstos no lote de vídeo`. This exposes the internal implementation plan instead of explaining what the current app can do, contrary to the product-flow instruction. The corresponding unsupported-WebM error in library-ipc.ts:103 also refers to the video batch. A user choosing a file needs an actionable current-format limit, not the team's batch schedule.

State the present behavior plainly: local video import currently accepts WebM, preserves the original, and does not convert other formats or extract duration/poster yet. Keep future batch details in the implementation documentation. Update these messages when batch 5 changes capability; do not promise unimplemented availability in the user interface.

## Triage

- Decision: `VALID`
- Notes:

## Resolution — FixRound1 re-review, 2026-10-18

**ADDRESSED.** Both Settings and invalid-WebM product messages now state current WebM/original-preservation/conversion/duration/thumbnail limits without internal video-batch terminology. Reviewed both changed strings and the aligned documentation; planning details remain in developer documentation.

## Current capability coherence — checkpoint final fix, 18/10/2026

The historical FixRound1 resolution above remains unchanged. Phase5b now provides real duration/poster, selected-frame/MP4/GIF output. Preferences and invalid-WebM guidance were updated together to describe those current capabilities, preserving WebM-only import, the400MB limit and original preservation. No duplicate finding was created. Final scoped Node161/161, full11renderer, real media/video-native4/4, types/build and quality gates passed. The initial no-duration/no-thumbnail wording was a capability snapshot, not a permanent restriction. See [final fix record](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/checkpoint-final-fix.md); independent re-review remains pending.

## Independent current-capability re-review — 18/10/2026

**C1 ADDRESSED.** Conferidas as duas strings atuais em editor/library.js:29 e main/library-ipc.ts:105: duração/miniatura e saída do intervalo MP4/GIF, original preservado, importação somente WebM e limite400MB no erro. Correspondem à capacidade5b examinada, sem terminologia interna de lote ou promessa futura. Mantida a resolução histórica; nenhum finding novo/duplicado. O [append independente](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/full-review.md) registra o aceite escopado com os limites e pipeline global ainda pendente.
