---
status: resolved
file: apps/edicaptura/src/main/main.cjs
line: 797
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Photo cancellation can destroy an unsaved video recording

## Review Comment

The new `capture:cancel` registration authorizes the editor and calls `cleanup()` whenever PhotoCapture is idle. The new image dialog always exposes `Cancelar captura` (`editor.js:1114`, `index.html:24`). During a video recording or failed-save recovery, reopening the editor through the tray or second-instance handler and clicking that button destroys the recording controller and clears `capture`. The recorded chunks live in that renderer; neither `record-stop` nor finalization/save runs. This creates a normal UI route to discard unsaved video work, including work intentionally retained after a disk failure.

A fresh VM probe executed the exact frozen handler and `cleanup` function with an active video session. Result: `editorCanCancelVideo:true`, `controllerDestroyed:true`, `captureCleared:true`, `recordStopRequested:false`, `saveRequested:false`. Existing recording-preservation tests pass because they do not exercise this newly authorized editor route.

Give photo cancellation its own narrow operation, or otherwise bind cancellation to the intended session/mode. An idle photo dialog must not clean up an unrelated video/scroll session. If a video stop is intentionally supported, route it through the existing stop/finalize/retry preservation lifecycle. Add a regression through the actual registration for an ongoing recording and a retained failed-save recording; verify controller/chunks remain available or are successfully saved.

## Triage

- Decision: `VALID`
- Notes: Resolved after scoped fix1 re-review: ADDRESSED. Narrow photo channel and legacy video stop preserve active/failed-save chunks; actual handler/authority and recording regressions passed. Parent accepted SPEC/QUALITY verdict on 18/10/2026.
