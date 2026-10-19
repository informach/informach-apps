---
status: resolved
file: apps/edicaptura/src/editor/editor.js
line: 880
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Restrict canvas shortcuts to the active editor view

## Review Comment

The document-level key handler excludes inputs and open dialogs, but only checks `current.kind` before editing the canvas. Switching to Library hides the canvas without clearing `current`. With focus on a Library button, Ctrl+A selects hidden annotations, Ctrl+D duplicates them, Delete removes them, Ctrl+V invokes the hidden image insertion action, and undo/arrows also target the hidden editor. These changes trigger autosave while the user is managing library records. This violates the required library/editor context isolation.

Confirmed in Chromium at 1366x768 using `.cache/review-batch3-ui.cjs`: open a synthetic one-annotation document, click Library, press Ctrl+A/Ctrl+D; the save boundary receives two annotations. Press Delete; it receives one. Ctrl+V calls pasteImage. The settings modal correctly blocks these keys and is not the failing surface.

Require the editor view to be active before canvas-specific shortcuts can mutate/select/paste/undo. Define library shortcuts independently if wanted. Add real-renderer regressions that focus Library buttons and check annotations, selection and save calls remain unchanged for Delete, Ctrl+A/D/V/Z and arrows; retain the existing modal guard.

## Triage

- Decision: `VALID`
- Notes:

## Resolution — FixRound1 re-review, 2026-10-18

**ADDRESSED.** Both keyboard handlers now require the editor view and reject workspace transitions; native dialog/input guards remain. Reviewed the actual-source diff and `workspace-regressions.cjs`: real Library persistence, deterministic advancement across the autosave deadline, Library/modal Delete/Ctrl+A/D/V/Z/arrows, Space button activation and editor-key positive control. Implementer's final five-runner renderer gate passed; the same regression fails on the frozen original handler. No full gate rerun was needed for this resolved behavior.
