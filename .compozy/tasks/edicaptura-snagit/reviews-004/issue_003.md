---
status: resolved
file: apps/edicaptura/tests/capture-pixels-native.cjs
line: 12
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Isolate Electron profile before the native fixture starts

## Review Comment

The temporary directory created after `app.whenReady()` isolates the test Library only. This standalone fixture never sets `userData` or `sessionData`, and the package script launches `electron tests/capture-pixels-native.cjs` without an owned profile argument. It does not load the commercial main's test-profile configuration. BrowserWindows therefore use Electron's default persistent profile/session, potentially reading and writing existing cookies, cache, GPU state and preferences outside the disposable fixture root. Cleanup removes only the library.

This violates the repository's explicit isolated-profile rule and contradicts the implementation report's blanket isolated-profile claim. The installed Electron 44.8.0 default-app loader was inspected read-only: a direct script path sets the app path but supplies no profile isolation. The [matching official API documentation](https://raw.githubusercontent.com/electron/electron/v44.8.0/docs/api/app.md) specifies that userData defaults beneath appData and sessionData defaults to userData; sessionData must be overridden before ready. No existing/default profile was opened or inspected to verify this finding.

Create an owned temporary root synchronously before Electron readiness, set both userData and sessionData there (and any logs/crash paths used), and retain it through shutdown. Delete only that verified owned root after the process no longer uses it, preferably from a parent runner. Assert the resolved profile paths stay inside the fixture root. Run the documented package command without relying on a manually supplied external profile and correct the evidence/report accordingly.

## Triage

- Decision: `VALID`
- Notes: Resolved after scoped fix1 re-review: ADDRESSED. Documented parent/child command owns profile/session/log/crash/library paths before readiness and cleans its verified root after child close. Historical blanket isolation claim withdrawn; no previous default/personal profile inspected or deleted.
