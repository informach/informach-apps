---
status: resolved
file: apps/edicaptura/src/editor/editor.js
line: 306
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Invalidate pending document activation when the root changes

## Review Comment

`activateDocument` awaits image preparation and persistence, then unconditionally activates the document. A root switch calls `clearDocument`, which increments documentRequest and clears current, but the pending activation never checks that epoch. A previously requested old-library document can therefore finish opening after the new root is selected. The UI now shows an old-root document while all subsequent read/save IPC targets the new Library instance. Saving then fails when that UUID is absent, or can replace the same UUID's annotations in a separately restored/copied library.

Confirmed with the actual renderer and controlled async boundaries in `.cache/review-batch3-ui.cjs`: defer the next image decode during document opening, use Preferences > Open existing library and allow its successful response/clearDocument, observe `Nenhuma captura aberta`, then release decode. The visible title becomes `Old root delayed document`. This probe stubs the successful root IPC response; it proves the stale renderer activation, not a filesystem data-loss incident. The production main root handler does replace the Library instance, and existing filesystem tests cover that replacement separately.

Introduce a library/root generation or transition token and validate it across every pending read/prepare/activation boundary. Root switching must cancel or drain pending opens before committing the new root; incrementing documentRequest only for importResult is insufficient. Cover a delayed card read and delayed image prepare across root-open/restore, including a matching UUID in the destination, and ensure no stale document activation or save crosses roots.

## Triage

- Decision: `VALID`
- Notes:

## FixRound1 re-review — 2026-10-18

**NOT ADDRESSED in full.** The original stale-read/decode activation is fixed: opens capture workspace/request generations, revalidate after awaits, and root transitions invalidate old queues and drain old saves. Reviewed real-filesystem renderer regressions for delayed read/decode across root-open/restore with colliding UUIDs; those pass in the implementer evidence.

The transition still accepts user edits while suppressing their persistence. New `editor.js:243` returns from `scheduleSave` whenever `workspaceTransition` is true. The settings form's Close button and Escape remain usable while the root operation waits; only type=button controls inside settings are disabled. After closing it, the title and canvas controls remain editable. A successful root response clears these edits, and during the operation the status can still claim all changes were saved.

Confirmed against the fixed actual renderer with `node .cache/review-batch3-fix1-transition.cjs` (exit 0, synthetic IPC, 1366x768): open `probe`; start a root-open workflow with its response held; close settings using the actual Close button; fill the title with `Edit during pending root switch`; then release the successful root response. During the edit, the title changed but lastSaved remained `probe` and status was `Todas as alterações salvas`; afterward the document was cleared and the two save calls both predated the edit. This proves dropped user input across the transition; no native clipboard or production filesystem was involved.

Make the transition atomic for actual editor mutations as well as queued completions. Either prevent dialog dismissal and keep all editor mutation surfaces inert while switching, or preserve/drain accepted edits before commit and retain them after cancellation/failure. Do not silently discard change notifications while controls remain editable. Add a regression that closes/Escapes settings during held copy/open/restore, attempts title/pointer/property edits, and verifies they are blocked or preserved through success and cancellation/failure. This is retained under the original root-transition finding rather than creating a duplicate issue.

## Resolution — FixRound2 re-review, 2026-10-18T12:28:22Z

**ADDRESSED.** Reviewed the exact fix2 diff against `task-3-fix-1-base.json`, the final production code and the expanded actual-Chromium/Library regression. Root operations enter the workspace lock before saving or showing a native picker. Settings disables Close and all controls, prevents cancel/submit while busy, and restores prior states. Other editor surfaces are inert/disabled with a capturing mutation guard; pending raster/text and paste/object/style/cutout continuations are invalidated by canvas/workspace generation. Unfinished gestures reuse the existing rollback behavior. Progress remains accurate after save completion, old-root save draining is retained, and finally restores usable controls/current-document state after cancel/failure.

The covering runner exercises open/copy/restore × success/cancel/failure at both held picker and response boundaries, actual coordinate clicks on Close, Escape/Enter, title/property/pointer/key mutation attempts, delayed paste/object/raster/text completion, preserved accepted names/annotation kinds on real isolated filesystem, and successful editing/insertion after cancel/failure. Failure cases inject native-picker rejection; main disk-error behavior was not changed in this round. Its baseline failure specifically reproduces Close dismissing the dialog. The final serial five-runner renderer suite passed after the final build; Node67/typecheck/build/scoped Biome also passed in the fresh implementer evidence. No full gate was repeated by reviewer and no new critical/high fix-induced defect was confirmed.

This closes the code finding only. Previously recorded native startup failure, OS clipboard-publication limitation and credential incident remain unchanged and are not resolved by this renderer correction.
