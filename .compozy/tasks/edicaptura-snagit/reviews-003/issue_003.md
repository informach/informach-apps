---
status: resolved
file: apps/edicaptura/src/main/library-ipc.ts
line: 363
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Implement the required final-file clipboard action

## Review Comment

N19 and the batch brief explicitly require copying the final file and its path. This handler only calls `clipboard.writeText(lastExport)`. The other existing action calls `clipboard.writeImage` and is limited to images. Source inspection of the entire EdiCaptura clipboard/preload/UI surface finds no file clipboard operation or corresponding UI; a WebM export can only copy its pathname as text. Pasting that into Explorer or a recipient expecting a file does not transfer/attach the exported file. The report accurately says copy final path, but provides no approved deferral of the distinct file workflow.

Add a user-facing copy-final-file action backed by a narrow authorized main-process Windows file clipboard contract using an existing validated final export, preserving the separate copy-path and copy-image actions. Validate existence and file identity at the boundary and handle no export/deleted export explicitly. Verify with isolated synthetic PNG and WebM outputs that a real Windows file consumer receives a file reference rather than plain text, while respecting the user's clipboard during automated verification. Update the README/report to state the actual supported behavior.

## Triage

- Decision: `VALID`
- Notes:

## Resolution — FixRound1 re-review, 2026-10-18

**ADDRESSED at the implementation/contract boundary.** Distinct file/path/image UI and narrow zero-argument role-gated IPC now exist. Per-instance FinalExport retains identity/content evidence, rejects absent/replaced/oversized files, rechecks access and delegates fixed Windows STA code; path/hash/size travel as stdin JSON, never command interpolation. The C# helper creates standard FileDrop/CF_HDROP with copy drop effect, rechecks content under a non-write/non-delete-sharing read handle, and calls persistent Clipboard.SetDataObject. The helper is hidden and time-bounded, without extra renderer authority.

Reviewed fresh implementer Node67/renderer/native evidence and the tests themselves. Actual Windows Forms IDataObject.GetData(CF_HDROP, TYMED_HGLOBAL) plus shell32 DragQueryFileW consumes exact Unicode synthetic PNG/WebM file references, not text. This is meaningful native file-consumer verification. **Full OS clipboard publication/receiving-application interaction remains UNVERIFIED**: private CreateWindowStationW failed with access denied (5) before clipboard access. The harness records that boundary and has no interactive/global fallback or elevation. Resolution of the missing implementation does not claim that full publication gate passed; that limitation remains in the report and README.
