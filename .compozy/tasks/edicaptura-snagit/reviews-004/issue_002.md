---
status: resolved
file: apps/edicaptura/tests/capture-pixels-native.cjs
line: 187
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Native fixture can exit zero after a failed assertion

## Review Comment

Cleanup destroys every BrowserWindow before awaiting `fs.rm`, and only afterward calls `app.exit(process.exitCode || 0)`. With no `window-all-closed` handler, Electron can quit normally during that await, before the explicit failure exit executes. Setting Node's `process.exitCode` does not make Electron's default quit propagate that status reliably.

Fresh evidence: the unchanged fixture, launched with an explicit owned userData/sessionData wrapper, printed `sources: AssertionError ... 0 !== 1` at line 82 but the Electron child exited **0**. This is a failed test, not a passing native pixel gate. An independent owned Electron lifecycle probe recorded `process.exitCode = 1`, destroyed its sole window, then modeled asynchronous cleanup with a 500 ms await: child exit **0**, and the marker immediately before explicit `app.exit` was never reached. A separate fast forced-failure variant of the original fixture exited 1; the problem is a timing race, not every failure being swallowed.

Own the shutdown sequence explicitly: prevent default last-window quit while cleanup is pending, keep an explicit result code, and call `app.exit(resultCode)` only after cleanup. Preserve cleanup errors as failures too. Verify with a deterministic failure injection and delayed cleanup that the actual Electron subprocess returns nonzero. Diagnose/preserve the real owned-source discovery failure separately; do not convert it to a skip or retry-to-green.

## Triage

- Decision: `VALID`
- Notes: Resolved after scoped fix1 re-review: ADDRESSED. Explicit shutdown/cleanup result and parent checks reject early exit; four deliberate failures freshly returned child1. Source discovery traced to hidden owned GUI launch; actual pixels now pass with visibility/presentation assertions. Original failures and WGC diagnostics remain recorded.
